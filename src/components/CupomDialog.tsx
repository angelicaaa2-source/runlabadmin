import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  CODIGO_REGEX,
  CODIGOS_RESERVADOS,
  appliesToDe,
  diaParaIso,
  formataReais,
  isoParaDia,
  type CorridaOpcao,
  type Cupom,
  type LotKind,
  type PacoteOpcao,
} from "@/lib/cupons";

interface CupomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = cupom novo */
  cupom: Cupom | null;
  corridas: CorridaOpcao[];
  pacotes: PacoteOpcao[];
  onSaved: () => void;
}

interface FormState {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  semKit: boolean;
  comKit: boolean;
  pacotesModo: "todos" | "alguns" | "nenhum";
  pacotesEscolhidos: string[];
  corridasModo: "todas" | "algumas";
  corridasEscolhidas: string[];
  usoCpfModo: "um" | "ilimitado" | "outro";
  usoCpfNumero: string;
  limiteTotalModo: "sem" | "com";
  limiteTotal: string;
  inicio: string;
  fim: string;
  compraMinima: string;
  active: boolean;
}

const VAZIO: FormState = {
  code: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  semKit: true,
  comKit: true,
  pacotesModo: "todos",
  pacotesEscolhidos: [],
  corridasModo: "todas",
  corridasEscolhidas: [],
  usoCpfModo: "um",
  usoCpfNumero: "2",
  limiteTotalModo: "sem",
  limiteTotal: "",
  inicio: "",
  fim: "",
  compraMinima: "",
  active: true,
};

function formDoCupom(c: Cupom): FormState {
  const kinds = c.lot_kinds;
  return {
    code: c.code,
    description: c.description ?? "",
    discountType: c.discount_type,
    discountValue: String(Number(c.discount_value)),
    semKit: kinds === null || kinds.includes("sem_kit"),
    comKit: kinds === null || kinds.includes("com_kit"),
    pacotesModo: c.plan_ids === null ? "todos" : c.plan_ids.length === 0 ? "nenhum" : "alguns",
    pacotesEscolhidos: c.plan_ids ?? [],
    corridasModo: c.competition_ids === null ? "todas" : "algumas",
    corridasEscolhidas: c.competition_ids ?? [],
    usoCpfModo: c.max_uses_per_user == null ? "ilimitado" : c.max_uses_per_user === 1 ? "um" : "outro",
    usoCpfNumero: c.max_uses_per_user != null && c.max_uses_per_user > 1 ? String(c.max_uses_per_user) : "2",
    limiteTotalModo: c.max_uses == null ? "sem" : "com",
    limiteTotal: c.max_uses != null ? String(c.max_uses) : "",
    inicio: isoParaDia(c.valid_from),
    fim: isoParaDia(c.valid_until),
    compraMinima: c.min_amount != null ? String(Number(c.min_amount)) : "",
    active: c.active,
  };
}

