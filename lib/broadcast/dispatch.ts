import { capReason, isWithinSendWindow, pauseSeconds, shouldBrake, type BroadcastConfig } from "@/lib/broadcast/policy";
import { newId } from "@/lib/crm";
import type { Deps } from "@/lib/deps";
import type { Store } from "@/lib/store/types";
import { startOfMexicoDay, startOfMexicoWeek } from "@/lib/time";

export type TickResult = { sent: number; reason: string };

export async function dispatchTick(opts: {
  store: Store;
  now: Date;
  cfg: BroadcastConfig;
  sendText: Deps["sendText"];
  rng: () => number;
  channelHealth: Deps["channelHealth"];
}): Promise<TickResult> {
  if (!opts.cfg.enabled) return { sent: 0, reason: "disabled" };
  const brake = await opts.store.getBrake();
  if (brake.activo) return { sent: 0, reason: "paused" };
  if (brake.holdUntil && brake.holdUntil > opts.now.toISOString()) {
    return { sent: 0, reason: "pacing" };
  }

  const health = await opts.channelHealth();
  const brakeWhy = shouldBrake({
    consecutiveFails: brake.failStreak,
    failsInHour: 0,
    attemptsInHour: 0,
    optOutsInBatch: 0,
    sendsInBatch: 0,
    channelOk: health.ok,
    cfg: opts.cfg,
  });
  if (brakeWhy === "canal" || brakeWhy === "fallos_seguidos") {
    await opts.store.setBrake({
      ...brake,
      activo: true,
      motivo: brakeWhy,
    });
    return { sent: 0, reason: brakeWhy };
  }

  if (!isWithinSendWindow(opts.now, opts.cfg)) {
    return { sent: 0, reason: "outside_hours" };
  }

  const hourAgo = new Date(opts.now.getTime() - 60 * 60 * 1000).toISOString();
  const dayStart = startOfMexicoDay(opts.now).toISOString();
  const weekStart = startOfMexicoWeek(opts.now).toISOString();
  const until = new Date(opts.now.getTime() + 1).toISOString();
  const sentThisHour = await opts.store.countSent(hourAgo, until);
  const sentToday = await opts.store.countSent(dayStart, until);
  if (sentThisHour >= opts.cfg.perHour) return { sent: 0, reason: "hour_cap" };
  if (sentToday >= opts.cfg.perDay) return { sent: 0, reason: "day_cap" };

  const item = await opts.store.nextQueueItem(opts.now.toISOString());
  if (!item) return { sent: 0, reason: "empty" };

  const cliente = await opts.store.getCliente(item.chatId);
  if (!cliente || !cliente.recibeAvisos || cliente.fueraDeLista) {
    item.status = "skipped";
    item.lastError = "no_eligible";
    await opts.store.saveQueueItem(item);
    return { sent: 0, reason: "skipped" };
  }
  const personDay = await opts.store.countSentFor(item.chatId, dayStart, until);
  const personWeek = await opts.store.countSentFor(item.chatId, weekStart, until);
  const person = capReason(
    {
      sentThisHour: 0,
      sentToday: 0,
      sentPersonToday: personDay,
      sentPersonWeek: personWeek,
    },
    opts.cfg,
  );
  if (person) {
    item.status = "skipped";
    item.lastError = person;
    await opts.store.saveQueueItem(item);
    return { sent: 0, reason: person };
  }

  try {
    await opts.sendText(item.chatId, item.cuerpo);
  } catch (err) {
    item.attempts += 1;
    item.lastError = err instanceof Error ? err.name : "Error";
    item.status = item.attempts >= 3 ? "failed" : "pending";
    await opts.store.saveQueueItem(item);
    const streak = brake.failStreak + 1;
    const fails = await opts.store.countByStatus(hourAgo, until, "failed");
    const attempts = sentThisHour + fails + 1;
    const why = shouldBrake({
      consecutiveFails: streak,
      failsInHour: fails + 1,
      attemptsInHour: attempts,
      optOutsInBatch: 0,
      sendsInBatch: 0,
      channelOk: true,
      cfg: opts.cfg,
    });
    await opts.store.setBrake({
      activo: Boolean(why),
      motivo: why,
      failStreak: streak,
      holdUntil: brake.holdUntil,
    });
    await opts.store.logSend({
      id: newId(),
      chatId: item.chatId,
      tipo: item.tipo,
      status: "failed",
      createdAt: opts.now.toISOString(),
    });
    return { sent: 0, reason: why || "send_failed" };
  }

  item.status = "sent";
  item.sentAt = opts.now.toISOString();
  await opts.store.saveQueueItem(item);
  await opts.store.logSend({
    id: newId(),
    chatId: item.chatId,
    tipo: item.tipo,
    status: "sent",
    createdAt: opts.now.toISOString(),
  });
  cliente.sinRespuestaAvisos += 1;
  if (cliente.sinRespuestaAvisos >= opts.cfg.dropAfter) {
    cliente.fueraDeLista = true;
    cliente.soloResumenSemanal = false;
  } else if (cliente.sinRespuestaAvisos >= opts.cfg.cooldownAfter) {
    cliente.soloResumenSemanal = true;
  }
  await opts.store.saveCliente(cliente);
  const pause = pauseSeconds(sentToday + 1, opts.cfg, opts.rng);
  await opts.store.setBrake({
    activo: false,
    motivo: null,
    failStreak: 0,
    holdUntil: new Date(opts.now.getTime() + pause * 1000).toISOString(),
  });
  return { sent: 1, reason: "sent" };
}
