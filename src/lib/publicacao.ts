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

export type ModoPublicacao = "now" | "schedule" | "hide";

/** Escolha de publicação feita num formulário (cadastro ou edição da corrida). */
export interface EscolhaPublicacao {
  modo: ModoPublicacao;
  /** YYYY-MM-DD (Brasília), só para "schedule". */
  data: string;
  /** HH:mm (Brasília), só para "schedule". */
  hora: string;
}

/** Escolha inicial a partir do estado da corrida (status do banco e publish_at). */
export function escolhaInicial(isDraft: boolean, publishAt: string | null | undefined): EscolhaPublicacao {
  const partes = isoToBrasiliaParts(publishAt);
  return {
    modo: isDraft ? (publishAt ? "schedule" : "hide") : "now",
    data: partes.date,
    hora: partes.time || "08:00",
  };
}

/** ISO da data e hora programadas (null quando não é "schedule" ou está incompleta). */
export function escolhaIso(e: EscolhaPublicacao): string | null {
  return e.modo === "schedule" ? brasiliaToIso(e.data, e.hora) : null;
}

/** Mensagem de erro da escolha, ou null quando está ok. */
export function erroDaEscolha(e: EscolhaPublicacao): string | null {
  if (e.modo !== "schedule") return null;
  const iso = escolhaIso(e);
  if (!iso) return "Escolha a data e a hora em que a corrida vai aparecer no app.";
  if (new Date(iso).getTime() <= Date.now()) return "Escolha uma data e hora no futuro para a publicação.";
  return null;
}

/** true quando a escolha muda o que está salvo na corrida. */
export function escolhaMudou(e: EscolhaPublicacao, isDraft: boolean, publishAt: string | null | undefined): boolean {
  if (e.modo === "now") return isDraft;
  if (e.modo === "hide") return !isDraft || !!publishAt;
  const iso = escolhaIso(e);
  return !isDraft || iso !== (publishAt ? new Date(publishAt).toISOString() : null);
}

/** Texto do estado salvo da corrida. */
export function estadoPublicacao(isDraft: boolean, publishAt: string | null | undefined): string {
  if (!isDraft) return "Visível no app";
  return publishAt ? `Programada para ${formatPublishAt(publishAt)}` : "Oculta no app (rascunho)";
}