function numero(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

function inteiroPositivo(texto: string): number | null {
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const rotulo = "text-xs text-muted-foreground uppercase tracking-wide";
const campo = "bg-[#1A1A1A] border-0 text-foreground";
const opcao = "flex items-center gap-2 text-sm text-foreground cursor-pointer";

export const CupomDialog = ({ open, onOpenChange, cupom, corridas, pacotes, onSaved }: CupomDialogProps) => {
  const { user } = useAuth();
  const [f, setF] = useState<FormState>(VAZIO);
  const [buscaCorrida, setBuscaCorrida] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setF(cupom ? formDoCupom(cupom) : VAZIO);
      setBuscaCorrida("");
      setError(null);
      setSaving(false);
    }
  }, [open, cupom]);

  const set = <K extends keyof FormState>(chave: K, valor: FormState[K]) => {
    setF((atual) => ({ ...atual, [chave]: valor }));
    if (error) setError(null);
  };

  const alterna = (chave: "pacotesEscolhidos" | "corridasEscolhidas", id: string) => {
    setF((atual) => {
      const lista = atual[chave];
      return { ...atual, [chave]: lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id] };
    });
    if (error) setError(null);
  };

  const corridasFiltradas = useMemo(() => {
    const termo = buscaCorrida.trim().toLowerCase();
    if (!termo) return corridas;
    return corridas.filter((c) => c.title.toLowerCase().includes(termo));
  }, [buscaCorrida, corridas]);

  const valeInscricao = f.semKit || f.comKit;
  const valor = numero(f.discountValue);
  const ficaGratis =
    f.discountType === "percent" && valor >= 100;
  const usos = cupom?.usos ?? 0;

  const montaPayload = (): Record<string, unknown> | string => {
    const code = f.code.trim().toUpperCase();
    if (!CODIGO_REGEX.test(code)) return "Código: use de 3 a 30 caracteres (letras, números, _ ou -), sem espaço.";
    if (CODIGOS_RESERVADOS.includes(code)) return `O código ${code} é reservado pelo checkout. Escolha outro.`;

    if (!Number.isFinite(valor) || valor <= 0) return "Informe o valor do desconto.";
    if (f.discountType === "percent" && valor > 100) return "A porcentagem vai até 100%.";

    let lotKinds: LotKind[] | null;
    if (f.semKit && f.comKit) lotKinds = null;
    else lotKinds = [...(f.semKit ? (["sem_kit"] as LotKind[]) : []), ...(f.comKit ? (["com_kit"] as LotKind[]) : [])];

    let planIds: string[] | null;
    if (f.pacotesModo === "todos") planIds = null;
    else if (f.pacotesModo === "nenhum") planIds = [];
    else {
      if (f.pacotesEscolhidos.length === 0) return "Escolha pelo menos um pacote, ou marque outra opção em Pacotes.";
      planIds = f.pacotesEscolhidos;
    }

    const appliesTo = appliesToDe(lotKinds, planIds);
    if (!appliesTo) return "O cupom precisa valer para alguma coisa: inscrição ou pacote.";

    let competitionIds: string[] | null = null;
    if (valeInscricao && f.corridasModo === "algumas") {
      if (f.corridasEscolhidas.length === 0) return "Escolha pelo menos uma corrida, ou marque Todas as corridas.";
      competitionIds = f.corridasEscolhidas;
    }

    let maxPorCpf: number | null;
    if (f.usoCpfModo === "um") maxPorCpf = 1;
    else if (f.usoCpfModo === "ilimitado") maxPorCpf = null;
    else {
      maxPorCpf = inteiroPositivo(f.usoCpfNumero);
      if (maxPorCpf === null) return "Uso por CPF: informe um número inteiro a partir de 1.";
    }

    let maxTotal: number | null = null;
    if (f.limiteTotalModo === "com") {
      maxTotal = inteiroPositivo(f.limiteTotal);
      if (maxTotal === null) return "Limite total: informe um número inteiro a partir de 1.";
    }

    if (f.inicio && f.fim && f.fim < f.inicio) return "A data final precisa ser depois da data inicial.";

    let minimo: number | null = null;
    if (f.compraMinima.trim()) {
      minimo = numero(f.compraMinima);
      if (!Number.isFinite(minimo) || minimo < 0) return "Compra mínima: informe um valor em reais.";
    }

    return {
      code,
      description: f.description.trim() || null,
      discount_type: f.discountType,
      discount_value: valor,
      applies_to: appliesTo,
      lot_kinds: lotKinds,
      plan_ids: planIds,
      competition_ids: competitionIds,
      max_uses_per_user: maxPorCpf,
      max_uses: maxTotal,
      valid_from: f.inicio ? diaParaIso(f.inicio, false) : null,
      valid_until: f.fim ? diaParaIso(f.fim, true) : null,
      min_amount: minimo,
      active: f.active,
    };
  };

  const handleSave = async () => {
    const payload = montaPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: dbError } = cupom
        ? await supabase.from("coupons").update(payload).eq("id", cupom.id)
        : await supabase.from("coupons").insert({ ...payload, created_by: user?.id ?? null });
      if (dbError) {
        if (dbError.code === "23505") throw new Error("Já existe um cupom com esse código.");
        throw new Error(dbError.message);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o cupom.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#2a2a2a] border-0 sm:max-w-[680px] p-0 max-h-[92vh] flex flex-col">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Fechar</span>
        </button>

        <div className="px-8 pt-8 pb-2">
          <h2 className="text-2xl font-semibold text-foreground">{cupom ? "Editar cupom" : "Novo cupom"}</h2>
          {cupom && usos > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Já usado {usos} {usos === 1 ? "vez" : "vezes"}. As mudanças valem para as próximas compras.
            </p>
          )}
        </div>

        <div className="px-8 py-4 space-y-6 overflow-y-auto [color-scheme:dark]">
          {/* Código e descrição */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={rotulo}>Código</label>
              <Input
                autoFocus={!cupom}
                value={f.code}
                onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="Ex.: NATAL20"
                maxLength={30}
                className={`${campo} uppercase tracking-wider`}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <label className={rotulo}>Descrição interna (opcional)</label>
              <Input
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Ex.: Campanha de Natal no Instagram"
                maxLength={140}
                className={campo}
                disabled={saving}
              />
            </div>
          </div>

          {/* Desconto */}
          <div className="space-y-2">
            <label className={rotulo}>Desconto</label>
            <div className="flex flex-wrap items-center gap-4">
              <RadioGroup
                value={f.discountType}
                onValueChange={(v) => set("discountType", v as FormState["discountType"])}
                className="flex gap-4"
              >
                <label className={opcao}><RadioGroupItem value="percent" /> Porcentagem</label>
                <label className={opcao}><RadioGroupItem value="fixed" /> Valor em reais</label>
              </RadioGroup>
              <div className="flex items-center gap-2">
                {f.discountType === "fixed" && <span className="text-sm text-muted-foreground">R$</span>}
                <Input
                  value={f.discountValue}
                  onChange={(e) => set("discountValue", e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder={f.discountType === "percent" ? "20" : "10,00"}
                  inputMode="decimal"
                  className={`${campo} w-28`}
                  disabled={saving}
                />
                {f.discountType === "percent" && <span className="text-sm text-muted-foreground">%</span>}
              </div>
            </div>
          </div>

          {/* Vale para */}
          <div className="space-y-3">
            <label className={rotulo}>Vale para</label>
            <div className="rounded-md bg-[#1A1A1A] p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Inscrição em corrida</p>
                <div className="flex flex-wrap gap-6">
                  <label className={opcao}>
                    <Checkbox checked={f.semKit} onCheckedChange={(v) => set("semKit", v === true)} />
                    Sem kit
                  </label>
                  <label className={opcao}>
                    <Checkbox checked={f.comKit} onCheckedChange={(v) => set("comKit", v === true)} />
                    Com kit
                  </label>
                </div>
              </div>

              {valeInscricao && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Em quais corridas</p>
                  <RadioGroup
                    value={f.corridasModo}
                    onValueChange={(v) => set("corridasModo", v as FormState["corridasModo"])}
                    className="flex gap-6"
                  >
                    <label className={opcao}><RadioGroupItem value="todas" /> Todas as corridas</label>
                    <label className={opcao}><RadioGroupItem value="algumas" /> Só as que eu escolher</label>
                  </RadioGroup>
                  {f.corridasModo === "algumas" && (
                    <div className="space-y-2 pt-1">
                      <Input
                        value={buscaCorrida}
                        onChange={(e) => setBuscaCorrida(e.target.value)}
                        placeholder="Buscar corrida pelo nome"
                        className="bg-[#2a2a2a] border-0 text-foreground"
                      />
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {corridasFiltradas.length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">Nenhuma corrida encontrada.</p>
                        )}
                        {corridasFiltradas.map((c) => (
                          <label key={c.id} className={`${opcao} py-1`}>
                            <Checkbox
                              checked={f.corridasEscolhidas.includes(c.id)}
                              onCheckedChange={() => alterna("corridasEscolhidas", c.id)}
                            />
                            <span className="flex-1">{c.title}</span>
                            {c.starts_at && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(c.starts_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {f.corridasEscolhidas.length} {f.corridasEscolhidas.length === 1 ? "corrida escolhida" : "corridas escolhidas"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 border-t border-border/40 pt-4">
                <p className="text-sm font-medium text-foreground">Pacotes</p>
                <RadioGroup
                  value={f.pacotesModo}
                  onValueChange={(v) => set("pacotesModo", v as FormState["pacotesModo"])}
                  className="flex flex-wrap gap-6"
                >
                  <label className={opcao}><RadioGroupItem value="todos" /> Todos os pacotes</label>
                  <label className={opcao}><RadioGroupItem value="alguns" /> Só os que eu escolher</label>
                  <label className={opcao}><RadioGroupItem value="nenhum" /> Não vale para pacotes</label>
                </RadioGroup>
                {f.pacotesModo === "alguns" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                    {pacotes.map((p) => (
                      <label key={p.id} className={`${opcao} py-1`}>
                        <Checkbox
                          checked={f.pacotesEscolhidos.includes(p.id)}
                          onCheckedChange={() => alterna("pacotesEscolhidos", p.id)}
                        />
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formataReais(Number(p.price))}
                          {!p.is_active && " (fora de venda)"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Limites */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={rotulo}>Uso por CPF</label>
              <RadioGroup
                value={f.usoCpfModo}
                onValueChange={(v) => set("usoCpfModo", v as FormState["usoCpfModo"])}
                className="space-y-1"
              >
                <label className={opcao}><RadioGroupItem value="um" /> 1 vez por CPF</label>
                <label className={opcao}><RadioGroupItem value="ilimitado" /> Ilimitado</label>
                <label className={opcao}>
                  <RadioGroupItem value="outro" /> Até
                  <Input
                    value={f.usoCpfNumero}
                    onChange={(e) => set("usoCpfNumero", e.target.value.replace(/\D/g, ""))}
                    onFocus={() => set("usoCpfModo", "outro")}
                    inputMode="numeric"
                    className={`${campo} w-16 h-8`}
                    disabled={saving}
                  />
                  vezes por CPF
                </label>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <label className={rotulo}>Limite total de usos</label>
              <RadioGroup
                value={f.limiteTotalModo}
                onValueChange={(v) => set("limiteTotalModo", v as FormState["limiteTotalModo"])}
                className="space-y-1"
              >
                <label className={opcao}><RadioGroupItem value="sem" /> Sem limite</label>
                <label className={opcao}>
                  <RadioGroupItem value="com" /> Até
                  <Input
                    value={f.limiteTotal}
                    onChange={(e) => set("limiteTotal", e.target.value.replace(/\D/g, ""))}
                    onFocus={() => set("limiteTotalModo", "com")}
                    inputMode="numeric"
                    placeholder="100"
                    className={`${campo} w-20 h-8`}
                    disabled={saving}
                  />
                  usos no total
                </label>
              </RadioGroup>
            </div>
          </div>

          {/* Validade e mínimo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className={rotulo}>Começa em</label>
              <Input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} className={campo} disabled={saving} />
            </div>
            <div className="space-y-2">
              <label className={rotulo}>Termina em</label>
              <Input type="date" value={f.fim} onChange={(e) => set("fim", e.target.value)} className={campo} disabled={saving} />
            </div>
            <div className="space-y-2">
              <label className={rotulo}>Compra mínima (R$)</label>
              <Input
                value={f.compraMinima}
                onChange={(e) => set("compraMinima", e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="Opcional"
                inputMode="decimal"
                className={campo}
                disabled={saving}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            Datas em branco = sem prazo. O cupom vale do início do primeiro dia ao fim do último (horário de Brasília).
          </p>

          <label className="flex items-center gap-3 text-sm text-foreground cursor-pointer">
            <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />
            {f.active ? "Ativo: aceito no checkout" : "Inativo: o checkout recusa este código"}
          </label>

          {ficaGratis && f.usoCpfModo === "ilimitado" && f.limiteTotalModo === "sem" && (
            <div className="flex gap-2 rounded-md bg-destructive/15 p-3 text-sm text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              Com 100% de desconto, uso ilimitado e sem limite total, qualquer pessoa com o código compra de graça quantas vezes quiser.
            </div>
          )}

        </div>

        {error && (
          <p className="px-8 pt-4 text-sm text-destructive border-t border-border/40" role="alert">
            {error}
          </p>
        )}
        <div className={`flex gap-4 px-8 py-5 ${error ? "" : "border-t border-border/40"}`}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1 bg-transparent border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 border-0 hover:brightness-90 transition-all"
            style={{ backgroundColor: "#CCF725", color: "#1A1A1A" }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : cupom ? (
              "Salvar alterações"
            ) : (
              "Criar cupom"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
