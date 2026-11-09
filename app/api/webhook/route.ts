import { NextRequest, NextResponse } from "next/server";
import { handleWebhook, webhookAuthorized, webhookHint } from "@/lib/webhookHandler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleWebhook(req);
}

export async function GET(req: NextRequest) {
  if (!webhookAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return webhookHint();
}
