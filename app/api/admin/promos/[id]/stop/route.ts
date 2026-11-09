import { NextRequest } from "next/server";
import { adminAuthorized, stopPromo } from "@/lib/admin/promos";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!adminAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await stopPromo(id, defaultDeps());
  return Response.json(result.json, { status: result.status });
}
