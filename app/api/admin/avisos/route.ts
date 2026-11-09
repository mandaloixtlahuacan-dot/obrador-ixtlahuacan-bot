import { NextRequest } from "next/server";
import { adminAuthorized } from "@/lib/admin/promos";
import { defaultDeps } from "@/lib/deps";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!adminAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { action?: string } = {};
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const deps = defaultDeps();
  const brake = await deps.store.getBrake();
  if (body.action === "pause") {
    await deps.store.setBrake({ ...brake, activo: true, motivo: "manual" });
    return Response.json({ ok: true, activo: true });
  }
  if (body.action === "resume") {
    await deps.store.setBrake({ ...brake, activo: false, motivo: null, failStreak: 0 });
    return Response.json({ ok: true, activo: false });
  }
  return Response.json({ ok: false, error: "action_invalida" }, { status: 400 });
}
