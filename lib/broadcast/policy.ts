import { mexicoParts } from "@/lib/time";

/** Week-1 caps are the starting point. Later weeks stay opt-in via env. */
export const WEEK_CAPS = {
  1: { perHour: 15, perDay: 50 },
  2: { perHour: 25, perDay: 100 },
  3: { perHour: 40, perDay: 200 },
} as const;

export type BroadcastConfig = {
  enabled: boolean;
  week: 1 | 2 | 3;
  perHour: number;
  perDay: number;
  perPersonPerDay: number;
  perPersonPerWeek: number;
  pauseMinSec: number;
  pauseMaxSec: number;
  longEvery: number;
  longMinSec: number;
  longMaxSec: number;
  startHour: number;
  endHour: number;
  summaryIfSalesOver: number;
  cooldownAfter: number;
  dropAfter: number;
  maxFailStreak: number;
  maxFailRate: number;
  maxOptOutRate: number;
  holidays: string[];
};

/** Official Mexican holidays in 2026. Editable; not guessed at send time. */
export const HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-02-02",
  "2026-03-16",
  "2026-05-01",
  "2026-09-16",
  "2026-11-16",
  "2026-12-25",
];

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function loadBroadcastConfig(): BroadcastConfig {
  const weekRaw = intEnv("BROADCAST_WEEK", 1);
  const week = (weekRaw === 2 ? 2 : weekRaw >= 3 ? 3 : 1) as 1 | 2 | 3;
  const caps = WEEK_CAPS[week];
  const extra = (process.env.BROADCAST_HOLIDAYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    enabled: boolEnv("BROADCASTS_ENABLED", false),
    week,
    perHour: intEnv("BROADCAST_PER_HOUR", caps.perHour),
    perDay: intEnv("BROADCAST_PER_DAY", caps.perDay),
    perPersonPerDay: intEnv("BROADCAST_PER_PERSON_DAY", 1),
    perPersonPerWeek: intEnv("BROADCAST_PER_PERSON_WEEK", 3),
    pauseMinSec: intEnv("BROADCAST_PAUSE_MIN_SEC", 30),
    pauseMaxSec: intEnv("BROADCAST_PAUSE_MAX_SEC", 90),
    longEvery: intEnv("BROADCAST_LONG_EVERY", 20),
    longMinSec: intEnv("BROADCAST_LONG_MIN_SEC", 300),
    longMaxSec: intEnv("BROADCAST_LONG_MAX_SEC", 600),
    startHour: intEnv("BROADCAST_START_HOUR", 9),
    endHour: intEnv("BROADCAST_END_HOUR", 19),
    summaryIfSalesOver: intEnv("BROADCAST_SUMMARY_IF_OVER", 3),
    cooldownAfter: intEnv("BROADCAST_COOLDOWN_AFTER", 3),
    dropAfter: intEnv("BROADCAST_DROP_AFTER", 6),
    maxFailStreak: intEnv("BROADCAST_MAX_FAIL_STREAK", 3),
    maxFailRate: Number(process.env.BROADCAST_MAX_FAIL_RATE || "0.05"),
    maxOptOutRate: Number(process.env.BROADCAST_MAX_OPTOUT_RATE || "0.05"),
    holidays: extra.length ? extra : HOLIDAYS_2026,
  };
}

export function isWithinSendWindow(date: Date, cfg: BroadcastConfig): boolean {
  const p = mexicoParts(date);
  if (cfg.holidays.includes(p.isoDate)) return false;
  if (p.weekday === 0 && p.hour < 12) return false;
  if (p.hour < cfg.startHour || p.hour >= cfg.endHour) return false;
  return true;
}

export function pauseSeconds(
  sentInBatch: number,
  cfg: BroadcastConfig,
  rng: () => number = Math.random,
): number {
  const roll = Math.min(0.999999, Math.max(0, rng()));
  if (cfg.longEvery > 0 && sentInBatch > 0 && sentInBatch % cfg.longEvery === 0) {
    const span = Math.max(0, cfg.longMaxSec - cfg.longMinSec);
    return cfg.longMinSec + Math.floor(roll * (span + 1));
  }
  const span = Math.max(0, cfg.pauseMaxSec - cfg.pauseMinSec);
  return cfg.pauseMinSec + Math.floor(roll * (span + 1));
}

export type CapInput = {
  sentThisHour: number;
  sentToday: number;
  sentPersonToday: number;
  sentPersonWeek: number;
};

export function capReason(input: CapInput, cfg: BroadcastConfig): string | null {
  if (input.sentThisHour >= cfg.perHour) return "hour_cap";
  if (input.sentToday >= cfg.perDay) return "day_cap";
  if (input.sentPersonToday >= cfg.perPersonPerDay) return "person_day";
  if (input.sentPersonWeek >= cfg.perPersonPerWeek) return "person_week";
  return null;
}

export function shouldBrake(input: {
  consecutiveFails: number;
  failsInHour: number;
  attemptsInHour: number;
  optOutsInBatch: number;
  sendsInBatch: number;
  channelOk: boolean;
  cfg: BroadcastConfig;
}): string | null {
  if (!input.channelOk) return "canal";
  if (input.consecutiveFails >= input.cfg.maxFailStreak) return "fallos_seguidos";
  if (
    input.attemptsInHour >= 5 &&
    input.failsInHour / input.attemptsInHour > input.cfg.maxFailRate
  ) {
    return "tasa_fallos";
  }
  if (
    input.sendsInBatch >= 5 &&
    input.optOutsInBatch / input.sendsInBatch > input.cfg.maxOptOutRate
  ) {
    return "muchos_ya_no";
  }
  return null;
}

export function puedeSubirSemana(stats: {
  brakes: number;
  optOutRate: number;
}): boolean {
  return stats.brakes === 0 && stats.optOutRate <= 0.05;
}

export type PriorityInput = {
  busca: boolean;
  mismoPueblo: boolean;
  zona: "municipio" | "cerca" | "lejos" | null;
  mismaEspecie: boolean;
  esGanadero: boolean;
  ultimaConversacion: string | null;
};

export function prioridadAviso(p: PriorityInput): number {
  let s = 0;
  if (p.busca) s += 1000;
  if (p.mismoPueblo) s += 400;
  else if (p.zona === "municipio") s += 300;
  else if (p.zona === "cerca") s += 200;
  else if (p.zona === "lejos") s += 100;
  if (p.mismaEspecie) s += 40;
  else if (p.esGanadero) s += 20;
  else s += 10;
  const rec = p.ultimaConversacion ? Date.parse(p.ultimaConversacion) : 0;
  if (Number.isFinite(rec)) s += Math.min(30, Math.floor(rec / 1e12));
  return s;
}

export function estimarMinutos(destinatarios: number, cfg: BroadcastConfig): number {
  if (destinatarios <= 1) return destinatarios === 0 ? 0 : 1;
  const avgPause = (cfg.pauseMinSec + cfg.pauseMaxSec) / 2;
  const avgLong = (cfg.longMinSec + cfg.longMaxSec) / 2;
  const gaps = destinatarios - 1;
  const longs = cfg.longEvery > 0 ? Math.floor(gaps / cfg.longEvery) : 0;
  const sec = gaps * avgPause + longs * avgLong;
  return Math.max(1, Math.round(sec / 60));
}
