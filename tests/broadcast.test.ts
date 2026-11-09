import { describe, expect, it } from "vitest";
import { previewPromo, sendPromo, stopPromo } from "@/lib/admin/promos";
import { hasShortLink, textoPromoFinal, validarTextoPromo, avisoVenta } from "@/lib/broadcast/compose";
import { dispatchTick } from "@/lib/broadcast/dispatch";
import { planSaleNotices } from "@/lib/broadcast/plan";
import {
  capReason,
  isWithinSendWindow,
  loadBroadcastConfig,
  pauseSeconds,
  prioridadAviso,
  WEEK_CAPS,
} from "@/lib/broadcast/policy";
import { newCliente, newId, recomputeEtiquetas } from "@/lib/crm";
import { MemoryStore } from "@/lib/store/memory";
import { mexicoDate } from "@/lib/time";
import type { QueueItem, Venta } from "@/lib/types";
import { makeDeps } from "./helpers";

function clienteQueEscribio(chatId: string, nombre: string) {
  const c = newCliente(chatId, chatId);
  c.nombre = nombre;
  c.pueblo = "Ixtlahuacán del Río";
  c.ultimaConversacion = "2026-11-09T15:00:00.000Z";
  return c;
}

describe("avisos apagados por defecto", () => {
  it("la cola no manda nada si BROADCASTS_ENABLED no está prendido", async () => {
    const store = new MemoryStore();
    const c = clienteQueEscribio("5215551112233@s.whatsapp.net", "Ana");
    await store.saveCliente(c);
    const item: QueueItem = {
      id: newId(),
      tipo: "venta",
      chatId: c.chatId,
      cuerpo: "Hola Ana, hay una venta. Si ya no quieres avisos, dime 'ya no'.",
      promoId: null,
      priority: 1,
      status: "pending",
      notBefore: "2026-11-09T16:00:00.000Z",
      attempts: 0,
      lastError: null,
      createdAt: "2026-11-09T16:00:00.000Z",
      sentAt: null,
    };
    await store.enqueue([item]);
    const { deps, sent } = makeDeps({ store, now: mexicoDate("2026-11-09T10:00:00") });
    const result = await dispatchTick({
      store,
      now: deps.now(),
      cfg: loadBroadcastConfig(),
      sendText: deps.sendText,
      rng: () => 0,
      channelHealth: deps.channelHealth,
    });
    expect(loadBroadcastConfig().enabled).toBe(false);
    expect(result).toEqual({ sent: 0, reason: "disabled" });
    expect(sent).toHaveLength(0);
    expect((await store.nextQueueItem(deps.now().toISOString()))?.status).toBe("pending");
  });

  it("una venta no arma cola mientras los avisos están apagados", () => {
    const seller = clienteQueEscribio("5213310000001@s.whatsapp.net", "Juan");
    const otro = clienteQueEscribio("5215551112233@s.whatsapp.net", "Ana");
    const venta: Venta = {
      id: "v1",
      chatId: seller.chatId,
      especie: "bovino",
      razaTipo: "pintas",
      cantidad: 5,
      pesoEdad: "400 kg",
      pueblo: "la Cofradía",
      comparteNumero: true,
      estado: "activa",
      createdAt: "2026-11-09T16:00:00.000Z",
    };
    const items = planSaleNotices({
      venta,
      seller,
      clientes: [seller, otro],
      cfg: loadBroadcastConfig(),
      now: new Date("2026-11-09T16:00:00.000Z"),
    });
    expect(items).toEqual([]);
  });
});

