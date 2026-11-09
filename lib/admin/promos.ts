import { randomUUID } from "crypto";
import { textoPromoFinal, validarTextoPromo } from "@/lib/broadcast/compose";
import { estimarMinutos, loadBroadcastConfig } from "@/lib/broadcast/policy";
import { clienteEnGrupo, newId } from "@/lib/crm";
import type { Deps } from "@/lib/deps";
import type { Campana, QueueItem } from "@/lib/types";

const TTL_MS = 30 * 60 * 1000;

export function adminAuthorized(req: Request): boolean {
  const token = process.env.ADMIN_API_TOKEN || "";
  if (!token) return false;
  const header = req.headers.get("x-admin-token") || "";
  const auth = req.headers.get("authorization") || "";
  return header === token || auth === `Bearer ${token}`;
}

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function previewPromo(
  body: { grupo?: string; texto?: string },
  deps: Pick<Deps, "store" | "now">,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const grupo = body.grupo;
  if (grupo !== "carne" && grupo !== "ganadero" && grupo !== "todos") {
    return { status: 400, json: { ok: false, error: "grupo_invalido" } };
  }
  const texto = (body.texto || "").trim();
  const invalid = validarTextoPromo(texto);
  if (invalid) return { status: 400, json: { ok: false, error: invalid } };

  const cfg = loadBroadcastConfig();
  const clientes = (await deps.store.listClientes()).filter((c) =>
    clienteEnGrupo(c, grupo),
  );
  const textoFinal = textoPromoFinal(texto, { nombre: "{nombre}", pueblo: "{pueblo}" });
  const minutos = estimarMinutos(clientes.length, cfg);
  const now = deps.now();
  const campana: Campana = {
    id: randomUUID(),
    grupo,
    texto,
    textoFinal,
    destinatarios: clientes.length,
    tiempoEstimadoMin: minutos,
    status: "preview",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    used: false,
  };
  await deps.store.saveCampana(campana);
  return {
    status: 200,
    json: {
      ok: true,
      promo_id: campana.id,
      texto_final: campana.textoFinal,
      destinatarios: campana.destinatarios,
      tiempo_estimado: campana.tiempoEstimadoMin,
      vence_en_min: 30,
      sent: 0,
    },
  };
}

export async function sendPromo(
  id: string,
  deps: Pick<Deps, "store" | "now">,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const campana = await deps.store.getCampana(id);
  if (!campana) return { status: 404, json: { ok: false, error: "not_found" } };
  if (campana.used || campana.status === "queued" || campana.status === "stopped") {
    return { status: 409, json: { ok: false, error: "already_used" } };
  }
  const now = deps.now();
  if (now.toISOString() > campana.expiresAt) {
    return { status: 410, json: { ok: false, error: "expired" } };
  }
  const cfg = loadBroadcastConfig();
  if (!cfg.enabled) {
    return {
      status: 409,
      json: {
        ok: false,
        error: "broadcasts_disabled",
        sent: 0,
        queued: 0,
      },
    };
  }
  const clientes = (await deps.store.listClientes()).filter((c) =>
    clienteEnGrupo(c, campana.grupo),
  );
  const items: QueueItem[] = clientes.map((c) => ({
    id: newId(),
    tipo: "promo",
    chatId: c.chatId,
    cuerpo: textoPromoFinal(campana.texto, c),
    promoId: campana.id,
    priority: 10,
    status: "pending",
    notBefore: now.toISOString(),
    attempts: 0,
    lastError: null,
    createdAt: now.toISOString(),
    sentAt: null,
  }));
  if (items.length) await deps.store.enqueue(items);
  campana.used = true;
  campana.status = "queued";
  campana.destinatarios = items.length;
  await deps.store.saveCampana(campana);
  return {
    status: 200,
    json: { ok: true, queued: items.length, sent: 0, promo_id: campana.id },
  };
}

export async function stopPromo(
  id: string,
  deps: Pick<Deps, "store">,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const campana = await deps.store.getCampana(id);
  if (!campana) return { status: 404, json: { ok: false, error: "not_found" } };
  const cancelled = await deps.store.cancelQueueByPromo(id);
  campana.status = "stopped";
  campana.used = true;
  await deps.store.saveCampana(campana);
  return { status: 200, json: { ok: true, stopped: cancelled, promo_id: id } };
}
