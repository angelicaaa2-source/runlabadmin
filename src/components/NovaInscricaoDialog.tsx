import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { formatKm, modeLabel, todayInBrasilia } from "@/lib/corridas";
import { REASON_LABELS, type ReasonType } from "@/lib/inscricoes";

type CompetitionOption = {
  id: string;
  title: string;
  mode: string | null;
  ends_on: string | null;
  registration_starts_on: string | null;
  registration_ends_on: string | null;
};
type DistanceOption = { id: string; meters: number; label: string | null };
type LotOption = { id: string; name: string; has_kit: boolean | null };

const SHIRT_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];
const NO_LOT = "none";

const ERROR_MESSAGES: [string, string][] = [
  ["NO_CREDIT", "O atleta não tem crédito disponível. Adicione o crédito manualmente antes e faça a inscrição de novo."],
  ["Saldo de créditos insuficiente", "O atleta não tem crédito disponível. Adicione o crédito manualmente antes e faça a inscrição de novo."],
  ["DESCRIPTION_REQUIRED", "Escreva a descrição: ela é obrigatória quando não desconta crédito em \"Outro\"."],
  ["DEBIT_CHOICE_REQUIRED", "Escolha se desconta 1 crédito."],
  ["FORBIDDEN", "Você não tem permissão para inscrever corredores."],
  ["janela de inscricoes", "A competição está fora do período de inscrições."],
  ["inscrito nesta distância", "O atleta já está inscrito nesta distância."],
];

interface NovaInscricaoDialogProps {
  open: boolean;
  userId: string;
  userName: string;
  creditBalance: number;
  onClose: () => void;
  onDone: () => void;
}

