import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { useParams, Link, useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { CancelarInscricaoDialog } from "@/components/CancelarInscricaoDialog";
import { CorredorPerfilSheet } from "@/components/CorredorPerfilSheet";
import { ChevronLeft, ChevronRight, Pencil, Download, Filter, Loader2, Search, CalendarClock } from "lucide-react";
import { PublicacaoAppDialog } from "@/components/PublicacaoAppDialog";
import { formatPublishAt } from "@/lib/publicacao";
import { GENEROS, type Genero } from "@/lib/genero";
import { PERFIL_DA_CASA_ROTULO } from "@/lib/perfisDaCasa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { ExportDialog } from "@/components/ExportDialog";
import { InscricoesFilterDialog } from "@/components/InscricoesFilterDialog";
import { CompeticaoDetalheTabProvider, CompeticaoDetalheTabs, useCompeticaoDetalheTab } from "@/components/CompeticaoDetalheTabs";
import {
  useCompetitionDetails,
  useCompetitionRegistrations,
  useCompetitionRanking,
  formatPace,
  formatTime,
  formatDistanceKm,
  formatPrice,
  formatDateBR,
  formatDateRangeBR,
  mapRegistrationStatus,
  mapCompetitionStatus,
  mapRunState,
  mapHiddenReason,
  exportRegistrationsCsv,
  exportRankingCsv,
  exportAttemptsCsv,
} from "@/hooks/useCompetitionDetails";
import type { CompetitionDetail, InscricoesFilters } from "@/hooks/useCompetitionDetails";
import { toast } from "sonner";
import competitionHero from "@/assets/competition-hero.png";

// ─── Status Badge ────────────────────────────────────────

const getRegistrationStatusBadge = (status: string) => {
  const mapped = mapRegistrationStatus(status);
  switch (status) {
    case "pending":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-0 hover:bg-yellow-500/20 px-4 py-1 rounded-full">
          {mapped}
        </Badge>
      );
    case "confirmed":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-0 hover:bg-green-500/20 px-4 py-1 rounded-full">
          {mapped}
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-0 hover:bg-red-500/20 px-4 py-1 rounded-full">
          {mapped}
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-500/20 text-gray-400 border-0 hover:bg-gray-500/20 px-4 py-1 rounded-full">
          {mapped}
        </Badge>
      );
  }
};

// ─── Loading Component ───────────────────────────────────

const LoadingState = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
    <span className="ml-3 text-muted-foreground">Carregando...</span>
  </div>
);

// ─── Error Component ─────────────────────────────────────

const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-20">
    <p className="text-red-400 mb-4">{message}</p>
    {onRetry && (
      <Button
        onClick={onRetry}
        className="border-0 hover:brightness-90 transition-all"
        style={{ backgroundColor: "#CCF725", color: "#1A1A1A" }}
      >
        Tentar novamente
      </Button>
    )}
  </div>
);

// ─── Empty State ─────────────────────────────────────────

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center py-16">
    <p className="text-muted-foreground">{message}</p>
  </div>
);

// ─── Tab: Detalhes ───────────────────────────────────────