describe("preview no envía", () => {
  it("preview cuenta gente y send no manda si el interruptor está apagado", async () => {
    const store = new MemoryStore();
    const ana = clienteQueEscribio("5215551112233@s.whatsapp.net", "Ana");
    const luis = clienteQueEscribio("5215551112244@s.whatsapp.net", "Luis");
    luis.recibeAvisos = false;
    await store.saveCliente(ana);
    await store.saveCliente(luis);
    const { deps, sent } = makeDeps({ store });
    const preview = await previewPromo(
      { grupo: "todos", texto: "En la forrajera hay avena. ¿Te interesa? Contéstame." },
      deps,
    );
    expect(preview.status).toBe(200);
    expect(preview.json.sent).toBe(0);
    expect(preview.json.destinatarios).toBe(1);
    expect(String(preview.json.texto_final)).toMatch(/ya no/);
    expect(sent).toHaveLength(0);
    expect(store.queue).toHaveLength(0);

    const id = String(preview.json.promo_id);
    const blocked = await sendPromo(id, deps);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toBe("broadcasts_disabled");
    expect(sent).toHaveLength(0);
    expect(store.queue).toHaveLength(0);

    process.env.BROADCASTS_ENABLED = "true";
    const queued = await sendPromo(id, deps);
    expect(queued.status).toBe(200);
    expect(queued.json.sent).toBe(0);
    expect(queued.json.queued).toBe(1);
    expect(sent).toHaveLength(0);

    const again = await sendPromo(id, deps);
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("already_used");

    const later = new Date(deps.now().getTime() + 31 * 60 * 1000);
    const second = await previewPromo(
      { grupo: "todos", texto: "Otra promo. ¿Te interesa? Contéstame." },
      { store, now: () => later },
    );
    const expired = await sendPromo(String(second.json.promo_id), {
      store,
      now: () => new Date(later.getTime() + 31 * 60 * 1000),
    });
    expect(expired.status).toBe(410);

    const stopped = await stopPromo(id, { store });
    expect(stopped.json.ok).toBe(true);
    expect(store.queue.every((q) => q.status !== "pending" || q.promoId !== id)).toBe(true);
  });

  it("rechaza links acortados", async () => {
    const store = new MemoryStore();
    const { deps } = makeDeps({ store });
    const res = await previewPromo(
      { grupo: "todos", texto: "Mira bit.ly/oferta" },
      deps,
    );
    expect(res.status).toBe(400);
    expect(hasShortLink("https://bit.ly/abc")).toBe(true);
    expect(validarTextoPromo("Mira bit.ly/abc")).toBe("link_acortado");
  });
});

