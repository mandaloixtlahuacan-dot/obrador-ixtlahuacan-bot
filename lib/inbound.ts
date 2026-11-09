export type LocFields = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  name?: string;
  address?: string;
  comment?: string;
  caption?: string;
};

export type WhapiMessage = {
  id?: string;
  from_me?: boolean;
  fromMe?: boolean;
  chat_id?: string;
  from?: string;
  from_name?: string;
  type?: string;
  text?: { body?: string } | string;
  body?: string;
  link_preview?: { body?: string };
  location?: LocFields;
  live_location?: LocFields;
  image?: unknown;
};

export function isLocationMessage(msg: WhapiMessage): boolean {
  const mtype = msg.type || "";
  return mtype === "location" || mtype === "live_location" || (!mtype && !!msg.location);
}

export function isImageMessage(msg: WhapiMessage): boolean {
  return msg.type === "image" || msg.type === "video";
}

/** Text only. Location pins are not turned into text and are never stored. */
export function extractText(msg: WhapiMessage): string | null {
  const mtype = msg.type || "";
  if (mtype === "location" || mtype === "live_location" || msg.location || msg.live_location) {
    if (mtype === "location" || mtype === "live_location" || (!mtype && (msg.location || msg.live_location))) {
      return null;
    }
  }

  if (mtype === "text" || mtype === "") {
    if (typeof msg.text === "string" && msg.text.trim()) return msg.text.trim();
    if (msg.text && typeof msg.text === "object" && msg.text.body?.trim()) {
      return msg.text.body.trim();
    }
    if (typeof msg.body === "string" && msg.body.trim()) return msg.body.trim();
    if (mtype === "text") return null;
  }

  if (mtype === "link_preview") {
    const body = msg.link_preview?.body?.trim();
    return body || null;
  }

  if (typeof msg.text === "string" && msg.text.trim()) return msg.text.trim();
  if (msg.text && typeof msg.text === "object" && msg.text.body?.trim()) {
    return msg.text.body.trim();
  }
  if (typeof msg.body === "string" && msg.body.trim()) return msg.body.trim();
  return null;
}

export function collectMessages(payload: unknown): WhapiMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;

  const event = p.event;
  if (event && typeof event === "object") {
    const et = (event as Record<string, unknown>).type;
    if (typeof et === "string" && et && et !== "messages") return [];
  }

  if (Array.isArray(p.messages)) {
    return p.messages.filter((m): m is WhapiMessage => !!m && typeof m === "object");
  }
  if (p.message && typeof p.message === "object") return [p.message as WhapiMessage];
  if (p.data && typeof p.data === "object") {
    const d = p.data as Record<string, unknown>;
    if (Array.isArray(d.messages)) {
      return d.messages.filter((m): m is WhapiMessage => !!m && typeof m === "object");
    }
  }
  return [];
}
