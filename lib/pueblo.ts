import type { Zona } from "@/lib/types";
import { fold, norm } from "@/lib/text";

export type PuebloParse = { pueblo: string; zona: Zona };

const KNOWN: { re: RegExp; pueblo: string; zona: Zona }[] = [
  { re: /ixtlahuacan|cabecera/, pueblo: "Ixtlahuacán del Río", zona: "municipio" },
  { re: /guadalajara|\bgdl\b|zapopan|tlaquepaque/, pueblo: "Guadalajara y alrededores", zona: "lejos" },
  { re: /los altos/, pueblo: "Los Altos", zona: "lejos" },
  { re: /cuquio/, pueblo: "Cuquío", zona: "lejos" },
  { re: /mascota/, pueblo: "Mascota", zona: "lejos" },
  { re: /trejos/, pueblo: "Trejos", zona: "lejos" },
  { re: /zacatecas/, pueblo: "Zacatecas", zona: "lejos" },
  { re: /el consuelo|consuelo/, pueblo: "El Consuelo", zona: "lejos" },
];

export const PUEBLO_PASO_1 =
  "¿De dónde eres?\n1) Ixtlahuacán del Río (cabecera)\n2) Un rancho por aquí cerca\n3) De más lejos";

export const PUEBLO_RANCHO = "¿De qué rancho?";

export const PUEBLO_LEJOS =
  "¿Por dónde?\n1) Guadalajara y alrededores\n2) Los Altos\n3) Otro lugar";

export const PUEBLO_OTRO =
  "¿Cuál? Por ejemplo Cuquío, Mascota, Trejos, Zacatecas, El Consuelo u otro rancho.";

export function opcionesDe(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d\)/.test(l));
}

/** "soy de Cuquío" skips the menu. Bare "de res" does not. */
export function parsePuebloMention(text: string): PuebloParse | null {
  const t = fold(text);
  const m = t.match(/\b(?:soy de|somos de|vivo en|vivimos en|ando en|estoy en)\s+(.+)/);
  if (!m) return null;
  const raw = m[1].replace(/[.!?].*$/, "").trim();
  if (!raw || raw.length < 3) return null;
  for (const k of KNOWN) {
    if (k.re.test(raw)) return { pueblo: k.pueblo, zona: k.zona };
  }
  const pretty = raw.replace(/\s+/g, " ");
  const zona: Zona = /rancho|cerca/.test(pretty) ? "cerca" : "lejos";
  return { pueblo: pretty, zona };
}

export type PuebloStep = "origen" | "rancho" | "lejos" | "otro";

export function advancePueblo(
  step: PuebloStep,
  text: string,
): { done?: PuebloParse; next?: PuebloStep; ask: string } {
  const direct = parsePuebloMention(text);
  if (direct) return { done: direct, ask: "" };

  const t = norm(text);
  const choice = t.match(/^([123])\b/)?.[1] || "";
  const rawRest = text
    .trim()
    .replace(/^[123]\s*[,.)\-]?\s*/i, "")
    .replace(/^de\s+/i, "")
    .trim();

  if (step === "origen") {
    if (choice === "1" || /cabecera|ixtlahuacan/.test(t)) {
      return {
        done: { pueblo: "Ixtlahuacán del Río", zona: "municipio" },
        ask: "",
      };
    }
    if (choice === "2" || t === "rancho" || /rancho por aqui/.test(t)) {
      if (
        rawRest &&
        !/^un rancho/i.test(rawRest) &&
        fold(rawRest) !== "un rancho por aqui cerca"
      ) {
        return { done: { pueblo: rawRest, zona: "cerca" }, ask: "" };
      }
      return { next: "rancho", ask: PUEBLO_RANCHO };
    }
    if (choice === "3" || /mas lejos|de mas lejos/.test(t)) {
      return { next: "lejos", ask: PUEBLO_LEJOS };
    }
    return { next: "origen", ask: PUEBLO_PASO_1 };
  }

  if (step === "rancho") {
    const pueblo = text.trim().replace(/^[23][,.)\s-]*/, "").trim();
    if (!pueblo) return { next: "rancho", ask: PUEBLO_RANCHO };
    return { done: { pueblo, zona: "cerca" }, ask: "" };
  }

  if (step === "lejos") {
    if (choice === "1" || /guadalajara/.test(t)) {
      return { done: { pueblo: "Guadalajara y alrededores", zona: "lejos" }, ask: "" };
    }
    if (choice === "2" || /los altos/.test(t)) {
      return { done: { pueblo: "Los Altos", zona: "lejos" }, ask: "" };
    }
    if (choice === "3" || /otro/.test(t)) {
      return { next: "otro", ask: PUEBLO_OTRO };
    }
    for (const k of KNOWN) {
      if (k.re.test(t)) return { done: { pueblo: k.pueblo, zona: k.zona }, ask: "" };
    }
    return { next: "lejos", ask: PUEBLO_LEJOS };
  }

  const pueblo = text.trim();
  if (!pueblo) return { next: "otro", ask: PUEBLO_OTRO };
  for (const k of KNOWN) {
    if (k.re.test(fold(pueblo))) {
      return { done: { pueblo: k.pueblo, zona: k.zona }, ask: "" };
    }
  }
  return { done: { pueblo, zona: "lejos" }, ask: "" };
}
