import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Search, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { CupomDialog } from "@/components/CupomDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/usePermissions";
import {
  formataDesconto,
  formataReais,
  formataUsoPorCpf,
  formataValidade,
  statusDoCupom,
  valeInscricoes,
  valePacotes,
  type CorridaOpcao,
  type Cupom,
  type PacoteOpcao,
  type ParceiroOpcao,
  type StatusCupom,
} from "@/lib/cupons";

type Filtro = "valendo" | "todos" | "fora";
type Aba = "cupons" | "parceiros";

/** Código de parceiro: 10% de desconto para quem compra e 10% de comissão para o parceiro. */
interface CodigoParceiro {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  vendas: number;
  vendido: number;
  comissao: number;
}

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "valendo", texto: "Valendo agora" },
  { valor: "fora", texto: "Inativos e encerrados" },
  { valor: "todos", texto: "Todos" },
];

const STATUS: Record<StatusCupom, { texto: string; classe: string }> = {
  ativo: { texto: "Ativo", classe: "bg-[#CCF725]/15 text-[#CCF725] hover:bg-[#CCF725]/15" },
  agendado: { texto: "Agendado", classe: "bg-primary/15 text-primary hover:bg-primary/15" },
  esgotado: { texto: "Esgotado", classe: "bg-muted text-foreground hover:bg-muted" },
  expirado: { texto: "Expirado", classe: "bg-muted text-muted-foreground hover:bg-muted" },
  inativo: { texto: "Inativo", classe: "bg-destructive/20 text-destructive hover:bg-destructive/20" },
};

const cabecalho = { color: "#E0E0E0" };

function useCupons() {
  return useQuery({
    queryKey: ["cupons"],
    queryFn: async (): Promise<Cupom[]> => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*, coupon_redemptions(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((linha) => {
        const { coupon_redemptions, ...resto } = linha as Record<string, unknown> & {
          coupon_redemptions?: { count: number }[];
        };
        return { ...(resto as unknown as Cupom), usos: coupon_redemptions?.[0]?.count ?? 0 };
      });
    },
  });
}

function parceriaValendo(r: { status: string; valid_from: string | null; valid_until: string | null }): boolean {
  const agora = Date.now();
  if (r.status !== "approved") return false;
  if (r.valid_from && new Date(r.valid_from).getTime() > agora) return false;
  if (r.valid_until && new Date(r.valid_until).getTime() < agora) return false;
  return true;
}

/** Nome do parceiro que abre a tela dele (dados, comissões, repasses), com volta para Cupons. */
function LinkParceiro({ id, nome }: { id: string; nome: string }) {
  return (
    <Link
      to={`/parceiros/${id}`}
      state={{ voltarPara: "/cupons?aba=parceiros", voltarNome: "Cupons" }}
      className="underline decoration-muted-foreground/50 underline-offset-4 hover:text-primary hover:decoration-primary"
    >
      {nome}
    </Link>
  );
}

/** Parceiros (solicitações aprovadas, inativadas ou vencidas) com código e comissões. */
function useCodigosParceiros() {
  return useQuery({
    queryKey: ["cupons-parceiros"],
    queryFn: async (): Promise<CodigoParceiro[]> => {
      const { data: pedidos, error } = await supabase
        .from("partnership_requests")
        .select("user_id, status, valid_from, valid_until, created_at")
        .in("status", ["approved", "inactive", "expired"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const porUsuario = new Map<string, { status: string; valid_from: string | null; valid_until: string | null }>();
      for (const r of pedidos ?? []) if (!porUsuario.has(r.user_id)) porUsuario.set(r.user_id, r);
      const ids = Array.from(porUsuario.keys());
      if (ids.length === 0) return [];
      const [perfis, comissoes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, referral_code").in("id", ids),
        supabase.from("partner_commissions").select("partner_id, payment_amount, commission_amount").in("partner_id", ids),
      ]);
      if (perfis.error) throw perfis.error;
      if (comissoes.error) throw comissoes.error;
      const soma = new Map<string, { vendas: number; vendido: number; comissao: number }>();
      for (const c of comissoes.data ?? []) {
        const atual = soma.get(c.partner_id) ?? { vendas: 0, vendido: 0, comissao: 0 };
        atual.vendas += 1;
        atual.vendido += Number(c.payment_amount ?? 0);
        atual.comissao += Number(c.commission_amount ?? 0);
        soma.set(c.partner_id, atual);
      }
      return (perfis.data ?? [])
        .map((p) => ({
          id: p.id as string,
          nome: (p.full_name as string | null) ?? "Sem nome",
          codigo: (p.referral_code as string | null) ?? null,
          ativo: parceriaValendo(porUsuario.get(p.id as string)!),
          ...(soma.get(p.id as string) ?? { vendas: 0, vendido: 0, comissao: 0 }),
        }))
        .sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.vendas - a.vendas || a.nome.localeCompare(b.nome));
    },
    staleTime: 60 * 1000,
  });
}

