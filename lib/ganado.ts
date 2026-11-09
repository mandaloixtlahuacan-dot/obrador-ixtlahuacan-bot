import type { PrecioGanado } from "@/lib/types";
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

export function animalsSinPrecioConfiable(animal: string): boolean {
  const e = especieDe(animal);
  return e === "aves" || e === "equino";
}
