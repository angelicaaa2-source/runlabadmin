/**
 * Kit da corrida (peças físicas), 24/11/2026:
 * - Camiseta do kit: nulo = a pessoa escolhe entre os modelos marcados "Faz parte do kit"
 *   na Loja do checkout; um produto = a corrida tem camiseta própria (a pessoa só escolhe o tamanho).
 * - Medalha do kit (peça física): nula = a equipe escolhe (como hoje). Com modelo e fita, a
 *   venda paga com kit também gera a saída da medalha para o estoque do Dash. A pessoa não escolhe.
 * Não confundir com a "Medalha da corrida" do app (badge em Recompensas, lib/medalha.ts).
 */
import { supabase } from "@/lib/supabase";

export type EscolhaKitCorrida = { camisetaId: string | null; medalhaId: string | null; fitaId: string | null };

export const KIT_CORRIDA_VAZIO: EscolhaKitCorrida = { camisetaId: null, medalhaId: null, fitaId: null };

export type ProdutoKit = { id: string; name: string; category: "camisa" | "medalha"; options: { id: string; name: string }[] };

export async function carregarKitCorrida(competitionId: string): Promise<EscolhaKitCorrida> {
  const { data, error } = await supabase
    .from("competitions")
    .select("kit_store_product_id, kit_medal_store_product_id, kit_medal_option_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (error || !data) return KIT_CORRIDA_VAZIO;
  return {
    camisetaId: (data.kit_store_product_id as string | null) ?? null,
    medalhaId: (data.kit_medal_store_product_id as string | null) ?? null,
    fitaId: (data.kit_medal_option_id as string | null) ?? null,
  };
}

export async function salvarKitCorrida(competitionId: string, v: EscolhaKitCorrida): Promise<void> {
  const { error } = await supabase
    .from("competitions")
    .update({
      kit_store_product_id: v.camisetaId,
      kit_medal_store_product_id: v.medalhaId,
      kit_medal_option_id: v.medalhaId ? v.fitaId : null,
    })
    .eq("id", competitionId);
  if (error) throw error;
}

/** Camisas e medalhas da Loja do checkout (cópia do estoque do Dash), com as opções. */
export async function carregarProdutosKit(): Promise<ProdutoKit[]> {
  const { data, error } = await supabase
    .from("store_products")
    .select("id, name, category, dash_active, sort_order, store_product_options(id, name, dash_active, sort_order)")
    .in("category", ["camisa", "medalha"])
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((p) => p.dash_active)
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      category: p.category as "camisa" | "medalha",
      options: ((p.store_product_options as { id: string; name: string; dash_active: boolean; sort_order: number }[]) ?? [])
        .filter((o) => o.dash_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({ id: o.id, name: o.name })),
    }));
}
