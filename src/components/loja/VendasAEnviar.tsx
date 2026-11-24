import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Printer, RefreshCw, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Vendas a enviar (24/11/2026): uma linha por compra paga com camiseta escolhida no kit (e a
 * medalha do kit, quando a corrida define modelo e fita). Cada venda já vem com o frete mais
 * barato do Melhor Envio entre Correios, Jadlog, Loggi, JeT e Total Express, e o ponto de
 * postagem dessa transportadora perto da saída escolhida (padrão RunLab Içara, da Bia).
 * Marque as vendas e clique "Comprar etiquetas": a tela mostra o total e o saldo antes; depois
 * da compra aparecem "Imprimir etiqueta" e o rastreio. No ambiente de teste a compra só simula.
 * A função loja-envios fala com o Melhor Envio (o token nunca vem para o navegador).
 */

interface Envio {
  status: "cotado" | "sem_opcao" | "simulado" | "comprada" | "postada" | "erro";
  origin_key: string;
  paid_by: "runlab" | "cliente";
  package: { height: number; weight: number } | null;
  company_name: string | null;
  service_name: string | null;
  price: number | null;
  delivery_days: number | null;
  agency_name: string | null;
  agency_address: string | null;
  label_url: string | null;
  tracking_code: string | null;
  simulated_at: string | null;
  error: string | null;
}

interface VendaEnvio {
  checkout_session_id: string;
  sold_at: string | null;
  compra: string | null;
  cliente: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  itens: { peca: "camiseta" | "medalha"; modelo: string; tamanho: string; quantidade: number }[];
  kits: number;
  lancada_no_dash: boolean;
  envio: Envio | null;
}

interface ConfigEnvio {
  compraLigada: boolean;
  saldo: number | null;
  origens: { key: string; label: string; cidade: string; cep: string }[];
  origemPadrao: string;
  kitFreteGratis: boolean;
  kitFreteGratisAte: string | null;
}

interface ResultadoCompra {
  simulacao: boolean;
  comprado?: boolean;
  mensagem?: string;
  total: number;
  saldo: number;
  falta: number;
  itens: { sessionId: string; transportadora: string; preco: number; ondePostar: string }[];
  etiqueta?: string | null;
}

const BOTAO_LIMAO = { backgroundColor: "#CCF725", color: "#1A1A1A" };
const COMPRADA = new Set(["comprada", "postada"]);

function formataData(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function reais(v: number | null | undefined) {
  return v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function chamaEnvios<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("loja-envios", { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) msg = j.error;
    } catch {
      /* mantém a mensagem padrão */
    }
    throw new Error(msg);
  }
  return data as T;
}

