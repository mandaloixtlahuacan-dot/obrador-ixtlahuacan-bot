import { NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/admin/promos";
import { runDailySummary, runReminders } from "@/lib/broadcast/daily";
import { loadBroadcastConfig } from "@/lib/broadcast/policy";
import { defaultDeps } from "@/lib/deps";
import { loadDailyPrices } from "@/lib/sniim";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One daily pass for the Hobby plan (Vercel allows two crons, each once a day).
 * The separate routes stay for a manual call or a Pro schedule.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const deps = defaultDeps();
  const cfg = loadBroadcastConfig();
  const reminders = await runReminders(deps);
  const summary = await runDailySummary(deps);
  const sniim = await loadDailyPrices();
  let channel: { checked: boolean; reason?: string; status?: string; healthy?: boolean } = {
    checked: false,
    reason: "disabled",
  };
  if (cfg.enabled) {
    const health = await deps.channelHealth();
    if (!health.ok) {
      const brake = await deps.store.getBrake();
      await deps.store.setBrake({
        ...brake,
        activo: true,
        motivo: `canal:${health.status}`,
      });
    }
    channel = { checked: true, status: health.status, healthy: health.ok };
  }
  return Response.json({ ok: true, reminders, summary, sniim, channel });
}
