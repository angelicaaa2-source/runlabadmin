// Cupons de desconto do checkout (tabela public.coupons).
// Regras: ver supabase/migrations/20261123120000_coupon_rules_admin.sql e
// 20261125010000_cupons_onde_vale.sql (onde o cupom vale) no repositório checkout-runlab.

export type LotKind = "sem_kit" | "com_kit";

export interface Cupom {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  /** NULL = sem limite por CPF/usuário. */
  max_uses_per_user: number | null;
  min_amount: number | null;
  /** Calculado pelo banco (gatilho coupons_onde_vale); as funções antigas ainda leem. */
  applies_to: "plan" | "competition" | "both";
  /** Vale na página geral do checkout (Inscrição avulsa e com kit, que viram créditos). Não é pacote. */
  general_checkout: boolean;
  /** Vale dentro das corridas (compra feita na página de uma corrida). */
  in_races: boolean;
  /** Corridas destes campeonatos (inclui as futuras). Com competition_ids nulo também: todas. */
  championship_ids: string[] | null;
  /** Corridas escolhidas uma a uma. NULL (e championship_ids NULL) = todas as corridas. */
  competition_ids: string[] | null;
  /** NULL = com e sem kit. Vale para a página geral e para as corridas. */
  lot_kinds: LotKind[] | null;
  /** Só pacotes (RunLab Club): NULL = todos; [] = nenhum. */
  plan_ids: string[] | null;
  /** Parceiro dono do cupom: recebe a comissão das compras com ele. NULL = cupom da RunLab, sem comissão. */
  owner_partner_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  usos: number;
}

/** Parceiro aprovado (pode ser dono de cupom). */
export interface ParceiroOpcao {
  id: string;
  nome: string;
  codigo: string | null;
}

export interface CorridaOpcao {
  id: string;
  title: string;
  starts_at: string | null;
}

export interface PacoteOpcao {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

export interface CampeonatoOpcao {
  id: string;
  name: string;
}

export type StatusCupom = "ativo" | "inativo" | "agendado" | "expirado" | "esgotado";

/** O checkout troca DESCONTO100 por CORRERUNLAB: esse código não pode ser usado. */
export const CODIGOS_RESERVADOS = ["DESCONTO100"];
export const CODIGO_REGEX = /^[A-Z0-9_-]{3,30}$/;

export function statusDoCupom(c: Cupom, agora = new Date()): StatusCupom {
  if (!c.active) return "inativo";
  if (c.valid_from && new Date(c.valid_from) > agora) return "agendado";
  if (c.valid_until && new Date(c.valid_until) < agora) return "expirado";
  if (c.max_uses != null && c.usos >= c.max_uses) return "esgotado";
  return "ativo";
}

export function valePacotes(c: Pick<Cupom, "plan_ids">): boolean {
  return c.plan_ids === null || c.plan_ids.length > 0;
}

/** Mesma conta do gatilho coupons_onde_vale do banco. null = o cupom não vale em lugar nenhum. */
export function appliesToDe(geral: boolean, corridas: boolean, planIds: string[] | null): Cupom["applies_to"] | null {
  const pacotes = planIds === null || planIds.length > 0;
  if ((geral || pacotes) && corridas) return "both";
  if (corridas) return "competition";
  if (geral || pacotes) return "plan";
  return null;
}

/** "Inscrição com ou sem kit", "Inscrição com kit" ou "Inscrição sem kit". */
export function tipoDeInscricao(lotKinds: LotKind[] | null): string {
  if (lotKinds === null) return "Inscrição com ou sem kit";
  return lotKinds.includes("com_kit") ? "Inscrição com kit" : "Inscrição sem kit";
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formataDesconto(c: Pick<Cupom, "discount_type" | "discount_value">): string {
  if (c.discount_type === "percent") {
    return `${Number(c.discount_value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }
  return brl.format(Number(c.discount_value));
}

export function formataReais(valor: number): string {
  return brl.format(valor);
}

export function formataUsoPorCpf(c: Pick<Cupom, "max_uses_per_user">): string {
  if (c.max_uses_per_user == null) return "Ilimitado";
  if (c.max_uses_per_user === 1) return "1 vez por CPF";
  return `${c.max_uses_per_user} vezes por CPF`;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formataValidade(c: Pick<Cupom, "valid_from" | "valid_until">): string {
  if (!c.valid_from && !c.valid_until) return "Sem prazo";
  if (c.valid_from && c.valid_until) return `${dataCurta(c.valid_from)} a ${dataCurta(c.valid_until)}`;
  if (c.valid_until) return `Até ${dataCurta(c.valid_until)}`;
  return `A partir de ${dataCurta(c.valid_from as string)}`;
}

/** "2026-12-31" (dia em Brasília) para o início ou o fim do dia em ISO. */
export function diaParaIso(dia: string, fimDoDia: boolean): string {
  return `${dia}T${fimDoDia ? "23:59:59" : "00:00:00"}-03:00`;
}

/** ISO para "2026-12-31" no fuso de Brasília (valor de <input type="date">). */
export function isoParaDia(iso: string | null): string {
  if (!iso) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return partes; // en-CA já sai como AAAA-MM-DD
}