export function VendasAEnviar() {
  const queryClient = useQueryClient();
  const [origem, setOrigem] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [cotando, setCotando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [comprando, setComprando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCompra | null>(null);
  const cotadoPara = useRef<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["loja-vendas-a-enviar"],
    queryFn: async (): Promise<VendaEnvio[]> => {
      const { data, error } = await supabase.rpc("admin_store_shipments");
      if (error) throw error;
      return (data ?? []) as VendaEnvio[];
    },
  });

  const { data: config } = useQuery({
    queryKey: ["loja-envios-config"],
    queryFn: () => chamaEnvios<ConfigEnvio>({ action: "config" }),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (config && origem == null) setOrigem(config.origemPadrao);
  }, [config, origem]);

  const recarrega = () => queryClient.invalidateQueries({ queryKey: ["loja-vendas-a-enviar"] });

  const cota = async (ids?: string[]) => {
    if (!origem) return;
    setCotando(true);
    try {
      await chamaEnvios({ action: "cotar", origin: origem, ...(ids?.length ? { sessionIds: ids } : {}) });
      await recarrega();
    } catch (e) {
      toast.error("Não foi possível cotar o frete", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setCotando(false);
    }
  };

  // Cota sozinho o que ainda não tem frete para a saída escolhida.
  useEffect(() => {
    if (!data || !origem || cotando) return;
    const faltam = data
      .filter((v) => !v.envio || (!COMPRADA.has(v.envio.status) && v.envio.origin_key !== origem))
      .map((v) => v.checkout_session_id);
    const chave = `${origem}:${faltam.join(",")}`;
    if (faltam.length && cotadoPara.current !== chave) {
      cotadoPara.current = chave;
      void cota(faltam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, origem]);

  const pendentes = useMemo(
    () => (data ?? []).filter((v) => !v.envio || !COMPRADA.has(v.envio.status)),
    [data],
  );
  const selecionadas = (data ?? []).filter((v) => marcadas.has(v.checkout_session_id));
  const total = selecionadas.reduce((t, v) => t + Number(v.envio?.price ?? 0), 0);
  const podeComprar =
    selecionadas.length > 0 &&
    selecionadas.every((v) => v.envio && ["cotado", "simulado"].includes(v.envio.status) && v.envio.origin_key === origem);
  const temComprada = (data ?? []).some((v) => v.envio && COMPRADA.has(v.envio.status));

  const alterna = (id: string) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const compra = async () => {
    setComprando(true);
    try {
      const r = await chamaEnvios<ResultadoCompra>({
        action: "comprar",
        origin: origem,
        sessionIds: selecionadas.map((v) => v.checkout_session_id),
      });
      setResultado(r);
      if (r.simulacao) toast.success("Simulação feita: nada foi comprado no Melhor Envio.");
      else if (r.comprado) toast.success("Etiquetas compradas. Imprima pela coluna Etiqueta.");
      else toast.error(r.mensagem ?? "Não foi possível comprar.");
      setMarcadas(new Set());
      await recarrega();
    } catch (e) {
      toast.error("Não foi possível comprar as etiquetas", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setComprando(false);
      setConfirmar(false);
    }
  };

  const rastreio = async () => {
    try {
      const r = await chamaEnvios<{ atualizados: number }>({ action: "rastreio" });
      toast.success(r.atualizados ? `${r.atualizados} rastreio(s) atualizado(s).` : "Nenhum rastreio novo ainda.");
      await recarrega();
    } catch (e) {
      toast.error("Não foi possível buscar o rastreio", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const origemAtual = config?.origens.find((o) => o.key === origem);
  const saldo = config?.saldo ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Vendas a enviar</h2>
        <p className="text-sm text-muted-foreground">
          Uma linha por compra paga, com o frete mais barato (Correios, Jadlog, Loggi, JeT ou Total Express) e onde postar.
          Marque as vendas e clique em Comprar etiquetas; depois é só imprimir e levar ao ponto. A saída vai para o
          estoque do Dash sozinha, com o motivo Compra.
          {config?.kitFreteGratis && " Kit com frete grátis: a RunLab paga a etiqueta."}
        </p>
      </div>

      {config && !config.compraLigada && (
        <p className="rounded-lg border border-[#CCF725]/40 bg-[#CCF725]/10 px-3 py-2 text-xs text-foreground">
          Ambiente de teste: frete e pontos de postagem são reais, mas Comprar etiquetas só simula (nada é comprado no
          Melhor Envio).
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Sai de</span>
          <select
            value={origem ?? ""}
            onChange={(e) => {
              setOrigem(e.target.value);
              setMarcadas(new Set());
            }}
            className="h-10 rounded-md border border-border bg-[#262626] px-3 text-sm text-foreground"
          >
            {(config?.origens ?? []).map((o) => (
              <option key={o.key} value={o.key}>
                {o.label} ({o.cidade})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void cota(pendentes.map((v) => v.checkout_session_id))}
          disabled={cotando || !pendentes.length}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[#262626] px-4 text-sm text-foreground hover:bg-[#333] disabled:opacity-50"
        >
          {cotando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar fretes
        </button>
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          disabled={!podeComprar || comprando || cotando}
          className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-all hover:brightness-90 disabled:opacity-40"
          style={BOTAO_LIMAO}
        >
          <Truck className="h-4 w-4" />
          Comprar etiquetas{selecionadas.length ? ` (${selecionadas.length}) · ${reais(total)}` : ""}
        </button>
        {temComprada && (
          <button
            type="button"
            onClick={() => void rastreio()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#262626] px-4 text-sm text-foreground hover:bg-[#333]"
          >
            Atualizar rastreio
          </button>
        )}
        {saldo != null && (
          <span className="pb-2 text-xs text-muted-foreground">Saldo no Melhor Envio: {reais(saldo)}</span>
        )}
      </div>

      {isLoading && (
        <p className="text-muted-foreground">
          <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
          Carregando...
        </p>
      )}
      {error && (
        <p className="text-destructive">
          Não foi possível carregar as vendas. {error instanceof Error ? error.message : ""}
        </p>
      )}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium" aria-label="Marcar" />
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Peças</th>
                <th className="px-3 py-2 font-medium">Endereço</th>
                <th className="px-3 py-2 font-medium">Frete</th>
                <th className="px-3 py-2 font-medium">Onde postar</th>
                <th className="px-3 py-2 font-medium">Etiqueta</th>
                <th className="px-3 py-2 font-medium">No Dash</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => {
                const e = v.envio;
                const comprada = !!e && COMPRADA.has(e.status);
                const marcavel = !!e && ["cotado", "simulado"].includes(e.status) && e.origin_key === origem;
                return (
                  <tr key={v.checkout_session_id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Marcar a venda de ${v.cliente ?? ""}`}
                        disabled={!marcavel}
                        checked={marcadas.has(v.checkout_session_id)}
                        onChange={() => alterna(v.checkout_session_id)}
                        className="mt-0.5 h-4 w-4 accent-[#CCF725]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{formataData(v.sold_at)}</td>
                    <td className="px-3 py-2 text-foreground">
                      {v.cliente ?? "-"}
                      <span className="block text-xs text-muted-foreground">{v.email}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {v.itens.map((i, n) => (
                        <span key={n} className="block">
                          {i.quantidade > 1 ? `${i.quantidade}x ` : ""}
                          {i.modelo}
                          <span className="text-xs text-muted-foreground">
                            {i.peca === "medalha" ? ` · fita ${i.tamanho}` : ` · ${i.tamanho}`}
                          </span>
                        </span>
                      ))}
                      {v.kits > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {v.kits === 1 ? "1 kit" : `${v.kits} kits`} (camiseta + medalha)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {v.endereco}
                      <span className="block text-xs">
                        {[v.cidade, v.estado].filter(Boolean).join("/")} {v.cep ? `· CEP ${v.cep}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {!e && <span className="text-muted-foreground">Cotando...</span>}
                      {e && (e.status === "sem_opcao" || e.status === "erro") && (
                        <span className="text-xs text-destructive">{e.error ?? "Sem opção de frete."}</span>
                      )}
                      {e && e.company_name && e.status !== "sem_opcao" && e.status !== "erro" && (
                        <>
                          {e.company_name} {e.service_name}
                          <span className="block text-xs text-muted-foreground">
                            {reais(e.price)}
                            {e.delivery_days ? ` · ${e.delivery_days} dias úteis` : ""}
                            {e.paid_by === "runlab" ? " · RunLab paga" : ""}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e?.agency_name ? (
                        <>
                          <span className="text-foreground">{e.agency_name}</span>
                          <span className="block text-xs">{e.agency_address}</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {comprada && e?.label_url ? (
                        <a
                          href={e.label_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#CCF725] underline underline-offset-4"
                        >
                          <Printer className="h-4 w-4" />
                          Imprimir etiqueta
                        </a>
                      ) : e?.status === "simulado" ? (
                        <span className="text-xs">Simulada em {formataData(e.simulated_at)}</span>
                      ) : (
                        "-"
                      )}
                      {e?.tracking_code && <span className="block text-xs">Rastreio: {e.tracking_code}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {v.lancada_no_dash ? "Lançada" : "Ainda não"}
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhuma venda com camiseta escolhida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {resultado && (
        <div className="rounded-lg border border-border bg-table-row p-4 text-sm">
          <p className="font-medium text-foreground">
            {resultado.simulacao ? "Simulação da compra" : resultado.comprado ? "Etiquetas compradas" : "Compra não feita"}
          </p>
          {resultado.mensagem && <p className="text-muted-foreground">{resultado.mensagem}</p>}
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {resultado.itens.map((i) => (
              <li key={i.sessionId}>
                {i.transportadora}: {reais(i.preco)} · postar em {i.ondePostar}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-foreground">
            Total {reais(resultado.total)} · saldo {reais(resultado.saldo)}
            {resultado.falta > 0 ? ` · faltariam ${reais(resultado.falta)}` : ""}
          </p>
        </div>
      )}

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Comprar {selecionadas.length === 1 ? "1 etiqueta" : `${selecionadas.length} etiquetas`}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Total {reais(total)}, saindo de {origemAtual?.label ?? "-"}. O valor sai do saldo do Melhor Envio
                  {saldo != null ? ` (hoje ${reais(saldo)})` : ""}.
                </p>
                {saldo != null && saldo < total && (
                  <p className="text-destructive">
                    O saldo não cobre: faltam {reais(total - saldo)}. Carregue no Melhor Envio (Pix) antes, ou siga para ver
                    a simulação.
                  </p>
                )}
                {config && !config.compraLigada && (
                  <p>Ambiente de teste: este clique só simula. Nada é comprado.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={comprando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                void compra();
              }}
              disabled={comprando}
              style={BOTAO_LIMAO}
            >
              {comprando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {config && !config.compraLigada ? "Simular compra" : "Comprar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
