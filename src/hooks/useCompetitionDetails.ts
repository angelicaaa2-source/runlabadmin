import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { semAcento } from "@/lib/buscaSemAcento";
import { useRealtimeRefetch } from "./useSupabaseRealtime";
import { formatLocalDate, formatLocalDateRange, resolveLocalDate } from "@/lib/localDate";
import { fetchGenders, rankByGender, type Genero } from "@/lib/genero";

// ─── Types ───────────────────────────────────────────────

export type CompetitionDistance = {
  id: string;
  label: string;
  meters: number;
  sortOrder: number;
};

export type CompetitionLot = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isSubscriptionAllowed: boolean;
  isActive: boolean;
  sortOrder: number;
  hasKit: boolean;
};

export type CompetitionDocument = {
  id: string;
  title: string;
  fileUrl: string;
  sortOrder: number;
};

export type CompetitionSponsor = {
  id: string;
  name: string;
  logoUrl: string | null;
  sortOrder: number;
};

export type CompetitionDetail = {
  id: string;
  title: string;
  subtitle: string | null;
  locationName: string | null;
  startsOn: string;
  endsOn: string | null;
  registrationStartsOn: string | null;
  registrationEndsOn: string | null;
  mode: string;
  formatType: string;
  formatObservations: string | null;
  status: string;
  /** Rascunho com data marcada para aparecer no app (null = sem data). */
  publishAt: string | null;
  isFree: boolean;
  coverImageUrl: string | null;
  description: string | null;
  prizeDescription: string | null;
  championshipId: string | null;
  unlimitedAttempts: boolean;
  maxRegistrations: number | null;
  distances: CompetitionDistance[];
  lots: CompetitionLot[];
  documents: CompetitionDocument[];
  sponsors: CompetitionSponsor[];
  stats: {
    totalAthletes: number;
    totalRegistrations: number;
    totalRevenueCents: number;
  };
};

export type RegistrationRow = {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  distanceLabel: string | null;
  distanceMeters: number | null;
  attempts: number;
  priceCents: number | null;
  lotName: string | null;
  lotHasKit: boolean;
  shirtSize: string | null;
  status: string;
  createdAt: string;
  /** Só em inscrição cancelada pelo admin (admin_registration_cancellations). */
  cancelamento: { reason: string; createdAt: string; byName: string | null; creditReturned: boolean } | null;
};

export type RankingRow = {
  position: number;
  userId: string;
  userName: string;
  userAvatar: string | null;
  paceSecondsPerKm: number | null;
  distanceMeters: number;
  totalTimeSeconds: number;
  state: string;
  currentDistanceMeters: number | null;
  publicVisibility: "visible" | "hidden";
  hiddenReason: string | null;
  rawTotalTimeSeconds: number | null;
  /** Gênero do cadastro ("Feminino" | "Masculino" | null). */
  gender: string | null;
};

export type RankingSource = "public" | "audit";

/** Filtros da aba Inscrições (competição) */
export type InscricoesFilters = {
  status?: "pending" | "confirmed" | "cancelled" | "all";
  distanceLabel?: string;
  distanceMeters?: number;
  isParceiro?: boolean;
  naoEParceiro?: boolean;
  participacaoMin?: number;
  cidade?: string;
  estado?: string;
  plano?: string;
};

// ─── Helpers ─────────────────────────────────────────────

export const formatPace = (seconds: number | null): string => {
  if (!seconds || seconds <= 0) return "-";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
};

