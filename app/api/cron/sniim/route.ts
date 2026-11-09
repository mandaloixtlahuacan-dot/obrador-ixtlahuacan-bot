import { NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/admin/promos";
import { loadDailyPrices } from "@/lib/sniim";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await loadDailyPrices();
  return Response.json({ ok: true, ...result });
}
