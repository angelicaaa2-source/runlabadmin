import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/lib/supabase";
import { formatKm } from "@/lib/corridas";
import { mensagemCancelamento } from "@/lib/cancelamento";

type Detalhe = {
  status: string;
  payment_id: string | null;
  competitions: { title: string } | null;
  competition_distances: { meters: number } | null;
  runner_payments: { amount: number | null; billing_type: string | null } | null;
};

interface CancelarInscricaoDialogProps {
  open: boolean;
  registrationId: string | null;
  userName: string;
  onClose: () => void;
  onDone: () => void;
}

const formaPagamento = (b: string | null | undefined) =>
  b === "PIX" ? "Pix" : b === "CREDIT_CARD" ? "cartão" : b === "BOLETO" ? "boleto" : "pagamento";

/**
 * Cancela uma inscrição pelo admin (admin_cancel_registration), com justificativa obrigatória.
 * A pessoa sai da lista de inscritos e o app volta a mostrar "Inscreva-se". Se a inscrição usou crédito,
 * pergunta se devolve. O dinheiro de inscrição paga é devolvido por fora (banco ou Asaas): aqui não mexe no pagamento.
 */
export const CancelarInscricaoDialog = ({ open, registrationId, userName, onClose, onDone }: CancelarInscricaoDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [creditos, setCreditos] = useState(0);
  const [corridas, setCorridas] = useState(0);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [devolve, setDevolve] = useState<"sim" | "nao" | "">("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open || !registrationId) return;
    setDevolve("");
    setMotivo("");
    setErroCarga(null);
    setDetalhe(null);
    setLoading(true);
    (async () => {
      try {
        const [regRes, credRes, runRes] = await Promise.all([
          supabase
            .from("competition_registrations")
            .select("status, payment_id, competitions(title), competition_distances(meters), runner_payments(amount, billing_type)")
            .eq("id", registrationId)
            .single(),
          supabase.from("credit_transactions").select("amount, type").eq("competition_registration_id", registrationId),
          supabase
            .from("user_runs")
            .select("id", { count: "exact", head: true })
            .eq("registration_id", registrationId)
            .in("state", ["running", "paused", "finished"]),
        ]);
        if (regRes.error) throw regRes.error;
        setDetalhe(regRes.data as unknown as Detalhe);
        const tx = (credRes.data ?? []) as { amount: number; type: string }[];
        const usado = -tx.filter((t) => t.type === "usage").reduce((s, t) => s + t.amount, 0);
        const devolvido = tx.filter((t) => t.type === "refund").reduce((s, t) => s + t.amount, 0);
        setCreditos(Math.max(usado - devolvido, 0));
        setCorridas(runRes.count ?? 0);
      } catch (e) {
        setErroCarga(e instanceof Error ? e.message : "Erro ao carregar a inscrição");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, registrationId]);

  const motivoOk = motivo.trim().length >= 5;
  const precisaEscolher = creditos > 0;
  const bloqueada = corridas > 0 || detalhe?.status === "cancelled";
  const canSubmit = !saving && !loading && !!detalhe && !bloqueada && motivoOk && (!precisaEscolher || devolve !== "");

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    if (!registrationId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_cancel_registration", {
        p_registration_id: registrationId,
        p_reason: motivo.trim(),
        p_return_credit: precisaEscolher ? devolve === "sim" : null,
      });
      if (error) throw error;
      toast.success("Inscrição cancelada", {
        description: precisaEscolher && devolve === "sim" ? `${creditos} crédito${creditos > 1 ? "s" : ""} devolvido${creditos > 1 ? "s" : ""} ao atleta.` : undefined,
      });
      onDone();
    } catch (e) {
      toast.error("Não foi possível cancelar", { description: mensagemCancelamento(e) });
    } finally {
      setSaving(false);
    }
  };

  const pago = detalhe?.payment_id ? detalhe.runner_payments : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent data-cancelar-inscricao className="bg-[#2a2a2a] border-0 sm:max-w-[560px] p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          disabled={saving}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Fechar</span>
        </button>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">Cancelar inscrição</h2>
            {detalhe && (
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{userName}</strong> em{" "}
                <strong className="text-foreground">{detalhe.competitions?.title ?? "-"}</strong>
                {detalhe.competition_distances ? ` (${formatKm(detalhe.competition_distances.meters)})` : ""}
              </p>
            )}
          </div>

          {loading ? (
            <div className="py-6 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline-block" />
            </div>
          ) : erroCarga ? (
            <p className="text-sm text-destructive">{erroCarga}</p>
          ) : detalhe ? (
            <>
              {corridas > 0 ? (
                <p className="text-sm text-destructive">
                  O atleta já correu com essa inscrição ({corridas} corrida{corridas > 1 ? "s" : ""} em andamento ou finalizada
                  {corridas > 1 ? "s" : ""}), e ela está no ranking. Não dá para cancelar por aqui.
                </p>
              ) : detalhe.status === "cancelled" ? (
                <p className="text-sm text-muted-foreground">Essa inscrição já está cancelada.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  O atleta sai da lista de inscritos e, no app, o botão volta para "Inscreva-se" (ou "Inscrições encerradas", se o
                  período já fechou).
                </p>
              )}

              {pago && !bloqueada && (
                <p data-aviso-pagamento className="text-sm rounded-md bg-[#1A1A1A] p-4 text-foreground">
                  Inscrição paga por {formaPagamento(pago.billing_type)}
                  {pago.amount != null ? ` (R$ ${Number(pago.amount).toFixed(2).replace(".", ",")})` : ""}. A devolução do dinheiro
                  é feita por fora (banco ou Asaas). Aqui só a inscrição é cancelada e a justificativa fica registrada.
                </p>
              )}

              {precisaEscolher && !bloqueada && (
                <div className="space-y-3 rounded-md bg-[#1A1A1A] p-4">
                  <Label>Essa inscrição usou {creditos} crédito{creditos > 1 ? "s" : ""}. Devolver ao atleta?</Label>
                  <RadioGroup value={devolve} onValueChange={(v) => setDevolve(v as "sim" | "nao")} disabled={saving} className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sim" id="devolve-sim" className="border-muted-foreground" />
                      <Label htmlFor="devolve-sim" className="text-foreground cursor-pointer font-normal">Sim, devolver</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="nao" id="devolve-nao" className="border-muted-foreground" />
                      <Label htmlFor="devolve-nao" className="text-foreground cursor-pointer font-normal">Não devolver</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {!bloqueada && (
                <div className="space-y-2">
                  <Label htmlFor="cancel-motivo">Justificativa (obrigatória)</Label>
                  <Textarea
                    id="cancel-motivo"
                    placeholder="Ex.: pediu reembolso em 20/11, devolvido pelo Pix do Banco Inter"
                    maxLength={500}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    disabled={saving}
                  />
                </div>
              )}
            </>
          ) : null}

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
            >
              Voltar
            </Button>
            <Button onClick={handleSave} disabled={!canSubmit} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? "Cancelando..." : "Cancelar inscrição"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
