/** Motivos da inscrição manual pelo admin (mesmos códigos de admin_manual_registrations.reason_type). */
export type ReasonType = "pagou_nao_inscreveu" | "premio" | "cortesia" | "outro";

export const REASON_LABELS: Record<ReasonType, string> = {
  pagou_nao_inscreveu: "Pagou e não conseguiu se inscrever",
  premio: "Prêmio",
  cortesia: "Cortesia",
  outro: "Outro",
};
