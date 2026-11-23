import { useMemo, useState } from "react";
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
  type StatusCupom,
} from "@/lib/cupons";

type Filtro = "valendo" | "todos" | "fora";

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

const Cupons = () => {
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("financeiro.edit");
  const queryClient = useQueryClient();
  const { data: cupons, isLoading, error } = useCupons();
  const { data: opcoes } = useOpcoes();
  const corridas = opcoes?.corridas ?? [];
  const pacotes = opcoes?.pacotes ?? [];

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
            <h1 className="text-2xl font-semibold text-foreground">Cupons de desconto</h1>
            <p className="text-sm text-muted-foreground">
              Cupons aceitos no checkout de inscrições e pacotes. Inativar não apaga o histórico de usos.
            </p>
          </div>
          {podeEditar && (
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
                <TableHead className="font-medium" style={cabecalho}>Uso por CPF</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Usos</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Validade</TableHead>
                <TableHead className="font-medium" style={cabecalho}>Status</TableHead>
                {podeEditar && <TableHead className="font-medium text-right" style={cabecalho}>Editar / ativo</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow className="bg-table-row">
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Carregando cupons...
                  </TableCell>
                </TableRow>
              )}
              {error && (
                <TableRow className="bg-table-row">
                  <TableCell colSpan={8} className="text-center text-destructive py-10">
                    Não foi possível carregar os cupons. {error instanceof Error ? error.message : ""}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && lista.length === 0 && (
                <TableRow className="bg-table-row">
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
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
                    <TableCell className="text-foreground whitespace-nowrap">{formataUsoPorCpf(cupom)}</TableCell>
                    <TableCell className="text-foreground whitespace-nowrap">
                      {cupom.usos}
                      <span className="text-muted-foreground">
                        {cupom.max_uses != null ? ` de ${cupom.max_uses}` : " · sem limite"}
                      </span>
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
      </main>

      <CupomDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        cupom={editando}
        corridas={corridas}
        pacotes={pacotes}
        onSaved={() => {
          toast.success(editando ? "Cupom atualizado" : "Cupom criado");
          recarrega();
        }}
      />
    </div>
  );
};

export default Cupons;
