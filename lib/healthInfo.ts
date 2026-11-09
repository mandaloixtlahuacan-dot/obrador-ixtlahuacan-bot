import { broadcastsEnabled, remindersEnabled, supabaseConfigured } from "@/lib/config";
import { getStore } from "@/lib/store";

export async function healthInfo(): Promise<Record<string, unknown>> {
  const configured = supabaseConfigured();
  let connected = false;
  let mode: "memory" | "supabase" = "memory";
  if (configured) {
    const store = getStore();
    mode = store.mode;
    try {
      connected = await store.ping();
    } catch {
      connected = false;
    }
  }
  return {
    ok: true,
    status: connected || !configured ? "ok" : "degraded",
    service: "obrador-ixtlahuacan-bot",
    version: "3.0.0",
    whapi_token: process.env.WHAPI_TOKEN ? "set" : "missing",
    openai_api_key: process.env.OPENAI_API_KEY ? "set" : "missing",
    webhook_secret: process.env.WEBHOOK_SECRET ? "set" : "missing",
    admin_api_token: process.env.ADMIN_API_TOKEN ? "set" : "missing",
    supabase_url: process.env.SUPABASE_URL ? "set" : "missing",
    supabase_service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    max_history: Number.parseInt(process.env.MAX_HISTORY || "24", 10) || 24,
    admin_phone: process.env.ADMIN_PHONE || "5213312974282@s.whatsapp.net",
    broadcasts_enabled: broadcastsEnabled(),
    reminders_enabled: remindersEnabled(),
    database: { configured, connected, mode: configured ? mode : "memory" },
  };
}
