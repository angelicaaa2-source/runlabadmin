import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Dois hooks montados no mesmo milissegundo (ex.: Header e a página chamando usePermissions)
// geravam o mesmo nome de canal com Date.now(); o supabase-js devolvia o canal já inscrito e a
// tela quebrava ("cannot add postgres_changes callbacks after subscribe()"). O contador evita isso.
let contadorCanais = 0;
const nomeUnico = () => `${Date.now()}-${++contadorCanais}`;

/**
 * Escuta mudanças em tempo real de uma ou mais tabelas do Supabase
 * e invalida as query keys do React Query automaticamente.
 */
export function useRealtimeInvalidation(
  tables: string[],
  queryKeys: string[][],
) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (tables.length === 0) return;

    const channelName = `realtime-${tables.join("-")}-${nomeUnico()}`;
    const channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          queryKeys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        },
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [tables.join(","), JSON.stringify(queryKeys)]);
}

type RealtimeRefetchOptions = {
  /** Filtro do postgres_changes, ex.: "competition_id=eq.<uuid>". */
  filter?: string;
  /**
   * Agrupa eventos em rajada: no máximo um refetch a cada N ms. Use em
   * consultas pesadas ligadas a tabelas de escrita frequente.
   */
  throttleMs?: number;
};

/**
 * Escuta mudanças em tempo real de uma ou mais tabelas do Supabase
 * e chama uma callback de refetch. Para hooks que usam useState/useEffect.
 */
export function useRealtimeRefetch(
  tables: string[],
  refetch: () => void,
  options: RealtimeRefetchOptions = {},
) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const { filter, throttleMs } = options;

  useEffect(() => {
    if (tables.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (!throttleMs) {
        refetchRef.current();
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refetchRef.current();
      }, throttleMs);
    };

    const channelName = `realtime-refetch-${tables.join("-")}-${nomeUnico()}`;
    const channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        trigger,
      );
    });

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      channel.unsubscribe();
    };
  }, [tables.join(","), filter, throttleMs]);
}
