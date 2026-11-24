/** Utilitários do histórico e da correção de corridas na página do atleta. */

/** Dias depois do fim da competição em que ainda dá para corrigir (o banco confere o mesmo prazo). */
export const REVIEW_DAYS = 7;

export type RunRow = {
  id: string;
  competition_id: string;
  state: string;
  started_at: string | null;
  finished_at: string | null;
  distance_meters: number | null;
  total_time_seconds: number | null;
  avg_pace_seconds_per_km: number | null;
  competitions: { title: string; mode: string | null; starts_on: string | null; ends_on: string | null } | null;
  competition_registrations: {
    distance_id: string | null;
    competition_distances: { meters: number; label: string | null } | null;
  } | null;
};

export const RUN_SELECT =
  "id, competition_id, state, started_at, finished_at, distance_meters, total_time_seconds, avg_pace_seconds_per_km, " +
  "competitions(title, mode, starts_on, ends_on), " +
  "competition_registrations(distance_id, competition_distances(meters, label))";

/** Data civil de hoje em Brasília (YYYY-MM-DD), mesma referência das competições. */
export function todayInBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Soma dias a uma data civil YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD -> DD/MM */
export function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function formatRunDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "5,51" ou "5.51" (km) → metros */
export function parseKm(value: string): number | null {
  const km = Number(value.trim().replace(",", "."));
  return Number.isFinite(km) && km > 0 ? Math.round(km * 1000) : null;
}

/** "30:28" ou "1:05:10" → segundos */
export function parseDuration(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m > 59 && nums.length === 3) return null;
  if (s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

export function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return "-";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

export function formatPace(secondsPerKm: number | null): string {
  if (!secondsPerKm || secondsPerKm <= 0) return "-";
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, "0")}/km`;
}

export function formatKm(meters: number | null): string {
  if (meters == null) return "-";
  return `${(meters / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

export function runStateLabel(state: string): string {
  switch (state) {
    case "finished":
      return "Finalizada";
    case "aborted":
      return "Abortada";
    case "running":
      return "Em andamento";
    case "paused":
      return "Pausada";
    default:
      return state;
  }
}

export function modeLabel(mode: string | null): string {
  if (mode === "indoor") return "Esteira";
  if (mode === "outdoor") return "Rua";
  return "";
}

/** A competição ainda aceita correção: já começou e não terminou há mais de REVIEW_DAYS dias. */
export function isCorrectable(r: RunRow, today: string): boolean {
  const c = r.competitions;
  if (!c) return false;
  if (c.starts_on && c.starts_on > today) return false;
  return !c.ends_on || c.ends_on >= addDays(today, -REVIEW_DAYS);
}

/** A competição já terminou, mas ainda está no prazo de revisão. */
export function isInReview(r: RunRow, today: string): boolean {
  const end = r.competitions?.ends_on;
  return !!end && end < today && end >= addDays(today, -REVIEW_DAYS);
}