export const formatTime = (seconds: number | null): string => {
  if (seconds == null || seconds <= 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export const formatDistanceKm = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2).replace(".", ",")}km`;
  }
  return `${meters}m`;
};

export const formatPrice = (cents: number | null): string => {
  if (cents === null || cents === undefined) return "-";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
};

export const mapRegistrationStatus = (status: string): string => {
  switch (status) {
    case "pending":
      return "Pendente";
    case "confirmed":
      return "Confirmado";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
};

export const mapCompetitionStatus = (status: string): string => {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "open":
      return "Aberta";
    case "closed":
      return "Fechada";
    case "in_progress":
      return "Em andamento";
    case "finished":
      return "Finalizada";
    default:
      return status;
  }
};

export const mapRunState = (state: string): string => {
  switch (state) {
    case "finished":
      return "Finalizada";
    case "running":
      return "Em andamento";
    case "paused":
      return "Pausada";
    case "aborted":
      return "Abortada";
    default:
      return state;
  }
};

export const mapHiddenReason = (reason: string | null): string => {
  switch (reason) {
    case null:
      return "Visível no app";
    case "aborted":
      return "Corrida abortada";
    case "missing_pace":
      return "Sem pace";
    case "pace_too_fast":
      return "Pace abaixo de 3:00/km";
    case "pace_too_slow":
      return "Pace acima de 30:00/km";
    case "below_99pct_distance":
      return "Distância abaixo de 99%";
    case "paused_after_competition_end":
      return "Pausada após encerramento";
    case "not_finished":
      return "Não finalizada";
    default:
      return reason;
  }
};

export const formatDateBR = (date: string | null): string => {
  return formatLocalDate(date, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export const formatDateRangeBR = (
  start: string | null,
  end: string | null
): string => {
  return formatLocalDateRange(start, end);
};

// ─── Hook: Competition Details ───────────────────────────

export function useCompetitionDetails(id: string | undefined) {
  const [data, setData] = useState<CompetitionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!id) return null;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch competition
      const { data: comp, error: compError } = await supabase
        .from("competitions")
        .select("*")
        .eq("id", id)
        .single();

      if (compError) throw compError;
      if (!comp) throw new Error("Competição não encontrada");

      // 2. Fetch distances
      const { data: distances } = await supabase
        .from("competition_distances")
        .select("*")
        .eq("competition_id", id)
        .order("sort_order");

      // 3. Fetch lots
      const { data: lots } = await supabase
        .from("competition_lots")
        .select("*")
        .eq("competition_id", id)
        .order("sort_order");

      // 4. Fetch documents
      const { data: documents, error: documentsError } = await supabase
        .from("competition_documents")
        .select("*")
        .eq("competition_id", id)
        .order("sort_order");

      if (documentsError) throw documentsError;

      // 5. Fetch sponsors
      const sponsorIds: string[] = comp.competition_sponsors || [];
      let sponsors: CompetitionSponsor[] = [];
      if (sponsorIds.length > 0) {
        const { data: sponsorData } = await supabase
          .from("competition_sponsors")
          .select("*")
          .in("id", sponsorIds)
          .order("sort_order");

        sponsors = (sponsorData || []).map((s) => ({
          id: s.id,
          name: s.name,
          logoUrl: s.logo_url,
          sortOrder: s.sort_order,
        }));
      }

      // 6. Fetch registration stats
      const { data: registrations } = await supabase
        .from("v_admin_competition_registered_users")
        .select("id, user_id, lot_id, status")
        .eq("competition_id", id)
        .neq("status", "cancelled");

      const totalRegistrations = registrations?.length || 0;
      const uniqueUsers = new Set(registrations?.map((r) => r.user_id));
      const totalAthletes = uniqueUsers.size;

      // 7. Calculate revenue from confirmed registrations + lots
      let totalRevenueCents = 0;
      if (registrations && registrations.length > 0 && lots) {
        const lotPriceMap: Record<string, number> = {};
        (lots || []).forEach((l) => {
          lotPriceMap[l.id] = l.price_cents;
        });

        registrations
          .filter((r) => r.status === "confirmed" && r.lot_id)
          .forEach((r) => {
            totalRevenueCents += lotPriceMap[r.lot_id] || 0;
          });
      }

      const startsOn = resolveLocalDate(comp.starts_on, comp.starts_at);
      if (!startsOn) throw new Error("Competição sem data de início");

      const nextData: CompetitionDetail = {
        id: comp.id,
        title: comp.title,
        subtitle: comp.subtitle,
        locationName: comp.location_name,
        startsOn,
        endsOn: resolveLocalDate(comp.ends_on, comp.ends_at),
        registrationStartsOn: resolveLocalDate(
          comp.registration_starts_on,
          comp.registration_starts_at,
        ),
        registrationEndsOn: resolveLocalDate(
          comp.registration_ends_on,
          comp.registration_ends_at,
        ),
        mode: comp.mode,
        formatType: comp.format_type ?? "oficial",
        formatObservations: comp.format_observations ?? null,
        status: comp.status,
        publishAt: comp.publish_at ?? null,
        isFree: comp.is_free,
        coverImageUrl: comp.cover_image_url,
        description: comp.description,
        prizeDescription: comp.prize_description,
        championshipId: comp.championship_id,
        unlimitedAttempts: comp.unlimited_attempts ?? true,
        maxRegistrations: comp.max_registrations ?? null,
        distances: (distances || []).map((d) => ({
          id: d.id,
          label: d.label,
          meters: d.meters,
          sortOrder: d.sort_order,
        })),
        lots: (lots || []).map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description,
          priceCents: l.price_cents,
          currency: l.currency,
          isSubscriptionAllowed: l.is_subscription_allowed,
          isActive: l.is_active,
          sortOrder: l.sort_order,
          hasKit: l.has_kit ?? false,
        })),
        documents: (documents || []).map((d) => ({
          id: d.id,
          title: d.title,
          fileUrl: d.file_url,
          sortOrder: d.sort_order,
        })),
        sponsors,
        stats: {
          totalAthletes,
          totalRegistrations,
          totalRevenueCents,
        },
      };

      setData(nextData);
      return nextData;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Erro ao carregar detalhes");
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useRealtimeRefetch(
    ["competitions", "competition_distances", "competition_lots", "competition_documents", "competition_sponsors", "competition_registrations"],
    fetchDetails,
  );

  return { data, loading, error, refetch: fetchDetails };
}

// ─── Hook: Competition Registrations (paginated) ─────────

const LABEL_TO_METERS: Record<string, number> = {
  "3 km": 3000,
  "5 km": 5000,
  "10 km": 10000,
  "21 km": 21000,
  "42 km": 42000,
};

export function useCompetitionRegistrations(
  competitionId: string | undefined,
  page: number = 1,
  pageSize: number = 10,
  filters: InscricoesFilters = {},
  search: string = ""
) {
  const [data, setData] = useState<RegistrationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cancelledTotal, setCancelledTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRegistrations = useCallback(async () => {
    if (!competitionId) return;
    setLoading(true);
    setError(null);

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Optional: restrict by user_ids (parceiro / participação)
      let filterUserIds: string[] | null = null;

      if (filters.isParceiro && !filters.naoEParceiro) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id")
          .eq("tipo_user", "Parceiro");
        filterUserIds = (profs ?? []).map((p) => p.id);
        if (filterUserIds.length === 0) {
          setData([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      } else if (filters.naoEParceiro && !filters.isParceiro) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id")
          .neq("tipo_user", "Parceiro");
        filterUserIds = (profs ?? []).map((p) => p.id);
      }

      if (filters.participacaoMin != null && filters.participacaoMin > 0) {
        const { data: regs } = await supabase
          .from("v_admin_competition_registered_users")
          .select("user_id")
          .neq("status", "cancelled");
        const countByUser: Record<string, number> = {};
        (regs ?? []).forEach((r) => {
          countByUser[r.user_id] = (countByUser[r.user_id] ?? 0) + 1;
        });
        const userIdsParticipacao = Object.entries(countByUser)
          .filter(([, c]) => c >= filters.participacaoMin!)
          .map(([id]) => id);
        if (userIdsParticipacao.length === 0) {
          setData([]);
          setTotal(0);
          setLoading(false);
          return;
        }
        filterUserIds =
          filterUserIds === null
            ? userIdsParticipacao
            : filterUserIds.filter((id) => userIdsParticipacao.includes(id));
        if (filterUserIds.length === 0) {
          setData([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      }

      // Optional: distance_ids for this competition
      let distanceIds: string[] | null = null;
      if (filters.distanceLabel || (filters.distanceMeters != null && filters.distanceMeters > 0)) {
        let query = supabase
          .from("competition_distances")
          .select("id")
          .eq("competition_id", competitionId);
        if (filters.distanceLabel) {
          const meters = LABEL_TO_METERS[filters.distanceLabel];
          if (meters != null) {
            query = query.eq("meters", meters);
          } else {
            query = query.eq("label", filters.distanceLabel!);
          }
        } else {
          query = query.eq("meters", filters.distanceMeters!);
        }
        const { data: dists } = await query;
        distanceIds = (dists ?? []).map((d) => d.id);
        if (distanceIds.length === 0) {
          setData([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      }

      // Canceladas ficam na lista, com o status "Cancelado" (pedido dela em 24/11/2026). A contagem do topo
      // separa as canceladas. A exportação continua só com as ativas (alimenta o fechamento no Dash).
      const { count: canceladas } = await supabase
        .from("competition_registrations")
        .select("id", { count: "exact", head: true })
        .eq("competition_id", competitionId)
        .eq("status", "cancelled");
      setCancelledTotal(canceladas ?? 0);

      // Busca por nome ou e-mail (sem acento): a lista de uma competição é pequena, então junta os ids
      // de todas as inscrições com os filtros, compara os nomes aqui e pagina o resultado.
      const termo = semAcento(search);
      let pageIds: string[] | null = null;
      if (termo) {
        const todas: { id: string; user_id: string }[] = [];
        for (let start = 0; ; start += 1000) {
          let q = supabase
            .from("competition_registrations")
            .select("id, user_id")
            .eq("competition_id", competitionId)
            .order("created_at", { ascending: false });
          if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
          if (filterUserIds && filterUserIds.length > 0) q = q.in("user_id", filterUserIds);
          if (distanceIds && distanceIds.length > 0) q = q.in("distance_id", distanceIds);
          const { data: chunk, error: chunkError } = await q.range(start, start + 999);
          if (chunkError) throw chunkError;
          todas.push(...((chunk ?? []) as { id: string; user_id: string }[]));
          if (!chunk || chunk.length < 1000) break;
        }
        const uids = [...new Set(todas.map((r) => r.user_id))];
        const achados = new Set<string>();
        for (let i = 0; i < uids.length; i += 100) {
          const { data: ps, error: psError } = await supabase
            .from("v_corredores_admin")
            .select("id, full_name, email")
            .in("id", uids.slice(i, i + 100));
          if (psError) throw psError;
          ((ps ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((pr) => {
            if (semAcento(pr.full_name ?? "").includes(termo) || (pr.email ?? "").toLowerCase().includes(termo)) {
              achados.add(pr.id);
            }
          });
        }
        const ids = todas.filter((r) => achados.has(r.user_id)).map((r) => r.id);
        setTotal(ids.length);
        pageIds = ids.slice(from, to + 1);
        if (pageIds.length === 0) {
          setData([]);
          return;
        }
      }

      let query = supabase
        .from("competition_registrations")
        .select("id, user_id, distance_id, lot_id, status, created_at, shirt_size", {
          count: "exact",
        })
        .eq("competition_id", competitionId)
        .order("created_at", { ascending: false });

      if (pageIds) {
        query = query.in("id", pageIds);
      } else {
        if (filters.status && filters.status !== "all") {
          query = query.eq("status", filters.status);
        }
        if (filterUserIds && filterUserIds.length > 0) {
          query = query.in("user_id", filterUserIds);
        }
        if (distanceIds && distanceIds.length > 0) {
          query = query.in("distance_id", distanceIds);
        }
      }

      const {
        data: regs,
        error: regsError,
        count,
      } = pageIds ? await query : await query.range(from, to);

      if (regsError) throw regsError;
      if (!pageIds) setTotal(count || 0);

      if (!regs || regs.length === 0) {
        setData([]);
        return;
      }

      // Fetch profiles for user_ids
      const userIds = [...new Set(regs.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      const profileMap: Record<
        string,
        { full_name: string | null; avatar_url: string | null }
      > = {};
      (profiles || []).forEach((p) => {
        profileMap[p.id] = p;
      });

      const { data: runs } = await supabase
        .from("user_runs")
        .select("user_id")
        .eq("competition_id", competitionId)
        .in("user_id", userIds)
        .not("started_at", "is", null);

      const attemptsByUser: Record<string, number> = {};
      (runs || []).forEach((run) => {
        attemptsByUser[run.user_id] = (attemptsByUser[run.user_id] ?? 0) + 1;
      });

      // Fetch distances for the fetched registrations
      const regDistanceIds = [
        ...new Set(regs.filter((r) => r.distance_id).map((r) => r.distance_id)),
      ];
      const distanceMap: Record<string, { label: string; meters: number }> = {};
      if (regDistanceIds.length > 0) {
        const { data: dists } = await supabase
          .from("competition_distances")
          .select("id, label, meters")
          .in("id", regDistanceIds);
        (dists || []).forEach((d) => {
          distanceMap[d.id] = d;
        });
      }

      // Fetch lots
      const lotIds = [
        ...new Set(regs.filter((r) => r.lot_id).map((r) => r.lot_id)),
      ];
      const lotMap: Record<string, { name: string; price_cents: number; has_kit: boolean }> = {};
      if (lotIds.length > 0) {
        const { data: lotsData } = await supabase
          .from("competition_lots")
          .select("id, name, price_cents, has_kit")
          .in("id", lotIds);
        (lotsData || []).forEach((l) => {
          lotMap[l.id] = { ...l, has_kit: l.has_kit ?? false };
        });
      }

      // Quem cancelou, quando e a justificativa (inscrições canceladas pelo admin).
      const cancMap: Record<string, RegistrationRow["cancelamento"]> = {};
      const cancIds = regs.filter((r) => r.status === "cancelled").map((r) => r.id);
      if (cancIds.length > 0) {
        const { data: cs } = await supabase
          .from("admin_registration_cancellations")
          .select("registration_id, reason, created_at, cancelled_by, credit_returned")
          .in("registration_id", cancIds);
        const lista = (cs ?? []) as { registration_id: string; reason: string; created_at: string; cancelled_by: string; credit_returned: boolean }[];
        const quem = [...new Set(lista.map((c) => c.cancelled_by))];
        const nomes: Record<string, string> = {};
        if (quem.length > 0) {
          const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", quem);
          ((ps ?? []) as { id: string; full_name: string | null }[]).forEach((pr) => {
            nomes[pr.id] = pr.full_name ?? "";
          });
        }
        lista.forEach((c) => {
          cancMap[c.registration_id] = {
            reason: c.reason,
            createdAt: c.created_at,
            byName: nomes[c.cancelled_by] || null,
            creditReturned: c.credit_returned,
          };
        });
      }

      const rows: RegistrationRow[] = regs.map((r) => {
        const profile = profileMap[r.user_id];
        const distance = r.distance_id ? distanceMap[r.distance_id] : null;
        const lot = r.lot_id ? lotMap[r.lot_id] : null;
        return {
          id: r.id,
          userId: r.user_id,
          userName: profile?.full_name || "Usuário desconhecido",
          userAvatar: profile?.avatar_url || null,
          distanceLabel: distance?.label || null,
          distanceMeters: distance?.meters || null,
          attempts: attemptsByUser[r.user_id] ?? 0,
          priceCents: lot?.price_cents ?? null,
          lotName: lot?.name || null,
          lotHasKit: lot?.has_kit ?? false,
          shirtSize: r.shirt_size ?? null,
          status: r.status,
          createdAt: r.created_at,
          cancelamento: cancMap[r.id] ?? null,
        };
      });

      setData(rows);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error("Erro ao carregar inscrições")
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [competitionId, page, pageSize, filters, search]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  useRealtimeRefetch(["competition_registrations"], fetchRegistrations);

  return { data, total, cancelledTotal, loading, error, refetch: fetchRegistrations };
}

// ─── Hook: Competition Ranking (paginated) ───────────────

export function useCompetitionRanking(
  competitionId: string | undefined,
  page: number = 1,
  pageSize: number = 10,
  source: RankingSource = "public",
  search: string = "",
  gender: Genero = ""
) {
  const [data, setData] = useState<RankingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRanking = useCallback(async () => {
    if (!competitionId) return;
    setLoading(true);
    setError(null);

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // As views do ranking não têm e-mail: busca os corredores por nome/e-mail e
      // filtra o ranking pelos ids encontrados. A posição continua a original.
      // Vírgula e parênteses quebram a sintaxe do .or() do PostgREST.
      const term = search.trim().replace(/[,()]/g, " ");
      let userIds: string[] | null = null;
      if (term) {
        // profiles não tem e-mail; a view do admin junta com auth.users.
        const { data: profiles, error: profilesError } = await supabase
          .from("v_corredores_admin")
          .select("id")
          .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(500);
        if (profilesError) {
          throw new Error(`Erro ao buscar corredor: ${profilesError.message}`);
        }
        userIds = (profiles ?? []).map((p) => p.id);
        if (userIds.length === 0) {
          setTotal(0);
          setData([]);
          return;
        }
      }

      const table =
        source === "public"
          ? "v_competition_leaderboard"
          : "v_admin_competition_attempt_ranking";
      const selectColumns =
        source === "public"
          ? "run_id, user_id, distance_meters, avg_pace_seconds_per_km, total_time_seconds, rank, user_name, user_avatar_url, state, current_distance_meters"
          : "run_id, user_id, distance_meters, avg_pace_seconds_per_km, total_time_seconds, rank, user_name, user_avatar_url, state, current_distance_meters, public_visibility, hidden_reason, raw_total_time_seconds";
      const tooSlow = (e: { code?: string; message: string }) =>
        new Error(
          e.code === "57014"
            ? "O ranking demorou demais para carregar (tempo limite do banco). Tente novamente em instantes."
            : `Erro ao carregar ranking: ${e.message}`
        );

      // Filtro de gênero (só no ranking público): busca o ranking inteiro, deixa só o gênero
      // e refaz a posição dentro do gênero; a paginação passa a ser aqui.
      if (source === "public" && gender) {
        type Linha = Record<string, unknown> & { user_id: string; distance_meters: number; rank: number };
        const all: Linha[] = [];
        for (let start = 0; ; start += 1000) {
          const { data: chunk, error: chunkError } = await supabase
            .from(table)
            .select(selectColumns)
            .eq("competition_id", competitionId)
            .order("distance_meters", { ascending: true })
            .order("rank", { ascending: true })
            .order("user_id", { ascending: true })
            .range(start, start + 999);
          if (chunkError) throw tooSlow(chunkError);
          all.push(...((chunk ?? []) as unknown as Linha[]));
          if (!chunk || chunk.length < 1000) break;
        }
        const genders = await fetchGenders(all.map((r) => r.user_id));
        let ranked = rankByGender(all, genders, gender);
        if (userIds) {
          const wanted = new Set(userIds);
          ranked = ranked.filter((r) => wanted.has(r.user_id));
        }
        setTotal(ranked.length);
        setData(
          ranked.slice(from, to + 1).map((r) => ({
            position: r.genderRank,
            userId: r.user_id,
            userName: (r.user_name as string) || "Usuário desconhecido",
            userAvatar: (r.user_avatar_url as string) || null,
            paceSecondsPerKm: r.avg_pace_seconds_per_km as number | null,
            distanceMeters: r.distance_meters,
            totalTimeSeconds: r.total_time_seconds as number,
            state: r.state as string,
            currentDistanceMeters: (r.current_distance_meters as number | null) ?? null,
            publicVisibility: "visible",
            hiddenReason: null,
            rawTotalTimeSeconds: null,
            gender: genders[r.user_id] ?? null,
          }))
        );
        return;
      }

      let query = supabase
        .from(table)
        .select(selectColumns, { count: "exact" })
        .eq("competition_id", competitionId);
      if (userIds) query = query.in("user_id", userIds);
      const {
        data: runs,
        error: runsError,
        count,
      } = await query
        .order("distance_meters", { ascending: true })
        .order("rank", { ascending: true })
        .range(from, to);

      if (runsError) throw tooSlow(runsError);
      setTotal(count || 0);

      if (!runs || runs.length === 0) {
        setData([]);
        return;
      }

      const pageUserIds = (runs as unknown as { user_id: string }[]).map((r) => r.user_id);
      const pageGenders = await fetchGenders(pageUserIds);
      const rows: RankingRow[] = runs.map((r) => ({
        position: r.rank,
        userId: r.user_id,
        userName: r.user_name || "Usuário desconhecido",
        userAvatar: r.user_avatar_url || null,
        paceSecondsPerKm: r.avg_pace_seconds_per_km,
        distanceMeters: r.distance_meters,
        totalTimeSeconds: r.total_time_seconds,
        state: r.state,
        currentDistanceMeters: r.current_distance_meters ?? null,
        publicVisibility: r.public_visibility ?? "visible",
        hiddenReason: r.hidden_reason ?? null,
        rawTotalTimeSeconds: r.raw_total_time_seconds ?? null,
        gender: null,
      }));
      rows.forEach((row) => {
        row.gender = pageGenders[row.userId] ?? null;
      });

      setData(rows);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error("Erro ao carregar ranking")
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [competitionId, page, pageSize, source, search, gender]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  // Só corridas desta competição, no máximo um refetch a cada 10s. Escutar
  // user_run_events disparava a view pesada a cada ponto de GPS de qualquer
  // corredor e estourava o statement_timeout durante as etapas.
  useRealtimeRefetch(["user_runs"], fetchRanking, {
    filter: competitionId ? `competition_id=eq.${competitionId}` : undefined,
    throttleMs: 10_000,
  });

  return { data, total, loading, error, refetch: fetchRanking };
}

// ─── CSV Export Helpers ──────────────────────────────────

export function generateCsv(headers: string[], rows: string[][]): string {
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${(cell ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  return csvRows.join("\n");
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exports all registrations for a competition as CSV */
export async function exportRegistrationsCsv(competitionId: string) {
  // Fetch ALL registrations (no pagination)
  const { data: regs, error: regsError } = await supabase
    .from("competition_registrations")
    .select("id, user_id, distance_id, lot_id, status, created_at, shirt_size")
    .eq("competition_id", competitionId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (regsError) throw regsError;
  if (!regs || regs.length === 0) {
    throw new Error("Nenhuma inscrição para exportar");
  }

  const userIds = [...new Set(regs.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const profileMap: Record<string, string> = {};
  (profiles || []).forEach((p) => {
    profileMap[p.id] = p.full_name || "Desconhecido";
  });

  const { data: runs } = await supabase
    .from("user_runs")
    .select("user_id")
    .eq("competition_id", competitionId)
    .in("user_id", userIds)
    .not("started_at", "is", null);

  const attemptsByUser: Record<string, number> = {};
  (runs || []).forEach((run) => {
    attemptsByUser[run.user_id] = (attemptsByUser[run.user_id] ?? 0) + 1;
  });

  const distanceIds = [
    ...new Set(regs.filter((r) => r.distance_id).map((r) => r.distance_id)),
  ];
  const distanceMap: Record<string, string> = {};
  if (distanceIds.length > 0) {
    const { data: dists } = await supabase
      .from("competition_distances")
      .select("id, label")
      .in("id", distanceIds);
    (dists || []).forEach((d) => {
      distanceMap[d.id] = d.label;
    });
  }

  const lotIds = [
    ...new Set(regs.filter((r) => r.lot_id).map((r) => r.lot_id)),
  ];
  const lotMap: Record<string, { name: string; price_cents: number; has_kit: boolean }> = {};
  if (lotIds.length > 0) {
    const { data: lotsData } = await supabase
      .from("competition_lots")
      .select("id, name, price_cents, has_kit")
      .in("id", lotIds);
    (lotsData || []).forEach((l) => {
      lotMap[l.id] = { ...l, has_kit: l.has_kit ?? false };
    });
  }

  const headers = ["Nome", "Distância", "Tentativas", "Lote", "Valor", "Tamanho camiseta", "Status", "Data de inscrição"];
  const rows = regs.map((r) => {
    const lot = r.lot_id ? lotMap[r.lot_id] : null;
    return [
      profileMap[r.user_id] || "Desconhecido",
      r.distance_id ? distanceMap[r.distance_id] || "-" : "-",
      String(attemptsByUser[r.user_id] ?? 0),
      lot?.name || "-",
      lot ? formatPrice(lot.price_cents) : "-",
      r.shirt_size ?? "-",
      mapRegistrationStatus(r.status),
      new Date(r.created_at).toLocaleDateString("pt-BR"),
    ];
  });

  const csv = generateCsv(headers, rows);
  downloadCsv(csv, `inscricoes-${competitionId}.csv`);
}

/** Exports ranking (best run per registered runner with at least one attempt) as CSV */
export async function exportRankingCsv(competitionId: string, gender: Genero = "") {
  type Linha = {
    user_id: string;
    distance_meters: number;
    avg_pace_seconds_per_km: number | null;
    total_time_seconds: number | null;
    rank: number;
    user_name: string | null;
  };
  const runs: Linha[] = [];
  for (let start = 0; ; start += 1000) {
    const { data: chunk, error: runsError } = await supabase
      .from("v_competition_leaderboard")
      .select("user_id, distance_meters, avg_pace_seconds_per_km, total_time_seconds, rank, user_name")
      .eq("competition_id", competitionId)
      .order("distance_meters", { ascending: true })
      .order("rank", { ascending: true })
      .order("user_id", { ascending: true })
      .range(start, start + 999);
    if (runsError) throw runsError;
    runs.push(...((chunk ?? []) as Linha[]));
    if (!chunk || chunk.length < 1000) break;
  }
  if (runs.length === 0) {
    throw new Error("Nenhum resultado no ranking para exportar");
  }

  const genders = await fetchGenders(runs.map((r) => r.user_id));
  const lista = gender
    ? rankByGender(runs, genders, gender).map((r) => ({ ...r, posicao: r.genderRank }))
    : runs.map((r) => ({ ...r, posicao: r.rank }));
  if (lista.length === 0) {
    throw new Error(`Nenhum resultado no ranking ${gender.toLowerCase()} para exportar`);
  }

  const headers = ["Distância", "Posição", "Corredor", "Gênero", "Pace", "Tempo"];
  const rows = lista.map((r) => [
    formatDistanceKm(r.distance_meters),
    `${r.posicao}º`,
    r.user_name || "Desconhecido",
    genders[r.user_id] ?? "",
    formatPace(r.avg_pace_seconds_per_km),
    formatTime(r.total_time_seconds),
  ]);

  const csv = generateCsv(headers, rows);
  downloadCsv(csv, gender ? `ranking-${gender.toLowerCase()}-${competitionId}.csv` : `ranking-${competitionId}.csv`);
}

/**
 * Exports the attempts audit as CSV (button "Exportar" on the
 * "Auditoria de tentativas" tab).
 *
 * Who appears in the public ranking comes first, with the same position the
 * app shows (per distance). Then everyone who tried and does not appear in the
 * app, with the reason. Read-only: it only reads the two ranking views and the
 * admin e-mail view; nothing is written.
 */
export async function exportAttemptsCsv(competitionId: string) {
  const PAGE = 1000; // api.max_rows

  type PublicRow = {
    user_id: string;
    distance_meters: number;
    avg_pace_seconds_per_km: number | null;
    total_time_seconds: number | null;
    rank: number;
    user_name: string | null;
    state: string;
  };
  type AuditRow = {
    user_id: string;
    distance_meters: number;
    avg_pace_seconds_per_km: number | null;
    total_time_seconds: number | null;
    user_name: string | null;
    state: string;
    public_visibility: string | null;
    hidden_reason: string | null;
  };

  async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .eq("competition_id", competitionId)
        .order("distance_meters", { ascending: true })
        .order("rank", { ascending: true })
        .order("user_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(
          error.code === "57014"
            ? "A exportação demorou demais (tempo limite do banco). Tente novamente em instantes."
            : `Erro ao exportar tentativas: ${error.message}`
        );
      }
      all.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  const publicRows = await fetchAll<PublicRow>(
    "v_competition_leaderboard",
    "user_id, distance_meters, avg_pace_seconds_per_km, total_time_seconds, rank, user_name, state"
  );
  const auditRows = await fetchAll<AuditRow>(
    "v_admin_competition_attempt_ranking",
    "user_id, distance_meters, avg_pace_seconds_per_km, total_time_seconds, rank, user_name, state, public_visibility, hidden_reason"
  );

  if (publicRows.length === 0 && auditRows.length === 0) {
    throw new Error("Nenhuma tentativa para exportar");
  }

  // E-mails (as views do ranking não têm e-mail; v_corredores_admin tem).
  const userIds = [
    ...new Set([...publicRows, ...auditRows].map((r) => r.user_id)),
  ];
  const emailMap: Record<string, string> = {};
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const { data: people, error: peopleError } = await supabase
      .from("v_corredores_admin")
      .select("id, email")
      .in("id", chunk);
    if (peopleError) {
      throw new Error(`Erro ao buscar e-mails: ${peopleError.message}`);
    }
    (people ?? []).forEach((p: { id: string; email: string | null }) => {
      emailMap[p.id] = p.email ?? "";
    });
  }

  const inPublic = new Set(publicRows.map((r) => r.user_id));

  const visible = publicRows.map((r) => ({
    distance: r.distance_meters,
    order: 0,
    rank: r.rank,
    cells: [
      formatDistanceKm(r.distance_meters),
      `${r.rank}º`,
      r.user_name || "Desconhecido",
      emailMap[r.user_id] ?? "",
      formatPace(r.avg_pace_seconds_per_km),
      formatTime(r.total_time_seconds),
      mapRunState(r.state),
      "Sim",
      "",
    ],
  }));

  const notVisible = auditRows
    .filter((r) => !inPublic.has(r.user_id))
    .map((r) => ({
      distance: r.distance_meters,
      order: 1,
      rank: 0,
      cells: [
        formatDistanceKm(r.distance_meters),
        "",
        r.user_name || "Desconhecido",
        emailMap[r.user_id] ?? "",
        formatPace(r.avg_pace_seconds_per_km),
        formatTime(r.total_time_seconds),
        mapRunState(r.state),
        "Não",
        r.hidden_reason
          ? mapHiddenReason(r.hidden_reason)
          : "Fora das regras do ranking do app",
      ],
    }));

  const rows = [...visible, ...notVisible]
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.order - b.order ||
        a.rank - b.rank ||
        a.cells[2].localeCompare(b.cells[2], "pt-BR")
    )
    .map((r) => r.cells);

  const headers = [
    "Distância",
    "Posição",
    "Corredor",
    "E-mail",
    "Pace",
    "Tempo",
    "Situação",
    "Visível no app",
    "Motivo",
  ];

  const csv = generateCsv(headers, rows);
  downloadCsv(csv, `tentativas-${competitionId}.csv`);
}
