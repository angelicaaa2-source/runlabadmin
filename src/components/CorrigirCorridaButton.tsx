import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, PencilLine, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSION_KEYS } from "@/lib/permissions";

/** Dias depois do fim da competição em que ainda dá para corrigir (o banco confere o mesmo prazo). */
const REVIEW_DAYS = 7;

type RunRow = {
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

type CompetitionGroup = {
  id: string;
  title: string;
  mode: string | null;
  endsOn: string | null;
  distances: { meters: number | null; label: string; runs: RunRow[] }[];
};

const CORRECTION_ERROR_MESSAGES: [string, string][] = [
  ["REVIEW_PERIOD_OVER", "O prazo de revisão desta competição acabou (7 dias depois do fim)."],
  ["Apenas administradores", "Você não tem permissão para corrigir corridas."],
  ["Justificativa é obrigatória", "Informe o motivo."],
  ["Só é possível corrigir corrida finalizada", "Só dá para corrigir corrida finalizada."],
  ["Pace resultante", "O ritmo precisa ficar entre 2:50 e 30:00 min/km."],
  ["Distância e tempo devem ser maiores que zero", "Distância e tempo devem ser maiores que zero."],
];

function todayInBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "5,51" ou "5.51" (km) → metros */
function parseKm(value: string): number | null {
  const km = Number(value.trim().replace(",", "."));
  return Number.isFinite(km) && km > 0 ? Math.round(km * 1000) : null;
}

/** "30:28" ou "1:05:10" → segundos */
function parseDuration(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m > 59 && nums.length === 3) return null;
  if (s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return "-";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

function formatPace(secondsPerKm: number | null): string {
  if (!secondsPerKm || secondsPerKm <= 0) return "-";
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, "0")}/km`;
}

function formatKm(meters: number | null): string {
  if (meters == null) return "-";
  return `${(meters / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

function stateLabel(state: string): string {
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

function modeLabel(mode: string | null): string {
  if (mode === "indoor") return "Esteira";
  if (mode === "outdoor") return "Rua";
  return "";
}

interface CorrigirCorridaButtonProps {
  userId: string;
  userName: string;
}

export const CorrigirCorridaButton = ({ userId, userName }: CorrigirCorridaButtonProps) => {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [hiddenOld, setHiddenOld] = useState(0);
  const [ranks, setRanks] = useState<Record<string, number>>({});
  const [corrections, setCorrections] = useState<Record<string, { count: number; last: string; reason: string }>>({});
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<RunRow | null>(null);
  const [km, setKm] = useState("");
  const [duration, setDuration] = useState("");
  const [reason, setReason] = useState("");

  const today = todayInBrasilia();
  const reviewStart = addDays(today, -REVIEW_DAYS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_runs")
        .select(
          "id, competition_id, state, started_at, finished_at, distance_meters, total_time_seconds, avg_pace_seconds_per_km, " +
            "competitions(title, mode, starts_on, ends_on), " +
            "competition_registrations(distance_id, competition_distances(meters, label))"
        )
        .eq("user_id", userId)
        .not("started_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const all = (data ?? []) as unknown as RunRow[];
      // Só competições em andamento ou encerradas há até REVIEW_DAYS dias.
      const correctable = all.filter((r) => {
        const c = r.competitions;
        if (!c) return false;
        if (c.starts_on && c.starts_on > today) return false;
        return !c.ends_on || c.ends_on >= reviewStart;
      });
      setRuns(correctable);
      setHiddenOld(all.length - correctable.length);

      const runIds = correctable.map((r) => r.id);
      const competitionIds = [...new Set(correctable.map((r) => r.competition_id))];
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
      toast.error("Erro ao carregar as corridas", {
        description: e instanceof Error ? e.message : "Tente de novo em instantes.",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, today, reviewStart]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Agrupa por competição (mais recente primeiro) e, dentro dela, pela distância da inscrição.
  const groups = useMemo<CompetitionGroup[]>(() => {
    const byComp = new Map<string, CompetitionGroup>();
    for (const r of runs) {
      const c = r.competitions;
      if (!c) continue;
      let g = byComp.get(r.competition_id);
      if (!g) {
        g = { id: r.competition_id, title: c.title, mode: c.mode, endsOn: c.ends_on, distances: [] };
        byComp.set(r.competition_id, g);
      }
      const reg = r.competition_registrations?.competition_distances ?? null;
      const meters = reg?.meters ?? null;
      const label = reg ? (reg.label ? `${reg.label} (${formatKm(reg.meters)})` : formatKm(reg.meters)) : "Sem distância na inscrição";
      let d = g.distances.find((x) => x.meters === meters);
      if (!d) {
        d = { meters, label, runs: [] };
        g.distances.push(d);
      }
      d.runs.push(r);
    }
    for (const g of byComp.values()) g.distances.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0));
    return [...byComp.values()];
  }, [runs]);

  if (!hasPermission(PERMISSION_KEYS.COMPETICOES_EDIT)) return null;

  const target = selected?.competition_registrations?.competition_distances?.meters ?? null;
  const meters = parseKm(km);
  const seconds = parseDuration(duration);
  const pace = meters && seconds ? Math.round((seconds * 1000) / meters) : null;
  const paceValid = pace !== null && pace >= 170 && pace <= 1800;
  const overTarget = !!target && !!meters && meters > target;
  const tooShort = !!target && !!meters && meters < Math.ceil(target * 0.99);
  // Acima do alvo grava a distância do alvo e o tempo no alvo pelo ritmo (igual ao "Lançar corrida"),
  // para o ranking usar exatamente o tempo informado.
  const sendMeters = overTarget && target ? target : meters;
  const sendSeconds = overTarget && target && pace ? Math.round((target * pace) / 1000) : seconds;
  const canSubmit = !!selected && !!meters && !!seconds && paceValid && reason.trim().length > 0 && !saving;

  const pick = (r: RunRow) => {
    setSelected(r);
    setKm(r.distance_meters ? (r.distance_meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "");
    setDuration(r.total_time_seconds ? formatDuration(r.total_time_seconds) : "");
    setReason("");
  };

  const backToList = () => {
    if (saving) return;
    setSelected(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (!next) setSelected(null);
  };

  const handleSave = async () => {
    if (!selected || !canSubmit || !sendMeters || !sendSeconds) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_correct_run_metrics", {
        p_run_id: selected.id,
        p_distance_meters: sendMeters,
        p_total_time_seconds: sendSeconds,
        p_reason: reason.trim(),
      });
      if (error) {
        const hit = CORRECTION_ERROR_MESSAGES.find(([k]) => error.message.includes(k));
        throw new Error(hit ? hit[1] : error.message);
      }
      toast.success("Corrida corrigida", {
        description: `${userName}: ${formatKm(sendMeters)} em ${formatDuration(sendSeconds)}. Ranking e pontos da etapa recalculados.`,
      });
      // A página do atleta se recarrega sozinha quando uma corrida muda (igual ao "Lançar corrida"),
      // então a janela fecha; ao abrir de novo, a tentativa aparece como "Corrigida".
      setSelected(null);
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao corrigir a corrida", {
        description: e instanceof Error ? e.message : "Não foi possível corrigir a corrida.",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedGroup = selected ? groups.find((g) => g.id === selected.competition_id) : null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 border-0 hover:brightness-90 transition-all"
        style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
      >
        <PencilLine className="w-4 h-4" />
        Corrigir corrida
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-[#2a2a2a] border-0 sm:max-w-[720px] p-8 max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Close</span>
          </button>

          {!selected ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">Corrigir corrida</h2>
                <p className="text-sm text-muted-foreground">
                  Todas as tentativas de <strong className="text-foreground">{userName}</strong> em competições em
                  andamento ou encerradas há até {REVIEW_DAYS} dias, por competição e distância da inscrição. Só dá
                  para corrigir corrida finalizada. A marcação "No ranking" mostra qual tentativa conta hoje.
                </p>
              </div>

              {loading && <p className="text-sm text-muted-foreground">Carregando corridas...</p>}
              {!loading && groups.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma corrida em competição em andamento ou em revisão.
                </p>
              )}

              {!loading &&
                groups.map((g) => {
                  const inReview = !!g.endsOn && g.endsOn < today;
                  return (
                    <div key={g.id} className="rounded-md bg-[#1A1A1A] p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{g.title}</span>
                        {modeLabel(g.mode) && (
                          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                            {modeLabel(g.mode)}
                          </Badge>
                        )}
                        {inReview && g.endsOn && (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                            encerrada, revisão até {formatDayMonth(addDays(g.endsOn, REVIEW_DAYS))}
                          </Badge>
                        )}
                      </div>
                      {g.distances.map((d) => (
                        <div key={`${g.id}-${d.meters}`} className="space-y-2">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Inscrição: {d.label}</p>
                          {d.runs.map((r) => {
                            const finished = r.state === "finished";
                            const corr = corrections[r.id];
                            return (
                              <div
                                key={r.id}
                                className={`flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 px-3 py-2 text-sm ${finished ? "" : "opacity-60"}`}
                              >
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="text-foreground">{formatDateTime(r.started_at)}</span>
                                  <span className="text-muted-foreground">{stateLabel(r.state)}</span>
                                  <span className="text-foreground">{formatKm(r.distance_meters)}</span>
                                  <span className="text-foreground">{formatDuration(r.total_time_seconds)}</span>
                                  <span className="text-muted-foreground">{formatPace(r.avg_pace_seconds_per_km)}</span>
                                  {ranks[r.id] && (
                                    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                                      No ranking: {ranks[r.id]}º
                                    </Badge>
                                  )}
                                  {corr && (
                                    <Badge
                                      variant="outline"
                                      className="border-muted-foreground/30 text-muted-foreground"
                                      title={`Último motivo: ${corr.reason}`}
                                    >
                                      Corrigida{corr.count > 1 ? ` ${corr.count}x` : ""} em {formatDateTime(corr.last)}
                                    </Badge>
                                  )}
                                  {manual.has(r.id) && (
                                    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                                      Lançada pelo admin
                                    </Badge>
                                  )}
                                </div>
                                {finished && (
                                  <Button
                                    size="sm"
                                    onClick={() => pick(r)}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                  >
                                    Corrigir
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}

              {!loading && hiddenOld > 0 && (
                <p className="text-xs text-muted-foreground">
                  {hiddenOld} {hiddenOld === 1 ? "tentativa" : "tentativas"} de competições encerradas há mais de{" "}
                  {REVIEW_DAYS} dias não {hiddenOld === 1 ? "aparece" : "aparecem"} aqui: o resultado delas já é
                  definitivo.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <button
                onClick={backToList}
                disabled={saving}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar às tentativas
              </button>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">Corrigir corrida</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedGroup?.title}
                  {selectedGroup && modeLabel(selectedGroup.mode) ? ` · ${modeLabel(selectedGroup.mode)}` : ""}
                  {target ? ` · inscrição ${formatKm(target)}` : ""} · tentativa de {formatDateTime(selected.started_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Hoje: <span className="text-foreground">{formatKm(selected.distance_meters)}</span> em{" "}
                  <span className="text-foreground">{formatDuration(selected.total_time_seconds)}</span> (
                  {formatPace(selected.avg_pace_seconds_per_km)})
                  {ranks[selected.id] ? ` · ${ranks[selected.id]}º no ranking` : " · não conta no ranking hoje"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fix-km">Distância certa (km)</Label>
                  <Input id="fix-km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fix-time">Tempo certo</Label>
                  <Input
                    id="fix-time"
                    placeholder="30:28 ou 1:05:10"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>

              {meters && seconds && pace !== null && (
                <div className="rounded-md bg-[#1A1A1A] p-4 text-sm space-y-1">
                  <p className="text-muted-foreground">
                    Ritmo: <span className="text-foreground">{formatPace(pace)}</span>
                  </p>
                  {!paceValid && <p className="text-destructive">O ritmo precisa ficar entre 2:50 e 30:00 min/km.</p>}
                  {paceValid && overTarget && target && (
                    <p className="text-muted-foreground">
                      Acima da distância da inscrição: grava {formatKm(target)} em{" "}
                      <span className="text-foreground">{formatDuration(sendSeconds)}</span> (tempo no alvo pelo ritmo; os
                      valores informados ficam na auditoria).
                    </p>
                  )}
                  {paceValid && tooShort && target && (
                    <p className="text-yellow-400">
                      Abaixo de 99% de {formatKm(target)}: depois da correção esta tentativa sai do ranking.
                    </p>
                  )}
                </div>
              )}
              {(km && !meters) || (duration && !seconds) ? (
                <p className="text-xs text-destructive">
                  Use km com vírgula ou ponto (ex.: 5,51) e tempo como mm:ss ou h:mm:ss.
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="fix-reason">Motivo</Label>
                <Textarea
                  id="fix-reason"
                  placeholder="Ex.: GPS falhou no km 3; tempo conferido no print do relógio enviado pelo atleta"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={saving}
                />
              </div>

              <p className="text-xs text-yellow-400">
                O ranking e os pontos da etapa são recalculados na hora. Isso pode mudar a posição de outros atletas.
              </p>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={backToList}
                  disabled={saving}
                  className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                >
                  Voltar
                </Button>
                <Button onClick={handleSave} disabled={!canSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? "Salvando..." : "Salvar correção"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