/** Inscrição manual do corredor numa competição com inscrições abertas (usa admin_add_registration). */
export const NovaInscricaoDialog = ({ open, userId, userName, creditBalance, onClose, onDone }: NovaInscricaoDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [distances, setDistances] = useState<DistanceOption[]>([]);
  const [lots, setLots] = useState<LotOption[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [distanceId, setDistanceId] = useState("");
  const [lotId, setLotId] = useState(NO_LOT);
  const [shirtSize, setShirtSize] = useState("");
  const [reason, setReason] = useState<ReasonType | "">("");
  const [debitChoice, setDebitChoice] = useState<"sim" | "nao" | "">("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setCompetitionId("");
    setDistanceId("");
    setLotId(NO_LOT);
    setShirtSize("");
    setReason("");
    setDebitChoice("");
    setDescription("");
  };

  // Só competições com inscrição aberta hoje (o banco confere o mesmo).
  useEffect(() => {
    if (!open) return;
    const today = todayInBrasilia();
    supabase
      .from("competitions")
      .select("id, title, mode, ends_on, registration_starts_on, registration_ends_on")
      .in("status", ["open", "in_progress"])
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Erro ao carregar competições", { description: error.message });
          return;
        }
        const rows = ((data ?? []) as CompetitionOption[]).filter(
          (c) =>
            (!c.registration_starts_on || c.registration_starts_on <= today) &&
            (!c.registration_ends_on || c.registration_ends_on >= today) &&
            (!c.ends_on || c.ends_on >= today)
        );
        setCompetitions(rows);
      });
  }, [open]);

  useEffect(() => {
    setDistanceId("");
    setDistances([]);
    setLotId(NO_LOT);
    setLots([]);
    setShirtSize("");
    if (!competitionId) return;
    Promise.all([
      supabase.from("competition_distances").select("id, meters, label").eq("competition_id", competitionId).order("meters"),
      supabase
        .from("competition_lots")
        .select("id, name, has_kit")
        .eq("competition_id", competitionId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]).then(([d, l]) => {
      const ds = (d.data ?? []) as DistanceOption[];
      setDistances(ds);
      if (ds.length === 1) setDistanceId(ds[0].id);
      setLots((l.data ?? []) as LotOption[]);
    });
  }, [competitionId]);

  const lot = lots.find((l) => l.id === lotId);
  const needsShirt = !!lot?.has_kit;
  const debit = reason === "pagou_nao_inscreveu" || (reason === "outro" && debitChoice === "sim");
  const descriptionRequired = reason === "outro" && debitChoice === "nao";
  const noCredit = debit && creditBalance < 1;
  const canSubmit =
    !!competitionId &&
    !!distanceId &&
    (!needsShirt || !!shirtSize) &&
    !!reason &&
    (reason !== "outro" || !!debitChoice) &&
    (!descriptionRequired || description.trim().length > 0) &&
    !noCredit &&
    !saving;

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!canSubmit || !reason) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_add_registration", {
        p_user_id: userId,
        p_competition_id: competitionId,
        p_distance_id: distanceId,
        p_lot_id: lotId === NO_LOT ? null : lotId,
        p_shirt_size: needsShirt ? shirtSize : null,
        p_reason_type: reason,
        p_description: description.trim() || null,
        p_debit_credit: reason === "outro" ? debitChoice === "sim" : null,
      });
      if (error) {
        const hit = ERROR_MESSAGES.find(([k]) => error.message.includes(k));
        throw new Error(hit ? hit[1] : error.message);
      }
      const comp = competitions.find((c) => c.id === competitionId);
      toast.success("Inscrição feita", {
        description: `${userName} inscrito em ${comp?.title ?? "competição"}.${debit ? " 1 crédito descontado." : ""}`,
      });
      reset();
      onDone();
    } catch (e) {
      toast.error("Erro ao inscrever", {
        description: e instanceof Error ? e.message : "Não foi possível fazer a inscrição.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="bg-[#2a2a2a] border-0 sm:max-w-[560px] p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          disabled={saving}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Close</span>
        </button>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">Nova inscrição</h2>
            <p className="text-sm text-muted-foreground">
              Inscreve <strong className="text-foreground">{userName}</strong> numa competição com inscrições abertas.
              Saldo de créditos: <strong className="text-foreground">{creditBalance}</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Competição</Label>
            <Select value={competitionId} onValueChange={setCompetitionId} disabled={saving}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a competição" />
              </SelectTrigger>
              <SelectContent>
                {competitions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                    {modeLabel(c.mode) ? ` · ${modeLabel(c.mode)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {open && competitions.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma competição com inscrições abertas hoje.</p>
            )}
          </div>

          {competitionId && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Distância</Label>
                <Select value={distanceId} onValueChange={setDistanceId} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Distância" />
                  </SelectTrigger>
                  <SelectContent>
                    {distances.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label ? `${d.label} (${formatKm(d.meters)})` : formatKm(d.meters)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lote (opcional)</Label>
                <Select value={lotId} onValueChange={(v) => { setLotId(v); setShirtSize(""); }} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem lote" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LOT}>Sem lote</SelectItem>
                    {lots.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        {l.has_kit ? " (com kit)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {needsShirt && (
            <div className="space-y-2">
              <Label>Tamanho da camiseta (lote com kit)</Label>
              <Select value={shirtSize} onValueChange={setShirtSize} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder="Tamanho" />
                </SelectTrigger>
                <SelectContent>
                  {SHIRT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            <Label>Motivo</Label>
            <RadioGroup
              value={reason}
              onValueChange={(v) => {
                setReason(v as ReasonType);
                setDebitChoice("");
              }}
              disabled={saving}
            >
              {(Object.keys(REASON_LABELS) as ReasonType[]).map((k) => (
                <div key={k} className="flex items-center space-x-3">
                  <RadioGroupItem value={k} id={`motivo-${k}`} className="border-muted-foreground" />
                  <Label htmlFor={`motivo-${k}`} className="text-foreground cursor-pointer font-normal">
                    {REASON_LABELS[k]}
                    <span className="text-muted-foreground">
                      {k === "pagou_nao_inscreveu" ? " (desconta 1 crédito)" : k === "outro" ? "" : " (não desconta crédito)"}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {reason === "outro" && (
            <div className="space-y-3 rounded-md bg-[#1A1A1A] p-4">
              <Label>Descontar 1 crédito?</Label>
              <RadioGroup value={debitChoice} onValueChange={(v) => setDebitChoice(v as "sim" | "nao")} disabled={saving} className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="desconto-sim" className="border-muted-foreground" />
                  <Label htmlFor="desconto-sim" className="text-foreground cursor-pointer font-normal">Sim</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="desconto-nao" className="border-muted-foreground" />
                  <Label htmlFor="desconto-nao" className="text-foreground cursor-pointer font-normal">Não</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {reason && (reason !== "outro" || debitChoice) && (
            noCredit ? (
              <p className="text-sm text-destructive">
                O atleta não tem crédito disponível. Adicione 1 crédito manualmente antes (botão "Adicionar créditos", em
                "Saldo de créditos" nesta página) e depois faça a inscrição.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {debit
                  ? `Vai descontar 1 crédito (saldo ${creditBalance} → ${creditBalance - 1}). Aparece no histórico de créditos.`
                  : "Não desconta crédito."}
              </p>
            )
          )}

          <div className="space-y-2">
            <Label htmlFor="insc-descricao">Descrição {descriptionRequired ? "(obrigatória)" : "(opcional)"}</Label>
            <Textarea
              id="insc-descricao"
              placeholder="Ex.: pagou o Pix às 10h e o app não liberou; ganhador do sorteio do Strava"
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!canSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? "Inscrevendo..." : "Inscrever"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
