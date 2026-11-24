import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeRefetch } from "./useSupabaseRealtime";
import { padraoSemAcento } from "@/lib/buscaSemAcento";

export type CorredorFilters = {
  search?: string;
  /** "Corredor" | "Parceiro" - empty = ambos */
  tipoUser?: "Corredor" | "Parceiro";
  /** Parceiro: só quem é parceiro; Corredor: só quem não é; undefined = ambos */
  eParceiro?: boolean;
  naoEParceiro?: boolean;
  /** preferred_distance no perfil */
  preferredDistance?: string;
  /** Mínimo de inscrições em competições (0 = nenhuma, 1+ = mínimo) */
  participacaoMin?: number;
  /** Plano: Gratuito (0 créditos) ou Com créditos (1+) */
  plano?: "Gratuito" | "ComCreditos";
  /** Cidade (ilike) - exige coluna city na view */
  cidade?: string;
  /** Estado (ilike) - exige coluna state na view */
  estado?: string;
};

export type CorredorRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  preferencia: string;
  vinculo: string;
  ultimoAcesso: string;
  plano: string;
  /** Marcou no checkout a caixinha de lembretes, novidades e ofertas pelo WhatsApp (e não cancelou). */
  aceiteWhatsapp: boolean;
};

const PAGE_SIZE_DEFAULT = 10;
/** Limite de linhas por requisição do PostgREST (max_rows do Supabase) */
const SUPABASE_MAX_ROWS = 1000;

