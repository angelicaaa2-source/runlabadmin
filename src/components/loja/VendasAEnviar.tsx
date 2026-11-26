import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, Printer, RefreshCw, Truck } from "lucide-react";
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
 * postagem perto da saída escolhida (padrão RunLab Içara, da Bia).
 * Fluxo da etiqueta: marcar as vendas, "Enviar para o Melhor Envio" (vão para o carrinho de lá,
 * sem custo), "Pagar no Melhor Envio" (Pix, cartão ou saldo, na tela deles) e, ao voltar, a
 * etiqueta aparece sozinha com "Imprimir etiqueta" e o rastreio. No teste a ida ao carrinho só
 * simula. A função loja-envios fala com o Melhor Envio (o token nunca vem para o navegador).
 */

interface Envio {
  status:
    | "cotado"
    | "sem_opcao"
    | "simulado"
    | "no_carrinho"
    | "paga"
    | "etiqueta"
    | "postada"
    | "entregue"
    | "cancelada"
    | "erro";
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
  carrinhoLigado: boolean;
  linkPagamento: string;
  origens: { key: string; label: string; cidade: string; cep: string }[];
  origemPadrao: string;
  kitFreteGratis: boolean;
  kitFreteGratisAte: string | null;
}

interface ResultadoEnvio {
  simulacao: boolean;
  enviados?: number;
  mensagem?: string;
  total: number;
  linkPagamento: string;
  itens: { sessionId: string; transportadora: string; preco: number; ondePostar: string }[];
}

