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

const RECEIPT_COLORS: Record<string, string> = {
  Créditos: "#FF8A4C",
  "Inscrição na corrida": "#CCF725",
  "RunLab Club": "#5BC0EB",
};

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
    .select("id, amount, plan_id, plan_type, status, paid_at, user_id, lot_id")
    .in("status", ["CONFIRMED", "RECEIVED"])
    .not("paid_at", "is", null)
    .gte("paid_at", start)
    .lte("paid_at", end);

  if (paymentsError) throw paymentsError;

  const paymentsList = payments ?? [];
  const faturamentoTotal = paymentsList.reduce((acc, p) => acc + Number(p.amount), 0);

  // Novos assinantes do mês: usuários únicos que pagaram um plano anual.
  const assinantesSet = new Set(
    paymentsList.filter((p) => p.plan_type === "anual").map((p) => p.user_id),
  );

  // Pizza "Receita por tipo", com os nomes padrão (23/11/2026):
  // - Créditos: inscrição avulsa ou com kit comprada no checkout geral (vira crédito)
  // - Inscrição na corrida: compra direto na página de uma corrida (lot_id presente)
  // - RunLab Club: pacote de 12 inscrições
  const byReceiptType: Record<string, number> = { Créditos: 0, "Inscrição na corrida": 0, "RunLab Club": 0 };
  paymentsList.forEach((p) => {
    const amount = Number(p.amount);
    if (p.plan_type === "anual") {
      byReceiptType["RunLab Club"] += amount;
    } else if (p.lot_id) {
      byReceiptType["Inscrição na corrida"] += amount;
    } else {
      byReceiptType.Créditos += amount;
    }
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

  (["Créditos", "Inscrição na corrida", "RunLab Club"] as const).forEach((name) => {
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
