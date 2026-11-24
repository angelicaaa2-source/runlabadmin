import { supabase } from "@/lib/supabase";

/** Filtro de gênero do ranking ("" = todos). Valores iguais aos do cadastro do app (profiles.gender). */
export type Genero = "" | "Feminino" | "Masculino";

export const GENEROS: { value: Genero; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "Feminino", label: "Feminino" },
  { value: "Masculino", label: "Masculino" },
];

/** Gênero de cada corredor (id -> "Feminino" | "Masculino" | null), lido do cadastro. */
export async function fetchGenders(userIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const ids = [...new Set(userIds)];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from("v_corredores_admin").select("id, gender").in("id", chunk);
    if (error) throw new Error(`Erro ao buscar o gênero dos corredores: ${error.message}`);
    ((data ?? []) as { id: string; gender: string | null }[]).forEach((p) => {
      out[p.id] = p.gender ?? null;
    });
  }
  return out;
}

/**
 * Deixa só o gênero escolhido e refaz a posição dentro de cada distância, mantendo empates
 * (mesma regra do ranking do app: posição = 1 + quantos do mesmo gênero e distância têm rank menor).
 * As linhas precisam vir com distance_meters e rank.
 */
export function rankByGender<T extends { user_id: string; distance_meters: number; rank: number }>(
  rows: T[],
  genders: Record<string, string | null>,
  gender: Exclude<Genero, "">,
): (T & { genderRank: number })[] {
  const filtered = rows
    .filter((r) => genders[r.user_id] === gender)
    .sort((a, b) => a.distance_meters - b.distance_meters || a.rank - b.rank);
  return filtered.map((r) => ({
    ...r,
    genderRank: 1 + filtered.filter((o) => o.distance_meters === r.distance_meters && o.rank < r.rank).length,
  }));
}
