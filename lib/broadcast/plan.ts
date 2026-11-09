import { avisoVenta, resumenVentas } from "@/lib/broadcast/compose";
import { prioridadAviso, type BroadcastConfig } from "@/lib/broadcast/policy";
import { clienteEnGrupo, newId } from "@/lib/crm";
import { fold } from "@/lib/text";
import { mexicoParts } from "@/lib/time";
import type { Cliente, QueueItem, Venta } from "@/lib/types";

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
    const contacto = opts.venta.comparteNumero
      ? "Si te late, contéstame y te paso el contacto."
      : "Si te late, contéstame y te conecto.";
    const cuerpo = avisoVenta(
      {
        nombre: c.nombre || "",
        pueblo: c.pueblo || "",
        vendedor: opts.seller.nombre || "Un ganadero",
        cantidad: opts.venta.cantidad != null ? String(opts.venta.cantidad) : "",
        animal: opts.venta.especie,
        raza: opts.venta.razaTipo,
        peso: opts.venta.pesoEdad || "",
        contacto,
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
