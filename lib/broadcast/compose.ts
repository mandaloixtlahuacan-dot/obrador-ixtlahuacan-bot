import type { Cliente, Venta } from "@/lib/types";
import { fold } from "@/lib/text";

const SHORTENER =
  /(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|rb\.gy|cutt\.ly|is\.gd|buff\.ly|ow\.ly|shorturl\.at)\b/i;

const URGENCY = /¡{2,}|ultimo dia|urgente|corre\b|ultimos\b/i;

export function hasShortLink(text: string): boolean {
  return SHORTENER.test(text);
}

export function hasUrgency(text: string): boolean {
  if (URGENCY.test(fold(text))) return true;
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letters.length < 20) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
  return upper / letters.length > 0.6;
}

export function variantIndex(seed: string, n: number): number {
  if (n <= 1) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  return h % n;
}

export type SaleNotice = {
  nombre: string;
  pueblo: string;
  vendedor: string;
  cantidad: string;
  animal: string;
  raza: string;
  peso: string;
  contacto: string;
};

function fill(p: SaleNotice): string[] {
  const quien = p.nombre ? `Hola ${p.nombre}` : "Hola";
  const de = p.pueblo ? ` de ${p.pueblo}` : "";
  const peso = p.peso ? `, unos ${p.peso}` : "";
  const que = [p.cantidad, p.animal, p.raza].filter(Boolean).join(" ");
  const cola =
    "¿Te interesa? Contéstame. Si ya no quieres avisos, dime 'ya no'.";
  return [
    `${quien} 👋 ${p.vendedor}${de} vende ${que}${peso}. ${p.contacto} ${cola}`,
    `${quien}, por tu zona hay ${que}${peso}. Los ofrece ${p.vendedor}${de}. ${p.contacto} ${cola}`,
    `${quien} 👋 Te paso un aviso: ${p.vendedor}${de} tiene ${que}${peso}. ${p.contacto} ${cola}`,
    `${quien}, ${p.vendedor}${de} anda vendiendo ${que}${peso}. ${p.contacto} ${cola}`,
  ];
}

export function avisoVenta(p: SaleNotice, seed: string): string {
  const variants = fill(p);
  return variants[variantIndex(seed, variants.length)];
}

export function resumenVentas(nombre: string | null, ventas: Venta[]): string {
  const hola = nombre ? `Hola ${nombre}` : "Hola";
  const lineas = ventas.slice(0, 8).map((v, i) => {
    const cant = v.cantidad != null ? `${v.cantidad} ` : "";
    const pueblo = v.pueblo ? `, ${v.pueblo}` : "";
    return `${i + 1}) ${cant}${v.razaTipo || v.especie}${pueblo}`;
  });
  return `${hola}, esto se vende hoy por la zona:\n${lineas.join("\n")}\n¿Te interesa alguno? Contéstame el número.\nSi ya no quieres avisos, dime 'ya no'.`;
}

export function textoPromoFinal(template: string, cliente: Pick<Cliente, "nombre" | "pueblo">): string {
  const nombre = cliente.nombre?.trim() || "";
  const pueblo = cliente.pueblo?.trim() || "";
  let body = template.replaceAll("{nombre}", nombre).replaceAll("{pueblo}", pueblo);
  body = body.replace(/\s{2,}/g, " ").trim();
  if (!nombre) body = body.replace(/^hola\s*,?\s*/i, "Hola. ");
  if (!/ya no/i.test(body)) {
    body = `${body}\nSi ya no quieres avisos, dime 'ya no'.`;
  }
  if (!/contestame|te interesa/i.test(fold(body))) {
    body = `${body}\n¿Te interesa? Contéstame.`;
  }
  return body.trim();
}

export function validarTextoPromo(texto: string): string | null {
  if (!texto.trim()) return "texto_vacio";
  if (hasShortLink(texto)) return "link_acortado";
  if (hasUrgency(texto)) return "urgencia";
  if (texto.length > 700) return "muy_largo";
  return null;
}