describe("topes y horario de la cola", () => {
  it("arranca en semana 1: 15 por hora y 50 al día", () => {
    const cfg = loadBroadcastConfig();
    expect(cfg.week).toBe(1);
    expect(cfg.perHour).toBe(WEEK_CAPS[1].perHour);
    expect(cfg.perDay).toBe(50);
    expect(cfg.perPersonPerDay).toBe(1);
    expect(cfg.perPersonPerWeek).toBe(3);
    expect(cfg.startHour).toBe(9);
    expect(cfg.endHour).toBe(19);
  });

  it("solo manda entre 9 y 19, no el domingo en la mañana ni en festivo", () => {
    const cfg = loadBroadcastConfig();
    expect(isWithinSendWindow(mexicoDate("2026-11-09T08:59:00"), cfg)).toBe(false);
    expect(isWithinSendWindow(mexicoDate("2026-11-09T09:00:00"), cfg)).toBe(true);
    expect(isWithinSendWindow(mexicoDate("2026-11-09T18:59:00"), cfg)).toBe(true);
    expect(isWithinSendWindow(mexicoDate("2026-11-09T19:00:00"), cfg)).toBe(false);
    expect(isWithinSendWindow(mexicoDate("2026-11-15T10:00:00"), cfg)).toBe(false);
    expect(isWithinSendWindow(mexicoDate("2026-11-15T12:30:00"), cfg)).toBe(true);
    expect(isWithinSendWindow(mexicoDate("2026-09-16T11:00:00"), cfg)).toBe(false);
  });

  it("la pausa cae entre 30 y 90 segundos, y cada 20 es larga", () => {
    const cfg = loadBroadcastConfig();
    expect(pauseSeconds(1, cfg, () => 0)).toBe(30);
    expect(pauseSeconds(1, cfg, () => 0.999)).toBe(90);
    const larga = pauseSeconds(20, cfg, () => 0);
    expect(larga).toBeGreaterThanOrEqual(300);
    expect(larga).toBeLessThanOrEqual(600);
  });

  it("respeta tope por hora, por persona y el freno de horario", async () => {
    const cfg = loadBroadcastConfig();
    expect(
      capReason(
        { sentThisHour: 15, sentToday: 15, sentPersonToday: 0, sentPersonWeek: 0 },
        cfg,
      ),
    ).toBe("hour_cap");
    expect(
      capReason(
        { sentThisHour: 1, sentToday: 50, sentPersonToday: 0, sentPersonWeek: 0 },
        cfg,
      ),
    ).toBe("day_cap");
    expect(
      capReason(
        { sentThisHour: 0, sentToday: 0, sentPersonToday: 1, sentPersonWeek: 1 },
        cfg,
      ),
    ).toBe("person_day");

    process.env.BROADCASTS_ENABLED = "true";
    const live = loadBroadcastConfig();
    const store = new MemoryStore();
    const c = clienteQueEscribio("5215551112233@s.whatsapp.net", "Ana");
    await store.saveCliente(c);
    const now = mexicoDate("2026-11-09T08:00:00");
    await store.enqueue([
      {
        id: newId(),
        tipo: "promo",
        chatId: c.chatId,
        cuerpo: "Hola Ana. ¿Te interesa? Contéstame. Si ya no quieres avisos, dime 'ya no'.",
        promoId: null,
        priority: 1,
        status: "pending",
        notBefore: now.toISOString(),
        attempts: 0,
        lastError: null,
        createdAt: now.toISOString(),
        sentAt: null,
      },
    ]);
    const { deps, sent } = makeDeps({ store, now, channelOk: true });
    const fuera = await dispatchTick({
      store,
      now,
      cfg: live,
      sendText: deps.sendText,
      rng: () => 0,
      channelHealth: deps.channelHealth,
    });
    expect(fuera.reason).toBe("outside_hours");
    expect(sent).toHaveLength(0);

    const dentro = mexicoDate("2026-11-09T10:00:00");
    const ok = await dispatchTick({
      store,
      now: dentro,
      cfg: live,
      sendText: deps.sendText,
      rng: () => 0,
      channelHealth: deps.channelHealth,
    });
    expect(ok).toEqual({ sent: 1, reason: "sent" });
    const paced = await dispatchTick({
      store,
      now: dentro,
      cfg: live,
      sendText: deps.sendText,
      rng: () => 0,
      channelHealth: deps.channelHealth,
    });
    expect(paced.reason).toBe("pacing");
    expect(sent).toHaveLength(1);
  });

  it("prioriza a quien busca y no manda el aviso al mismo vendedor", () => {
    const busca = prioridadAviso({
      busca: true,
      mismoPueblo: false,
      zona: "lejos",
      mismaEspecie: false,
      esGanadero: false,
      ultimaConversacion: null,
    });
    const pueblo = prioridadAviso({
      busca: false,
      mismoPueblo: true,
      zona: "municipio",
      mismaEspecie: true,
      esGanadero: true,
      ultimaConversacion: null,
    });
    expect(busca).toBeGreaterThan(pueblo);

    const seller = clienteQueEscribio("5213310000001@s.whatsapp.net", "Juan");
    seller.etiquetas = ["ganadero"];
    const interesado = clienteQueEscribio("5215551112233@s.whatsapp.net", "Ana");
    interesado.busquedas = [
      {
        id: "b1",
        chatId: interesado.chatId,
        especie: "bovino",
        razaTipo: "pintas",
        createdAt: "2026-11-09T12:00:00.000Z",
        activa: true,
      },
    ];
    recomputeEtiquetas(interesado);
    const fuera = clienteQueEscribio("5215551112255@s.whatsapp.net", "Luz");
    fuera.recibeAvisos = false;
    process.env.BROADCASTS_ENABLED = "true";
    const venta: Venta = {
      id: "v1",
      chatId: seller.chatId,
      especie: "bovino",
      razaTipo: "pintas",
      cantidad: 5,
      pesoEdad: "400 kg",
      pueblo: "la Cofradía",
      comparteNumero: false,
      estado: "activa",
      createdAt: "2026-11-09T16:00:00.000Z",
    };
    const items = planSaleNotices({
      venta,
      seller,
      clientes: [seller, interesado, fuera],
      cfg: loadBroadcastConfig(),
      now: new Date("2026-11-09T16:00:00.000Z"),
    });
    expect(items.map((i) => i.chatId)).toEqual([interesado.chatId]);
    expect(items[0].cuerpo).toContain("Ana");
    expect(items[0].cuerpo).toMatch(/contéstame por aquí/i);
    expect(items[0].cuerpo).toMatch(/ya no/);
    expect(items[0].cuerpo).not.toContain("Juan");
    expect(items[0].cuerpo).not.toContain("3310000001");
    expect(items[0].cuerpo).not.toMatch(/bit\.ly|goo\.gl/);
    const otra = avisoVenta(
      {
        nombre: "Luz",
        pueblo: "Mascota",
        cantidad: "5",
        animal: "bovino",
        raza: "pintas",
        peso: "400 kg",
      },
      "otra-semilla",
    );
    expect(otra).not.toBe(items[0].cuerpo);
  });

  it("un ya no deja fuera un aviso que ya estaba en la cola", async () => {
    process.env.BROADCASTS_ENABLED = "true";
    const store = new MemoryStore();
    const c = clienteQueEscribio("5215551112233@s.whatsapp.net", "Ana");
    c.recibeAvisos = false;
    await store.saveCliente(c);
    const now = mexicoDate("2026-11-09T10:00:00");
    await store.enqueue([
      {
        id: newId(),
        tipo: "venta",
        chatId: c.chatId,
        cuerpo: "aviso",
        promoId: null,
        priority: 1,
        status: "pending",
        notBefore: now.toISOString(),
        attempts: 0,
        lastError: null,
        createdAt: now.toISOString(),
        sentAt: null,
      },
    ]);
    const { deps, sent } = makeDeps({ store, now });
    const result = await dispatchTick({
      store,
      now,
      cfg: loadBroadcastConfig(),
      sendText: deps.sendText,
      rng: () => 0,
      channelHealth: deps.channelHealth,
    });
    expect(result.reason).toBe("skipped");
    expect(sent).toHaveLength(0);
  });
});
