import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/prompt";
import { handleWebhook } from "@/lib/webhookHandler";
import { LOCATION_REPLY } from "@/lib/locations";
import { OBRADOR_MAPS } from "@/lib/config";
import { makeDeps, webhookRequest } from "./helpers";

describe("nunca pide ubicación", () => {
  it("si mandan un pin, no lo guarda y no llama a OpenAI", async () => {
    const { deps, sent, completions } = makeDeps();
    const res = await handleWebhook(
      webhookRequest({
        messages: [
          {
            id: "loc-1",
            from_me: false,
            chat_id: "5215551112233@s.whatsapp.net",
            from: "5215551112233@s.whatsapp.net",
            type: "location",
            location: {
              latitude: 20.123456,
              longitude: -103.654321,
              address: "Calle inventada 1",
            },
          },
        ],
      }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(completions.n).toBe(0);
    expect(sent).toEqual([
      {
        to: "5215551112233@s.whatsapp.net",
        body: LOCATION_REPLY,
      },
    ]);
    const cliente = await deps.store.getCliente("5215551112233@s.whatsapp.net");
    const dumped = JSON.stringify(cliente);
    expect(dumped).not.toContain("20.123456");
    expect(dumped).not.toContain("-103.654321");
    expect(dumped).not.toContain("Calle inventada");
  });

  it("el prompt prohíbe pedir ubicación y no usa el nombre viejo del pin", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toMatch(/Nunca pidas ubicación/);
    expect(prompt).toContain(OBRADOR_MAPS);
    expect(prompt).toContain("https://maps.google.com/?q=20.874329,-103.232947");
    expect(prompt.toLowerCase()).not.toContain("mándame tu ubicación");
    expect(prompt.toLowerCase()).not.toContain("comparte tu ubicación");
    expect(prompt).not.toContain("Hermanos Sánchez");
    expect(prompt).not.toContain("Forrajes y Quesos");
  });
});

describe("ya no, persona y bórrame", () => {
  it("ya no apaga los avisos al momento", async () => {
    const { deps, sent, completions } = makeDeps();
    await handleWebhook(webhookRequest({
      messages: [
        {
          id: "opt-1",
          from_me: false,
          chat_id: "5215551112233@s.whatsapp.net",
          from: "5215551112233@s.whatsapp.net",
          type: "text",
          text: { body: "ya no" },
        },
      ],
    }), deps);
    expect(completions.n).toBe(0);
    expect(sent[0].body).toMatch(/ya no te mando avisos/i);
    const cliente = await deps.store.getCliente("5215551112233@s.whatsapp.net");
    expect(cliente?.recibeAvisos).toBe(false);
    expect(cliente?.recibeAvisosCambio).toBeTruthy();
  });

  it("persona avisa al encargado sin inventar un nombre", async () => {
    const { deps, sent, completions } = makeDeps({
      now: new Date("2026-11-09T16:00:00.000Z"),
    });
    await handleWebhook(webhookRequest({
      messages: [
        {
          id: "per-1",
          from_me: false,
          chat_id: "5215551112233@s.whatsapp.net",
          from: "5215551112233@s.whatsapp.net",
          type: "text",
          text: { body: "persona" },
        },
      ],
    }), deps);
    expect(completions.n).toBe(0);
    const admin = sent.find((m) => m.to.includes("5213312974282"));
    const cliente = sent.find((m) => m.to.includes("5215551112233"));
    expect(admin?.body).toContain("Piden una persona");
    expect(cliente?.body).toContain("Ya le avisé a alguien del equipo");
  });

  it("bórrame borra la ficha", async () => {
    const { deps } = makeDeps();
    await handleWebhook(webhookRequest({
      messages: [
        {
          id: "h1",
          from_me: false,
          chat_id: "5215551112233@s.whatsapp.net",
          from: "5215551112233@s.whatsapp.net",
          type: "text",
          text: { body: "Hola" },
        },
      ],
    }), deps);
    expect(await deps.store.getCliente("5215551112233@s.whatsapp.net")).not.toBeNull();
    await handleWebhook(webhookRequest({
      messages: [
        {
          id: "h2",
          from_me: false,
          chat_id: "5215551112233@s.whatsapp.net",
          from: "5215551112233@s.whatsapp.net",
          type: "text",
          text: { body: "bórrame" },
        },
      ],
    }), deps);
    expect(await deps.store.getCliente("5215551112233@s.whatsapp.net")).toBeNull();
    expect(await deps.store.getHistory("5215551112233@s.whatsapp.net")).toEqual([]);
  });
});
