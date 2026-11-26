import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import {
  type RunRow,
  formatDuration,
  formatKm,
  formatPace,
  formatRunDateTime,
  modeLabel,
  parseDuration,
  parseKm,
} from "@/lib/corridas";

const CORRECTION_ERROR_MESSAGES: [string, string][] = [
  ["REVIEW_PERIOD_OVER", "O prazo de revisão desta competição acabou (7 dias depois do fim)."],
  ["Apenas administradores", "Você não tem permissão para corrigir corridas."],
  ["Justificativa é obrigatória", "Informe o motivo."],
  ["Só é possível corrigir corrida finalizada", "Só dá para corrigir corrida finalizada."],
  ["Pace resultante", "O ritmo precisa ficar entre 2:50 e 30:00 min/km."],
  ["Distância e tempo devem ser maiores que zero", "Distância e tempo devem ser maiores que zero."],
];

interface CorrigirCorridaDialogProps {
  run: RunRow | null;
  rank: number | null;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Janela de correção de uma tentativa finalizada (usa admin_correct_run_metrics). */
export const CorrigirCorridaDialog = ({ run, rank, userName, onClose, onSaved }: CorrigirCorridaDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [km, setKm] = useState("");
  const [duration, setDuration] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!run) return;
    setKm(run.distance_meters ? (run.distance_meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "");
    setDuration(run.total_time_seconds ? formatDuration(run.total_time_seconds) : "");
    setReason("");
  }, [run]);

  const target = run?.competition_registrations?.competition_distances?.meters ?? null;
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
  const canSubmit = !!run && !!meters && !!seconds && paceValid && reason.trim().length > 0 && !saving;

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    if (!next) onClose();
  };

  const handleSave = async () => {
    if (!run || !canSubmit || !sendMeters || !sendSeconds) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_correct_run_metrics", {
        p_run_id: run.id,
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
      onSaved();
    } catch (e) {
      toast.error("Erro ao corrigir a corrida", {
        description: e instanceof Error ? e.message : "Não foi possível corrigir a corrida.",
      });
    } finally {
      setSaving(false);
    }
  };

  const c = run?.competitions;

  return (
    <Dialog open={!!run} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#2a2a2a] border-0 sm:max-w-[560px] p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => handleOpenChange(false)}
          disabled={saving}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Close</span>
        </button>

        {run && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Corrigir corrida</h2>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{userName}</strong> · {c?.title}
                {c && modeLabel(c.mode) ? ` · ${modeLabel(c.mode)}` : ""}
                {target ? ` · inscrição ${formatKm(target)}` : ""} · tentativa de {formatRunDateTime(run.started_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                Hoje: <span className="text-foreground">{formatKm(run.distance_meters)}</span> em{" "}
                <span className="text-foreground">{formatDuration(run.total_time_seconds)}</span> (
                {formatPace(run.avg_pace_seconds_per_km)})
                {rank ? ` · ${rank}º no ranking` : " · não conta no ranking hoje"}
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
                onClick={() => handleOpenChange(false)}
                disabled={saving}
                className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!canSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? "Salvando..." : "Salvar correção"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
