import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/Pagination";
import { CorrigirCorridaDialog } from "@/components/CorrigirCorridaDialog";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSION_KEYS } from "@/lib/permissions";
import {
  type RunRow,
  REVIEW_DAYS,
  RUN_SELECT,
  addDays,
  formatDayMonth,
  formatDuration,
  formatKm,
  formatPace,
  formatRunDateTime,
  isCorrectable,
  isInReview,
  modeLabel,
  runStateLabel,
  todayInBrasilia,
} from "@/lib/corridas";

const PAGE_SIZE = 10;

const STATE_CLASS: Record<string, string> = {
  finished: "bg-green-500/10 text-green-400 border-green-500/20",
  aborted: "bg-red-500/10 text-red-400 border-red-500/20",
  running: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const th = "px-4 py-3 text-left text-sm font-medium whitespace-nowrap";
const td = "px-4 py-4 text-sm text-foreground align-top";

interface HistoricoCorridasProps {
  userId: string;
  userName: string;
}

/**
 * Histórico de corridas do atleta: todas as tentativas, da mais recente para a mais antiga, com a
 * competição (Rua ou Esteira), a distância da inscrição, os números da tentativa, o status e a posição
 * no ranking da tentativa que conta hoje. Quem tem competicoes.edit vê "Corrigir" nas tentativas
 * finalizadas de competições em andamento ou encerradas há até REVIEW_DAYS dias.
 */
export const HistoricoCorridas = ({ userId, userName }: HistoricoCorridasProps) => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(PERMISSION_KEYS.COMPETICOES_EDIT);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ranks, setRanks] = useState<Record<string, number>>({});
  const [corrections, setCorrections] = useState<Record<string, { count: number; last: string; reason: string }>>({});
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<RunRow | null>(null);
  const today = todayInBrasilia();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const { data, error: runsError, count } = await supabase
        .from("user_runs")
        .select(RUN_SELECT, { count: "exact" })
        .eq("user_id", userId)
        .not("started_at", "is", null)
        .order("started_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (runsError) throw runsError;
      const list = (data ?? []) as unknown as RunRow[];
      setRows(list);
      setTotal(count ?? 0);

      const runIds = list.map((r) => r.id);
      const competitionIds = [...new Set(list.map((r) => r.competition_id))];
      const nextRanks: Record<string, number> = {};
      const nextCorrections: Record<string, { count: number; last: string; reason: string }> = {};
      const nextManual = new Set<string>();
      if (runIds.length > 0) {
        const [rankRes, corrRes, manualRes] = await Promise.all([
          supabase
            .from("v_competition_leaderboard")
            .select("run_id, rank")
            .eq("user_id", userId)
            .in("competition_id", competitionIds),
          supabase
            .from("run_metric_corrections")
            .select("run_id, created_at, reason")
            .in("run_id", runIds)
            .order("created_at", { ascending: true }),
          supabase.from("admin_manual_runs").select("run_id").in("run_id", runIds),
        ]);
        ((rankRes.data ?? []) as { run_id: string; rank: number }[]).forEach((r) => {
          nextRanks[r.run_id] = r.rank;
        });
        ((corrRes.data ?? []) as { run_id: string; created_at: string; reason: string }[]).forEach((c) => {
          const prev = nextCorrections[c.run_id];
          nextCorrections[c.run_id] = { count: (prev?.count ?? 0) + 1, last: c.created_at, reason: c.reason };
        });
        ((manualRes.data ?? []) as { run_id: string }[]).forEach((m) => nextManual.add(m.run_id));
      }
      setRanks(nextRanks);
      setCorrections(nextCorrections);
      setManual(nextManual);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o histórico de corridas");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const cols = canEdit ? 9 : 8;

  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-foreground mb-1">Histórico de corridas</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Todas as tentativas, da mais recente para a mais antiga. "Ranking" mostra a posição da tentativa que conta hoje
        naquela competição e distância.
        {canEdit && ` Dá para corrigir tentativa finalizada de competição em andamento ou encerrada há até ${REVIEW_DAYS} dias.`}
      </p>
      <Card className="bg-card border-0 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full max-lg:[&_td]:whitespace-nowrap max-lg:[&_th]:whitespace-nowrap">
            <thead className="bg-table-header">
              <tr>
                {["Data", "Competição", "Inscrição", "Distância", "Tempo", "Pace", "Status", "Ranking"].map((h) => (
                  <th key={h} className={th} style={{ color: "#E0E0E0" }}>
                    {h}
                  </th>
                ))}
                {canEdit && <th className={th} style={{ color: "#E0E0E0" }} />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={cols} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={cols} className="px-6 py-8 text-center text-destructive text-sm">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cols} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    Nenhuma corrida registrada.
                  </td>
                </tr>
              ) : (
                rows.map((r, index) => {
                  const c = r.competitions;
                  const reg = r.competition_registrations?.competition_distances ?? null;
                  const finished = r.state === "finished";
                  const corr = corrections[r.id];
                  const review = isInReview(r, today);
                  return (
                    <tr
                      key={r.id}
                      data-run-row
                      className={`border-t border-border ${index % 2 === 0 ? "bg-table-row" : ""}`}
                    >
                      <td className={`${td} whitespace-nowrap`}>{formatRunDateTime(r.started_at)}</td>
                      <td className={td}>
                        <div className="font-medium">{c?.title ?? "-"}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c && modeLabel(c.mode) && (
                            <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                              {modeLabel(c.mode)}
                            </Badge>
                          )}
                          {review && c?.ends_on && (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                              em revisão até {formatDayMonth(addDays(c.ends_on, REVIEW_DAYS))}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{reg ? formatKm(reg.meters) : "-"}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatKm(r.distance_meters)}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatDuration(r.total_time_seconds)}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatPace(r.avg_pace_seconds_per_km)}</td>
                      <td className={td}>
                        <Badge variant="outline" className={STATE_CLASS[r.state] ?? "border-muted-foreground/30 text-muted-foreground"}>
                          {runStateLabel(r.state)}
                        </Badge>
                        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {corr && (
                            <span title={`Último motivo: ${corr.reason}`}>
                              Corrigida{corr.count > 1 ? ` ${corr.count}x` : ""} em {formatRunDateTime(corr.last)}
                            </span>
                          )}
                          {manual.has(r.id) && <span>Lançada pelo admin</span>}
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {ranks[r.id] ? (
                          <span className="font-semibold text-green-400">{ranks[r.id]}º</span>
                        ) : (
                          <span
                            className="text-muted-foreground"
                            title={finished ? "Não é a tentativa que conta no ranking" : undefined}
                          >
                            —
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {finished && isCorrectable(r, today) ? (
                            <Button
                              size="sm"
                              onClick={() => setEditing(r)}
                              className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              Corrigir
                            </Button>
                          ) : finished ? (
                            <span className="text-xs text-muted-foreground">Prazo encerrado</span>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {total > PAGE_SIZE && (
        <Pagination total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}

      <CorrigirCorridaDialog
        run={editing}
        rank={editing ? ranks[editing.id] ?? null : null}
        userName={userName}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
};
