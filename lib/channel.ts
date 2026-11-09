/** Whapi /health: code 4 / AUTH means the channel is connected. */
export function interpretChannelHealth(body: unknown): { ok: boolean; status: string } {
  if (!body || typeof body !== "object") return { ok: false, status: "unknown" };
  const status = (body as { status?: { code?: number; text?: string } }).status;
  const code = status?.code;
  const text = (status?.text || "").toUpperCase();
  if (code === 4 || text === "AUTH") return { ok: true, status: text || "AUTH" };
  if (text) return { ok: false, status: text };
  if (code != null) return { ok: false, status: String(code) };
  return { ok: false, status: "unknown" };
}
