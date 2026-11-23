import { useEffect, useState } from "react";
import { Footprints, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSION_KEYS } from "@/lib/permissions";

type CompetitionOption = { id: string; title: string; ends_on: string | null };
type DistanceOption = { id: string; label: string | null; meters: number };

const MANUAL_RUN_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Você não tem permissão para lançar corridas.",
  TARGET_NOT_FOUND: "Usuário não encontrado.",
  INVALID_REASON: "Informe o motivo (até 300 caracteres).",
  DISTANCE_NOT_FOUND: "Distância não encontrada nesta competição.",
  INVALID_METRICS: "Distância e tempo devem ser maiores que zero.",
  DISTANCE_TOO_SHORT: "A distância está abaixo de 99% do desafio e não entraria no ranking.",
  INVALID_PACE: "O ritmo precisa ficar entre 3:00 e 30:00 min/km.",
  "Competicao nao esta em andamento": "A competição não está em andamento.",
  "Competicao fora da janela de corrida": "A competição está fora do período de corrida.",
  "Tentativa já utilizada nesta competição": "O atleta já tem uma corrida finalizada e a competição só permite uma tentativa.",
  REVIEW_PERIOD_OVER: "O prazo de revisão desta competição acabou (7 dias depois do fim).",
  "Competicao fora da janela de inscricoes": "A competição está fora do período de inscrições.",
};

/** Dias depois do fim da competição em que ainda dá para lançar corrida (o banco confere o mesmo prazo). */
const REVIEW_DAYS = 7;

/** Soma dias a uma data civil YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD -> DD/MM */
function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Data civil de hoje em Brasília (YYYY-MM-DD), mesma referência das competições. */
function todayInBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
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

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

