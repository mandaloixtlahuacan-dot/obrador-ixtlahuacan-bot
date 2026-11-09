import type { GuiaRacion, NegocioConfig, PromoForrajera } from "@/lib/types";
import { mensajeForrajeraLugar } from "@/lib/locations";
import { fold } from "@/lib/text";
import { mexicoParts } from "@/lib/time";

export function mensajeForrajera(cfg: NegocioConfig): string {
  const f = cfg.ubicaciones.forrajera;
  const base = mensajeForrajeraLugar(f.horario, f.telefono);
  if (!f.catalogo.length) {
    return `${base} La disponibilidad te la confirma alguien del equipo.`;
  }
  return `${base} Tienen: ${f.catalogo.slice(0, 6).join(", ")}.`;
}

export function mensajeDosis(): string {
  return "Eso mejor con tu veterinario o en mostrador.";
}

export function guiaAlimento(
  para: string,
  objetivo: string,
  guias: GuiaRacion[],
): string {
  const p = fold(para);
  const o = fold(objetivo);
  const hit = guias.find((g) => {
    const gp = fold(g.para);
    const go = fold(g.objetivo);
    const paraOk = gp.includes(p) || p.includes(gp);
    const objOk = !o || go.includes(o) || o.includes(go);
    return paraOk && objOk && g.texto.trim();
  });
  if (!hit) {
    return "La ración exacta te la confirma la forrajera o tu veterinario; no quiero inventarte una fórmula.";
  }
  return `${hit.texto.trim()} Todo esto lo tienen en la forrajera, ¿te paso cómo llegar?`;
}

export function promosVigentes(promos: PromoForrajera[], now: Date): PromoForrajera[] {
  const day = mexicoParts(now).isoDate;
  return promos.filter((p) => p.vigenteHasta >= day && p.producto.trim());
}

export function mensajePromo(p: PromoForrajera): string {
  const presentacion = p.presentacion ? ` ${p.presentacion}` : "";
  return `Hoy en la forrajera hay ${p.producto}${presentacion}, hasta el ${p.vigenteHasta}. ¿Lo pido con el equipo?`;
}

export function mensajeSinPromo(): string {
  return "Ahorita no tengo una promo cargada en la forrajera. Alguien del equipo te confirma.";
}
