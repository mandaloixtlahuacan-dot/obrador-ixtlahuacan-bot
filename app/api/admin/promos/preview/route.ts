import { NextRequest } from "next/server";
import { adminAuthorized, previewPromo } from "@/lib/admin/promos";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!adminAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { grupo?: string; texto?: string } = {};
  try {
    body = (await req.json()) as { grupo?: string; texto?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const deps = defaultDeps();
  const result = await previewPromo(body, deps);
  return Response.json(result.json, { status: result.status });
}
