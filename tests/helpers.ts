import type { Deps, ModelMessage } from "@/lib/deps";
import { MemoryStore } from "@/lib/store/memory";
import type { Store } from "@/lib/store/types";

export type Sent = { to: string; body: string };

export function makeDeps(opts?: {
  store?: Store;
  now?: Date;
  completion?: (n: number) => Promise<ModelMessage> | ModelMessage;
  rng?: () => number;
  channelOk?: boolean;
}): { deps: Deps; sent: Sent[]; completions: { n: number } } {
  const sent: Sent[] = [];
  const completions = { n: 0 };
  const deps: Deps = {
    store: opts?.store ?? new MemoryStore(),
    now: () => opts?.now ?? new Date("2026-11-09T16:00:00.000Z"),
    sendText: async (to, body) => {
      sent.push({ to, body });
    },
    createCompletion: async () => {
      completions.n += 1;
      if (!opts?.completion) {
        throw new Error("OpenAI no debe llamarse en este test");
      }
      return opts.completion(completions.n);
    },
    rng: opts?.rng ?? (() => 0),
    channelHealth: async () =>
      opts?.channelOk === false
        ? { ok: false, status: "QR" }
        : { ok: true, status: "AUTH" },
  };
  return { deps, sent, completions };
}

export function whapiMessage(body: string, id = "m1") {
  return {
    messages: [
      {
        id,
        from_me: false,
        chat_id: "5215551112233@s.whatsapp.net",
        from: "5215551112233@s.whatsapp.net",
        type: "text",
        text: { body },
      },
    ],
  };
}

export function webhookRequest(payload: unknown): Request {
  return new Request("http://localhost/api/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bot-webhook-secret": "test-secret",
    },
    body: JSON.stringify(payload),
  });
}
