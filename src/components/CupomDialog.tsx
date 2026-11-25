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
  situacaoDaCorrida,
  type CampeonatoOpcao,
  type CorridaOpcao,
  type Cupom,
  type LotKind,
  type PacoteOpcao,
  type ParceiroOpcao,
} from "@/lib/cupons";

interface CupomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = cupom novo */
  cupom: Cupom | null;
  corridas: CorridaOpcao[];
  /** Só os pacotes de 12 inscrições (RunLab Club). */
  pacotes: PacoteOpcao[];
  campeonatos: CampeonatoOpcao[];
  parceiros: ParceiroOpcao[];
  onSaved: () => void;
}

interface FormState {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  /** Página geral do checkout (Inscrição avulsa e com kit, que viram créditos). */
  geral: boolean;
  /** Dentro das corridas (compra na página da corrida). */
  corridas: boolean;
  semKit: boolean;
  comKit: boolean;
  pacotesEscolhidos: string[];
  corridasModo: "todas" | "campeonato" | "algumas";
  campeonatosEscolhidos: string[];
  corridasEscolhidas: string[];
  usoCpfModo: "um" | "ilimitado" | "outro";
  usoCpfNumero: string;
  limiteTotalModo: "sem" | "com";
  limiteTotal: string;
  inicio: string;
  fim: string;
  compraMinima: string;
  /** "" = cupom da RunLab, sem comissão. */
  dono: string;
  active: boolean;
}

const VAZIO: FormState = {
  code: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  geral: true,
  corridas: true,
  semKit: true,
  comKit: true,
  pacotesEscolhidos: [],
  corridasModo: "todas",
  campeonatosEscolhidos: [],
  corridasEscolhidas: [],
  usoCpfModo: "um",
  usoCpfNumero: "2",
  limiteTotalModo: "sem",
  limiteTotal: "",
  inicio: "",
  fim: "",
  compraMinima: "",
  dono: "",
  active: true,
};

