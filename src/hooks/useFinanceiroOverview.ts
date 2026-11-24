import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRealtimeInvalidation } from "./useSupabaseRealtime";

export interface OverviewMetrics {
  faturamento: number;
  inscricoesPagas: number;
  inscricoesEmAberto: number;
  numeroAssinantes: number;
  margemBruta: number;
  comissaoParceiros: number;
}

export interface PieDataItem {
  name: string;
  value: number;
  amount: number;
  color: string;
}

export interface MonthlyBarItem {
  month: string;
  value: number;
  monthIndex: number;
}

// Pizza "Receita por tipo" (24/11/2026): tipo + avulsa ou com kit. Mesma
// família de cor por tipo (laranja = créditos, verde = na corrida).
const RECEIPT_SLICES = [
  "Créditos · avulsa",
  "Créditos · com kit",
  "Na corrida · avulsa",
  "Na corrida · com kit",
  "RunLab Club",
] as const;
type ReceiptSlice = (typeof RECEIPT_SLICES)[number];

const RECEIPT_COLORS: Record<ReceiptSlice, string> = {
  "Créditos · avulsa": "#FF8A4C",
  "Créditos · com kit": "#FFC4A3",
  "Na corrida · avulsa": "#CCF725",
  "Na corrida · com kit": "#E8F5A0",
  "RunLab Club": "#5BC0EB",
};

type LinhaPlano = "avulsa" | "kit" | "club";

/** Linha do plano pelo nome ("Inscrição avulsa", "Inscrição com kit", "RunLab Club") ou slug. */
function linhaDoPlano(nome: string): LinhaPlano | null {
  const n = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/club/.test(n)) return "club";
  if (/kit|pack/.test(n)) return "kit";
  if (/avulsa|ticket/.test(n)) return "avulsa";
  return null;
}

/**
 * Divide um pagamento de créditos entre avulsa, com kit e Club. Carrinho
 * ("2x Inscrição avulsa + 1x Inscrição com kit (M)") é rateado pelo preço de
 * tabela de cada linha, com o desconto proporcional; compra de um produto só
 * vai inteira para o plano dela.
 */
function divideCreditos(
  amount: number,
  description: string | null,
  slug: string | null,
  planType: string | null,
  precoPorLinha: Record<LinhaPlano, number>,
): Partial<Record<LinhaPlano, number>> {
  const partes = (description ?? "").split(" + ").map((t) => t.trim().match(/^(\d+)\s*x\s+(.+?)(\s*\([^)]*\))?$/i));
  if (description && /^\d+\s*x\s/i.test(description) && partes.every(Boolean)) {
    const linhas = partes.map((m) => ({ linha: linhaDoPlano(m![2]), qtd: Number(m![1]) || 1 }));
    if (linhas.every((l) => l.linha)) {
      const tabela = linhas.map((l) => l.qtd * (precoPorLinha[l.linha!] || 0));
      const soma = tabela.reduce((a, b) => a + b, 0);
      if (soma > 0) {
        const out: Partial<Record<LinhaPlano, number>> = {};
        linhas.forEach((l, i) => {
          out[l.linha!] = (out[l.linha!] ?? 0) + (amount * tabela[i]) / soma;
        });
        return out;
      }
    }
  }
  if (planType === "anual") return { club: amount };
  return { [linhaDoPlano(slug ?? "") === "kit" ? "kit" : "avulsa"]: amount };
}

