import { NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/admin/promos";
import { runDailySummary } from "@/lib/broadcast/daily";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailySummary(defaultDeps());
  return Response.json(result);
}
