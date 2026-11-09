import { forrajeraPedidosPhone, intermediarioPhone } from "@/lib/config";
import { especieDe, newId } from "@/lib/crm";
import type { Deps } from "@/lib/deps";
import { fold } from "@/lib/text";
import { mexicoParts } from "@/lib/time";
import type { Cliente, InteresGanado, InventarioGanado } from "@/lib/types";
import { loadBroadcastConfig } from "@/lib/broadcast/policy";
import { planInventarioNotices } from "@/lib/broadcast/plan";

export function sinMontos(text: string): string {
  return text
    .replace(/\$\s?\d[\d.,]*/g, "")
    .replace(/\b\d[\d.,]*\s*(?:pesos|mxn)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tipoDe(t: string): string {
  if (/gord/.test(t)) return "gordas";
  if (/becerro/.test(t)) return "becerros";
  if (/cria/.test(t)) return "cria";
  if (/engord/.test(t)) return "engorda";
  if (/pie/.test(t)) return "en pie";
  return "";
}

function razaDe(t: string): string {
  if (/pelibuey/.test(t)) return "pelibuey";
  if (/pinta/.test(t)) return "pintas";
  if (/suiz/.test(t)) return "suizo";
  if (/cebu|cebú/.test(t)) return "cebu";
  if (/cruz/.test(t)) return "cruzadas";
  return "";
}

export function parsePublicacion(
  text: string,
): { cantidad: number | null; especie: string; tipo: string; raza: string; notas: string } | null {
  const t = fold(text);
  if (!/\b(tengo|vendo|tenemos|vendemos)\b/.test(t)) return null;
  if (/carne|canal|taco|menudo|cotiz|kilo de/.test(t)) return null;
  if (!/vaca|becerro|toro|borrego|oveja|chiva|cabra|puerco|cerdo|caballo|pollo/.test(t)) {
    return null;
  }
  const cantidad = text.match(/\b(\d{1,4})\b/);
  return {
    cantidad: cantidad ? Number(cantidad[1]) : null,
    especie: especieDe(text),
    tipo: tipoDe(t),
    raza: razaDe(t),
    notas: sinMontos(text),
  };
}

export function esConsultaInventario(text: string): boolean {
  const t = fold(text);
  if (/precio|sniim|en pie anda|cuanto anda|cuanto esta/.test(t)) return false;
  if (/carne|canal|taco|kilo/.test(t)) return false;
  return /\b(busco|estan buscando|que ganado|que hay de|hay vacas|hay becerros|tienen vacas|tienen ganado)\b/.test(
    t,
  );
}

export function esInteres(text: string): boolean {
  const t = fold(text);
  return /\bme interes/.test(t);
}

function coincide(item: InventarioGanado, filtro: string): boolean {
  if (!filtro.trim()) return true;
  const f = fold(filtro);
  const blob = fold(
    `${item.especie} ${item.tipo} ${item.raza} ${item.notas || ""} ${item.pueblo || ""}`,
  );
  const tokens = f.split(" ").filter((w) => w.length > 2 && !/busco|interesa|interesan|quiero|hay/.test(w));
  if (!tokens.length) return true;
  return tokens.some((w) => blob.includes(w) || w.includes(fold(item.tipo)) || w.includes(fold(item.raza)));
}

export function textoInventarioPublico(items: InventarioGanado[], filtro: string): string {
  const activos = items.filter((i) => i.estado === "activa" && coincide(i, filtro));
  if (!activos.length) {
    const que = filtro.trim() || "ese ganado";
    return `Ahorita no tengo ${que} anotado. ¿Te aviso cuando haya?`;
  }
  const lineas = activos.slice(0, 3).map((it, n) => {
    const cant = it.cantidad != null ? `${it.cantidad} ` : "";
    const tipo = it.tipo ? ` ${it.tipo}` : "";
    const raza = it.raza ? ` ${it.raza}` : "";
    const pueblo = it.pueblo ? `, en ${it.pueblo}` : "";
    return `${n + 1}) ${cant}${it.especie}${tipo}${raza}${pueblo}, del ${it.fecha}`;
  });
  const mas = activos.length > 3 ? "\nHay más. Dime si quieres ver otros." : "";
  return `Hay esto anotado:\n${lineas.join("\n")}${mas}\n¿Te interesa alguna? Contéstame.`;
}

export function resumenPublico(it: InventarioGanado): string {
  return [
    it.cantidad != null ? String(it.cantidad) : null,
    it.especie,
    it.tipo,
    it.raza,
    it.pueblo ? `en ${it.pueblo}` : null,
    it.fecha,
  ]
    .filter(Boolean)
    .join(" ");
}

export function avisoIntermediario(opts: {
  interesadoNombre: string | null;
  interesadoTelefono: string | null;
  que: string;
  publicacion: InventarioGanado;
}): string {
  return [
    "🐄 Interés en ganado",
    `Interesado: ${opts.interesadoNombre || "—"}`,
    `Número del interesado: ${opts.interesadoTelefono || "—"}`,
    `Le interesa: ${sinMontos(opts.que)}`,
    `Publicación: ${opts.publicacion.id}`,
    `Resumen: ${resumenPublico(opts.publicacion)}`,
    `Publicó: ${opts.publicacion.publicadorNombre || "—"}`,
    `Número del ganadero: ${opts.publicacion.publicadorTelefono || "—"}`,
  ].join("\n");
}

export function parsePedidoForrajera(text: string): {
  que: string;
  cuanto: string | null;
  cuando: string | null;
  entrega: string | null;
} | null {
  const t = fold(text);
  const esForraje = /forrajera|maiz|avena|sorgo|salvado|paca|bulto|rastrojo/.test(t);
  const esPedido = /quiero|pido|pedir|aparta|encarga|me das|necesito/.test(t);
  const esCarne = /canal|taco|menudo|cabeza|manteca|kilo de (res|puerco|carne)/.test(t);
  const soloLugar = /donde|ubicacion|como llego|horario/.test(t) && !/bulto|saco|paca|quiero|pido/.test(t);
  if (!esForraje || !esPedido || esCarne || soloLugar) return null;
  const cuanto =
    text.match(/(\d+\s*(?:bultos?|sacos?|pacas?|costales?|kilos?|kg|toneladas?))/i)?.[1] || null;
  const cuando = text.match(/\bpara el\s+([a-záéíóúñ]+)/i)?.[1] || null;
  const entrega = /paso|recojo|recoger|recog/.test(t)
    ? "recoge"
    : /llev|entreg/.test(t)
      ? "se lo llevan"
      : null;
  let que = "forraje";
  if (/maiz/.test(t)) que = "maíz";
  else if (/avena/.test(t)) que = "avena";
  else if (/sorgo/.test(t)) que = "sorgo";
  else if (/salvado/.test(t)) que = "salvado";
  else if (/rastrojo/.test(t)) que = "rastrojo";
  else if (/paca/.test(t)) que = "pacas";
  return { que, cuanto, cuando, entrega };
}

export function avisoPedidoForrajera(opts: {
  nombre: string | null;
  telefono: string | null;
  que: string;
  cuanto: string | null;
  cuando: string | null;
  entrega: string | null;
}): string {
  return [
    "🌾 Pedido forrajera",
    `Nombre: ${opts.nombre || "—"}`,
    `Número: ${opts.telefono || "—"}`,
    `Qué: ${opts.que}`,
    `Cuánto: ${opts.cuanto || "—"}`,
    `Para cuándo: ${opts.cuando || "—"}`,
    `Recoge o le llevan: ${opts.entrega || "—"}`,
  ].join("\n");
}

function elegirPublicacion(items: InventarioGanado[], text: string): InventarioGanado | null {
  const activas = items.filter((i) => i.estado === "activa");
  const filtradas = activas.filter((i) => coincide(i, text));
  return (filtradas[0] || activas[0]) ?? null;
}

export async function atenderInventarioYForrajera(
  text: string,
  cliente: Cliente,
  deps: Deps,
): Promise<string | null> {
  const pedido = parsePedidoForrajera(text);
  if (pedido) {
    await deps.store.saveCliente(cliente);
    const cuerpo = avisoPedidoForrajera({
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      que: pedido.que,
      cuanto: pedido.cuanto,
      cuando: pedido.cuando,
      entrega: pedido.entrega,
    });
    await deps.sendText(forrajeraPedidosPhone(), cuerpo);
    cliente.comprasForrajera.push({
      id: newId(),
      producto: pedido.que,
      fecha: mexicoParts(deps.now()).isoDate,
    });
    const detalle = [pedido.cuanto, pedido.que, pedido.cuando ? `para el ${pedido.cuando}` : null, pedido.entrega]
      .filter(Boolean)
      .join(" ");
    return `Va, tomé tu pedido de ${detalle}. Alguien del equipo te confirma.`;
  }

  const pub = parsePublicacion(text);
  if (pub) {
    await deps.store.saveCliente(cliente);
    const item: InventarioGanado = {
      id: newId(),
      chatId: cliente.chatId,
      publicadorNombre: cliente.nombre,
      publicadorTelefono: cliente.telefono,
      especie: pub.especie,
      tipo: pub.tipo,
      raza: pub.raza,
      cantidad: pub.cantidad,
      pueblo: cliente.pueblo,
      notas: pub.notas,
      fecha: mexicoParts(deps.now()).isoDate,
      estado: "activa",
      createdAt: deps.now().toISOString(),
    };
    await deps.store.saveInventario(item);
    cliente.animales.push({
      id: newId(),
      especie: item.especie,
      razaTipo: [item.tipo, item.raza].filter(Boolean).join(" ") || item.especie,
      cantidad: item.cantidad,
      pesoEdad: null,
    });
    const cfg = loadBroadcastConfig();
    if (cfg.enabled) {
      const clientes = await deps.store.listClientes();
      const notices = planInventarioNotices({
        item,
        clientes,
        cfg,
        now: deps.now(),
      });
      if (notices.length) await deps.store.enqueue(notices);
    }
    const cant = item.cantidad != null ? `${item.cantidad} ` : "";
    const como = [item.tipo, item.raza].filter(Boolean).join(" ");
    return `Quedó anotado: ${cant}${como || item.especie}. No paso tu número. Si alguien se interesa, alguien del equipo los contacta.`;
  }

  if (esConsultaInventario(text)) {
    const items = await deps.store.listInventario();
    return textoInventarioPublico(items, text);
  }

  if (esInteres(text)) {
    const items = await deps.store.listInventario();
    const item = elegirPublicacion(items, text);
    if (!item) {
      return "Ahorita no tengo esa publicación. ¿Te aviso cuando haya?";
    }
    await deps.store.saveCliente(cliente);
    const interes: InteresGanado = {
      id: newId(),
      inventarioId: item.id,
      chatId: cliente.chatId,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      queLeInteresa: sinMontos(text),
      createdAt: deps.now().toISOString(),
    };
    await deps.store.saveInteres(interes);
    await deps.sendText(
      intermediarioPhone(),
      avisoIntermediario({
        interesadoNombre: cliente.nombre,
        interesadoTelefono: cliente.telefono,
        que: text,
        publicacion: item,
      }),
    );
    const que = [item.cantidad, item.tipo || item.raza || item.especie].filter(Boolean).join(" ");
    return `Va. Alguien del equipo te contacta para lo de ${que}.`;
  }

  return null;
}