function formatPace(secondsPerKm: number): string {
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, "0")}/km`;
}

function distanceLabel(d: DistanceOption): string {
  const km = `${(d.meters / 1000).toLocaleString("pt-BR")} km`;
  return d.label ? `${d.label} (${km})` : km;
}

interface LancarCorridaButtonProps {
  userId: string;
  userName: string;
  onCreated?: () => void;
}

export const LancarCorridaButton = ({ userId, userName, onCreated }: LancarCorridaButtonProps) => {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [distances, setDistances] = useState<DistanceOption[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [distanceId, setDistanceId] = useState("");
  const [km, setKm] = useState("");
  const [duration, setDuration] = useState("");
  const [reason, setReason] = useState("");

  // Competições em andamento hoje e encerradas há até REVIEW_DAYS dias (prazo de
  // revisão): o banco recusa corrida fora disso.
  useEffect(() => {
    if (!open) return;
    const today = todayInBrasilia();
    const reviewStart = addDays(today, -REVIEW_DAYS);
    supabase
      .from("competitions")
      .select("id, title, ends_on")
      .neq("status", "draft")
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${reviewStart}`)
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Erro ao carregar competições", { description: error.message });
          return;
        }
        setCompetitions(data ?? []);
      });
  }, [open]);

  useEffect(() => {
    setDistanceId("");
    setDistances([]);
    if (!competitionId) return;
    supabase
      .from("competition_distances")
      .select("id, label, meters")
      .eq("competition_id", competitionId)
      .order("meters", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Erro ao carregar distâncias", { description: error.message });
          return;
        }
        const rows = (data ?? []) as DistanceOption[];
        setDistances(rows);
        if (rows.length === 1) setDistanceId(rows[0].id);
      });
  }, [competitionId]);

  if (!hasPermission(PERMISSION_KEYS.COMPETICOES_EDIT)) return null;

  const today = todayInBrasilia();
  const inReview = (c: CompetitionOption) => !!c.ends_on && c.ends_on < today;
  const selectedCompetition = competitions.find((c) => c.id === competitionId);
  const selectedInReview = !!selectedCompetition && inReview(selectedCompetition);
  const target = distances.find((d) => d.id === distanceId);
  const meters = parseKm(km);
  const seconds = parseDuration(duration);
  const pace = meters && seconds ? Math.round((seconds * 1000) / meters) : null;
  const paceValid = pace !== null && pace >= 180 && pace <= 1800;
  const tooShort = !!target && !!meters && meters < Math.ceil(target.meters * 0.99);
  const overTarget = !!target && !!meters && meters > target.meters;
  const rankedTime = target && pace ? (overTarget ? Math.round((target.meters * pace) / 1000) : seconds) : null;

  const canSubmit =
    !!competitionId && !!target && !!meters && !!seconds && paceValid && !tooShort &&
    reason.trim().length > 0 && !saving;

  const reset = () => {
    setCompetitionId("");
    setDistanceId("");
    setKm("");
    setDuration("");
    setReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (!next) reset();
  };

  const handleConfirm = async () => {
    if (!canSubmit || !meters || !seconds) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("admin_add_manual_run", {
        p_user_id: userId,
        p_competition_id: competitionId,
        p_distance_id: distanceId,
        p_distance_meters: meters,
        p_total_time_seconds: seconds,
        p_reason: reason.trim(),
      });
      if (error) {
        throw new Error(MANUAL_RUN_ERROR_MESSAGES[error.message] ?? error.message);
      }

      toast.success("Corrida lançada", {
        description:
          `${userName} entrou no ranking com ${formatDuration(rankedTime ?? seconds)}.` +
          ((data as { points_recalculated?: boolean } | null)?.points_recalculated
            ? " Ranking e pontos da etapa recalculados."
            : ""),
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (e) {
      toast.error("Erro ao lançar corrida", {
        description: e instanceof Error ? e.message : "Não foi possível lançar a corrida.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 border-0 hover:brightness-90 transition-all"
        style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
      >
        <Footprints className="w-4 h-4" />
        Lançar corrida
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-[#2a2a2a] border-0 sm:max-w-[520px] p-8 max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Close</span>
          </button>

          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Lançar corrida</h2>
              <p className="text-sm text-muted-foreground">
                Registra uma corrida finalizada para <strong className="text-foreground">{userName}</strong>.
                Se não houver inscrição na distância, ela é criada e confirmada sem consumir crédito.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Competição (em andamento ou em revisão)</Label>
              <Select value={competitionId} onValueChange={setCompetitionId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a competição" />
                </SelectTrigger>
                <SelectContent>
                  {competitions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                      {inReview(c) && c.ends_on
                        ? ` (encerrada, revisão até ${formatDayMonth(addDays(c.ends_on, REVIEW_DAYS))})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {open && competitions.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma competição em andamento ou em revisão hoje.</p>
              )}
              {selectedInReview && (
                <p className="text-xs text-yellow-400">
                  Competição encerrada, em revisão. A corrida entra com a data do último dia da competição e o
                  ranking e os pontos do campeonato são recalculados na hora. Isso pode mudar a posição de outros atletas.
                </p>
              )}
            </div>

            {distances.length > 1 && (
              <div className="space-y-2">
                <Label>Distância do desafio</Label>
                <Select value={distanceId} onValueChange={setDistanceId} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a distância" />
                  </SelectTrigger>
                  <SelectContent>
                    {distances.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {distanceLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="run-km">Distância corrida (km)</Label>
                <Input
                  id="run-km"
                  inputMode="decimal"
                  placeholder="5,51"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-time">Tempo total</Label>
                <Input
                  id="run-time"
                  placeholder="30:28 ou 1:05:10"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {target && meters && seconds && pace !== null && (
              <div className="rounded-md bg-[#1A1A1A] p-4 text-sm space-y-1">
                <p className="text-muted-foreground">
                  Ritmo: <span className="text-foreground">{formatPace(pace)}</span>
                </p>
                {tooShort && (
                  <p className="text-destructive">
                    Abaixo de 99% de {distanceLabel(target)}: não entraria no ranking.
                  </p>
                )}
                {!paceValid && (
                  <p className="text-destructive">O ritmo precisa ficar entre 3:00 e 30:00 min/km.</p>
                )}
                {!tooShort && paceValid && rankedTime !== null && (
                  <p className="text-muted-foreground">
                    No ranking:{" "}
                    <span className="text-foreground">
                      {distanceLabel(target)} em {formatDuration(rankedTime)}
                    </span>
                    {overTarget && " (tempo no alvo calculado pelo ritmo; os dados originais ficam na auditoria)"}
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
              <Label htmlFor="run-reason">Motivo</Label>
              <Textarea
                id="run-reason"
                placeholder="Ex.: corrida não sincronizou no app; print do relógio enviado pelo atleta"
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
                className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canSubmit}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? "Lançando..." : "Lançar corrida"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
