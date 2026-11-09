import { NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/admin/promos";
import { dispatchTick } from "@/lib/broadcast/dispatch";
import { loadBroadcastConfig } from "@/lib/broadcast/policy";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const deps = defaultDeps();
  const result = await dispatchTick({
    store: deps.store,
    now: deps.now(),
    cfg: loadBroadcastConfig(),
    sendText: deps.sendText,
    rng: deps.rng,
    channelHealth: deps.channelHealth,
  });
  return Response.json({ ok: true, ...result });
}
