import { NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/admin/promos";
import { loadBroadcastConfig } from "@/lib/broadcast/policy";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cfg = loadBroadcastConfig();
  if (!cfg.enabled) {
    return Response.json({ ok: true, checked: false, reason: "disabled" });
  }
  const deps = defaultDeps();
  const health = await deps.channelHealth();
  if (!health.ok) {
    const brake = await deps.store.getBrake();
    await deps.store.setBrake({
      ...brake,
      activo: true,
      motivo: `canal:${health.status}`,
    });
  }
  return Response.json({ ok: true, checked: true, channel: health.status, healthy: health.ok });
}
