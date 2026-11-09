import negocioJson from "@/config/negocio.json";
import type { NegocioConfig } from "@/lib/types";

export const OBRADOR_MAPS = "https://maps.google.com/?q=20.8552464,-103.2460428";
export const FORRAJERA_MAPS = "https://maps.google.com/?q=20.874329,-103.232947";
export const OBRADOR_NOMBRE = "Obrador";
export const FORRAJERA_NOMBRE = "Forrajera El Corral de Piedra";

/** Old Maps pin name. Never shown to customers. */
export const NOMBRE_PIN_PROHIBIDO = "Forrajes y Quesos Hermanos Sánchez";

const SAFE_EQUIPO =
  "Te lo confirma alguien del equipo.";

export function loadNegocio(): NegocioConfig {
  return negocioJson as NegocioConfig;
}

export function blank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

export function encargadoNombre(cfg: NegocioConfig = loadNegocio()): string {
  const name =
    cfg.encargados.obrador.trim() ||
    cfg.encargados.citas.trim() ||
    cfg.encargados.forrajera.trim();
  return name || "alguien del equipo";
}

export function mensajeSinDato(que: string): string {
  return `${que} ${SAFE_EQUIPO.charAt(0).toLowerCase()}${SAFE_EQUIPO.slice(1)}`;
}

export function broadcastsEnabled(): boolean {
  const v = (process.env.BROADCASTS_ENABLED || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function remindersEnabled(): boolean {
  const v = (process.env.REMINDERS_ENABLED || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function adminPhone(): string {
  return (process.env.ADMIN_PHONE || "5213312974282@s.whatsapp.net").trim();
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}
