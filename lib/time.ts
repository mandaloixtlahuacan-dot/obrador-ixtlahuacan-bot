const TZ = "America/Mexico_City";

export type MexicoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  isoDate: string;
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Wall-clock parts in America/Mexico_City (no DST since 2022, UTC−6). */
export function mexicoParts(date: Date): MexicoParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  const hour = Number(bag.hour);
  const minute = Number(bag.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: WEEKDAY[bag.weekday] ?? 0,
    isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Interpret a Mexico City wall time as a Date. `local` is `YYYY-MM-DDTHH:mm:ss`. */
export function mexicoDate(local: string): Date {
  return new Date(`${local}-06:00`);
}

export function startOfMexicoDay(date: Date): Date {
  const p = mexicoParts(date);
  return mexicoDate(
    `${p.isoDate}T00:00:00`,
  );
}

export function addMexicoDays(date: Date, days: number): Date {
  const p = mexicoParts(date);
  const utc = Date.UTC(p.year, p.month - 1, p.day + days);
  const d = new Date(utc);
  const iso = d.toISOString().slice(0, 10);
  return mexicoDate(`${iso}T00:00:00`);
}

export function startOfMexicoWeek(date: Date): Date {
  const p = mexicoParts(date);
  const mondayOffset = p.weekday === 0 ? 6 : p.weekday - 1;
  return addMexicoDays(startOfMexicoDay(date), -mondayOffset);
}

const DIA_SEMANA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

export function diaSemanaCorto(date: Date): string {
  return DIA_SEMANA[mexicoParts(date).weekday] || "lun";
}

/**
 * Obrador counter hours already used in production.
 * Mon–Fri 07:00–15:00, Sat 07:00–14:00, Sun closed.
 */
export function dentroDeHorarioObrador(date: Date): boolean {
  const p = mexicoParts(date);
  const mins = p.hour * 60 + p.minute;
  if (p.weekday === 0) return false;
  if (p.weekday === 6) return mins >= 7 * 60 && mins < 14 * 60;
  return mins >= 7 * 60 && mins < 15 * 60;
}

/** When a person will call back, using the Obrador's known counter hours. */
export function textoLlamadaManana(date: Date, hora = "7:00"): string {
  const p = mexicoParts(date);
  const mins = p.hour * 60 + p.minute;
  const abre = 7 * 60;
  if (p.weekday >= 1 && p.weekday <= 6 && mins < abre) {
    return `hoy a partir de las ${hora}`;
  }
  if (p.weekday === 5 && mins >= 15 * 60) {
    return `el lunes a partir de las ${hora}`;
  }
  if (p.weekday === 6) return `el lunes a partir de las ${hora}`;
  return `mañana a partir de las ${hora}`;
}
