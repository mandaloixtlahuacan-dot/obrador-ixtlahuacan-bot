import { describe, expect, it } from "vitest";
import { newCliente, newId } from "@/lib/crm";
import { buscarOfertas, puedeCompartirNumero } from "@/lib/ganado";
import { handleWebhook } from "@/lib/webhookHandler";
import { makeDeps, webhookRequest } from "./helpers";
import {
  advancePueblo,
  opcionesDe,
  parsePuebloMention,
  PUEBLO_LEJOS,
  PUEBLO_PASO_1,
} from "@/lib/pueblo";
import type { Cliente } from "@/lib/types";

function ganadero(partial: Partial<Cliente> & Pick<Cliente, "chatId" | "nombre">): Cliente {
  return {
    ...newCliente(partial.chatId),
    ...partial,
  };
}

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

describe("número solo con permiso", () => {
  it("no entrega el teléfono si no dijeron que sí", () => {
    const comparte = ganadero({
      chatId: "5213310000001@s.whatsapp.net",
      nombre: "Juan Pérez",
      telefono: "5213310000001@s.whatsapp.net",
      pueblo: "la Cofradía",
      zona: "cerca",
      ventas: [
        {
          id: newId(),
          chatId: "5213310000001@s.whatsapp.net",
          especie: "bovino",
          razaTipo: "pintas",
          cantidad: 5,
          pesoEdad: "400 kg",
          pueblo: "la Cofradía",
          comparteNumero: true,
          estado: "activa",
          createdAt: "2026-11-09T15:00:00.000Z",
        },
      ],
    });
    const privado = ganadero({
      chatId: "5213310000002@s.whatsapp.net",
      nombre: "Luis",
      telefono: "5213310000002@s.whatsapp.net",
      pueblo: "Ixtlahuacán del Río",
      zona: "municipio",
      ventas: [
        {
          id: newId(),
          chatId: "5213310000002@s.whatsapp.net",
          especie: "bovino",
          razaTipo: "pinta",
          cantidad: 2,
          pesoEdad: null,
          pueblo: "Ixtlahuacán del Río",
          comparteNumero: false,
          estado: "activa",
          createdAt: "2026-11-09T15:00:00.000Z",
        },
      ],
    });
    expect(puedeCompartirNumero(privado, privado.ventas[0])).toBe(false);
    const { mostradas } = buscarOfertas([comparte, privado], {
      raza: "vacas pintas",
      pueblo: "la Cofradía",
    });
    const juan = mostradas.find((m) => m.cliente.nombre === "Juan Pérez");
    const luis = mostradas.find((m) => m.cliente.nombre === "Luis");
    expect(juan?.telefono).toBe("33 1000 0001");
    expect(luis?.telefono).toBeNull();
    expect(luis?.puedeCompartir).toBe(false);
    expect(mostradas[0].cliente.nombre).toBe("Juan Pérez");
  });
});
