import type { Cliente, PrecioGanado, Venta } from "@/lib/types";
import { fold } from "@/lib/text";
import { especieDe } from "@/lib/crm";
import { mxNational10 } from "@/lib/mexicoJid";

const SIN_PRECIO = (animal: string) =>
  `Hoy no tengo precio confiable de ${animal}; ¿te comunico con alguien que te oriente?`;

export function formatTelefono(input: string | null | undefined): string | null {
  if (!input) return null;
  const n = mxNational10(input);
  if (!n) return null;
  return `${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
}

function stem(s: string): string {
  const t = fold(s).replace(/[^a-z0-9\s]/g, "").trim();
  return t.endsWith("s") ? t.slice(0, -1) : t;
}

export function formatPrecioGanado(animal: string, rows: PrecioGanado[]): string {
  const want = fold(animal);
  const especie = especieDe(animal);
  if (especie === "aves" || especie === "equino" || /pollo|caballo/.test(want)) {
    const friendly = /caballo|equino/.test(want) ? "caballo" : /pollo|ave/.test(want) ? "pollo" : animal;
    const has = rows.some((r) => fold(r.animal) === fold(friendly) || fold(r.animal) === especie);
    if (!has) return SIN_PRECIO(friendly);
  }
  const matches = rows
    .filter((r) => {
      const a = fold(r.animal);
      return a === want || a === especie || want.includes(a) || a.includes(stem(want));
    })
    .filter((r) => r.precioMin != null || r.precioMax != null)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const row = matches.find((r) => fold(r.presentacion) === "pie") || matches[0];
  if (!row || (row.precioMin == null && row.precioMax == null)) {
    return SIN_PRECIO(animal);
  }
  const min = row.precioMin ?? row.precioMax;
  const max = row.precioMax ?? row.precioMin;
  const presentacion = fold(row.presentacion) === "canal" ? "en canal" : "en pie";
  return `Hoy el ${animal} ${presentacion} anda en $${min}–$${max} el kilo, según la referencia del rastro de Guadalajara (SNIIM) del ${row.fecha}.`;
}

export type OfertaMatch = {
  venta: Venta;
  cliente: Cliente;
  telefono: string | null;
  puedeCompartir: boolean;
};

export function puedeCompartirNumero(c: Cliente, venta: Venta): boolean {
  if (c.comparteNumeroGeneral === "no") return false;
  if (venta.comparteNumero) return true;
  return c.comparteNumeroGeneral === "si";
}

function razaParecida(consulta: string, raza: string, especie: string): boolean {
  const q = stem(consulta);
  const r = stem(raza);
  const e = stem(especie);
  if (!q) return false;
  return r.includes(q) || q.includes(r) || e.includes(q) || q.includes(e);
}

function scoreMatch(
  m: OfertaMatch,
  consulta: { pueblo?: string | null; zona?: string | null },
): number {
  let s = 0;
  if (consulta.pueblo && m.venta.pueblo && fold(consulta.pueblo) === fold(m.venta.pueblo)) {
    s += 400;
  } else if (consulta.zona && m.cliente.zona === consulta.zona) {
    s += consulta.zona === "municipio" ? 300 : consulta.zona === "cerca" ? 200 : 100;
  }
  const rec = m.cliente.ultimaConversacion
    ? Date.parse(m.cliente.ultimaConversacion)
    : 0;
  s += Math.min(50, Math.floor(rec / 1e11));
  return s;
}

export function buscarOfertas(
  clientes: Cliente[],
  consulta: { raza: string; pueblo?: string | null; zona?: string | null },
  limit = 3,
): { mostradas: OfertaMatch[]; hayMas: boolean } {
  const all: OfertaMatch[] = [];
  for (const c of clientes) {
    for (const venta of c.ventas) {
      if (venta.estado !== "activa") continue;
      if (!razaParecida(consulta.raza, venta.razaTipo, venta.especie)) continue;
      const ok = puedeCompartirNumero(c, venta);
      all.push({
        venta,
        cliente: c,
        puedeCompartir: ok,
        telefono: ok ? formatTelefono(c.telefono) : null,
      });
    }
  }
  all.sort((a, b) => scoreMatch(b, consulta) - scoreMatch(a, consulta));
  return { mostradas: all.slice(0, limit), hayMas: all.length > limit };
}

export function textoOferta(m: OfertaMatch): string {
  const nombre = m.cliente.nombre || "Un ganadero";
  const pueblo = m.venta.pueblo || m.cliente.pueblo || "la zona";
  const cant = m.venta.cantidad != null ? `${m.venta.cantidad} ` : "";
  const peso = m.venta.pesoEdad ? `, ${m.venta.pesoEdad}` : "";
  const base = `${nombre} en ${pueblo} (${cant}${m.venta.razaTipo || m.venta.especie}${peso})`;
  if (m.puedeCompartir && m.telefono) {
    return `${base}. Su número es ${m.telefono}. Ahí le dices que vienes del Obrador`;
  }
  return base;
}

export function animalsSinPrecioConfiable(animal: string): boolean {
  const e = especieDe(animal);
  return e === "aves" || e === "equino";
}
