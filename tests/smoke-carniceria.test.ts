import { describe, expect, it } from "vitest";
import { generateReply } from "@/lib/bot";
import { handleWebhook } from "@/lib/webhookHandler";
import { makeDeps, webhookRequest } from "./helpers";

describe("flujo de carnicería", () => {
  it("webhook → respuesta al cliente y aviso al admin con resumen", async () => {
    const resumen =
      "Ana de Taquería El Puerto pide 40 kg de canal de res y pasa al Obrador.";
    const { deps, sent, completions } = makeDeps({
      completion: (n) => {
        if (n === 1) {
          return {
            content: null,
            tool_calls: [
              {
                id: "call_1",
                function: {
                  name: "enviar_pedido_a_admin",
                  arguments: JSON.stringify({
                    nombre_contacto: "Ana",
                    nombre_negocio: "Taquería El Puerto",
                    productos: "canal de res 40 kg",
                    entrega_o_recoge: "recoge en el Obrador",
                    dia_horario: "mañana",
                    resumen,
                  }),
                },
              },
            ],
          };
        }
        return {
          content:
            "Listo, Ana. Alguien del Obrador te habla para pasarte el precio exacto.",
          tool_calls: [],
        };
      },
    });

    const res = await handleWebhook(
      webhookRequest({
        messages: [
          {
            id: "meat-1",
            from_me: false,
            chat_id: "5215551112233@s.whatsapp.net",
            from: "5215551112233@s.whatsapp.net",
            type: "text",
            text: {
              body: "Soy Ana de Taquería El Puerto, quiero 40 kg de canal de res, paso al obrador mañana",
            },
          },
        ],
      }),
      deps,
    );
    const json = (await res.json()) as { ok: boolean; processed: number };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(1);
    expect(completions.n).toBe(2);

    const admin = sent.find((m) => m.to.includes("5213312974282"));
    const cliente = sent.find((m) => m.to.includes("5215551112233"));
    expect(admin?.body).toContain("🥩 NUEVA cotización / lead");
    expect(admin?.body).toContain("WhatsApp chat_id: 5215551112233@s.whatsapp.net");
    expect(admin?.body).toContain("Número: 5215551112233@s.whatsapp.net");
    expect(admin?.body).toContain("Nombre: Ana");
    expect(admin?.body).toContain("Negocio: Taquería El Puerto");
    expect(admin?.body).toContain("Productos: canal de res 40 kg");
    expect(admin?.body).toContain("Entrega/recoge: recoge en el Obrador");
    expect(admin?.body).toContain(`Resumen: ${resumen}`);
    expect(cliente?.body).toContain("precio exacto");
    expect(sent).toHaveLength(2);
  });

  it("no manda la ubicación del cliente al admin", async () => {
    const { deps, sent } = makeDeps({
      completion: (n) => {
        if (n === 1) {
          return {
            content: null,
            tool_calls: [
              {
                id: "call_loc",
                function: {
                  name: "enviar_pedido_a_admin",
                  arguments: JSON.stringify({
                    productos: "canal 20 kg",
                    entrega_o_recoge: "entrega en cabecera",
                    notas: "pin https://maps.google.com/?q=20.111,-103.222",
                    resumen: "Pedido sin pin",
                  }),
                },
              },
            ],
          };
        }
        return { content: "Listo, te hablan con el precio exacto.", tool_calls: [] };
      },
    });
    await handleWebhook(
      webhookRequest({
        messages: [
          {
            id: "meat-loc",
            from_me: false,
            chat_id: "5215551112233@s.whatsapp.net",
            from: "5215551112233@s.whatsapp.net",
            type: "text",
            text: { body: "Quiero 20 kg de canal, paso mañana" },
          },
        ],
      }),
      deps,
    );
    const admin = sent.find((m) => m.to.includes("5213312974282"));
    expect(admin?.body).toContain("Pedido sin pin");
    expect(admin?.body).not.toContain("20.111");
    expect(admin?.body).toContain("ubicación del cliente no se guarda");
  });

  it("avisa una vez y una actualización; la tercera no se reenvía", async () => {
    const tool = (resumen: string, update = false) => ({
      content: null,
      tool_calls: [
        {
          id: "call_x",
          function: {
            name: "enviar_pedido_a_admin",
            arguments: JSON.stringify({
              productos: "canal 20 kg",
              resumen,
              es_actualizacion: update,
            }),
          },
        },
      ],
    });
    const { deps, sent } = makeDeps({
      completion: (n) => {
        if (n % 2 === 1) {
          const round = Math.ceil(n / 2);
          if (round === 1) return tool("Pedido inicial");
          if (round === 2) return tool("Pedido corregido", true);
          return tool("Pedido de más", true);
        }
        return { content: "Te confirmo el precio exacto con el equipo.", tool_calls: [] };
      },
    });
    const chat = "5215551112233@s.whatsapp.net";
    await generateReply(chat, "quiero 20 kg de canal", chat, deps);
    await generateReply(chat, "mejor 30 kg de canal", chat, deps);
    await generateReply(chat, "y también menudo", chat, deps);
    const admins = sent.filter((m) => m.to.includes("5213312974282"));
    expect(admins).toHaveLength(2);
    expect(admins[0].body).toContain("🥩 NUEVA cotización / lead");
    expect(admins[0].body).toContain("Resumen: Pedido inicial");
    expect(admins[1].body).toContain("🔄 ACTUALIZACIÓN de cotización");
    expect(admins[1].body).toContain("Resumen: Pedido corregido");
  });

  it("ignora fromMe y un mensaje repetido", async () => {
    const { deps, sent, completions } = makeDeps({
      completion: () => ({ content: "¿Buscas carne o es algo de tus animales?", tool_calls: [] }),
    });
    await handleWebhook(
      webhookRequest({
        messages: [
          {
            id: "echo-1",
            from_me: true,
            chat_id: "5215551112233@s.whatsapp.net",
            type: "text",
            text: { body: "eco" },
          },
          {
            id: "dup-1",
            from_me: false,
            chat_id: "5215551112233@s.whatsapp.net",
            from: "5215551112233@s.whatsapp.net",
            type: "text",
            text: { body: "Quiero canal" },
          },
          {
            id: "dup-1",
            from_me: false,
            chat_id: "5215551112233@s.whatsapp.net",
            from: "5215551112233@s.whatsapp.net",
            type: "text",
            text: { body: "Quiero canal otra vez" },
          },
        ],
      }),
      deps,
    );
    expect(completions.n).toBe(1);
    expect(sent).toHaveLength(1);
  });
});