function formatLastAccess(updatedAt: string | null): string {
  if (!updatedAt) return "—";
  const d = new Date(updatedAt);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + " • " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function preferredDistanceToLabel(preferred: string | null): string {
  if (!preferred) return "—";
  if (preferred === "indoor") return "Corrida indoor";
  if (preferred === "outdoor") return "Corrida outdoor";
  return preferred;
}

type AceitesWhatsapp = { ids: Set<string>; emails: Set<string>; telefones: Set<string> };

function telefoneSoDigitos(t: string | null | undefined): string {
  let d = (t ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

/**
 * Quem aceitou ofertas pelo WhatsApp (caixinha do checkout, 24/11/2026). Vem da
 * view whatsapp_marketing_status (situação mais recente de cada telefone). A
 * compra sem login ainda não tem conta, então o corredor é achado pela conta,
 * pelo e-mail ou pelo telefone. Se a leitura falhar, a lista abre sem o ✓.
 */
async function buscaAceitesWhatsapp(): Promise<AceitesWhatsapp> {
  const aceites: AceitesWhatsapp = { ids: new Set(), emails: new Set(), telefones: new Set() };
  for (let de = 0; ; de += SUPABASE_MAX_ROWS) {
    const { data, error } = await supabase
      .from("whatsapp_marketing_status")
      .select("user_id, email, phone")
      .eq("purpose", "marketing")
      .eq("granted", true)
      .range(de, de + SUPABASE_MAX_ROWS - 1);
    if (error) {
      console.warn("[corredores] aceites do WhatsApp indisponíveis", error.message);
      return aceites;
    }
    for (const r of data ?? []) {
      if (r.user_id) aceites.ids.add(r.user_id as string);
      if (r.email) aceites.emails.add((r.email as string).trim().toLowerCase());
      if (r.phone) aceites.telefones.add(telefoneSoDigitos(r.phone as string));
    }
    if (!data || data.length < SUPABASE_MAX_ROWS) return aceites;
  }
}

function aceitouWhatsapp(a: AceitesWhatsapp, id: string, email: string | null, phone: string | null): boolean {
  if (a.ids.has(id)) return true;
  if (email && a.emails.has(email.trim().toLowerCase())) return true;
  const tel = telefoneSoDigitos(phone);
  return tel.length >= 10 && a.telefones.has(tel);
}

/** Busca corredores (view v_corredores_admin) com filtros e paginação */
async function fetchCorredores(
  filters: CorredorFilters,
  page: number,
  pageSize: number,
  aceitesPrevios?: AceitesWhatsapp,
): Promise<{ data: CorredorRow[]; total: number }> {
  const needCityState = Boolean(filters.cidade?.trim() || filters.estado?.trim());
  const selectFields = needCityState
    ? "id, full_name, email, phone, preferred_distance, tipo_user, updated_at, credit_balance, city, state"
    : "id, full_name, email, phone, preferred_distance, tipo_user, updated_at, credit_balance";

  // Filtro de participação: 0 = só quem tem zero inscrições; >0 = mínimo de inscrições
  let userIdsParticipacao: string[] | null = null;
  let userIdsExcluirParaZero: string[] | null = null;
  if (filters.participacaoMin != null) {
    const regs: { user_id: string }[] = [];
    for (let from = 0; ; from += SUPABASE_MAX_ROWS) {
      const { data: batch, error: regsError } = await supabase
        .from("competition_registrations")
        .select("user_id")
        .neq("status", "cancelled")
        .order("id", { ascending: true })
        .range(from, from + SUPABASE_MAX_ROWS - 1);
      if (regsError) throw regsError;
      regs.push(...(batch ?? []));
      if (!batch || batch.length < SUPABASE_MAX_ROWS) break;
    }
    const countByUser: Record<string, number> = {};
    regs.forEach((r) => {
      countByUser[r.user_id] = (countByUser[r.user_id] ?? 0) + 1;
    });
    if (filters.participacaoMin === 0) {
      userIdsExcluirParaZero = Object.keys(countByUser);
    } else {
      userIdsParticipacao = Object.entries(countByUser)
        .filter(([, c]) => c >= filters.participacaoMin!)
        .map(([id]) => id);
      if (userIdsParticipacao.length === 0) {
        return { data: [], total: 0 };
      }
    }
  }

  let query = supabase
    .from("v_corredores_admin")
    .select(selectFields, { count: "exact" })
    .order("full_name", { ascending: true })
    .order("id", { ascending: true });

  const search = filters.search?.trim();
  if (search) {
    // Nome sem depender de acento ("junior" acha "Júnior"); e-mail como antes.
    // Vírgula e parênteses quebram a sintaxe do .or() do PostgREST.
    const nome = padraoSemAcento(search);
    const email = search.replace(/[,()]/g, " ").trim();
    const partes = [nome ? `full_name.imatch.${nome}` : null, email ? `email.ilike.%${email}%` : null].filter(Boolean);
    if (partes.length > 0) query = query.or(partes.join(","));
  }
  if (filters.tipoUser) {
    query = query.eq("tipo_user", filters.tipoUser);
  }
  if (filters.eParceiro === true && filters.naoEParceiro !== true) {
    query = query.eq("tipo_user", "Parceiro");
  }
  if (filters.naoEParceiro === true && filters.eParceiro !== true) {
    query = query.eq("tipo_user", "Corredor");
  }
  if (filters.preferredDistance) {
    query = query.ilike("preferred_distance", `%${filters.preferredDistance}%`);
  }
  if (filters.plano === "Gratuito") {
    query = query.eq("credit_balance", 0);
  } else if (filters.plano === "ComCreditos") {
    query = query.gte("credit_balance", 1);
  }
  if (filters.cidade?.trim()) {
    query = query.ilike("city", `%${filters.cidade.trim()}%`);
  }
  if (filters.estado?.trim()) {
    query = query.ilike("state", `%${filters.estado.trim()}%`);
  }
  if (userIdsParticipacao) {
    query = query.in("id", userIdsParticipacao);
  }
  if (userIdsExcluirParaZero && userIdsExcluirParaZero.length > 0) {
    query = query.not("id", "in", `(${userIdsExcluirParaZero.join(",")})`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) throw error;

  const aceites = aceitesPrevios ?? (await buscaAceitesWhatsapp());
  const total = count ?? 0;
  const data: CorredorRow[] = (rows ?? []).map((r: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    preferred_distance: string | null;
    tipo_user: string | null;
    updated_at: string | null;
    credit_balance: number | null;
  }) => {
    const balance = Number(r.credit_balance) || 0;
    const plano = balance === 0 ? "Gratuito" : String(balance);
    return {
      id: r.id,
      nome: r.full_name ?? "—",
      email: r.email ?? "—",
      telefone: r.phone?.trim() || "—",
      preferencia: preferredDistanceToLabel(r.preferred_distance),
      vinculo: r.tipo_user === "Parceiro" ? "Corredor/parceiro" : "Corredor",
      ultimoAcesso: formatLastAccess(r.updated_at),
      plano,
      aceiteWhatsapp: aceitouWhatsapp(aceites, r.id, r.email, r.phone),
    };
  });

  return { data, total };
}

export function useCorredores(
  filters: CorredorFilters,
  page: number,
  pageSize: number = PAGE_SIZE_DEFAULT
) {
  const [data, setData] = useState<CorredorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCorredores(filters, page, pageSize);
      setData(result.data);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Erro ao carregar corredores"));
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    filters.search,
    filters.tipoUser,
    filters.eParceiro,
    filters.naoEParceiro,
    filters.preferredDistance,
    filters.participacaoMin,
    filters.plano,
    filters.cidade,
    filters.estado,
    page,
    pageSize,
  ]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useRealtimeRefetch(["profiles", "competition_registrations"], fetch);

  return { data, total, loading, error, refetch: fetch };
}

/** Busca todos os corredores com filtros (para exportação CSV) */
export async function fetchCorredoresForExport(filters: CorredorFilters): Promise<CorredorRow[]> {
  const rows: CorredorRow[] = [];
  const aceites = await buscaAceitesWhatsapp();
  for (let page = 1; ; page++) {
    const result = await fetchCorredores(filters, page, SUPABASE_MAX_ROWS, aceites);
    rows.push(...result.data);
    if (result.data.length < SUPABASE_MAX_ROWS || rows.length >= result.total) break;
  }
  return rows;
}
