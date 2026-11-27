import { supabase } from "@/lib/supabase";

/**
 * Perfis da casa da RunLab (tabela house_profiles, 28/11/2026): 5 personagens e 3 marcadores de ritmo que aparecem
 * no ranking do app nas corridas com "Preencher ranking" = sim. Não são contas: não estão em inscrições, corridas
 * nem perfis. Por isso nunca entram nas exportações do admin, que a equipe usa para sorteio e premiação.
 */
export const PERFIL_DA_CASA_ROTULO = "Perfil da casa";

/** user_id dos perfis da casa. Vazio antes da SQL do pacote (a tabela ainda não existe). */
export async function fetchHouseProfileIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("house_profiles").select("user_id");
  if (error) {
    // 42P01 (Postgres) / PGRST205 (API): a tabela não existe; então a view também não tem perfis da casa.
    if (error.code === "42P01" || error.code === "PGRST205") return new Set();
    throw new Error(`Erro ao buscar os perfis da casa: ${error.message}`);
  }
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

/**
 * Tira os perfis da casa e refaz a posição só entre corredores reais, em cada distância. Empate continua empate
 * (mesma regra do app: posição = 1 + quantos da mesma distância têm rank menor).
 */
export function onlyRealRunners<T extends { user_id: string; distance_meters: number; rank: number }>(
  rows: T[],
  house: Set<string>,
): (T & { realRank: number })[] {
  const reais = rows.filter((r) => !house.has(r.user_id));
  if (reais.length === rows.length) return reais.map((r) => ({ ...r, realRank: r.rank }));
  return reais.map((r) => ({
    ...r,
    realRank: 1 + reais.filter((o) => o.distance_meters === r.distance_meters && o.rank < r.rank).length,
  }));
}
