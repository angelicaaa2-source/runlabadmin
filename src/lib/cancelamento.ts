/** Cancelamento de inscrição pelo admin (admin_cancel_registration + admin_registration_cancellations). */

export const CANCELAMENTO_ERROS: [string, string][] = [
  ["FORBIDDEN", "Você não tem permissão para cancelar inscrições."],
  ["REASON_REQUIRED", "Escreva a justificativa (pelo menos 5 letras)."],
  ["REASON_TOO_LONG", "A justificativa pode ter no máximo 500 letras."],
  ["ALREADY_CANCELLED", "Essa inscrição já estava cancelada."],
  ["HAS_RUNS", "O atleta já correu com essa inscrição (a corrida está no ranking). Não dá para cancelar por aqui."],
  ["CREDIT_CHOICE_REQUIRED", "Escolha se devolve o crédito usado na inscrição."],
  ["NOT_FOUND", "Inscrição não encontrada."],
];

export function mensagemCancelamento(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  const achou = CANCELAMENTO_ERROS.find(([k]) => msg.includes(k));
  return achou ? achou[1] : msg || "Tente de novo.";
}

export type CancelamentoInfo = {
  registration_id: string;
  reason: string;
  previous_status: string;
  had_payment: boolean;
  credit_returned: boolean;
  cancelled_by: string;
  created_at: string;
};
