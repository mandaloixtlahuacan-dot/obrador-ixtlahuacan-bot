import type { LeadArgs } from "@/lib/lead";
import type { NegocioConfig, PrecioKg } from "@/lib/types";
import { fold } from "@/lib/text";
import { mexicoParts } from "@/lib/time";

export const MIN_KG = 10;

const SAFE_PORCION =
  "Para decirte cuántos kilos me falta la porción que usa el Obrador. Alguien del equipo te lo confirma. El mínimo del pedido es de 10 kg.";

const SAFE_PRECIO_CARNE =
  "El precio exacto te lo pasa el Obrador cuando arma tu pedido. Yo no lo invento.";

export function formatAdminMessage(
  chatId: string,
  fromNumber: string | null | undefined,
  args: LeadArgs,
  isUpdate: boolean,
): string {
  const header = isUpdate
    ? "🔄 ACTUALIZACIÓN de cotización"
    : "🥩 NUEVA cotización / lead";
  const lines = [header, `WhatsApp chat_id: ${chatId}`];
  if (fromNumber) lines.push(`Número: ${fromNumber}`);
  lines.push(
    `Nombre: ${args.nombre_contacto || "—"}`,
    `Negocio: ${args.nombre_negocio || "—"}`,
    `Productos: ${args.productos || "—"}`,
    `Entrega/recoge: ${args.entrega_o_recoge || "—"}`,
    `Día/horario: ${args.dia_horario || "—"}`,
    `Notas: ${args.notas || "—"}`,
    `Resumen: ${args.resumen || "—"}`,
  );
  return lines.join("\n");
}

function platilloKey(platillo: string, table: Record<string, number>): string | null {
  const want = fold(platillo);
  if (!want) return null;
  const keys = Object.keys(table);
  const scored = keys
    .map((k) => ({ k, f: fold(k) }))
    .filter(({ f }) => want.includes(f) || f.includes(want))
    .sort((a, b) => b.f.length - a.f.length);
  return scored[0]?.k ?? null;
}

function precioVigente(
  precios: PrecioKg[],
  platillo: string,
  now: Date,
): PrecioKg | null {
  const day = mexicoParts(now).isoDate;
  const want = fold(platillo);
  const hits = precios.filter((p) => {
    const name = fold(p.producto);
    if (!name || (!want.includes(name) && !name.includes(want))) return false;
    if (p.vigente_desde && p.vigente_desde > day) return false;
    if (p.vigente_hasta && p.vigente_hasta < day) return false;
    return Number.isFinite(p.precio) && p.precio > 0;
  });
  return hits[0] ?? null;
}

export type PorcionResult =
  | {
      ok: true;
      kilos: number;
      total: number | null;
      precioKg: number | null;
      respuesta: string;
    }
  | { ok: false; respuesta: string };

export function calcularPorcion(
  platillo: string,
  personas: number,
  cfg: NegocioConfig,
  now: Date,
): PorcionResult {
  if (!Number.isFinite(personas) || personas <= 0) {
    return {
      ok: false,
      respuesta: "¿Para cuántas personas es? Con eso y la porción del Obrador te digo los kilos.",
    };
  }
  const key = platilloKey(platillo, cfg.porcion_kg_por_persona);
  if (!key) {
    return { ok: false, respuesta: SAFE_PORCION };
  }
  const porcion = cfg.porcion_kg_por_persona[key];
  if (!Number.isFinite(porcion) || porcion <= 0) {
    return { ok: false, respuesta: SAFE_PORCION };
  }
  let kilos = Math.ceil(personas * porcion);
  if (kilos < MIN_KG) kilos = MIN_KG;
  const precio = precioVigente(cfg.precio_kg, key, now) || precioVigente(cfg.precio_kg, platillo, now);
  if (!precio) {
    return {
      ok: true,
      kilos,
      total: null,
      precioKg: null,
      respuesta: `Para ${personas} personas en ${platillo || key} te sugiero ${kilos} kg. El precio exacto te lo confirma el Obrador. ¿Te lo apartamos?`,
    };
  }
  const total = Math.round(kilos * precio.precio);
  return {
    ok: true,
    kilos,
    total,
    precioKg: precio.precio,
    respuesta: `Para ${personas} personas en ${platillo || key} te sugiero ${kilos} kg. A precio de hoy salen como $${total} (es referencia; el Obrador te confirma). ¿Te lo apartamos?`,
  };
}

export function respuestaPrecioCarne(): string {
  return SAFE_PRECIO_CARNE;
}

export function detectarPersonas(text: string): { personas: number; platillo: string } | null {
  const m = text.match(/(\d{1,4})\s*personas?/i);
  if (!m) return null;
  const folded = fold(text);
  if (!/carne|taco|barbacoa|platillo|kilo|comida|fiesta|banquete|asado/.test(folded)) {
    return null;
  }
  const platillo = /taco/.test(folded)
    ? "tacos"
    : /barbacoa/.test(folded)
      ? "barbacoa"
      : /asado/.test(folded)
        ? "asado"
        : "carne";
  return { personas: Number(m[1]), platillo };
}
