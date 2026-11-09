import { describe, expect, it } from "vitest";
import { newCliente } from "@/lib/crm";
import { mensajePromo } from "@/lib/forrajera";
import { textoInventarioPublico } from "@/lib/inventario";
import { handleWebhook } from "@/lib/webhookHandler";
import type { InventarioGanado, PromoForrajera } from "@/lib/types";
import { makeDeps, webhookRequest } from "./helpers";

const GANADERO = "5213310001111@s.whatsapp.net";
const INTERESADO = "5215552223344@s.whatsapp.net";

function msg(id: string, chat: string, body: string) {
  return {
    messages: [
      {
        id,
        from_me: false,
        chat_id: chat,
        from: chat,
        type: "text",
        text: { body },
      },
    ],
  };
}

describe("intermediación de ganado y forrajera", () => {
  it("publica en el inventario y la consulta no revela al ganadero", async () => {
    const { deps, sent, completions } = makeDeps();
    const juan = newCliente(GANADERO, GANADERO);
    juan.nombre = "Juan Pérez";
    await deps.store.saveCliente(juan);
    await handleWebhook(
      webhookRequest(msg("pub-1", GANADERO, "tengo 10 vacas gordas, soy de la Cofradía")),
      deps,
    );
    expect(completions.n).toBe(0);
    const inventario = await deps.store.listInventario();
    expect(inventario).toHaveLength(1);
    expect(inventario[0]).toMatchObject({
      chatId: GANADERO,
      especie: "bovino",
      tipo: "gordas",
      cantidad: 10,
      estado: "activa",
      publicadorNombre: "Juan Pérez",
    });
    expect(inventario[0].pueblo?.toLowerCase()).toContain("cofrad");
    expect(JSON.stringify(inventario[0])).not.toMatch(/precio|margen|\$/i);

    const consulta = await handleWebhook(
      webhookRequest(msg("bus-1", INTERESADO, "Busco vacas gordas")),
      deps,
    );
    expect(consulta.status).toBe(200);
    const alCliente = sent.filter((m) => m.to.includes("5215552223344")).at(-1);
    expect(alCliente?.body).toMatch(/10 bovino gordas/);
    expect(alCliente?.body).toMatch(/cofrad/i);
    expect(alCliente?.body).toMatch(/2026-11-09/);
    expect(alCliente?.body).not.toContain("Juan");
    expect(alCliente?.body).not.toContain("3310001111");
    expect(alCliente?.body).not.toContain(GANADERO);
    expect(alCliente?.body).not.toMatch(/\$\d/);
    expect(textoInventarioPublico(inventario, "vacas gordas")).not.toContain("Juan Pérez");
  });

  it("un interés avisa al 5213310184790 con los datos del interesado y del ganadero", async () => {
    const { deps, sent } = makeDeps();
    const juan = newCliente(GANADERO, GANADERO);
    juan.nombre = "Juan Pérez";
    await deps.store.saveCliente(juan);
    await handleWebhook(
      webhookRequest(msg("pub-2", GANADERO, "tengo 10 vacas gordas, soy de la Cofradía")),
      deps,
    );
    const ana = newCliente(INTERESADO, INTERESADO);
    ana.nombre = "Ana López";
    await deps.store.saveCliente(ana);
    await handleWebhook(
      webhookRequest(msg("int-1", INTERESADO, "Me interesan las vacas gordas")),
      deps,
    );
    const aviso = sent.find((m) => m.to.includes("5213310184790"));
    const item = (await deps.store.listInventario())[0];
    expect(aviso?.to).toBe("5213310184790@s.whatsapp.net");
    expect(aviso?.body).toContain("Ana López");
    expect(aviso?.body).toContain(INTERESADO);
    expect(aviso?.body).toContain("vacas gordas");
    expect(aviso?.body).toContain(item.id);
    expect(aviso?.body).toContain("10");
    expect(aviso?.body).toContain("bovino");
    expect(aviso?.body).toMatch(/cofrad/i);
    expect(aviso?.body).toContain("Juan Pérez");
    expect(aviso?.body).toContain(GANADERO);
    const intereses = await deps.store.listIntereses();
    expect(intereses).toHaveLength(1);
    expect(intereses[0].inventarioId).toBe(item.id);
    expect(intereses[0].chatId).toBe(INTERESADO);
    const alCliente = sent.filter((m) => m.to.includes("5215552223344")).at(-1);
    expect(alCliente?.body).toMatch(/alguien del equipo te contacta/i);
    expect(alCliente?.body).not.toContain("Juan");
    expect(alCliente?.body).not.toContain(GANADERO);
  });

  it("el pedido de forrajera va a FORRAJERA_PEDIDOS_PHONE o, si falta, a ADMIN_PHONE, y no trae precio", async () => {
    const pedido = "Quiero 2 bultos de maíz en la forrajera para el viernes, paso a recogerlos";
    const primero = makeDeps();
    await handleWebhook(webhookRequest(msg("f-1", INTERESADO, pedido)), primero.deps);
    const alPapa = primero.sent.find((m) => m.to.includes("5213312974282"));
    expect(alPapa?.body).toContain("Pedido forrajera");
    expect(alPapa?.body).toContain("maíz");
    expect(alPapa?.body).toContain("2 bultos");
    expect(alPapa?.body).toMatch(/viernes/i);
    expect(alPapa?.body).toContain("recoge");
    expect(alPapa?.body).not.toMatch(/\$\d/);
    const respuesta = primero.sent.find((m) => m.to.includes("5215552223344"));
    expect(respuesta?.body).not.toMatch(/\$\d/);

    process.env.FORRAJERA_PEDIDOS_PHONE = "5213310000099";
    const segundo = makeDeps();
    await handleWebhook(webhookRequest(msg("f-2", INTERESADO, pedido)), segundo.deps);
    expect(segundo.sent.some((m) => m.to === "5213310000099@s.whatsapp.net")).toBe(true);
    expect(segundo.sent.some((m) => m.to.includes("5213312974282"))).toBe(false);
  });

  it("la forrajera y el inventario no calculan precio", () => {
    const promo: PromoForrajera = {
      id: "p",
      producto: "avena",
      presentacion: "bulto",
      vigenteHasta: "2026-12-01",
      cargadaPor: null,
    };
    expect(mensajePromo(promo)).not.toMatch(/\$\d/);
    expect(mensajePromo(promo)).toContain("avena");
    const item: InventarioGanado = {
      id: "i1",
      chatId: GANADERO,
      publicadorNombre: "Juan Pérez",
      publicadorTelefono: GANADERO,
      especie: "bovino",
      tipo: "gordas",
      raza: "",
      cantidad: 10,
      pueblo: "la Cofradía",
      notas: null,
      fecha: "2026-11-09",
      estado: "activa",
      createdAt: "2026-11-09T16:00:00.000Z",
    };
    const publico = textoInventarioPublico([item], "vacas");
    expect(publico).not.toContain("Juan");
    expect(publico).not.toMatch(/\$\d|margen/i);
  });
});