const DetalhesTab = ({ competition }: { competition: CompetitionDetail }) => {
  const distanceRange =
    competition.distances.length > 0
      ? competition.distances.length === 1
        ? competition.distances[0].label
        : `De ${formatDistanceKm(
            Math.min(...competition.distances.map((d) => d.meters))
          )} a ${formatDistanceKm(
            Math.max(...competition.distances.map((d) => d.meters))
          )}`
      : "-";

  return (
    <>
      {/* Hero Image */}
      <div className="mb-8 rounded-lg overflow-hidden">
        <img
          src={competition.coverImageUrl || competitionHero}
          alt={competition.title}
          className="w-full h-[380px] object-cover"
        />
      </div>

      {/* Estatísticas */}
      <div className="mb-8 bg-[#262626] rounded-lg p-4 sm:p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">Estatísticas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#1A1A1A] border-0">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-2">Total de inscritos</p>
              <p className="text-2xl font-semibold text-foreground">
                {competition.stats.totalAthletes} atleta{competition.stats.totalAthletes !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1A1A1A] border-0">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-2">Total de inscrições</p>
              <p className="text-2xl font-semibold text-foreground">
                {competition.stats.totalRegistrations} {competition.stats.totalRegistrations === 1 ? "inscrição" : "inscrições"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1A1A1A] border-0">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-2">Total em vendas</p>
              <p className="text-2xl font-semibold text-foreground">
                {formatPrice(competition.stats.totalRevenueCents)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dados da competição */}
      <div className="mb-8 bg-[#262626] rounded-lg p-4 sm:p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">Dados da competição</h2>
        <Card className="bg-[#1A1A1A] border-0 mb-4">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-1">
                {competition.title.toUpperCase()}
              </h3>
              {competition.locationName && (
                <p className="text-sm text-foreground">{competition.locationName.toUpperCase()}</p>
              )}
            </div>

            {competition.description && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Descrição</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {competition.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-[#1A1A1A] border-0">
            <CardContent className="p-6 space-y-6 divide-y divide-border">
              <div className="pt-0">
                <p className="text-xs text-muted-foreground mb-2">Período de inscrições</p>
                <p className="text-base font-medium text-foreground">
                  {formatDateRangeBR(
                    competition.registrationStartsOn,
                    competition.registrationEndsOn
                  )}
                </p>
              </div>

              <div className="pt-6">
                <p className="text-xs text-muted-foreground mb-2">Período da competição</p>
                <p className="text-base font-medium text-foreground">
                  {formatDateRangeBR(competition.startsOn, competition.endsOn)}
                </p>
              </div>

              <div className="pt-6">
                <p className="text-xs text-muted-foreground mb-2">Modalidade</p>
                <p className="text-base font-medium text-foreground">
                  {competition.mode === "outdoor" ? "Outdoor" : competition.mode === "mista" ? "Mista" : "Indoor"}
                </p>
              </div>

              <div className="pt-6">
                <p className="text-xs text-muted-foreground mb-2">Formato</p>
                <p className="text-base font-medium text-foreground">
                  {competition.formatType === "patrocinada" ? "Patrocinada" : competition.formatType === "personalizado" ? "Personalizado" : "Oficial"}
                </p>
                {competition.formatType === "personalizado" && competition.formatObservations && (
                  <p className="text-sm text-muted-foreground mt-1">{competition.formatObservations}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1A1A1A] border-0">
            <CardContent className="p-6 space-y-6 divide-y divide-border">
              <div className="pt-0">
                <p className="text-xs text-muted-foreground mb-2">Distância</p>
                <p className="text-base font-medium text-foreground">{distanceRange}</p>
              </div>

              <div className="pt-6">
                <p className="text-xs text-muted-foreground mb-2">Premiação</p>
                <p className="text-base font-medium text-foreground">
                  {competition.prizeDescription || "-"}
                </p>
              </div>

              <div className="pt-6">
                <p className="text-xs text-muted-foreground mb-2">Status</p>
                <p className="text-base font-medium text-foreground">
                  {mapCompetitionStatus(competition.status)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Valores / Lotes */}
      {competition.lots.length > 0 && (
        <div className="mb-8 bg-[#262626] rounded-lg p-4 sm:p-6">
          <h2 className="text-lg font-medium text-foreground mb-4">Valores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competition.lots.map((lot) => (
              <Card key={lot.id} className="bg-[#1A1A1A] border-0">
                <CardContent className="p-6">
                  <p className="text-xs text-muted-foreground mb-2">{lot.name}</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {formatPrice(lot.priceCents)}
                  </p>
                  {lot.description && (
                    <p className="text-sm text-muted-foreground mt-2">{lot.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Patrocinadores */}
      {competition.sponsors.length > 0 && (
        <div className="mb-8 bg-[#262626] rounded-lg p-4 sm:p-6">
          <h2 className="text-lg font-medium text-foreground mb-4">Patrocinadores</h2>
          <Card className="bg-[#1A1A1A] border-0">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {competition.sponsors.map((sponsor) => (
                  <div key={sponsor.id} className="flex flex-col items-center gap-2">
                    {sponsor.logoUrl ? (
                      <img
                        src={sponsor.logoUrl}
                        alt={sponsor.name}
                        className="max-h-16 object-contain"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">Logo</span>
                      </div>
                    )}
                    <p className="text-sm text-foreground text-center">{sponsor.name}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Documentos */}
      {competition.documents.length > 0 && (
        <div className="mb-8 bg-[#262626] rounded-lg p-4 sm:p-6">
          <h2 className="text-lg font-medium text-foreground mb-4">Documentos</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {competition.documents.map((doc) => (
              <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <Card className="bg-[#1A1A1A] border-0 hover:bg-[#222222] transition-colors cursor-pointer">
                  <CardContent className="p-6 flex items-center justify-between">
                    <p className="text-sm" style={{ color: "#CCF725" }}>
                      {doc.title}
                    </p>
                    <Download className="w-5 h-5" style={{ color: "#CCF725" }} />
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ─── Tab: Inscrições ─────────────────────────────────────

const InscricoesTab = ({
  competitionId,
  filters,
  page,
  onPageChange,
}: {
  competitionId: string;
  filters: InscricoesFilters;
  page: number;
  onPageChange: (page: number) => void;
}) => {
  const pageSize = 10;
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("competicoes.edit");
  const [cancelar, setCancelar] = useState<{ id: string; nome: string } | null>(null);
  const [perfil, setPerfil] = useState<{ id: string; nome: string } | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    onPageChange(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data, total, cancelledTotal, loading, error, refetch } = useCompetitionRegistrations(
    competitionId,
    page,
    pageSize,
    filters,
    debouncedSearch
  );

  const hasActiveFilters = Object.keys(filters).length > 0;
  const buscando = debouncedSearch.trim().length > 0;

  if (loading && data.length === 0 && !buscando && !search) return <LoadingState />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const contagem = hasActiveFilters || buscando
    ? `${total} resultado${total !== 1 ? "s" : ""}${hasActiveFilters ? " (filtrado)" : ""}`
    : `${total - cancelledTotal} inscrito${total - cancelledTotal !== 1 ? "s" : ""}` +
      (cancelledTotal > 0 ? ` · ${cancelledTotal} cancelada${cancelledTotal !== 1 ? "s" : ""}` : "");

  return (
    <>
      <div className="rounded-lg overflow-hidden border border-border mb-6">
        <div className="px-4 sm:px-6 py-4 bg-[#262626] flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          <h2 className="text-xl font-semibold text-foreground">Inscritos</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <p data-contagem-inscritos className="text-sm text-muted-foreground flex items-center gap-2 whitespace-nowrap">
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {contagem}
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-busca-inscritos
                placeholder="Buscar por nome ou e-mail"
                className="pl-10 bg-input border-border text-foreground"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {data.length === 0 ? (
          <div className="bg-[#262626] px-6 py-10 text-center text-sm text-muted-foreground">
            {loading
              ? "Carregando..."
              : buscando
                ? `Nenhum inscrito encontrado para "${debouncedSearch.trim()}".`
                : hasActiveFilters
                  ? "Nenhuma inscrição encontrada com os filtros aplicados."
                  : "Nenhuma inscrição encontrada."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Nome
                </TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Distância
                </TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Tentativas
                </TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Lote
                </TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Valor
                </TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Tamanho
                </TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>
                  Status
                </TableHead>
                {canEdit && <TableHead className="w-[110px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((reg) => (
                <TableRow
                  key={reg.id}
                  data-inscrito-row
                  className={`border-border hover:bg-muted/50 bg-[#262626] ${reg.status === "cancelled" ? "opacity-70" : ""}`}
                >
                  <TableCell className="font-medium text-foreground">
                    <button
                      type="button"
                      data-abrir-corredor
                      onClick={() => setPerfil({ id: reg.userId, nome: reg.userName })}
                      className="flex items-center gap-3 text-left hover:text-primary transition-colors"
                      title="Ver perfil, contato e histórico"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex-shrink-0">
                        {reg.userAvatar ? (
                          <img
                            src={reg.userAvatar}
                            alt={reg.userName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                            {reg.userName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="underline-offset-4 hover:underline">{reg.userName}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-foreground">
                    {reg.distanceLabel || "-"}
                  </TableCell>
                  <TableCell className="text-foreground text-center">
                    {reg.attempts}
                  </TableCell>
                  <TableCell className="text-foreground">{reg.lotName || "-"}</TableCell>
                  <TableCell className="text-foreground">
                    {formatPrice(reg.priceCents)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {reg.shirtSize ?? "-"}
                  </TableCell>
                  <TableCell>
                    {getRegistrationStatusBadge(reg.status)}
                    {reg.cancelamento && (
                      <div data-info-cancelamento className="mt-1 max-w-[240px] space-y-0.5 text-xs text-muted-foreground">
                        <div>
                          Em {new Date(reg.cancelamento.createdAt).toLocaleDateString("pt-BR")}
                          {reg.cancelamento.byName ? ` por ${reg.cancelamento.byName}` : ""}
                        </div>
                        <div>"{reg.cancelamento.reason}"</div>
                        {reg.cancelamento.creditReturned && <div>Crédito devolvido</div>}
                      </div>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      {reg.status !== "cancelled" && (
                        <Button
                          data-cancelar-inscricao-btn
                          variant="ghost"
                          size="sm"
                          onClick={() => setCancelar({ id: reg.id, nome: reg.userName })}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          Cancelar
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />

      <CancelarInscricaoDialog
        open={cancelar !== null}
        registrationId={cancelar?.id ?? null}
        userName={cancelar?.nome ?? ""}
        onClose={() => setCancelar(null)}
        onDone={() => {
          setCancelar(null);
          refetch();
        }}
      />

      <CorredorPerfilSheet
        userId={perfil?.id ?? null}
        userName={perfil?.nome}
        onClose={() => {
          setPerfil(null);
          refetch();
        }}
      />
    </>
  );
};

// ─── Tab: Ranking ────────────────────────────────────────

const RankingTab = ({
  competitionId,
  onSourceChange,
  onGenderChange,
}: {
  competitionId: string;
  onSourceChange?: (source: "public" | "audit") => void;
  onGenderChange?: (gender: Genero) => void;
}) => {
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<"public" | "audit">("public");
  const [gender, setGender] = useState<Genero>("");

  // Avisa a página qual aba está aberta, para o botão Exportar baixar a certa.
  useEffect(() => {
    onSourceChange?.(source);
  }, [source, onSourceChange]);
  // O gênero só vale no ranking público.
  const activeGender: Genero = source === "public" ? gender : "";
  useEffect(() => {
    onGenderChange?.(activeGender);
  }, [activeGender, onGenderChange]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [perfil, setPerfil] = useState<{ id: string; nome: string } | null>(null);
  const pageSize = 10;
  const { data, total, loading, error, refetch } = useCompetitionRanking(
    competitionId,
    page,
    pageSize,
    source,
    debouncedSearch,
    activeGender
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Com busca ativa o campo precisa continuar montado durante o carregamento.
  if (loading && data.length === 0 && !debouncedSearch) return <LoadingState />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant={source === "public" ? "default" : "secondary"}
          onClick={() => {
            setSource("public");
            setPage(1);
          }}
        >
          Ranking público (app)
        </Button>
        <Button
          type="button"
          variant={source === "audit" ? "default" : "secondary"}
          onClick={() => {
            setSource("audit");
            setPage(1);
          }}
        >
          Auditoria de tentativas
        </Button>
        {source === "public" && (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto" data-filtro-genero>
            <span className="text-sm text-muted-foreground">Gênero:</span>
            {GENEROS.map((g) => (
              <Button
                key={g.label}
                type="button"
                size="sm"
                variant={gender === g.value ? "default" : "secondary"}
                onClick={() => {
                  setGender(g.value);
                  setPage(1);
                }}
              >
                {g.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg overflow-hidden border border-border mb-6">
        <div className="px-4 sm:px-6 py-4 bg-[#262626] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {source === "public" ? "Ranking público (app)" : "Auditoria de tentativas"}
              {activeGender ? ` · ${activeGender}` : ""}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {source === "public"
                ? activeGender
                  ? `Só ${activeGender === "Feminino" ? "mulheres" : "homens"}, com a posição refeita dentro do gênero (pelo gênero do cadastro).`
                  : "Mesma fonte exibida no app, com paces abaixo de 3:00/km ocultos."
                : "Inclui todos que tentaram correr e mostra por que podem não aparecer no app."}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail"
                className="pl-10 bg-input border-border text-foreground"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {total} resultado{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {data.length === 0 ? (
          <EmptyState
            message={
              debouncedSearch
                ? "Nenhum corredor encontrado no ranking para essa busca."
                : "Nenhum resultado no ranking ainda."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Posição</TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Corredor</TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Pace</TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Tempo</TableHead>
                <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Distância</TableHead>
                {source === "public" && (
                  <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Gênero</TableHead>
                )}
                {source === "audit" && (
                  <>
                    <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>Status</TableHead>
                    <TableHead className="font-medium" style={{ color: "#E0E0E0" }}>App</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow
                  key={`${source}-${item.userId}-${item.distanceMeters}-${item.position}`}
                  className="border-border hover:bg-muted/50 bg-[#262626]"
                >
                  <TableCell className="text-foreground font-medium">{item.position}º</TableCell>
                  <TableCell className="font-medium text-foreground">
                    {item.isHouseProfile ? (
                      // Perfil da casa da RunLab: aparece no app, não é corredor (sem cadastro) e não entra nas exportações.
                      <div className="flex items-center gap-3" data-perfil-da-casa title="Perfil da casa da RunLab: não concorre a nada e não entra nas exportações">
                        <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                          {item.userAvatar ? (
                            <img src={item.userAvatar} alt={item.userName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                              {item.userName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span>{item.userName}</span>
                        <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
                          {PERFIL_DA_CASA_ROTULO}
                        </Badge>
                      </div>
                    ) : (
                    <button
                      type="button"
                      data-abrir-corredor
                      onClick={() => setPerfil({ id: item.userId, nome: item.userName })}
                      className="flex items-center gap-3 text-left hover:text-primary transition-colors"
                      title="Ver perfil, contato e histórico"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                        {item.userAvatar ? (
                          <img src={item.userAvatar} alt={item.userName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                            {item.userName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="underline-offset-4 hover:underline">{item.userName}</span>
                    </button>
                    )}
                  </TableCell>
                  <TableCell className="text-foreground">{formatPace(item.paceSecondsPerKm)}</TableCell>
                  <TableCell className="text-foreground">{formatTime(item.totalTimeSeconds)}</TableCell>
                  <TableCell className="text-foreground">{formatDistanceKm(item.distanceMeters)}</TableCell>
                  {source === "public" && (
                    <TableCell className="text-foreground">{item.gender ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  )}
                  {source === "audit" && (
                    <>
                      <TableCell className="text-foreground">{mapRunState(item.state)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.publicVisibility === "visible"
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          }
                        >
                          {mapHiddenReason(item.hiddenReason)}
                        </Badge>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      />
      <CorredorPerfilSheet userId={perfil?.id ?? null} userName={perfil?.nome} onClose={() => setPerfil(null)} />
    </>
  );
};

// ─── Main Content ────────────────────────────────────────

const CompeticaoDetalhesContent = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { activeTab } = useCompeticaoDetalheTab();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rankingSource, setRankingSource] = useState<"public" | "audit">("public");
  const [publicacaoOpen, setPublicacaoOpen] = useState(false);
  const [rankingGender, setRankingGender] = useState<Genero>("");
  const [inscricoesFilters, setInscricoesFilters] = useState<InscricoesFilters>({});
  const [inscricoesPage, setInscricoesPage] = useState(1);

  const { data: competition, loading, error, refetch } = useCompetitionDetails(id);

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    try {
      if (activeTab === "inscricoes") {
        await exportRegistrationsCsv(id);
        toast.success("Inscrições exportadas com sucesso!");
      } else if (activeTab === "ranking" && rankingSource === "audit") {
        await exportAttemptsCsv(id);
        toast.success("Tentativas exportadas com sucesso!");
      } else if (activeTab === "ranking") {
        await exportRankingCsv(id, rankingGender);
        toast.success("Ranking exportado com sucesso!");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar dados");
    } finally {
      setExporting(false);
      setIsExportDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <main className="container mx-auto px-4 sm:px-6 py-8 pt-20 lg:pt-24">
        <LoadingState />
      </main>
    );
  }

  if (error || !competition) {
    return (
      <main className="container mx-auto px-4 sm:px-6 py-8 pt-20 lg:pt-24">
        <div className="mt-2 lg:mt-16 mb-8">
          <Link to="/gestao-competicoes">
            <Button
              className="gap-2 border-0 hover:brightness-90 transition-all"
              style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
            >
              <ChevronLeft className="w-5 h-5" />
              Voltar
            </Button>
          </Link>
        </div>
        <ErrorState
          message={error?.message || "Competição não encontrada"}
          onRetry={refetch}
        />
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 sm:px-6 py-8 pt-20 lg:pt-24">
      {/* Back Button and Action Buttons */}
      <div className="mt-2 lg:mt-16 mb-6 lg:mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link to="/gestao-competicoes">
          <Button
            className="gap-2 border-0 hover:brightness-90 transition-all"
            style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
          >
            <ChevronLeft className="w-5 h-5" />
            Voltar
          </Button>
        </Link>

        <div className="flex flex-wrap gap-2 sm:gap-3">
          {activeTab === "inscricoes" ? (
            <>
              <Button
                className="gap-2 border-0 hover:brightness-90 transition-all"
                style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
                onClick={() => setIsFilterDialogOpen(true)}
              >
                <Filter className="w-4 h-4" />
                Filtrar
              </Button>
              <Button
                className="gap-2 border-0 hover:brightness-90 transition-all"
                style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
                onClick={() => setIsExportDialogOpen(true)}
              >
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </>
          ) : activeTab === "ranking" ? (
            <Button
              className="gap-2 border-0 hover:brightness-90 transition-all"
              style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
              onClick={() => setIsExportDialogOpen(true)}
            >
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          ) : hasPermission("competicoes.edit") ? (
            <>
              <Button
                data-botao-publicacao
                className="gap-2 border-0 hover:brightness-90 transition-all"
                style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
                onClick={() => setPublicacaoOpen(true)}
              >
                <CalendarClock className="w-4 h-4" />
                {competition.status !== "draft"
                  ? "Publicação no app"
                  : competition.publishAt
                    ? `Programada: ${formatPublishAt(competition.publishAt)}`
                    : "Oculta no app"}
              </Button>
              <Button
                className="gap-2 border-0 hover:brightness-90 transition-all"
                style={{ backgroundColor: "#1A1A1A", color: "#CCF725" }}
                onClick={() => navigate(`/gestao-competicoes/${id}/editar`)}
              >
                <Pencil className="w-4 h-4" />
                Editar dados
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <PublicacaoAppDialog
        open={publicacaoOpen}
        competitionId={competition.id}
        competitionName={competition.title}
        isDraft={competition.status === "draft"}
        publishAt={competition.publishAt}
        inscritos={competition.stats.totalRegistrations}
        onClose={() => setPublicacaoOpen(false)}
        onDone={() => {
          setPublicacaoOpen(false);
          refetch();
        }}
      />

      {/* Breadcrumb - Only visible on Detalhes tab */}
      {activeTab === "detalhes" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8 py-2.5">
          <Link to="/gestao-competicoes" className="hover:text-foreground">
            Competições
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">{competition.title}</span>
        </div>
      )}

      {/* Tabs */}
      <CompeticaoDetalheTabs />

      {/* Tab Content */}
      {activeTab === "detalhes" && <DetalhesTab competition={competition} />}
      {activeTab === "inscricoes" && (
        <InscricoesTab
          competitionId={competition.id}
          filters={inscricoesFilters}
          page={inscricoesPage}
          onPageChange={setInscricoesPage}
        />
      )}
      {activeTab === "ranking" && (
        <RankingTab competitionId={competition.id} onSourceChange={setRankingSource} onGenderChange={setRankingGender} />
      )}

      {/* Dialogs */}
      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={handleExport}
        exporting={exporting}
      />
      <InscricoesFilterDialog
        open={isFilterDialogOpen}
        onOpenChange={setIsFilterDialogOpen}
        initialFilters={inscricoesFilters}
        onApply={(f) => {
          setInscricoesFilters(f);
          setInscricoesPage(1);
        }}
      />
    </main>
  );
};

// ─── Root Component ──────────────────────────────────────

const CompeticaoDetalhes = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <CompeticaoDetalheTabProvider>
        <CompeticaoDetalhesContent />
      </CompeticaoDetalheTabProvider>
    </div>
  );
};

export default CompeticaoDetalhes;