function formDoCupom(c: Cupom, pacotes: PacoteOpcao[]): FormState {
  const kinds = c.lot_kinds;
  return {
    code: c.code,
    description: c.description ?? "",
    discountType: c.discount_type,
    discountValue: String(Number(c.discount_value)),
    geral: c.general_checkout ?? true,
    corridas: c.in_races ?? true,
    semKit: kinds === null || kinds.includes("sem_kit"),
    comKit: kinds === null || kinds.includes("com_kit"),
    pacotesEscolhidos: c.plan_ids === null ? pacotes.map((p) => p.id) : c.plan_ids,
    corridasModo: c.championship_ids ? "campeonato" : c.competition_ids ? "algumas" : "todas",
    campeonatosEscolhidos: c.championship_ids ?? [],
    corridasEscolhidas: c.competition_ids ?? [],
    usoCpfModo: c.max_uses_per_user == null ? "ilimitado" : c.max_uses_per_user === 1 ? "um" : "outro",
    usoCpfNumero: c.max_uses_per_user != null && c.max_uses_per_user > 1 ? String(c.max_uses_per_user) : "2",
    limiteTotalModo: c.max_uses == null ? "sem" : "com",
    limiteTotal: c.max_uses != null ? String(c.max_uses) : "",
    inicio: isoParaDia(c.valid_from),
    fim: isoParaDia(c.valid_until),
    compraMinima: c.min_amount != null ? String(Number(c.min_amount)) : "",
    dono: c.owner_partner_id ?? "",
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
const dica = "text-xs text-muted-foreground leading-snug";

export const CupomDialog = ({ open, onOpenChange, cupom, corridas, pacotes, campeonatos, parceiros, onSaved }: CupomDialogProps) => {
  const { user } = useAuth();
  const [f, setF] = useState<FormState>(VAZIO);
  const [buscaCorrida, setBuscaCorrida] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setF(cupom ? formDoCupom(cupom, pacotes) : VAZIO);
      setBuscaCorrida("");
      setError(null);
      setSaving(false);
    }
  }, [open, cupom]);

  const set = <K extends keyof FormState>(chave: K, valor: FormState[K]) => {
    setF((atual) => ({ ...atual, [chave]: valor }));
    if (error) setError(null);
  };

  const alterna = (chave: "pacotesEscolhidos" | "corridasEscolhidas" | "campeonatosEscolhidos", id: string) => {
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

  const valeInscricao = f.geral || f.corridas;
  // "Vale em tudo" (pedido da Angélica, 24/11/2026): página geral, todas as corridas, com e sem kit e os pacotes.
  const todosPacotesIds = pacotes.map((p) => p.id);
  const valeEmTudo =
    f.geral &&
    f.corridas &&
    f.corridasModo === "todas" &&
    f.semKit &&
    f.comKit &&
    todosPacotesIds.every((id) => f.pacotesEscolhidos.includes(id));
  const marcaTudo = (ligar: boolean) => {
    setF((atual) =>
      ligar
        ? { ...atual, geral: true, corridas: true, corridasModo: "todas", semKit: true, comKit: true, pacotesEscolhidos: todosPacotesIds }
        : { ...atual, geral: false, corridas: false, pacotesEscolhidos: [] },
    );
    if (error) setError(null);
  };
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

    if (valeInscricao && !f.semKit && !f.comKit) return "Tipo de inscrição: marque Sem kit, Com kit ou os dois.";
    let lotKinds: LotKind[] | null = null;
    if (valeInscricao && !(f.semKit && f.comKit)) {
      lotKinds = [...(f.semKit ? (["sem_kit"] as LotKind[]) : []), ...(f.comKit ? (["com_kit"] as LotKind[]) : [])];
    }

    // Pacotes: todos marcados = todos (inclusive os que vierem depois); nenhum = não vale em pacote.
    const todosPacotes = pacotes.map((p) => p.id);
    let planIds: string[] | null;
    if (f.pacotesEscolhidos.length === 0) planIds = [];
    else if (todosPacotes.length > 0 && todosPacotes.every((id) => f.pacotesEscolhidos.includes(id))) planIds = null;
    else planIds = f.pacotesEscolhidos;

    const appliesTo = appliesToDe(f.geral, f.corridas, planIds);
    if (!appliesTo) return "Marque pelo menos um lugar onde o cupom vale: página geral, dentro das corridas ou um pacote.";

    let competitionIds: string[] | null = null;
    let championshipIds: string[] | null = null;
    if (f.corridas && f.corridasModo === "algumas") {
      if (f.corridasEscolhidas.length === 0) return "Escolha pelo menos uma corrida, ou marque Todas as corridas.";
      competitionIds = f.corridasEscolhidas;
    }
    if (f.corridas && f.corridasModo === "campeonato") {
      if (f.campeonatosEscolhidos.length === 0) return "Escolha pelo menos um campeonato, ou marque Todas as corridas.";
      championshipIds = f.campeonatosEscolhidos;
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
      general_checkout: f.geral,
      in_races: f.corridas,
      lot_kinds: lotKinds,
      plan_ids: planIds,
      competition_ids: competitionIds,
      championship_ids: championshipIds,
      max_uses_per_user: maxPorCpf,
      max_uses: maxTotal,
      valid_from: f.inicio ? diaParaIso(f.inicio, false) : null,
      valid_until: f.fim ? diaParaIso(f.fim, true) : null,
      min_amount: minimo,
      owner_partner_id: f.dono || null,
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

          {/* Dono do cupom: quem recebe a comissão */}
          <div className="space-y-2">
            <label className={rotulo} htmlFor="cupom-dono">Comissão vai para</label>
            <select
              id="cupom-dono"
              value={f.dono}
              onChange={(e) => set("dono", e.target.value)}
              disabled={saving}
              className={`${campo} h-10 w-full rounded-md px-3 text-sm`}
            >
              <option value="">Ninguém (cupom da RunLab, sem comissão)</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.codigo ? ` (${p.codigo})` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Quem compra com este cupom gera 10% de comissão para o parceiro escolhido, mesmo que o corredor
              seja ligado a outro parceiro.
            </p>
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

          {/* Onde o cupom vale (24/11/2026): a página geral não é pacote */}
          <div className="space-y-3">
            <label className={rotulo}>Onde o cupom vale</label>
            <div className="rounded-md bg-[#1A1A1A] p-4 space-y-4">
              <div className="space-y-1 border-b border-border/40 pb-4">
                <label className={`${opcao} font-medium`}>
                  <Checkbox checked={valeEmTudo} onCheckedChange={(v) => marcaTudo(v === true)} />
                  Vale em tudo
                </label>
                <p className={`${dica} pl-6`}>
                  Marca de uma vez a página geral, todas as corridas, com e sem kit e o RunLab Club. Desmarcar limpa
                  tudo para escolher do zero.
                </p>
              </div>

              <div className="space-y-1">
                <label className={opcao}>
                  <Checkbox checked={f.geral} onCheckedChange={(v) => set("geral", v === true)} />
                  Página geral do checkout
                </label>
                <p className={`${dica} pl-6`}>
                  Inscrição avulsa e Inscrição com kit compradas na página geral (checkout.runlab.com.br). Viram créditos
                  na conta e a pessoa escolhe a corrida depois, no app. Não é pacote.
                </p>
              </div>

              <div className="space-y-2 border-t border-border/40 pt-4">
                <div className="space-y-1">
                  <label className={opcao}>
                    <Checkbox checked={f.corridas} onCheckedChange={(v) => set("corridas", v === true)} />
                    Dentro das corridas
                  </label>
                  <p className={`${dica} pl-6`}>
                    Compra feita na página de uma corrida (link da corrida no app ou no site). A inscrição já sai feita
                    naquela corrida.
                  </p>
                </div>
                {f.corridas && (
                  <div className="space-y-2 pl-6 pt-1">
                    <RadioGroup
                      value={f.corridasModo}
                      onValueChange={(v) => set("corridasModo", v as FormState["corridasModo"])}
                      className="flex flex-col gap-2"
                    >
                      <label className={opcao}><RadioGroupItem value="todas" /> Todas as corridas</label>
                      <label className={opcao}><RadioGroupItem value="campeonato" /> Só as corridas de um campeonato</label>
                      <label className={opcao}><RadioGroupItem value="algumas" /> Só as corridas que eu escolher</label>
                    </RadioGroup>
                    {f.corridasModo === "campeonato" && (
                      <div className="space-y-1 pt-1">
                        {campeonatos.length === 0 && <p className={dica}>Nenhum campeonato cadastrado.</p>}
                        {campeonatos.map((c) => (
                          <label key={c.id} className={`${opcao} py-1`}>
                            <Checkbox
                              checked={f.campeonatosEscolhidos.includes(c.id)}
                              onCheckedChange={() => alterna("campeonatosEscolhidos", c.id)}
                            />
                            <span>{c.name}</span>
                          </label>
                        ))}
                        <p className={dica}>Vale em todas as etapas do campeonato, inclusive as que ainda vão ser criadas.</p>
                      </div>
                    )}
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
                              <span className="flex-1">
                                {c.title}
                                {situacaoDaCorrida(c) && (
                                  <span
                                    className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
                                      c.status === "draft" ? "bg-[#CCF725]/15 text-[#CCF725]" : "bg-[#333] text-muted-foreground"
                                    }`}
                                  >
                                    {situacaoDaCorrida(c)}
                                  </span>
                                )}
                              </span>
                              {c.starts_at && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(c.starts_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                        <p className={dica}>
                          {f.corridasEscolhidas.length}{" "}
                          {f.corridasEscolhidas.length === 1 ? "corrida escolhida" : "corridas escolhidas"}. Corrida em
                          rascunho ou programada pode ser escolhida: o cupom passa a valer sozinho quando ela for ao ar.
                          Corrida criada depois não entra sozinha: para isso, use "Só as corridas de um campeonato".
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {valeInscricao && (
                <div className="space-y-2 border-t border-border/40 pt-4">
                  <p className="text-sm font-medium text-foreground">Tipo de inscrição</p>
                  <p className={dica}>Vale para a página geral e para as corridas marcadas acima.</p>
                  <div className="flex flex-wrap gap-6">
                    <label className={opcao}>
                      <Checkbox checked={f.semKit} onCheckedChange={(v) => set("semKit", v === true)} />
                      Sem kit (inscrição avulsa)
                    </label>
                    <label className={opcao}>
                      <Checkbox checked={f.comKit} onCheckedChange={(v) => set("comKit", v === true)} />
                      Com kit
                    </label>
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-border/40 pt-4">
                <p className="text-sm font-medium text-foreground">Pacotes</p>
                <p className={dica}>
                  Só o pacote de 12 inscrições. A Inscrição avulsa e a com kit da página geral ficam em "Página geral do
                  checkout", lá em cima.
                </p>
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
