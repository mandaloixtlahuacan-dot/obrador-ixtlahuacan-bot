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

export const INTERMEDIARIO_DEFAULT = "5213310184790";

function asWhatsappJid(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return v.includes("@") ? v : `${v}@s.whatsapp.net`;
}

/** Víctor recibe los intereses de ganado. Default 5213310184790. */
export function intermediarioPhone(): string {
  return asWhatsappJid(process.env.INTERMEDIARIO_PHONE || INTERMEDIARIO_DEFAULT);
}

/** Pedidos de la forrajera. Si no hay variable, van al mismo número del papá. */
export function forrajeraPedidosPhone(): string {
  const propio = (process.env.FORRAJERA_PEDIDOS_PHONE || "").trim();
  if (!propio) return adminPhone();
  return asWhatsappJid(propio);
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}
