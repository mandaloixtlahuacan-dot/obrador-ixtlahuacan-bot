import { describe, expect, it } from "vitest";
import { newCliente } from "@/lib/crm";
import { handleWebhook } from "@/lib/webhookHandler";
import { makeDeps, webhookRequest } from "./helpers";
import {
  advancePueblo,
  opcionesDe,
  parsePuebloMention,
  PUEBLO_LEJOS,
  PUEBLO_PASO_1,
} from "@/lib/pueblo";
describe("pueblo, máximo 3 opciones", () => {
  it("el primer paso y el de lejos tienen 3 opciones", () => {
    expect(opcionesDe(PUEBLO_PASO_1)).toHaveLength(3);
    expect(opcionesDe(PUEBLO_LEJOS)).toHaveLength(3);
  });

  it("si escribe el lugar, se salta el menú", () => {
    expect(parsePuebloMention("soy de Cuquío")).toEqual({
      pueblo: "Cuquío",
      zona: "lejos",
    });
    expect(parsePuebloMention("quiero carne de res")).toBeNull();
  });

  it("sigue el ejemplo: 2, de la Cofradía", () => {
    const paso = advancePueblo("origen", "2, de la Cofradía");
    expect(paso.done).toEqual({ pueblo: "la Cofradía", zona: "cerca" });
    const lejos = advancePueblo("origen", "3");
    expect(lejos.ask).toBe(PUEBLO_LEJOS);
    expect(advancePueblo("lejos", "1").done?.pueblo).toBe("Guadalajara y alrededores");
  });

  it("si cambia de tema, deja el pueblo y atiende lo nuevo", async () => {
    const chat = "5215551112233@s.whatsapp.net";
    const { deps, sent, completions } = makeDeps({
      completion: () => ({ content: "¿Qué corte te hace falta?", tool_calls: [] }),
    });
    await deps.store.saveCliente(newCliente(chat, chat));
    await deps.store.saveSession({
      chatId: chat,
      pending: { kind: "pueblo", step: "origen", resume: "la venta" },
      misunderstood: 0,
      topic: null,
      updatedAt: null,
    });
    await handleWebhook(
      webhookRequest({
        messages: [
          {
            id: "topic-1",
            from_me: false,
            chat_id: chat,
            from: chat,
            type: "text",
            text: { body: "mejor quiero 20 kg de canal" },
          },
        ],
      }),
      deps,
    );
    expect(completions.n).toBe(1);
    expect(sent[0].body).toContain("corte");
    expect((await deps.store.getSession(chat)).pending).toBeNull();
    expect((await deps.store.getSession(chat)).topic).toBe("la venta");
  });
});

