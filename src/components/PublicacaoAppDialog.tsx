import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/lib/supabase";
import { todayInBrasilia } from "@/lib/corridas";
import { brasiliaToIso, formatPublishAt, isoToBrasiliaParts, mensagemDeErro } from "@/lib/publicacao";

type Modo = "now" | "schedule" | "hide";

interface PublicacaoAppDialogProps {
  open: boolean;
  competitionId: string;
  competitionName: string;
  /** true quando a corrida está em rascunho (oculta no app). */
  isDraft: boolean;
  publishAt: string | null;
  inscritos: number;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Quando a corrida aparece no app: agora, numa data e hora (o banco publica sozinho) ou oculta (rascunho).
 * Usa admin_set_competition_publication. Corrida pública com inscritos não pode ser escondida.
 */
export const PublicacaoAppDialog = ({
  open,
  competitionId,
  competitionName,
  isDraft,
  publishAt,
  inscritos,
  onClose,
  onDone,
}: PublicacaoAppDialogProps) => {
  const [modo, setModo] = useState<Modo>("schedule");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const partes = isoToBrasiliaParts(publishAt);
    setData(partes.date);
    setHora(partes.time || "08:00");
    setModo(isDraft ? (publishAt ? "schedule" : "hide") : "now");
  }, [open, isDraft, publishAt]);

  const podeEsconder = isDraft || inscritos === 0;
  const iso = modo === "schedule" ? brasiliaToIso(data, hora) : null;
  const noFuturo = iso ? new Date(iso).getTime() > Date.now() : false;
  const mudou =
    modo === "now" ? isDraft : modo === "hide" ? !isDraft || !!publishAt : !isDraft || iso !== (publishAt ? new Date(publishAt).toISOString() : null);
  const canSubmit = !saving && mudou && (modo !== "schedule" || noFuturo) && (modo === "now" || podeEsconder);

  const estadoAtual = !isDraft
    ? "Visível no app"
    : publishAt
      ? `Programada para ${formatPublishAt(publishAt)}`
      : "Oculta no app (rascunho)";

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_set_competition_publication", {
        p_competition_id: competitionId,
        p_mode: modo,
        p_publish_at: modo === "schedule" ? iso : null,
      });
      if (error) throw error;
      toast.success(
        modo === "now"
          ? "Corrida publicada no app"
          : modo === "schedule"
            ? `Corrida programada para ${formatPublishAt(iso)}`
            : "Corrida oculta no app",
      );
      onDone();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: mensagemDeErro(e, "Tente de novo.") });
    } finally {
      setSaving(false);
    }
  };

  const opcao = (valor: Modo, titulo: string, descricao: string, disabled = false) => (
    <div className={`flex items-start space-x-3 ${disabled ? "opacity-50" : ""}`}>
      <RadioGroupItem value={valor} id={`pub-${valor}`} disabled={disabled} className="border-muted-foreground mt-1" />
      <Label htmlFor={`pub-${valor}`} className={`text-foreground font-normal ${disabled ? "" : "cursor-pointer"}`}>
        {titulo}
        <span className="block text-xs text-muted-foreground mt-0.5">{descricao}</span>
      </Label>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="bg-[#2a2a2a] border-0 sm:max-w-[520px] p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Fechar</span>
        </button>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">Publicação no app</h2>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{competitionName}</strong>
              <br />
              Agora: <span data-estado-publicacao className="text-foreground">{estadoAtual}</span>
            </p>
          </div>

          <RadioGroup value={modo} onValueChange={(v) => setModo(v as Modo)} disabled={saving} className="space-y-4">
            {opcao("now", "Publicar agora", "Aparece no app e no site de compra na hora.")}
            {opcao(
              "schedule",
              "Programar",
              "Fica oculta e aparece sozinha no app e no site de compra na data e hora marcadas (horário de Brasília).",
              !podeEsconder,
            )}
            {modo === "schedule" && podeEsconder && (
              <div className="grid grid-cols-2 gap-4 pl-7">
                <div className="space-y-2">
                  <Label htmlFor="pub-data">Data</Label>
                  <Input
                    id="pub-data"
                    type="date"
                    min={todayInBrasilia()}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    disabled={saving}
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pub-hora">Hora</Label>
                  <Input
                    id="pub-hora"
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    disabled={saving}
                    className="bg-input border-border text-foreground"
                  />
                </div>
                {data && hora && !noFuturo && (
                  <p className="col-span-2 text-sm text-destructive">Escolha uma data e hora no futuro.</p>
                )}
              </div>
            )}
            {opcao("hide", "Ocultar (rascunho)", "Ninguém vê no app nem no site de compra até você publicar.", !podeEsconder)}
          </RadioGroup>

          {!podeEsconder && (
            <p className="text-sm text-muted-foreground">
              Essa corrida já tem {inscritos} inscrito{inscritos === 1 ? "" : "s"}, então não pode ser escondida do app.
            </p>
          )}

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!canSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
