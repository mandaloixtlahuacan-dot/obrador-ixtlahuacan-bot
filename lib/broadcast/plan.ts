import { avisoVenta, resumenVentas } from "@/lib/broadcast/compose";
import { prioridadAviso, type BroadcastConfig } from "@/lib/broadcast/policy";
import { clienteEnGrupo, newId } from "@/lib/crm";
import { fold } from "@/lib/text";
import { mexicoParts } from "@/lib/time";
import type { Cliente, InventarioGanado, QueueItem, Venta } from "@/lib/types";

function sameDay(iso: string, now: Date): boolean {
  return iso.slice(0, 10) === mexicoParts(now).isoDate;
}

export function planSaleNotices(opts: {
  venta: Venta;
  seller: Cliente;
  clientes: Cliente[];
  cfg: BroadcastConfig;
  now: Date;
}): QueueItem[] {
  if (!opts.cfg.enabled) return [];
  const ventasHoy = opts.clientes.flatMap((c) =>
    c.ventas.filter((v) => v.estado === "activa" && sameDay(v.createdAt, opts.now)),
  );
  if (ventasHoy.length > opts.cfg.summaryIfSalesOver) return [];

  const items: QueueItem[] = [];
  for (const c of opts.clientes) {
    if (c.chatId === opts.seller.chatId) continue;
    if (!c.recibeAvisos || c.fueraDeLista || c.soloResumenSemanal) continue;
    if (!clienteEnGrupo(c, "todos")) continue;
    const busca = c.busquedas.some(
      (b) =>
        b.activa &&
        (fold(b.razaTipo).includes(fold(opts.venta.razaTipo)) ||
          fold(opts.venta.razaTipo).includes(fold(b.razaTipo)) ||
          b.especie === opts.venta.especie),
    );
    const priority = prioridadAviso({
      busca,
      mismoPueblo: Boolean(
        c.pueblo && opts.venta.pueblo && fold(c.pueblo) === fold(opts.venta.pueblo),
      ),
      zona: c.zona,
      mismaEspecie: c.etiquetas.includes(`ganadero:${opts.venta.especie}`),
      esGanadero: c.etiquetas.includes("ganadero"),
      ultimaConversacion: c.ultimaConversacion,
    });
    const cuerpo = avisoVenta(
      {
        nombre: c.nombre || "",
        pueblo: opts.venta.pueblo || "",
        cantidad: opts.venta.cantidad != null ? String(opts.venta.cantidad) : "",
        animal: opts.venta.especie,
        raza: opts.venta.razaTipo,
        peso: opts.venta.pesoEdad || "",
      },
      `${c.chatId}:${opts.venta.id}`,
    );
    items.push({
      id: newId(),
      tipo: "venta",
      chatId: c.chatId,
      cuerpo,
      promoId: null,
      priority,
      status: "pending",
      notBefore: opts.now.toISOString(),
      attempts: 0,
      lastError: null,
      createdAt: opts.now.toISOString(),
      sentAt: null,
    });
  }
  items.sort((a, b) => b.priority - a.priority);
  return items.slice(0, opts.cfg.perDay);
}

/** Avisos de inventario: sin nombre ni número del ganadero. */
export function planInventarioNotices(opts: {
  item: InventarioGanado;
  clientes: Cliente[];
  cfg: BroadcastConfig;
  now: Date;
}): QueueItem[] {
  if (!opts.cfg.enabled) return [];
  const items: QueueItem[] = [];
  for (const c of opts.clientes) {
    if (c.chatId === opts.item.chatId) continue;
    if (!c.recibeAvisos || c.fueraDeLista || c.soloResumenSemanal) continue;
    if (!clienteEnGrupo(c, "todos")) continue;
    items.push({
      id: newId(),
      tipo: "venta",
      chatId: c.chatId,
      cuerpo: avisoVenta(
        {
          nombre: c.nombre || "",
          pueblo: opts.item.pueblo || "",
          cantidad: opts.item.cantidad != null ? String(opts.item.cantidad) : "",
          animal: opts.item.especie,
          raza: [opts.item.tipo, opts.item.raza].filter(Boolean).join(" "),
          peso: "",
        },
        `${c.chatId}:${opts.item.id}`,
      ),
      promoId: null,
      priority: 1,
      status: "pending",
      notBefore: opts.now.toISOString(),
      attempts: 0,
      lastError: null,
      createdAt: opts.now.toISOString(),
      sentAt: null,
    });
  }
  return items;
}

export function planResumenDiario(opts: {
  ventas: Venta[];
  clientes: Cliente[];
  now: Date;
  semanal: boolean;
}): QueueItem[] {
  if (opts.ventas.length === 0) return [];
  const items: QueueItem[] = [];
  for (const c of opts.clientes) {
    if (!c.recibeAvisos || c.fueraDeLista) continue;
    if (c.soloResumenSemanal && !opts.semanal) continue;
    if (!c.soloResumenSemanal && opts.semanal) continue;
    items.push({
      id: newId(),
      tipo: opts.semanal ? "resumen_semanal" : "resumen",
      chatId: c.chatId,
      cuerpo: resumenVentas(c.nombre, opts.ventas),
      promoId: null,
      priority: 1,
      status: "pending",
      notBefore: opts.now.toISOString(),
      attempts: 0,
      lastError: null,
      createdAt: opts.now.toISOString(),
      sentAt: null,
    });
  }
  return items;
}
