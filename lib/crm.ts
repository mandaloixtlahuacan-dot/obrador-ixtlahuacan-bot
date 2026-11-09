import { randomUUID } from "crypto";
import type { Cliente, Session, Zona } from "@/lib/types";
import { fold } from "@/lib/text";

export function newCliente(chatId: string, telefono?: string | null): Cliente {
  return {
    chatId,
    telefono: telefono ?? null,
    nombre: null,
    pueblo: null,
    zona: null,
    negocio: null,
    tipoNegocio: null,
    etiquetas: [],
    recibeAvisos: true,
    recibeAvisosCambio: null,
    comparteNumeroGeneral: "sin_preguntar",
    comparteNumeroEn: null,
    kilosHabituales: null,
    frecuencia: null,
    productosInteres: null,
    notasEncargado: null,
    avisoBienvenidaEnviado: false,
    ultimaConversacion: null,
    sinRespuestaAvisos: 0,
    soloResumenSemanal: false,
    fueraDeLista: false,
    animales: [],
    ventas: [],
    busquedas: [],
    pedidos: [],
    vacunas: [],
    citas: [],
    comprasForrajera: [],
  };
}

export function newSession(chatId: string): Session {
  return {
    chatId,
    pending: null,
    misunderstood: 0,
    topic: null,
    updatedAt: null,
  };
}

export function newId(): string {
  return randomUUID();
}

/** Species the customer named. The breed text is kept as they said it. */
export function especieDe(texto: string): string {
  const t = fold(texto);
  if (/vaca|becerro|toro|novillo|bovino|\bres\b|pinta|pinto/.test(t)) {
    return "bovino";
  }
  if (/puerco|cerdo|porcino|cochino|lechon/.test(t)) return "porcino";
  if (/borrego|oveja|ovino|cordero/.test(t)) return "ovino";
  if (/chiva|cabra|caprino|chivo/.test(t)) return "caprino";
  if (/pollo|gallina|\bave\b|guajolote|huevo/.test(t)) {
    return /huevo/.test(t) ? "huevo" : "aves";
  }
  if (/caballo|yegua|equino|burro|mula/.test(t)) return "equino";
  return "otro";
}

export function subetiquetaCarne(tipo: string | null | undefined): string | null {
  const t = fold(tipo || "");
  if (!t) return null;
  if (/taquer/.test(t)) return "carne:taqueria";
  if (/mayoreo|mayorista|distrib/.test(t)) return "carne:mayorista";
  if (/carnic|fonda|restaur|birrier|banquet/.test(t)) return "carne:carniceria";
  return "carne";
}

export function recomputeEtiquetas(c: Cliente): Cliente {
  const manual = c.etiquetas.filter((t) => t.startsWith("manual:"));
  const tags = new Set<string>(manual);
  if (c.pedidos.length || c.tipoNegocio || c.productosInteres) tags.add("carne");
  const sub = subetiquetaCarne(c.tipoNegocio || c.negocio);
  if (sub && sub !== "carne") tags.add(sub);
  if (
    c.animales.length ||
    c.ventas.length ||
    c.busquedas.length ||
    c.vacunas.length
  ) {
    tags.add("ganadero");
  }
  for (const a of c.animales) {
    if (a.especie && a.especie !== "otro") tags.add(`ganadero:${a.especie}`);
  }
  for (const v of c.ventas) {
    if (v.especie && v.especie !== "otro") tags.add(`ganadero:${v.especie}`);
  }
  if (c.zona) tags.add(`zona:${c.zona}`);
  for (const b of c.busquedas.filter((x) => x.activa)) {
    const raza = fold(b.razaTipo).replace(/\s+/g, "");
    if (raza) tags.add(`busca:${raza}`);
  }
  c.etiquetas = [...tags];
  return c;
}

export function resumenFicha(c: Cliente): string {
  const bits: string[] = [];
  if (c.nombre) bits.push(c.nombre);
  if (c.pueblo) bits.push(`de ${c.pueblo}`);
  if (c.negocio) bits.push(`negocio ${c.negocio}`);
  if (c.animales.length) {
    const a = c.animales
      .slice(0, 3)
      .map((x) =>
        [x.cantidad, x.razaTipo || x.especie].filter(Boolean).join(" "),
      )
      .join(", ");
    bits.push(`animales: ${a}`);
  }
  if (c.pedidos.length) bits.push("ya pediste carne por aquí");
  if (!bits.length) return "Todavía no tengo datos tuyos anotados.";
  const avisos = c.recibeAvisos ? "sí te mando avisos" : "no te mando avisos";
  return `Esto es lo que tengo: ${bits.join(", ")}. ${avisos}. Si quieres que lo borre, dime "bórrame".`;
}

export function zonaDePueblo(pueblo: string): Zona | null {
  const t = fold(pueblo);
  if (/ixtlahuacan|cabecera/.test(t)) return "municipio";
  if (/guadalajara|los altos|cuquio|mascota|trejos|zacatecas|consuelo/.test(t)) {
    return "lejos";
  }
  return null;
}

export function clienteEnGrupo(
  c: Cliente,
  grupo: "carne" | "ganadero" | "todos",
): boolean {
  if (!c.recibeAvisos || c.fueraDeLista || c.soloResumenSemanal) return false;
  if (grupo === "todos") return true;
  return c.etiquetas.some((t) => t === grupo || t.startsWith(`${grupo}:`));
}

/** After unanswered broadcasts: weekly-only at 3, off the list at 6. */
export function aplicarSilencio(c: Cliente, unanswered: number): void {
  c.sinRespuestaAvisos = unanswered;
  c.fueraDeLista = unanswered >= 6;
  c.soloResumenSemanal = unanswered >= 3 && unanswered < 6;
}

export function anotarBienvenida(reply: string, c: Cliente): string {
  if (c.avisoBienvenidaEnviado) return reply;
  c.avisoBienvenidaEnviado = true;
  return `${reply}\n\nPor aquí también te van a llegar avisos de ganado en venta y promos de la zona. Si no quieres, contéstame 'ya no' cuando sea.`;
}
