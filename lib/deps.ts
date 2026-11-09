import OpenAI from "openai";
import { fetchChannelHealth, sendText } from "@/lib/whapi";
import { getStore } from "@/lib/store";
import type { Store } from "@/lib/store/types";
import type { StoredMessage } from "@/lib/types";

export type ToolCall = {
  id: string;
  function: { name: string; arguments: string };
};

export type ModelMessage = {
  content: string | null;
  tool_calls: ToolCall[];
};

export type Deps = {
  store: Store;
  now: () => Date;
  sendText: (to: string, body: string) => Promise<void>;
  createCompletion: (args: {
    messages: StoredMessage[];
    tools: unknown[];
  }) => Promise<ModelMessage>;
  rng: () => number;
  channelHealth: () => Promise<{ ok: boolean; status: string }>;
};

export async function defaultCreateCompletion(args: {
  messages: StoredMessage[];
  tools: unknown[];
}): Promise<ModelMessage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: args.messages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: args.tools as OpenAI.Chat.ChatCompletionTool[],
    tool_choice: "auto",
    temperature: 0.4,
    max_tokens: 500,
  });
  const msg = completion.choices[0]?.message;
  const tool_calls: ToolCall[] = [];
  for (const tc of msg?.tool_calls || []) {
    if (tc.type !== "function" || !("function" in tc)) continue;
    tool_calls.push({
      id: tc.id,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    });
  }
  return { content: msg?.content ?? null, tool_calls };
}

export function defaultDeps(): Deps {
  return {
    store: getStore(),
    now: () => new Date(),
    sendText,
    createCompletion: defaultCreateCompletion,
    rng: Math.random,
    channelHealth: fetchChannelHealth,
  };
}