const BOTAO_LIMAO = { backgroundColor: "#CCF725", color: "#1A1A1A" };
/** Já no Melhor Envio: não cota de novo nem dá para marcar. */
const NO_MELHOR_ENVIO = new Set(["no_carrinho", "paga", "etiqueta", "postada", "entregue"]);
const ACOMPANHAR = new Set(["no_carrinho", "paga", "etiqueta", "postada"]);
const MARCAVEL = new Set(["cotado", "simulado", "cancelada"]);

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
  const [atualizando, setAtualizando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [tirando, setTirando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
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
    staleTime: 5 * 60 * 1000,
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
    const semFrete = data
      .filter((v) => !v.envio || (!NO_MELHOR_ENVIO.has(v.envio.status) && v.envio.origin_key !== origem))
      .map((v) => v.checkout_session_id);
    const chave = `${origem}:${semFrete.join(",")}`;
    if (semFrete.length && cotadoPara.current !== chave) {
      cotadoPara.current = chave;
      void cota(semFrete);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, origem]);

  const acompanhando = (data ?? []).some((v) => v.envio && ACOMPANHAR.has(v.envio.status));

  // Ao abrir a página, ao voltar para a janela e no botão Atualizar: confere no Melhor Envio
  // o que foi pago e busca a etiqueta.
  const atualiza = async (silencioso = false) => {
    setAtualizando(true);
    try {
      const r = await chamaEnvios<{ consultados: number; mudaram: number }>({ action: "atualizar" });
      await recarrega();
      if (!silencioso) {
        toast.success(r.mudaram ? `${r.mudaram} venda(s) atualizada(s).` : "Nada mudou no Melhor Envio ainda.");
      }
    } catch (e) {
      if (!silencioso) {
        toast.error("Não foi possível atualizar", { description: e instanceof Error ? e.message : undefined });
      }
    } finally {
      setAtualizando(false);
    }
  };

  const atualizouNaAbertura = useRef(false);
  useEffect(() => {
    if (!data || atualizouNaAbertura.current || !acompanhando) return;
    atualizouNaAbertura.current = true;
    void atualiza(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, acompanhando]);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && acompanhando) void atualiza(true);
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acompanhando]);

  const pendentes = useMemo(
    () => (data ?? []).filter((v) => !v.envio || !NO_MELHOR_ENVIO.has(v.envio.status)),
    [data],
  );
  const selecionadas = (data ?? []).filter((v) => marcadas.has(v.checkout_session_id));
  const total = selecionadas.reduce((t, v) => t + Number(v.envio?.price ?? 0), 0);
  const podeEnviar =
    selecionadas.length > 0 &&
    selecionadas.every((v) => v.envio && MARCAVEL.has(v.envio.status) && v.envio.origin_key === origem && v.envio.price);
  const noCarrinho = (data ?? []).filter((v) => v.envio?.status === "no_carrinho");
  const totalNoCarrinho = noCarrinho.reduce((t, v) => t + Number(v.envio?.price ?? 0), 0);
  const linkPagamento = config?.linkPagamento ?? "https://melhorenvio.com.br/carrinho";

  const alterna = (id: string) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const envia = async () => {
    setEnviando(true);
    try {
      const r = await chamaEnvios<ResultadoEnvio>({
        action: "enviar_carrinho",
        origin: origem,
        sessionIds: selecionadas.map((v) => v.checkout_session_id),
      });
      setResultado(r);
      toast.success(
        r.simulacao
          ? "Simulação feita: nada foi para o carrinho do Melhor Envio."
          : `${r.enviados} venda(s) no carrinho do Melhor Envio. Agora é pagar lá.`,
      );
      setMarcadas(new Set());
      await recarrega();
    } catch (e) {
      toast.error("Não foi possível enviar para o Melhor Envio", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  };

  const tira = async (id: string) => {
    setTirando(id);
    try {
      await chamaEnvios({ action: "tirar_carrinho", sessionIds: [id] });
      toast.success("Tirada do carrinho do Melhor Envio.");
      await recarrega();
    } catch (e) {
      toast.error("Não foi possível tirar do carrinho", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setTirando(null);
    }
  };

  const origemAtual = config?.origens.find((o) => o.key === origem);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Vendas a enviar</h2>
        <p className="text-sm text-muted-foreground">
          Uma linha por compra paga, com o frete mais barato (Correios, Jadlog, Loggi, JeT ou Total Express) e onde postar.
          Marque as vendas e clique em Enviar para o Melhor Envio; depois pague lá (Pix, cartão ou saldo). Ao voltar, a
          etiqueta aparece aqui para imprimir. A saída vai para o estoque do Dash sozinha, com o motivo Compra.
          {config?.kitFreteGratis && " Kit com frete grátis: a RunLab paga a etiqueta."}
        </p>
      </div>

      {config && !config.carrinhoLigado && (
        <p className="rounded-lg border border-[#CCF725]/40 bg-[#CCF725]/10 px-3 py-2 text-xs text-foreground">
          Envio ao carrinho desligado: frete e pontos de postagem são reais, mas Enviar para o Melhor Envio só simula
          até a liberação (nada vai para o carrinho de lá).
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
          onClick={() => setConfirmar(true)}
          disabled={!podeEnviar || enviando || cotando}
          className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-all hover:brightness-90 disabled:opacity-40"
          style={BOTAO_LIMAO}
        >
          <Truck className="h-4 w-4" />
          Enviar para o Melhor Envio{selecionadas.length ? ` (${selecionadas.length}) · ${reais(total)}` : ""}
        </button>
        {noCarrinho.length > 0 && (
          <a
            href={linkPagamento}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#CCF725] px-4 text-sm font-medium text-[#CCF725] hover:bg-[#CCF725]/10"
          >
            <ExternalLink className="h-4 w-4" />
            Pagar no Melhor Envio ({noCarrinho.length} · {reais(totalNoCarrinho)})
          </a>
        )}
        <button
          type="button"
          onClick={() => void (acompanhando ? atualiza() : cota(pendentes.map((v) => v.checkout_session_id)))}
          disabled={atualizando || cotando}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[#262626] px-4 text-sm text-foreground hover:bg-[#333] disabled:opacity-50"
        >
          {atualizando || cotando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
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
          <table className="w-full text-sm max-lg:[&_td]:whitespace-nowrap max-lg:[&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium" aria-label="Marcar" />
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Peças</th>
                <th className="px-3 py-2 font-medium">Entregar em</th>
                <th className="px-3 py-2 font-medium">Frete</th>
                <th className="px-3 py-2 font-medium">Onde postar</th>
                <th className="px-3 py-2 font-medium">Etiqueta</th>
                <th className="px-3 py-2 font-medium">No Dash</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => {
                const e = v.envio;
                const marcavel = !!e && MARCAVEL.has(e.status) && e.origin_key === origem && !!e.price;
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
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {v.sold_at ? (
                        <>
                          <span className="block">{new Date(v.sold_at).toLocaleDateString("pt-BR")}</span>
                          <span className="block text-xs">
                            {new Date(v.sold_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
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
                      <SituacaoEtiqueta
                        envio={e}
                        linkPagamento={linkPagamento}
                        tirando={tirando === v.checkout_session_id}
                        onTirar={() => void tira(v.checkout_session_id)}
                      />
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
            {resultado.simulacao ? "Simulação do envio para o Melhor Envio" : "No carrinho do Melhor Envio"}
          </p>
          {resultado.mensagem && <p className="text-muted-foreground">{resultado.mensagem}</p>}
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {resultado.itens.map((i) => (
              <li key={i.sessionId}>
                {i.transportadora}: {reais(i.preco)} · postar em {i.ondePostar}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-foreground">Total enviado ao carrinho: {reais(resultado.total)}</p>
          <a
            href={resultado.linkPagamento}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[#CCF725] underline underline-offset-4"
          >
            <ExternalLink className="h-4 w-4" />
            Pagar no Melhor Envio
          </a>
        </div>
      )}

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enviar {selecionadas.length === 1 ? "1 venda" : `${selecionadas.length} vendas`} para o Melhor Envio?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Total {reais(total)}, saindo de {origemAtual?.label ?? "-"}. As vendas vão para o carrinho do Melhor
                  Envio, sem custo. Depois é só clicar em Pagar no Melhor Envio e pagar lá (Pix, cartão ou saldo).
                </p>
                {config && !config.carrinhoLigado && <p>Envio ao carrinho desligado: este clique só simula. Nada vai para o carrinho.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                void envia();
              }}
              disabled={enviando}
              style={BOTAO_LIMAO}
            >
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {config && !config.carrinhoLigado ? "Simular envio" : "Enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Coluna Etiqueta: em que pé está a venda no Melhor Envio. */
function SituacaoEtiqueta({
  envio,
  linkPagamento,
  tirando,
  onTirar,
}: {
  envio: Envio | null;
  linkPagamento: string;
  tirando: boolean;
  onTirar: () => void;
}) {
  if (!envio) return <>-</>;
  const rastreio = envio.tracking_code && <span className="block text-xs">Rastreio: {envio.tracking_code}</span>;
  const imprimir = envio.label_url && (
    <a
      href={envio.label_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[#CCF725] underline underline-offset-4"
    >
      <Printer className="h-4 w-4" />
      Imprimir etiqueta
    </a>
  );
  switch (envio.status) {
    case "simulado":
      return (
        <span className="text-xs">
          Simulado em {formataData(envio.simulated_at)}: iria para o carrinho.
          <button type="button" onClick={onTirar} disabled={tirando} className="ml-1 underline underline-offset-2">
            Desfazer
          </button>
        </span>
      );
    case "no_carrinho":
      return (
        <span className="text-xs">
          <span className="block text-foreground">No carrinho, aguardando pagamento</span>
          <a href={linkPagamento} target="_blank" rel="noreferrer" className="text-[#CCF725] underline underline-offset-2">
            Pagar no Melhor Envio
          </a>
          <button
            type="button"
            onClick={onTirar}
            disabled={tirando}
            className="ml-2 underline underline-offset-2 disabled:opacity-50"
          >
            {tirando ? "Tirando..." : "Tirar do carrinho"}
          </button>
        </span>
      );
    case "paga":
      return <span className="text-xs text-foreground">Paga, gerando a etiqueta...</span>;
    case "etiqueta":
      return (
        <>
          {imprimir}
          {rastreio}
        </>
      );
    case "postada":
    case "entregue":
      return (
        <>
          <span className="block text-xs text-foreground">{envio.status === "postada" ? "Postada" : "Entregue"}</span>
          {imprimir}
          {rastreio}
        </>
      );
    case "cancelada":
      return <span className="text-xs">Cancelada no Melhor Envio. Dá para mandar de novo.</span>;
    default:
      return envio.error && envio.status === "cotado" ? <span className="text-xs">{envio.error}</span> : <>-</>;
  }
}