function useOpcoes() {
  return useQuery({
    queryKey: ["cupons-opcoes"],
    queryFn: async (): Promise<{ corridas: CorridaOpcao[]; pacotes: PacoteOpcao[] }> => {
      const [corridas, pacotes] = await Promise.all([
        supabase.from("competitions").select("id, title, starts_at").order("starts_at", { ascending: false }),
        supabase.from("plans").select("id, name, price, is_active").order("price", { ascending: true }),
      ]);
      if (corridas.error) throw corridas.error;
      if (pacotes.error) throw pacotes.error;
      return {
        corridas: (corridas.data ?? []) as CorridaOpcao[],
        pacotes: (pacotes.data ?? []) as PacoteOpcao[],
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function ValePara({ cupom, corridas, pacotes }: { cupom: Cupom; corridas: CorridaOpcao[]; pacotes: PacoteOpcao[] }) {
  const itens: { texto: string; detalhe?: string }[] = [];

  if (valeInscricoes(cupom)) {
    const kits = cupom.lot_kinds;
    const tipo =
      kits === null ? "Inscrição com ou sem kit" : kits.includes("com_kit") ? "Inscrição com kit" : "Inscrição sem kit";
    if (cupom.competition_ids === null) {
      itens.push({ texto: `${tipo}, todas as corridas` });
    } else {
      const nomes = cupom.competition_ids.map((id) => corridas.find((c) => c.id === id)?.title ?? "corrida removida");
      itens.push({
        texto: `${tipo}, ${nomes.length === 1 ? nomes[0] : `${nomes.length} corridas`}`,
        detalhe: nomes.length > 1 ? nomes.join(", ") : undefined,
      });
    }
  }

  if (valePacotes(cupom)) {
    if (cupom.plan_ids === null) {
      itens.push({ texto: "Todos os pacotes" });
    } else {
      const nomes = cupom.plan_ids.map((id) => pacotes.find((p) => p.id === id)?.name ?? "pacote removido");
      itens.push({ texto: nomes.join(", ") });
    }
  }

  return (
    <div className="space-y-0.5">
      {itens.map((item) =>
        item.detalhe ? (
          <Tooltip key={item.texto}>
            <TooltipTrigger asChild>
              <p className="underline decoration-dotted underline-offset-4 cursor-help">{item.texto}</p>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{item.detalhe}</TooltipContent>
          </Tooltip>
        ) : (
          <p key={item.texto}>{item.texto}</p>
        ),
      )}
    </div>
  );
}

function CodigosParceiros({ lista, carregando, erro }: { lista: CodigoParceiro[]; carregando: boolean; erro: unknown }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        O código de cada parceiro dá 10% de desconto para quem compra e 10% de comissão para o parceiro. O código é
        o mesmo do cadastro do parceiro (tela Parceiros).
      </p>
      <div className="rounded-lg overflow-hidden border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header">
              <TableHead className="font-medium" style={cabecalho}>Parceiro</TableHead>
              <TableHead className="font-medium" style={cabecalho}>Código</TableHead>
              <TableHead className="font-medium" style={cabecalho}>Desconto</TableHead>
              <TableHead className="font-medium text-center" style={cabecalho}>Compras</TableHead>
              <TableHead className="font-medium" style={cabecalho}>Vendido</TableHead>
              <TableHead className="font-medium" style={cabecalho}>Comissão</TableHead>
              <TableHead className="font-medium" style={cabecalho}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando && (
              <TableRow className="bg-table-row">
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Carregando parceiros...
                </TableCell>
              </TableRow>
            )}
            {!!erro && (
              <TableRow className="bg-table-row">
                <TableCell colSpan={7} className="text-center text-destructive py-10">
                  Não foi possível carregar os parceiros. {erro instanceof Error ? erro.message : ""}
                </TableCell>
              </TableRow>
            )}
            {!carregando && !erro && lista.length === 0 && (
              <TableRow className="bg-table-row">
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Nenhum parceiro aprovado.
                </TableCell>
              </TableRow>
            )}
            {lista.map((p) => (
              <TableRow key={p.id} className="bg-table-row hover:bg-table-row-hover">
                <TableCell className="text-foreground">
                  <LinkParceiro id={p.id} nome={p.nome} />
                </TableCell>
                <TableCell className="text-foreground font-semibold tracking-wide">{p.codigo ?? "Sem código"}</TableCell>
                <TableCell className="text-foreground whitespace-nowrap">10%</TableCell>
                <TableCell className="text-foreground text-center text-base font-semibold">{p.vendas}</TableCell>
                <TableCell className="text-foreground whitespace-nowrap">{formataReais(p.vendido)}</TableCell>
                <TableCell className="text-foreground whitespace-nowrap">{formataReais(p.comissao)}</TableCell>
                <TableCell>
                  <Badge className={p.ativo ? STATUS.ativo.classe : STATUS.inativo.classe}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const Cupons = () => {
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("financeiro.edit");
  const queryClient = useQueryClient();
  const { data: cupons, isLoading, error } = useCupons();
  const { data: opcoes } = useOpcoes();
  const corridas = opcoes?.corridas ?? [];
  const pacotes = opcoes?.pacotes ?? [];
  const { data: codigosParceiros, isLoading: carregandoParceiros, error: erroParceiros } = useCodigosParceiros();
  const parceiros: ParceiroOpcao[] = (codigosParceiros ?? []).map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo }));
  const nomeDoDono = (id: string | null) => {
    if (!id) return null;
    const p = codigosParceiros?.find((x) => x.id === id);
    return p ? `${p.nome}${p.codigo ? ` (${p.codigo})` : ""}` : "Parceiro";
  };
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get("aba") === "parceiros" ? "parceiros" : "cupons";
  const setAba = (nova: Aba) => setParams(nova === "parceiros" ? { aba: "parceiros" } : {}, { replace: true });

  const [filtro, setFiltro] = useState<Filtro>("valendo");
  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Cupom | null>(null);
  const [alternando, setAlternando] = useState<string | null>(null);

  const lista = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return (cupons ?? []).filter((c) => {
      const status = statusDoCupom(c);
      if (filtro === "valendo" && status !== "ativo") return false;
      if (filtro === "fora" && status === "ativo") return false;
      if (termo && !c.code.includes(termo) && !(c.description ?? "").toUpperCase().includes(termo)) return false;
      return true;
    });
  }, [cupons, filtro, busca]);

  const recarrega = () => queryClient.invalidateQueries({ queryKey: ["cupons"] });

  const abrirNovo = () => {
    setEditando(null);
    setDialogAberto(true);
  };

  const abrirEdicao = (cupom: Cupom) => {
    setEditando(cupom);
    setDialogAberto(true);
  };

  const alternaAtivo = async (cupom: Cupom, ativo: boolean) => {
    setAlternando(cupom.id);
    const { error: dbError } = await supabase.from("coupons").update({ active: ativo }).eq("id", cupom.id);
    setAlternando(null);
    if (dbError) {
      toast.error("Não foi possível alterar o cupom", { description: dbError.message });
      return;
    }
    toast.success(ativo ? `${cupom.code} reativado` : `${cupom.code} inativado`, {
      description: ativo ? "O checkout volta a aceitar o código." : "O checkout passa a recusar o código.",
    });
    recarrega();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8 pt-24 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Cupons e códigos</h1>
            <p className="text-sm text-muted-foreground">
              Tudo que a pessoa digita no campo "Cupom de desconto" do checkout: cupons da RunLab e códigos de
              parceiros. Um código por compra; a comissão vai para o dono do código usado.
            </p>
          </div>
          {podeEditar && aba === "cupons" && (
            <Button
              onClick={abrirNovo}
              className="border-0 hover:brightness-90 transition-all gap-2"
              style={{ backgroundColor: "#CCF725", color: "#1A1A1A" }}
            >
              <Plus className="h-4 w-4" />
              Novo cupom
            </Button>
          )}
        </div>

        <div className="flex gap-6 border-b border-border">
          {(
            [
              { valor: "cupons", texto: "Cupons" },
              { valor: "parceiros", texto: "Códigos de parceiros" },
            ] as { valor: Aba; texto: string }[]
          ).map((item) => (
            <button
              key={item.valor}
              onClick={() => setAba(item.valor)}
              className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
                aba === item.valor
                  ? "border-[#CCF725] font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.texto}
            </button>
          ))}
        </div>

        {aba === "parceiros" ? (
          <CodigosParceiros lista={codigosParceiros ?? []} carregando={carregandoParceiros} erro={erroParceiros} />
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md bg-[#262626] p-1">
            {FILTROS.map((item) => (
              <button
                key={item.valor}
                onClick={() => setFiltro(item.valor)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  filtro === item.valor ? "bg-[#CCF725] text-[#1A1A1A] font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.texto}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar código ou descrição"
              className="pl-9 w-72 bg-[#262626] border-0 text-foreground"
            />
          </div>
        </div>

        <div className="rounded-lg overflow-hidden border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="font-medium" style={cabecalho}>Código</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Desconto</TableHead>
                <TableHead className="font-medium min-w-[220px]" style={cabecalho}>Vale para</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Comissão para</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Uso por CPF</TableHead>
                <TableHead className="font-medium text-center" style={cabecalho}>Vezes usado</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Limite total</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Validade</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Status</TableHead>
                {podeEditar && <TableHead className="font-medium text-right" style={cabecalho}>Editar / ativo</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow className="bg-table-row">
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Carregando cupons...
                  </TableCell>
                </TableRow>
              )}
              {error && (
                <TableRow className="bg-table-row">
                  <TableCell colSpan={10} className="text-center text-destructive py-10">
                    Não foi possível carregar os cupons. {error instanceof Error ? error.message : ""}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && lista.length === 0 && (
                <TableRow className="bg-table-row">
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                    Nenhum cupom neste filtro.
                  </TableCell>
                </TableRow>
              )}
              {lista.map((cupom) => {
                const status = statusDoCupom(cupom);
                return (
                  <TableRow key={cupom.id} className="bg-table-row hover:bg-table-row-hover align-top">
                    <TableCell className="text-foreground">
                      <p className="font-semibold tracking-wide">{cupom.code}</p>
                      {cupom.description && (
                        <p className="text-xs text-muted-foreground max-w-[200px]">{cupom.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground whitespace-nowrap">
                      {formataDesconto(cupom)}
                      {cupom.min_amount != null && Number(cupom.min_amount) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          compra mínima {formataReais(Number(cupom.min_amount))}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground text-sm">
                      <ValePara cupom={cupom} corridas={corridas} pacotes={pacotes} />
                    </TableCell>
                    <TableCell className="text-foreground text-sm">
                      {cupom.owner_partner_id && nomeDoDono(cupom.owner_partner_id) ? (
                        <LinkParceiro id={cupom.owner_partner_id} nome={nomeDoDono(cupom.owner_partner_id)!} />
                      ) : (
                        <span className="text-muted-foreground">Ninguém</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground whitespace-nowrap">{formataUsoPorCpf(cupom)}</TableCell>
                    <TableCell className="text-foreground whitespace-nowrap text-center text-base font-semibold">
                      {cupom.usos}
                    </TableCell>
                    <TableCell className="text-foreground whitespace-nowrap">
                      {cupom.max_uses != null ? (
                        <>
                          {cupom.max_uses}
                          <span className="block text-xs text-muted-foreground">
                            {cupom.usos >= cupom.max_uses
                              ? "esgotado"
                              : `restam ${cupom.max_uses - cupom.usos}`}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Sem limite</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground whitespace-nowrap">{formataValidade(cupom)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS[status].classe}>{STATUS[status].texto}</Badge>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right whitespace-nowrap">
                        <button
                          onClick={() => abrirEdicao(cupom)}
                          className="text-muted-foreground hover:text-primary mr-4 align-middle"
                          aria-label={`Editar ${cupom.code}`}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <Switch
                          checked={cupom.active}
                          disabled={alternando === cupom.id}
                          onCheckedChange={(v) => alternaAtivo(cupom, v)}
                          aria-label={cupom.active ? `Inativar ${cupom.code}` : `Reativar ${cupom.code}`}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
        )}
      </main>

      <CupomDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        cupom={editando}
        corridas={corridas}
        pacotes={pacotes}
        parceiros={parceiros}
        onSaved={() => {
          toast.success(editando ? "Cupom atualizado" : "Cupom criado");
          recarrega();
        }}
      />
    </div>
  );
};

export default Cupons;
