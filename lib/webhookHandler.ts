import { generateReply } from "@/lib/bot";
import { newCliente } from "@/lib/crm";
import { defaultDeps, type Deps } from "@/lib/deps";
import { collectMessages, extractText, isImageMessage, isLocationMessage, type WhapiMessage } from "@/lib/inbound";
import { LOCATION_REPLY } from "@/lib/locations";
import { toMexicoWhatsappJid } from "@/lib/mexicoJid";

export const HUMAN_FALLBACK =
  "Gracias por escribir a Obrador Ixtlahuacán. " +
  "En este momento no puedo generar una respuesta automática; " +
  "un humano te atenderá pronto. WhatsApp: 33 1451 8120.";

function verifySecret(req: Request): boolean {
  const expected = process.env.WEBHOOK_SECRET || "";
  if (!expected) {
    console.warn("[bot] WEBHOOK_SECRET missing — rejecting webhook");
    return false;
  }
  const header =
    req.headers.get("x-bot-webhook-secret") ||
    req.headers.get("X-Bot-Webhook-Secret") ||
    "";
  const query = new URL(req.url).searchParams.get("secret") || "";
  return header === expected || query === expected;
}

function toJid(chatId: string): string {
  try {
    return toMexicoWhatsappJid(chatId);
  } catch {
    return chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
  }
}

async function processMessage(msg: WhapiMessage, deps: Deps): Promise<void> {
  const msgId = msg.id || "";
  if (!(await deps.store.markSeen(msgId))) {
    console.info("[bot] DUPLICATE_MESSAGE id=%s", msgId);
    return;
  }
  const fromMe = msg.from_me === true || msg.fromMe === true;
  if (fromMe) {
    console.info("[bot] ignore fromMe id=%s", msgId);
    return;
  }
  const chatId = msg.chat_id || msg.from || "";
  if (!chatId) {
    console.warn("[bot] message without chat_id/from id=%s", msgId);
    return;
  }
  const jid = toJid(chatId);

  if (isLocationMessage(msg)) {
    console.info("[bot] location ignored id=%s", msgId);
    const cliente =
      (await deps.store.getCliente(chatId)) ?? newCliente(chatId, msg.from || null);
    cliente.telefono = msg.from || cliente.telefono;
    cliente.ultimaConversacion = deps.now().toISOString();
    await deps.store.saveCliente(cliente);
    await deps.sendText(jid, LOCATION_REPLY);
    return;
  }

  const text = extractText(msg);
  if (!text) {
    if (isImageMessage(msg)) {
      const cliente =
        (await deps.store.getCliente(chatId)) ?? newCliente(chatId, msg.from || null);
      cliente.telefono = msg.from || cliente.telefono;
      cliente.ultimaConversacion = deps.now().toISOString();
      await deps.store.saveCliente(cliente);
      await deps.sendText(jid, "Vi tu foto. Cuéntame con palabras y seguimos.");
      return;
    }
    console.info("[bot] ignore non-text type=%s id=%s", msg.type, msgId);
    return;
  }

  console.info("[bot] inbound id=%s to=%s chars=%s", msgId, jid, text.length);
  let reply: string;
  try {
    reply = await generateReply(chatId, text, msg.from || null, deps);
  } catch (err) {
    console.error("[bot] OpenAI failed chat_id=%s", chatId, err);
    reply = HUMAN_FALLBACK;
  }
  await deps.sendText(jid, reply);
  console.info("[bot] replied id=%s chars=%s", msgId, reply.length);
}

export async function handleWebhook(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (!verifySecret(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const messages = collectMessages(payload);
  if (messages.length === 0) {
    return Response.json({ ok: true, ignored: true });
  }
  const errors: string[] = [];
  for (const msg of messages) {
    try {
      await processMessage(msg, deps);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[bot] process error:", message);
      errors.push(message);
    }
  }
  return Response.json({
    ok: true,
    processed: messages.length,
    errors: errors.length ? errors.length : undefined,
  });
}

export function webhookHint(): Response {
  return Response.json({
    ok: true,
    hint: "Webhook listo. Configura Whapi POST a esta URL con eventos messages / messages.post.",
  });
}

export function webhookAuthorized(req: Request): boolean {
  return verifySecret(req);
}
