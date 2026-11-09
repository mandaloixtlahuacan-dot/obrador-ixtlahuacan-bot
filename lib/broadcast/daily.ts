import { loadNegocio, remindersEnabled } from "@/lib/config";
import { citasParaRecordar, textoRecordatorio, vacunasParaAvisar } from "@/lib/citas";
import { planResumenDiario } from "@/lib/broadcast/plan";
import { loadBroadcastConfig } from "@/lib/broadcast/policy";
import type { Deps } from "@/lib/deps";
import { mexicoParts } from "@/lib/time";

export async function runReminders(deps: Pick<Deps, "store" | "now" | "sendText">): Promise<Record<string, unknown>> {
  if (!remindersEnabled()) return { ok: true, sent: 0, reason: "disabled" };
  const cfg = loadNegocio();
  const now = deps.now();
  const clientes = await deps.store.listClientes();
  const citas = clientes.flatMap((c) => c.citas);
  const vacunas = clientes.flatMap((c) => c.vacunas);
  const dueCitas = citasParaRecordar(citas, now, cfg.recordatorio_vispera_hora);
  const dueVac = vacunasParaAvisar(vacunas, now, cfg.dias_aviso_vacuna);
  if (!cfg.recordatorio_vispera_hora && cfg.dias_aviso_vacuna == null) {
    return { ok: true, sent: 0, reason: "hora_no_configurada" };
  }
  let sent = 0;
  for (const cita of dueCitas) {
    await deps.sendText(cita.chatId, textoRecordatorio(cita));
    const owner = clientes.find((c) => c.chatId === cita.chatId);
    if (owner) {
      const row = owner.citas.find((c) => c.id === cita.id);
      if (row) row.recordatorioEnviado = true;
      await deps.store.saveCliente(owner);
    }
    sent++;
  }
  for (const vac of dueVac) {
    await deps.sendText(
      vac.chatId,
      `Te recuerdo que se acerca la vacuna${vac.vacuna ? ` (${vac.vacuna})` : ""} de ${vac.animal}. ¿Sigue en pie la fecha?`,
    );
    const owner = clientes.find((c) => c.chatId === vac.chatId);
    if (owner) {
      const row = owner.vacunas.find((v) => v.id === vac.id);
      if (row) row.avisado = true;
      await deps.store.saveCliente(owner);
    }
    sent++;
  }
  return { ok: true, sent, reason: sent ? "sent" : "none" };
}

export async function runDailySummary(deps: Pick<Deps, "store" | "now" | "sendText">): Promise<Record<string, unknown>> {
  const cfg = loadBroadcastConfig();
  if (!cfg.enabled) return { ok: true, sent: 0, reason: "disabled" };
  const negocio = loadNegocio();
  const now = deps.now();
  const hour = mexicoParts(now).hour;
  const summaryHour = negocio.resumen_diario_hora
    ? Number(negocio.resumen_diario_hora.split(":")[0])
    : null;
  if (summaryHour == null || hour !== summaryHour) {
    return { ok: true, sent: 0, reason: "not_the_hour" };
  }
  const clientes = await deps.store.listClientes();
  const ventas = clientes.flatMap((c) => c.ventas.filter((v) => v.estado === "activa"));
  if (ventas.length <= cfg.summaryIfSalesOver) {
    return { ok: true, sent: 0, reason: "below_threshold" };
  }
  const monday = mexicoParts(now).weekday === 1;
  const items = [
    ...planResumenDiario({ ventas, clientes, now, semanal: false }),
    ...(monday ? planResumenDiario({ ventas, clientes, now, semanal: true }) : []),
  ];
  if (items.length) await deps.store.enqueue(items);
  return { ok: true, queued: items.length, sent: 0, reason: "queued" };
}
