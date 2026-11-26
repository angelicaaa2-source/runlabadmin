import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/Pagination";
import { NovaInscricaoDialog } from "@/components/NovaInscricaoDialog";
import { CancelarInscricaoDialog } from "@/components/CancelarInscricaoDialog";
import type { CancelamentoInfo } from "@/lib/cancelamento";
import { REASON_LABELS, type ReasonType } from "@/lib/inscricoes";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { formatKm, formatRunDateTime, modeLabel } from "@/lib/corridas";

const PAGE_SIZE = 10;

type RegRow = {
  id: string;
  status: string;
  created_at: string;
  payment_id: string | null;
  shirt_size: string | null;
  competitions: { title: string; mode: string | null; is_free: boolean | null } | null;
  competition_distances: { meters: number; label: string | null } | null;
  competition_lots: { name: string; has_kit: boolean | null } | null;
};

type ManualInfo = { reason_type: ReasonType; description: string | null; debited_credit: boolean; created_by: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmada", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  pending: { label: "Pendente", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  cancelled: { label: "Cancelada", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const th = "px-4 py-3 text-left text-sm font-medium whitespace-nowrap";
const td = "px-4 py-4 text-sm text-foreground align-top";

interface InscricoesCorredorProps {
  userId: string;
  userName: string;
  creditBalance: number;
  /** Chamado depois de inscrever ou cancelar (atualiza saldo e histórico de créditos da página). */
  onChanged?: () => void;
}

/**
 * Inscrições do atleta (mais recente primeiro), com a origem de cada uma: pagamento, crédito, gratuita ou
 * manual pelo admin (motivo, descrição, se descontou crédito e quem fez). Quem tem competicoes.edit vê
 * "Nova inscrição" e "Cancelar" em cada inscrição ativa (com justificativa). Inscrição cancelada mostra quem
 * cancelou, quando, a justificativa e se o crédito foi devolvido.
 */
export const InscricoesCorredor = ({ userId, userName, creditBalance, onChanged }: InscricoesCorredorProps) => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(PERMISSION_KEYS.COMPETICOES_EDIT);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RegRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credited, setCredited] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, ManualInfo>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelados, setCancelados] = useState<Record<string, CancelamentoInfo>>({});
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const { data, error: regError, count } = await supabase
        .from("competition_registrations")
        .select(
          "id, status, created_at, payment_id, shirt_size, competitions(title, mode, is_free), " +
            "competition_distances(meters, label), competition_lots(name, has_kit)",
          { count: "exact" }
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (regError) throw regError;
      const list = (data ?? []) as unknown as RegRow[];
      setRows(list);
      setTotal(count ?? 0);
      const ids = list.map((r) => r.id);
      const nextCredited = new Set<string>();
      const nextManual: Record<string, ManualInfo> = {};
      const nextNames: Record<string, string> = {};
      const nextCancel: Record<string, CancelamentoInfo> = {};
      if (ids.length > 0) {
        const [credRes, manRes, cancRes] = await Promise.all([
          supabase.from("credit_transactions").select("competition_registration_id").eq("type", "usage").in("competition_registration_id", ids),
          supabase
            .from("admin_manual_registrations")
            .select("registration_id, reason_type, description, debited_credit, created_by")
            .in("registration_id", ids),
          supabase
            .from("admin_registration_cancellations")
            .select("registration_id, reason, previous_status, had_payment, credit_returned, cancelled_by, created_at")
            .in("registration_id", ids),
        ]);
        ((credRes.data ?? []) as { competition_registration_id: string }[]).forEach((c) => nextCredited.add(c.competition_registration_id));
        const man = (manRes.data ?? []) as (ManualInfo & { registration_id: string })[];
        man.forEach((m) => {
          nextManual[m.registration_id] = m;
        });
        const canc = (cancRes.data ?? []) as CancelamentoInfo[];
        canc.forEach((c) => {
          nextCancel[c.registration_id] = c;
        });
        const creators = [...new Set([...man.map((m) => m.created_by), ...canc.map((c) => c.cancelled_by)].filter(Boolean))] as string[];
        if (creators.length > 0) {
          const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", creators);
          ((ps ?? []) as { id: string; full_name: string | null }[]).forEach((p) => {
            nextNames[p.id] = p.full_name ?? "";
          });
        }
      }
      setCredited(nextCredited);
      setManual(nextManual);
      setNames(nextNames);
      setCancelados(nextCancel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar as inscrições");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const origem = (r: RegRow) => {
    const m = manual[r.id];
    if (m) {
      return (
        <div className="space-y-0.5">
          <div>Manual: {REASON_LABELS[m.reason_type] ?? m.reason_type}</div>
          <div className="text-xs text-muted-foreground">
            {m.debited_credit ? "1 crédito descontado" : "Sem desconto de crédito"}
            {m.created_by && names[m.created_by] ? ` · por ${names[m.created_by]}` : ""}
          </div>
          {m.description && <div className="text-xs text-muted-foreground">"{m.description}"</div>}
        </div>
      );
    }
    if (r.payment_id) return "Pagamento";
    if (credited.has(r.id)) return "Crédito";
    if (r.competitions?.is_free) return "Gratuita";
    return <span className="text-muted-foreground">—</span>;
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="text-xl font-semibold text-foreground">Histórico de inscrições</h2>
        {canEdit && (
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-2 border-0 hover:brightness-90 transition-all"
            style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
          >
            <Plus className="w-4 h-4" />
            Nova inscrição
          </Button>
        )}
      </div>
      <Card className="bg-card border-0 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full max-lg:[&_td]:whitespace-nowrap max-lg:[&_th]:whitespace-nowrap">
            <thead className="bg-table-header">
              <tr>
                {["Data", "Competição", "Distância", "Lote", "Status", "Origem", ""].map((h) => (
                  <th key={h} className={th} style={{ color: "#E0E0E0" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-destructive text-sm">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    Nenhuma inscrição.
                  </td>
                </tr>
              ) : (
                rows.map((r, index) => {
                  const st = STATUS[r.status] ?? { label: r.status, cls: "border-muted-foreground/30 text-muted-foreground" };
                  const d = r.competition_distances;
                  return (
                    <tr key={r.id} data-reg-row className={`border-t border-border ${index % 2 === 0 ? "bg-table-row" : ""}`}>
                      <td className={`${td} whitespace-nowrap`}>{formatRunDateTime(r.created_at)}</td>
                      <td className={td}>
                        <div className="font-medium">{r.competitions?.title ?? "-"}</div>
                        {r.competitions && modeLabel(r.competitions.mode) && (
                          <Badge variant="outline" className="mt-1 border-muted-foreground/30 text-muted-foreground">
                            {modeLabel(r.competitions.mode)}
                          </Badge>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{d ? formatKm(d.meters) : "-"}</td>
                      <td className={td}>
                        {r.competition_lots ? (
                          <>
                            {r.competition_lots.name}
                            {r.competition_lots.has_kit && r.shirt_size ? (
                              <div className="text-xs text-muted-foreground">Camiseta {r.shirt_size}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={td}>
                        <Badge variant="outline" className={st.cls}>
                          {st.label}
                        </Badge>
                        {cancelados[r.id] && (
                          <div data-info-cancelamento className="mt-1 space-y-0.5 text-xs text-muted-foreground max-w-[260px]">
                            <div>
                              Em {formatRunDateTime(cancelados[r.id].created_at)}
                              {names[cancelados[r.id].cancelled_by] ? ` por ${names[cancelados[r.id].cancelled_by]}` : ""}
                            </div>
                            <div>"{cancelados[r.id].reason}"</div>
                            {cancelados[r.id].credit_returned && <div>Crédito devolvido</div>}
                          </div>
                        )}
                      </td>
                      <td className={td}>{origem(r)}</td>
                      <td className={`${td} text-right`}>
                        {canEdit && r.status !== "cancelled" && (
                          <Button
                            data-cancelar-inscricao-btn
                            variant="ghost"
                            size="sm"
                            onClick={() => setCancelId(r.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {total > PAGE_SIZE && <Pagination total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />}

      <CancelarInscricaoDialog
        open={cancelId !== null}
        registrationId={cancelId}
        userName={userName}
        onClose={() => setCancelId(null)}
        onDone={() => {
          setCancelId(null);
          load();
          onChanged?.();
        }}
      />

      <NovaInscricaoDialog
        open={dialogOpen}
        userId={userId}
        userName={userName}
        creditBalance={creditBalance}
        onClose={() => setDialogOpen(false)}
        onDone={() => {
          setDialogOpen(false);
          load();
          onChanged?.();
        }}
      />
    </div>
  );
};
