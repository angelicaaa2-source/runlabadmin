import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Vendas a enviar (kit com escolha de modelo, 24/11/2026): camisetas (e a medalha do kit,
 * quando a corrida define modelo e fita) das compras pagas, com o que a pessoa escolheu e o
 * endereço. "No Dash" mostra se a saída já foi lançada no estoque do Dash.
 */
interface VendaEnvio {
  reservation_id: string;
  sold_at: string | null;
  checkout_session_id: string;
  compra: string | null;
  cliente: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  peca: "camiseta" | "medalha";
  modelo: string;
  tamanho: string;
  quantidade: number;
  lancada_no_dash_em: string | null;
}

function formataData(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function VendasAEnviar() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["loja-vendas-a-enviar"],
    queryFn: async (): Promise<VendaEnvio[]> => {
      const { data, error } = await supabase.rpc("admin_store_sales_to_ship", { p_incluir_lancadas: true });
      if (error) throw error;
      return (data ?? []) as VendaEnvio[];
    },
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Vendas a enviar</h2>
        <p className="text-sm text-muted-foreground">
          Camisetas escolhidas no kit (e a medalha do kit, quando a corrida define modelo e fita) das compras pagas.
          A saída vai para o estoque do Dash sozinha, com o motivo Compra.
        </p>
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
                <th className="px-4 py-2 font-medium">Pago em</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Peça</th>
                <th className="px-4 py-2 font-medium">Endereço</th>
                <th className="px-4 py-2 font-medium">No Dash</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.reservation_id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">{formataData(v.sold_at)}</td>
                  <td className="px-4 py-2 text-foreground">
                    {v.cliente ?? "-"}
                    <span className="block text-xs text-muted-foreground">{v.email}</span>
                  </td>
                  <td className="px-4 py-2 text-foreground">
                    {v.quantidade > 1 ? `${v.quantidade}x ` : ""}
                    {v.modelo}
                    <span className="block text-xs text-muted-foreground">
                      {v.peca === "medalha" ? `Medalha do kit, fita ${v.tamanho}` : `Tamanho ${v.tamanho}`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {v.endereco}
                    <span className="block text-xs">
                      {[v.cidade, v.estado].filter(Boolean).join("/")} {v.cep ? `· CEP ${v.cep}` : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {v.lancada_no_dash_em ? formataData(v.lancada_no_dash_em) : "Ainda não"}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhuma venda com camiseta escolhida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