const PARTNER_COLOR_PALETTE = ["#CCF725", "#8B9D00", "#E8F5A0", "#5A6700", "#D4FF66", "#A8C400"];
const PARTNER_UNCLASSIFIED_COLOR = "#666";

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function periodBounds(year: number, month: number) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchOverviewData(year: number, month: number) {
  const { start, end } = periodBounds(year, month);

  // ── 1) runner_payments confirmados no período (cash basis) ──────
  const { data: payments, error: paymentsError } = await supabase
    .from("runner_payments")
    .select("id, amount, plan_id, plan_type, status, paid_at, user_id, lot_id, description")
    .in("status", ["CONFIRMED", "RECEIVED"])
    .not("paid_at", "is", null)
    .gte("paid_at", start)
    .lte("paid_at", end);

  if (paymentsError) throw paymentsError;

  const paymentsList = payments ?? [];
  const faturamentoTotal = paymentsList.reduce((acc, p) => acc + Number(p.amount), 0);

  // Planos (slug e preço de tabela) e lotes (com kit ou não) para dividir a receita.
  const lotIds = [...new Set(paymentsList.map((p) => p.lot_id).filter(Boolean))] as string[];
  const [{ data: planos, error: planosError }, { data: lotes, error: lotesError }] = await Promise.all([
    supabase.from("plans").select("id, slug, price"),
    lotIds.length
      ? supabase.from("competition_lots").select("id, has_kit").in("id", lotIds)
      : Promise.resolve({ data: [] as { id: string; has_kit: boolean }[], error: null }),
  ]);
  if (planosError) throw planosError;
  if (lotesError) throw lotesError;
  const slugDoPlano = new Map((planos ?? []).map((pl) => [pl.id as string, pl.slug as string]));
  const precoPorLinha: Record<LinhaPlano, number> = { avulsa: 0, kit: 0, club: 0 };
  (planos ?? []).forEach((pl) => {
    const linha = ({ "challenge-ticket": "avulsa", "challenge-pack": "kit", "runlab-club": "club" } as const)[
      pl.slug as "challenge-ticket" | "challenge-pack" | "runlab-club"
    ];
    if (linha) precoPorLinha[linha] = Number(pl.price);
  });
  const loteComKit = new Map((lotes ?? []).map((l) => [l.id, !!l.has_kit]));

  // Pizza "Receita por tipo": créditos (checkout geral) e na corrida (lot_id),
  // cada um em avulsa e com kit, mais o RunLab Club (também quando vem no carrinho).
  const byReceiptType: Record<ReceiptSlice, number> = {
    "Créditos · avulsa": 0,
    "Créditos · com kit": 0,
    "Na corrida · avulsa": 0,
    "Na corrida · com kit": 0,
    "RunLab Club": 0,
  };
  // Novos assinantes do mês: usuários únicos que compraram o RunLab Club (sozinho ou no carrinho).
  const assinantesSet = new Set<string>();
  paymentsList.forEach((p) => {
    const amount = Number(p.amount);
    if (p.lot_id) {
      byReceiptType[loteComKit.get(p.lot_id) ? "Na corrida · com kit" : "Na corrida · avulsa"] += amount;
      return;
    }
    const partes = divideCreditos(
      amount,
      p.description,
      p.plan_id ? slugDoPlano.get(p.plan_id) ?? null : null,
      p.plan_type,
      precoPorLinha,
    );
    byReceiptType["Créditos · avulsa"] += partes.avulsa ?? 0;
    byReceiptType["Créditos · com kit"] += partes.kit ?? 0;
    byReceiptType["RunLab Club"] += partes.club ?? 0;
    if (partes.club && p.user_id) assinantesSet.add(p.user_id);
  });

  // ── 3) Inscrições no período ─────────────────────────────────────
  const { data: regs, error: regsError } = await supabase
    .from("competition_registrations")
    .select("id, status, created_at")
    .gte("created_at", start)
    .lte("created_at", end)
    .neq("status", "cancelled");

  if (regsError) throw regsError;

  const regsList = regs ?? [];
  const inscricoesPagas = regsList.filter((r) => r.status === "confirmed").length;

  // "Em aberto" reflete pagamentos em aberto (PENDING/OVERDUE) criados no
  // período. Mesma fonte da aba Recebimentos, para os dois números baterem
  // quando filtrados pelo mesmo período.
  const { data: pendingPayments, error: pendingErr } = await supabase
    .from("runner_payments")
    .select("id", { count: "exact" })
    .in("status", ["PENDING", "OVERDUE"])
    .gte("created_at", start)
    .lte("created_at", end);
  if (pendingErr) throw pendingErr;
  const inscricoesEmAberto = pendingPayments?.length ?? 0;

  // ── 4) Gráfico de pizza: receita por tipo ────────────────────────
  const totalReceita = faturamentoTotal || 1;
  const receiptPie: PieDataItem[] = [];

  RECEIPT_SLICES.forEach((name) => {
    const value = byReceiptType[name];
    if (value > 0) {
      receiptPie.push({
        name,
        value: Math.round((value / totalReceita) * 100),
        amount: Math.round(value * 100) / 100,
        color: RECEIPT_COLORS[name],
      });
    }
  });

  if (receiptPie.length === 0) {
    receiptPie.push({ name: "Nenhuma receita", value: 100, amount: 0, color: "#666" });
  }

  // ── 5) Gráfico de pizza: comissão por tipo de parceiro ──────────
  // partner_type vive em partnership_requests (status='approved'); cruzamos
  // com partner_commissions do período para somar comissão real por categoria.
  const [approvedPartnersResult, commissionsResult] = await Promise.all([
    supabase
      .from("partnership_requests")
      .select("user_id, partner_type, updated_at")
      .eq("status", "approved")
      .order("updated_at", { ascending: false }),
    supabase
      .from("partner_commissions")
      .select("partner_id, commission_amount")
      .gte("created_at", start)
      .lte("created_at", end),
  ]);

  const typeByUser = new Map<string, string>();
  (approvedPartnersResult.data ?? []).forEach((r) => {
    if (!typeByUser.has(r.user_id)) typeByUser.set(r.user_id, r.partner_type);
  });

  const totalsByType: Record<string, number> = {};
  let totalCommission = 0;
  (commissionsResult.data ?? []).forEach((c) => {
    const type = typeByUser.get(c.partner_id) ?? "Não classificado";
    const amount = Number(c.commission_amount);
    totalsByType[type] = (totalsByType[type] ?? 0) + amount;
    totalCommission += amount;
  });

  const partnerPie: PieDataItem[] = totalCommission > 0
    ? Object.entries(totalsByType)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value], index) => ({
          name,
          value: Math.round((value / totalCommission) * 100),
          amount: Math.round(value * 100) / 100,
          color: name === "Não classificado"
            ? PARTNER_UNCLASSIFIED_COLOR
            : PARTNER_COLOR_PALETTE[index % PARTNER_COLOR_PALETTE.length],
        }))
    : [{ name: "Sem comissões no período", value: 100, amount: 0, color: PARTNER_UNCLASSIFIED_COLOR }];

  // ── 6) Margem e comissão ─────────────────────────────────────────
  // Comissão acumulada no período (partner_commissions criadas no período).
  // Reflete performance dos parceiros, não fluxo de caixa de saques.
  const comissaoParceiros = Math.round(totalCommission * 100) / 100;
  const margemBruta = Math.round((faturamentoTotal - comissaoParceiros) * 100) / 100;

  const metrics: OverviewMetrics = {
    faturamento: Math.round(faturamentoTotal * 100) / 100,
    inscricoesPagas,
    inscricoesEmAberto,
    numeroAssinantes: assinantesSet.size,
    margemBruta,
    comissaoParceiros,
  };

  // ── 7) Gráfico de barras: inscrições por mês (ano inteiro) ──────
  const yearStart = new Date(year, 0, 1).toISOString();
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999).toISOString();

  const { data: regsYear } = await supabase
    .from("competition_registrations")
    .select("id, created_at")
    .gte("created_at", yearStart)
    .lte("created_at", yearEnd)
    .neq("status", "cancelled");

  const byMonth = new Array(12).fill(0);
  (regsYear ?? []).forEach((r) => {
    const d = new Date(r.created_at);
    if (d.getFullYear() === year) {
      byMonth[d.getMonth()]++;
    }
  });

  const monthlyData: MonthlyBarItem[] = MONTH_LABELS.map((label, i) => ({
    month: label,
    value: byMonth[i],
    monthIndex: i,
  }));

  return { metrics, receiptData: receiptPie, partnerData: partnerPie, monthlyData };
}

export function useFinanceiroOverview(year: number, month: number) {
  useRealtimeInvalidation(
    [
      "runner_payments",
      "credit_transactions",
      "competition_registrations",
      "profiles",
      "partner_commissions",
      "partnership_requests",
    ],
    [["financeiro-overview"]],
  );

  return useQuery({
    queryKey: ["financeiro-overview", year, month],
    queryFn: () => fetchOverviewData(year, month),
  });
}
