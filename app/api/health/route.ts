import { NextResponse } from "next/server";
import { healthInfo } from "@/lib/healthInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await healthInfo());
}
