import { adminPhone } from "@/lib/config";
import { formatAdminMessage } from "@/lib/carne";
import { redactCustomerLocation } from "@/lib/locations";
import type { LeadArgs } from "@/lib/lead";
import type { Store } from "@/lib/store/types";

function clean(args: LeadArgs): LeadArgs {
  const out: LeadArgs = { ...args };
  const keys = ["entrega_o_recoge", "notas", "resumen", "dia_horario"] as const;
  for (const k of keys) {
    if (out[k]) out[k] = redactCustomerLocation(String(out[k]));
  }
  return out;
}

export async function notifyAdminLead(opts: {
  chatId: string;
  fromNumber: string | null | undefined;
  args: LeadArgs;
  store: Store;
  sendText: (to: string, body: string) => Promise<void>;
}): Promise<Record<string, unknown>> {
  const args = clean(opts.args);
  const esActualizacion = Boolean(args.es_actualizacion);
  const state = await opts.store.getLead(opts.chatId);

  let isUpdate = false;
  if (!state.sent) {
    isUpdate = false;
    state.sent = true;
  } else if (esActualizacion && !state.updated) {
    isUpdate = true;
    state.updated = true;
  } else if (!state.updated) {
    isUpdate = true;
    state.updated = true;
  } else {
    console.info(
      "[bot] Skip duplicate admin alert chat_id=%s (already sent+updated)",
      opts.chatId,
    );
    return {
      ok: true,
      skipped: true,
      reason: "already_notified",
      message: "Ya se notificó al admin de este pedido y su actualización.",
    };
  }

  await opts.store.saveLead(opts.chatId, state);
  const body = formatAdminMessage(opts.chatId, opts.fromNumber, args, isUpdate);
  try {
    await opts.sendText(adminPhone(), body);
    console.info("[bot] Admin notified chat_id=%s update=%s", opts.chatId, isUpdate);
    return {
      ok: true,
      skipped: false,
      is_update: isUpdate,
      message: "Pedido enviado al administrador del obrador.",
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    console.error("[bot] Failed to notify admin chat_id=%s", opts.chatId, err);
    if (isUpdate) state.updated = false;
    else state.sent = false;
    await opts.store.saveLead(opts.chatId, state);
    return {
      ok: false,
      error: name,
      message: "No se pudo notificar al admin; intenta de nuevo si el cliente confirma.",
    };
  }
}
