import type { Cita, HorarioCita, NegocioConfig, Vacuna } from "@/lib/types";
import { diaSemanaCorto, mexicoParts } from "@/lib/time";
import { fold } from "@/lib/text";

const SAFE_HORARIO =
  "Para apartarte la hora me falta el horario del equipo. Alguien te confirma el día. ¿Te comunico con la persona encargada?";

export function horasDelDia(
  dia: Date,
  lugar: "obrador" | "forrajera",
  horarios: HorarioCita[],
): string[] | null {
  const corto = diaSemanaCorto(dia);
  const bloque = horarios.find(
    (h) => h.lugar === lugar && h.dias.map((d) => fold(d)).includes(corto),
  );
  if (!bloque || !bloque.horas.length) return null;
  return bloque.horas.slice(0, 3);
}

export function ofrecerCita(
  dia: Date | null,
  lugar: "obrador" | "forrajera",
  cfg: NegocioConfig,
): { ok: true; horas: string[]; respuesta: string } | { ok: false; respuesta: string } {
  if (!cfg.horarios_cita.length) return { ok: false, respuesta: SAFE_HORARIO };
  if (!dia) {
    return { ok: false, respuesta: "¿Qué día te queda?" };
  }
  const horas = horasDelDia(dia, lugar, cfg.horarios_cita);
  if (!horas || horas.length === 0) return { ok: false, respuesta: SAFE_HORARIO };
  const [h1, h2, h3] = horas;
  const lista = [h1, h2, h3].filter(Boolean).join(", ").replace(/, ([^,]+)$/, " o $1");
  return {
    ok: true,
    horas,
    respuesta: `Ese día tengo ${lista}. ¿Cuál te late?`,
  };
}

export function confirmarCitaTexto(cita: Pick<Cita, "dia" | "hora" | "lugar">): string {
  const donde = cita.lugar === "forrajera" ? "la forrajera" : "el Obrador";
  return `Listo, te aparté el ${cita.dia} a las ${cita.hora}. En un ratito te confirmo.`;
}

export function textoRecordatorio(cita: Cita): string {
  const donde = cita.lugar === "forrajera" ? "la forrajera" : "el Obrador";
  return `Te recuerdo que mañana a las ${cita.hora} vienes a ${cita.motivo} en ${donde}. ¿Sigue en pie?`;
}

/** Eve-of reminder only when the family configured the hour. */
export function citasParaRecordar(
  citas: Cita[],
  now: Date,
  horaConfig: string | null,
): Cita[] {
  if (!horaConfig || !horaConfig.trim()) return [];
  const p = mexicoParts(now);
  const [hh] = horaConfig.split(":");
  if (p.hour !== Number(hh)) return [];
  const manana = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const iso = manana.toISOString().slice(0, 10);
  return citas.filter(
    (c) =>
      c.estado !== "cancelada" &&
      !c.recordatorioEnviado &&
      c.dia === iso,
  );
}

export function vacunasParaAvisar(
  vacunas: Vacuna[],
  now: Date,
  diasAntes: number | null,
): Vacuna[] {
  if (diasAntes == null || !Number.isFinite(diasAntes) || diasAntes < 0) return [];
  const p = mexicoParts(now);
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day + diasAntes));
  const iso = target.toISOString().slice(0, 10);
  return vacunas.filter((v) => v.proxima === iso && !v.avisado && v.proxima);
}

export function reabastoPendiente(
  producto: string,
  ultimaFecha: string | null,
  dias: Record<string, number>,
  now: Date,
): boolean {
  const key = Object.keys(dias).find((k) => fold(k) === fold(producto));
  if (!key || !ultimaFecha) return false;
  const n = dias[key];
  if (!Number.isFinite(n) || n <= 0) return false;
  const last = Date.parse(ultimaFecha);
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last >= n * 24 * 60 * 60 * 1000;
}
