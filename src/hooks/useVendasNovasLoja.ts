import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Bolinha da "Loja do checkout" no menu (24/11/2026): quantas vendas pagas a enviar chegaram
 * depois da última vez que esta pessoa abriu a Loja do checkout. O "visto em" fica no banco
 * (admin_area_views, por pessoa), então vale em qualquer computador. Confere ao abrir o admin,
 * a cada 60 segundos e quando a janela volta ao foco.
 */
export const CHAVE_VENDAS_NOVAS = ["loja-vendas-novas"] as const;

export function useVendasNovasLoja(ativo: boolean) {
  return useQuery({
    queryKey: CHAVE_VENDAS_NOVAS,
    enabled: ativo,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("admin_store_new_sales_to_ship");
      if (error) return 0;
      return Number(data ?? 0);
    },
  });
}

/** Grava que a pessoa abriu a Loja do checkout agora e apaga a bolinha. */
export function useMarcaLojaVista() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const { error } = await supabase.rpc("admin_mark_area_seen", { p_area: "loja-checkout" });
    if (!error) queryClient.setQueryData(CHAVE_VENDAS_NOVAS, 0);
    await queryClient.invalidateQueries({ queryKey: CHAVE_VENDAS_NOVAS });
  }, [queryClient]);
}
