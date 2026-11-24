/**
 * Publicação de corrida no app: rascunho fica oculto no app e no site de compra; com publish_at,
 * o banco publica sozinho na hora marcada (publish_scheduled_competitions, a cada minuto).
 * Horários sempre no horário de Brasília (sem horário de verão desde 2019).
 */

/** "dd/mm/aaaa às HH:mm" no horário de Brasília. */
export function formatPublishAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${data} às ${hora}`;
}

/** Data (YYYY-MM-DD) e hora (HH:mm) de Brasília para ISO. */
export function brasiliaToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Partes de Brasília (YYYY-MM-DD, HH:mm) de um ISO, para preencher o formulário. */
export function isoToBrasiliaParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}

export const PUBLICACAO_ERROS: [string, string][] = [
  ["HAS_REGISTRATIONS", "Essa corrida já tem inscritos e não pode ser escondida do app."],
  ["PUBLISH_AT_PAST", "Escolha uma data e hora no futuro."],
  ["PUBLISH_AT_REQUIRED", "Escolha a data e a hora em que a corrida vai aparecer no app."],
  ["FORBIDDEN", "Você não tem permissão para mudar a publicação de corridas."],
  ["NOT_FOUND", "Corrida não encontrada."],
];

export function mensagemDeErro(e: unknown, padrao: string): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  const achou = PUBLICACAO_ERROS.find(([k]) => msg.includes(k));
  return achou ? achou[1] : msg || padrao;
}
