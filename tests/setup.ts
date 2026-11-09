import { beforeEach, vi } from "vitest";

const ENV_KEYS = [
  "BROADCASTS_ENABLED",
  "REMINDERS_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BROADCAST_WEEK",
  "BROADCAST_PER_HOUR",
  "BROADCAST_PER_DAY",
  "BROADCAST_PER_PERSON_DAY",
  "BROADCAST_PER_PERSON_WEEK",
  "BROADCAST_HOLIDAYS",
  "ADMIN_API_TOKEN",
  "CRON_SECRET",
];

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.WEBHOOK_SECRET = "test-secret";
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.WHAPI_TOKEN = "test-whapi";
  process.env.ADMIN_PHONE = "5213312974282@s.whatsapp.net";
  vi.stubGlobal("fetch", () => {
    throw new Error("fetch real no está permitido en los tests");
  });
});
