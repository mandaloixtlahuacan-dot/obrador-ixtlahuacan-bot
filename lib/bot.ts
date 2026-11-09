import { matchCommand } from "@/lib/commands";
import { encargadoNombre } from "@/lib/config";
import { newCliente, newId, newSession, recomputeEtiquetas } from "@/lib/crm";
import { defaultDeps, type Deps } from "@/lib/deps";
import { parsePuebloMention } from "@/lib/pueblo";
import { fold, norm } from "@/lib/text";
import { buildSystemPrompt } from "@/lib/prompt";
import type { StoredMessage } from "@/lib/types";
import { executeTool, marcarVentaVendida, TOOLS, type ToolCtx } from "@/lib/tools";
import { replyCommand, replyPending, replySafe, withWelcome } from "@/lib/turn";

const FALLBACK =
  "¡Listo! Alguien del obrador te va a contactar pronto con el precio exacto. " +
  "Gracias por escribir a Obrador Ixtlahuacán.";

export async function generateReply(
  chatId: string,
  userText: string,
  fromNumber?: string | null,
  deps: Deps = defaultDeps(),
): Promise<string> {
  const now = deps.now();
  let cliente =
    (await deps.store.getCliente(chatId)) ?? newCliente(chatId, fromNumber);
  if (fromNumber) cliente.telefono = fromNumber;
  if (cliente.sinRespuestaAvisos > 0) {
    await deps.store.logSend({
      id: newId(),
      chatId,
      tipo: "respuesta",
      status: "replied",
      createdAt: now.toISOString(),
    });
  }
  cliente.sinRespuestaAvisos = 0;
  cliente.soloResumenSemanal = false;
  cliente.fueraDeLista = false;
  cliente.ultimaConversacion = now.toISOString();

  const session = await deps.store.getSession(chatId);
  const history = await deps.store.getHistory(chatId);

  if (!session.pending) {
    const direct = parsePuebloMention(userText);
    if (direct) {
      cliente.pueblo = direct.pueblo;
      cliente.zona = direct.zona;
    }
  }
  await marcarVentaVendida(cliente, userText);

  const cmd = matchCommand(userText);
  let reply: string | null = null;
  let deleted = false;
  if (cmd) {
    if (cmd.type === "borrar") deleted = true;
    reply = await replyCommand({ command: cmd, chatId, cliente, session, deps });
  }
  if (
    !reply &&
    !deleted &&
    session.pending?.kind === "pueblo" &&
    session.pending.step !== "rancho" &&
    session.pending.step !== "otro"
  ) {
    const esRespuesta =
      /^[123]\b/.test(norm(userText)) || Boolean(parsePuebloMention(userText));
    if (
      !esRespuesta &&
      /carne|canal|\bkg\b|kilo|precio|vendo|busco|forrajera|cita|vacuna|alimento|menudo|puerco|\bres\b/.test(
        fold(userText),
      )
    ) {
      session.topic = session.pending.resume || session.topic;
      session.pending = null;
    }
  }
  if (!reply && !deleted) {
    reply = await replyPending({ text: userText, cliente, session, deps });
  }
  if (!reply && !deleted) {
    reply = await replySafe(userText, deps);
  }

  const fresh: StoredMessage[] = [];
  let taskDone = false;

  if (!reply && !deleted) {
    const userMsg: StoredMessage = { role: "user", content: userText };
    const messages: StoredMessage[] = [
      { role: "system", content: buildSystemPrompt(cliente) },
      ...history,
      userMsg,
    ];
    fresh.push(userMsg);
    let model = await deps.createCompletion({ messages, tools: TOOLS });
    for (let round = 0; round < 3; round++) {
      if (!model.tool_calls.length) break;
      const assistant: StoredMessage = {
        role: "assistant",
        content: model.content,
        tool_calls: model.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      };
      messages.push(assistant);
      fresh.push(assistant);
      const ctx: ToolCtx = {
        chatId,
        fromNumber: fromNumber ?? null,
        cliente,
        session,
        deps,
        taskDone,
      };
      for (const tc of model.tool_calls) {
        const result = await executeTool(tc.function.name, tc.function.arguments, ctx);
        const toolMsg: StoredMessage = {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
        messages.push(toolMsg);
        fresh.push(toolMsg);
      }
      taskDone = ctx.taskDone;
      model = await deps.createCompletion({ messages, tools: TOOLS });
    }
    reply = (model.content || "").trim() || FALLBACK;
    if (taskDone && !(model.content || "").trim()) {
      const quien = encargadoNombre();
      reply =
        quien === "alguien del equipo"
          ? "Listo. Alguien del equipo te habla para pasarte el precio exacto."
          : `Listo, ${quien} del Obrador te habla para pasarte el precio exacto.`;
    }
  } else if (reply) {
    fresh.push(
      { role: "user", content: userText },
      { role: "assistant", content: reply },
    );
  }

  if (deleted) return reply || "Listo, borré tus datos.";

  if (reply && taskDone) reply = withWelcome(reply, cliente, true);
  recomputeEtiquetas(cliente);
  session.updatedAt = now.toISOString();
  if (!session.chatId) session.chatId = chatId;
  await deps.store.saveCliente(cliente);
  await deps.store.saveSession(session);
  if (fresh.length) await deps.store.appendMessages(chatId, fresh);
  return reply || FALLBACK;
}

export { newSession };
