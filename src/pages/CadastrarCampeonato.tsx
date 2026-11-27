import { Header } from "@/components/Header";
import { PreencherRankingField } from "@/components/PreencherRankingField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Upload, Check, CalendarIcon, CloudUpload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { localDateFromCalendar } from "@/lib/localDate";
import { PublicacaoAppCampos } from "@/components/PublicacaoAppCampos";
import { MedalhaCorridaCampos } from "@/components/MedalhaCorridaCampos";
import { KitCorridaCampos } from "@/components/KitCorridaCampos";
import { KIT_CORRIDA_VAZIO, salvarKitCorrida, type EscolhaKitCorrida } from "@/lib/kitCorrida";
import { PatrocinadoresCampos } from "@/components/PatrocinadoresCampos";
import { erroDaLista, mensagemPatrocinio, salvarPatrocinadores, type ItemPatrocinador } from "@/lib/patrocinadores";
import { erroDoArquivo, mensagemMedalha, salvarMedalha, type EscolhaMedalha } from "@/lib/medalha";
import { erroDaEscolha, escolhaIso, formatPublishAt, type EscolhaPublicacao, type ModoPublicacao } from "@/lib/publicacao";

import { listaKm, parseOutrasDistancias, rotuloKm } from "@/lib/distancias";
const formSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  descricao: z.string().optional(),
  modalidade: z.enum(["indoor", "outdoor"], { required_error: "Modalidade é obrigatória" }),
  formato: z.enum(["oficial", "patrocinada", "personalizado"], { required_error: "Formato é obrigatório" }),
  formatoObservacoes: z.string().optional(),
  /** Classificação do ranking no app (competitions.ranking_mode). */
  classificacaoRanking: z.enum(["tempo", "atividades"]).optional(),
  /** "Preencher ranking" com os perfis da casa (competitions.fill_ranking). */
  preencherRanking: z.boolean().optional(),
  campeonato: z.string().optional(),
  inscricaoInicio: z.date().optional(),
  inscricaoFim: z.date().optional(),
  competicaoInicio: z.date({ required_error: "Data da competição é obrigatória" }),
  competicaoFim: z.date().optional(),
  tipoCompeticao: z.enum(["gratuita", "paga"]).optional(),
});

type FormData = z.infer<typeof formSchema>;

const DISTANCE_METERS: Record<string, number> = {
  "3km": 3000,
  "5km": 5000,
  "10km": 10000,
  "15km": 15000,
  "21km": 21000,
  "42km": 42000,
};

function parseValorToCents(valor: string): number {
  const cleaned = valor.replace(/\s/g, "").replace(/R\$\s?/i, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

/** Formata apenas dígitos como "R$ 0,00" (máscara pt-BR). */
function formatValorMask(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const cents = parseInt(digits, 10);
  const reais = cents / 100;
  return "R$ " + reais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type ChampionshipOption = { id: string; name: string };

const CadastrarCampeonato = () => {
  const navigate = useNavigate();
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [miniBannerImage, setMiniBannerImage] = useState<string | null>(null);
  const [miniBannerFile, setMiniBannerFile] = useState<File | null>(null);
  const [championships, setChampionships] = useState<ChampionshipOption[]>([]);
  /** true depois que a pessoa mexe no "Preencher ranking" (aí o formato não muda mais a escolha). */
  const [preencherTocado, setPreencherTocado] = useState(false);
  const [championshipsLoading, setChampionshipsLoading] = useState(true);
  const [selectedDistances, setSelectedDistances] = useState<string[]>([]);
  const [outraDistancia, setOutraDistancia] = useState<string>("");
  const [tentativasIlimitadas, setTentativasIlimitadas] = useState(true);
  const [limiteInscritos, setLimiteInscritos] = useState(false);
  const [maxInscritos, setMaxInscritos] = useState<string>("");
  const [temPremiacoes, setTemPremiacoes] = useState<string>("sim");
  const [quantidadePremiacoes, setQuantidadePremiacoes] = useState<string>("");
  const [outraQuantidadePremiacoes, setOutraQuantidadePremiacoes] = useState<string>("");
  const [lotes, setLotes] = useState<
    { id: number; nome: string; valor: string; descricao: string; permitirCreditos: boolean; possuiKit: "sim" | "nao" }[]
  >([
    { id: 1, nome: "", valor: "", descricao: "", permitirCreditos: false, possuiKit: "sim" }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publicacao, setPublicacao] = useState<EscolhaPublicacao>({ modo: "now", data: "", hora: "08:00" });
  const [medalha, setMedalha] = useState<EscolhaMedalha>({ arquivo: null, nome: "", descricao: "" });
  const [kitCorrida, setKitCorrida] = useState<EscolhaKitCorrida>(KIT_CORRIDA_VAZIO);
  const [patrocinadores, setPatrocinadores] = useState<ItemPatrocinador[]>([]);
  const [documento1, setDocumento1] = useState<File | null>(null);
  const [documento2, setDocumento2] = useState<File | null>(null);
  const [documento3, setDocumento3] = useState<File | null>(null);

  const handleDocumentoChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setDoc: (file: File | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (file) setDoc(file);
  };

  const handleDocumentoDrop = (
    e: React.DragEvent,
    setDoc: (file: File | null) => void,
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setDoc(file);
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      descricao: "",
      modalidade: undefined,
      formato: undefined,
      formatoObservacoes: "",
      classificacaoRanking: "tempo",
      preencherRanking: true,
      campeonato: "",
      inscricaoInicio: undefined,
      inscricaoFim: undefined,
      competicaoInicio: undefined,
      competicaoFim: undefined,
      tipoCompeticao: "paga",
    },
  });
  const { register, handleSubmit, formState: { errors }, setValue, watch } = form;

  const setBannerFromFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setBannerImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBannerFromFile(e.target.files?.[0] ?? null);
  };

  useEffect(() => {
    (async () => {
      setChampionshipsLoading(true);
      const { data, error } = await supabase.from("championships").select("id, name").order("name");
      if (error) {
        console.error("Erro ao carregar campeonatos:", error);
        toast.error("Não foi possível carregar os campeonatos");
      }
      setChampionships((data ?? []) as ChampionshipOption[]);
      setChampionshipsLoading(false);
    })();
  }, []);

  const setMiniBannerFromFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setMiniBannerFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setMiniBannerImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleMiniBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMiniBannerFromFile(e.target.files?.[0] ?? null);
  };

  const distances = [
    { value: "3km", label: "3 km" },
    { value: "5km", label: "5 km" },
    { value: "10km", label: "10 km" },
    { value: "15km", label: "15 km" },
    { value: "21km", label: "21 km (meia-maratona)" },
    { value: "42km", label: "42 km (maratona)" },
  ];

  const toggleDistance = (distance: string) => {
    setSelectedDistances(prev =>
      prev.includes(distance)
        ? prev.filter(d => d !== distance)
        : [...prev, distance]
    );
  };


  const adicionarLote = () => {
    setLotes([...lotes, { id: lotes.length + 1, nome: "", valor: "", descricao: "", permitirCreditos: false, possuiKit: "sim" }]);
  };

  /**
   * "now" grava aberta (aparece no app); "schedule" e "hide" gravam em rascunho (oculta).
   * Na programada, publish_at entra só no fim, depois de banner, distâncias, lotes e documentos salvos,
   * para o relógio do banco nunca publicar uma corrida pela metade.
   */
  const saveCompetition = async (modo: ModoPublicacao, publishAtIso: string | null = null) => {
    const status = modo === "now" ? "open" : "draft";
    const data = form.getValues();
    const erroPatrocinio = erroDaLista(patrocinadores);
    if (erroPatrocinio) {
      toast.error(erroPatrocinio);
      return;
    }
    const erroMedalha = erroDoArquivo(medalha.arquivo);
    if (erroMedalha) {
      toast.error(`Badge da corrida: ${erroMedalha}`);
      return;
    }
    if (!data.nome?.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const hasDistance =
      selectedDistances.some((d) => d !== "outro" && DISTANCE_METERS[d]) ||
      (selectedDistances.includes("outro") && parseOutrasDistancias(outraDistancia).length > 0);
    if (!hasDistance) {
      toast.error("Selecione ao menos uma distância");
      return;
    }
    setIsSubmitting(true);
    try {
      const startsOn = localDateFromCalendar(data.competicaoInicio);
      const endsOn = data.competicaoFim
        ? localDateFromCalendar(data.competicaoFim)
        : null;
      const registrationStartsOn = data.inscricaoInicio
        ? localDateFromCalendar(data.inscricaoInicio)
        : null;
      const registrationEndsOn = data.inscricaoFim
        ? localDateFromCalendar(data.inscricaoFim)
        : null;
      const isFree = data.tipoCompeticao === "gratuita" || lotes.every((l) => parseValorToCents(l.valor) === 0);
      const championshipId =
        data.campeonato && data.campeonato !== "none" && /^[0-9a-f-]{36}$/i.test(data.campeonato) ? data.campeonato : null;
      const prizeText =
        temPremiacoes === "sim"
          ? quantidadePremiacoes === "outro"
            ? `${outraQuantidadePremiacoes || ""} premiados`.trim() || null
            : `${quantidadePremiacoes || ""} premiados`.trim() || null
          : null;
      const maxRegistrations =
        limiteInscritos && maxInscritos.trim()
          ? parseInt(maxInscritos, 10) || null
          : null;

      const { data: comp, error: compError } = await supabase
        .from("competitions")
        .insert({
          title: data.nome.trim(),
          subtitle: null,
          location_name: null,
          starts_on: startsOn,
          ends_on: endsOn,
          registration_starts_on: registrationStartsOn,
          registration_ends_on: registrationEndsOn,
          mode: data.modalidade ?? "outdoor",
          format_type: data.formato ?? "oficial",
          format_observations: data.formato === "personalizado" ? (data.formatoObservacoes?.trim() || null) : null,
          ranking_mode: data.classificacaoRanking ?? "tempo",
          fill_ranking: data.preencherRanking ?? data.formato !== "personalizado",
          status,
          is_free: isFree,
          cover_image_url: null,
          description: data.descricao?.trim() || null,
          prize_description: prizeText || null,
          competition_sponsors: null,
          championship_id: championshipId,
          unlimited_attempts: tentativasIlimitadas,
          max_registrations: maxRegistrations,
        })
        .select("id")
        .single();

      if (compError) throw compError;
      const competitionId = comp.id;

      let coverImageUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      const contentType = (file: File) => file.type?.startsWith("image/") ? file.type : "image/jpeg";

      if (bannerFile) {
        const ext = bannerFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `competitions/${competitionId}/cover.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sistema")
          .upload(path, bannerFile, { contentType: contentType(bannerFile) });
        if (uploadError) {
          toast.error("Erro ao enviar banner da competição", { description: uploadError.message });
          throw new Error(`Banner: ${uploadError.message}`);
        }
        const { data: urlData } = supabase.storage.from("sistema").getPublicUrl(path);
        coverImageUrl = urlData.publicUrl;
      }

      if (miniBannerFile) {
        const ext = miniBannerFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `competitions/${competitionId}/thumbnail.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sistema")
          .upload(path, miniBannerFile, { contentType: contentType(miniBannerFile) });
        if (uploadError) {
          toast.error("Erro ao enviar mini banner", { description: uploadError.message });
          throw new Error(`Mini banner: ${uploadError.message}`);
        }
        const { data: urlData } = supabase.storage.from("sistema").getPublicUrl(path);
        thumbnailUrl = urlData.publicUrl;
      }

      if (coverImageUrl !== null || thumbnailUrl !== null) {
        const updatePayload: { cover_image_url?: string | null; thumbnail_url?: string | null } = {};
        if (coverImageUrl !== null) updatePayload.cover_image_url = coverImageUrl;
        if (thumbnailUrl !== null) updatePayload.thumbnail_url = thumbnailUrl;
        const { error: updateError } = await supabase.from("competitions").update(updatePayload).eq("id", competitionId);
        if (updateError) {
          toast.error("Erro ao salvar URLs dos banners", { description: updateError.message });
          throw new Error(`Salvar URLs dos banners: ${updateError.message}`);
        }
      }

      const distanceRows: { competition_id: string; label: string; meters: number; sort_order: number }[] = [];
      // "Outro" aceita várias distâncias ("2, 4, 6"): cada uma vira uma linha, na ordem digitada.
      selectedDistances.forEach((d) => {
        if (d === "outro") {
          for (const km of parseOutrasDistancias(outraDistancia)) {
            if (distanceRows.some((r) => r.meters === Math.round(km * 1000))) continue;
            distanceRows.push({ competition_id: competitionId, label: rotuloKm(km), meters: Math.round(km * 1000), sort_order: distanceRows.length });
          }
        } else if (DISTANCE_METERS[d]) {
          if (distanceRows.some((r) => r.meters === DISTANCE_METERS[d])) return;
          distanceRows.push({ competition_id: competitionId, label: d, meters: DISTANCE_METERS[d], sort_order: distanceRows.length });
        }
      });
      if (distanceRows.length > 0) {
        const { error: distError } = await supabase.from("competition_distances").insert(distanceRows);
        if (distError) throw distError;
      }

      const lotRows = lotes
        .filter((l) => l.nome.trim() || l.valor || l.descricao.trim())
        .map((l, i) => ({
          competition_id: competitionId,
          name: l.nome.trim() || `Lote ${i + 1}`,
          description: l.descricao.trim() || null,
          price_cents: parseValorToCents(l.valor),
          currency: "BRL",
          starts_at: null,
          ends_at: null,
          is_subscription_allowed: l.permitirCreditos,
          is_active: true,
          sort_order: i,
          has_kit: l.possuiKit === "sim",
        }));
      if (lotRows.length > 0) {
        const { error: lotError } = await supabase.from("competition_lots").insert(lotRows);
        if (lotError) throw lotError;
      }

      // Upload de documentos opcionais (até 3).
      const docFiles = [documento1, documento2, documento3].filter(
        (f): f is File => f != null,
      );
      for (let i = 0; i < docFiles.length; i++) {
        const file = docFiles[i];
        const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
        const path = `competitions/${competitionId}/documents/${Date.now()}-${i}.${ext}`;
        const { error: uploadDocError } = await supabase.storage
          .from("sistema")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
          });
        if (uploadDocError) throw uploadDocError;
        const { data: urlData } = supabase.storage
          .from("sistema")
          .getPublicUrl(path);
        const { error: insertDocError } = await supabase
          .from("competition_documents")
          .insert({
            competition_id: competitionId,
            title: file.name,
            file_url: urlData.publicUrl,
            sort_order: i,
          });
        if (insertDocError) throw insertDocError;
      }

      // Kit da corrida (peças físicas): camiseta própria e medalha do kit, se definidas.
      if (kitCorrida.camisetaId || kitCorrida.medalhaId) {
        try {
          await salvarKitCorrida(competitionId, kitCorrida);
        } catch (e) {
          toast.error("Corrida salva, mas o kit da corrida não foi gravado", {
            description: `${e instanceof Error ? e.message : ""} Dá para definir depois em Editar.`,
          });
        }
      }

      // Patrocinadores (opcional): depois da corrida salva.
      if (patrocinadores.length > 0) {
        try {
          await salvarPatrocinadores(competitionId, patrocinadores);
        } catch (e) {
          toast.error("Corrida salva, mas os patrocinadores não", {
            description: `${mensagemPatrocinio(e)} Dá para cadastrar depois em Editar.`,
          });
        }
      }

      // Medalha da corrida (opcional): depois da corrida salva, antes da data de publicação.
      if (medalha.arquivo) {
        try {
          await salvarMedalha(competitionId, medalha, data.nome);
        } catch (e) {
          toast.error("Corrida salva, mas o badge não foi cadastrado", {
            description: `${mensagemMedalha(e)} Dá para cadastrar depois em Editar.`,
          });
        }
      }

      if (modo === "schedule" && publishAtIso) {
        const { error: publishAtError } = await supabase
          .from("competitions")
          .update({ publish_at: publishAtIso })
          .eq("id", competitionId);
        if (publishAtError) {
          toast.error("Competição salva oculta, mas a programação não foi gravada", {
            description: "Use \"Publicação no app\" no menu da corrida para programar.",
          });
          navigate("/gestao-competicoes");
          return;
        }
      }

      toast.success(
        modo === "now"
          ? "Competição publicada!"
          : modo === "schedule"
            ? `Competição programada para ${formatPublishAt(publishAtIso)}`
            : "Rascunho salvo! A corrida está oculta no app.",
      );
      navigate("/gestao-competicoes");
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : String(e);
      console.error("Erro ao salvar competição:", e);
      toast.error("Erro ao salvar competição", { description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSalvarRascunho = () => {
    saveCompetition("hide");
  };

  const onSubmit = (data: FormData) => {
    const erro = erroDaEscolha(publicacao);
    if (erro) {
      toast.error(erro);
      return;
    }
    saveCompetition(publicacao.modo, escolhaIso(publicacao));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 sm:px-6 py-8 pt-20 lg:pt-24">
        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/gestao-competicoes")}
            className="bg-[#171717] text-[#CCF725] hover:brightness-90 border-0"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button type="button" variant="ghost" className="bg-[#171717] text-[#CCF725] hover:brightness-90 border-0" onClick={handleSalvarRascunho} disabled={isSubmitting}>
            <Check className="h-4 w-4 mr-2" />
            Salvar rascunho
          </Button>
        </div>

        {/* Breadcrumb */}
        <div className="text-sm text-muted-foreground mb-8">
          Competições &gt; Nova competição
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Dados básicos */}
          <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Dados básicos</h2>
            
            <div className="space-y-6">
              {/* Nome da competição */}
              <div>
                <Label htmlFor="nome" className="text-foreground">
                  Nome da competição
                </Label>
                <Input
                  id="nome"
                  {...register("nome")}
                  placeholder="Corrida Azevio 10K - Etapa São Paulo"
                  className="mt-2"
                />
                {errors.nome && (
                  <p className="text-destructive text-sm mt-1">{errors.nome.message}</p>
                )}
              </div>

              {/* Descrição */}
              <div>
                <Label htmlFor="descricao" className="text-foreground">
                  Descrição
                </Label>
                <Textarea
                  id="descricao"
                  {...register("descricao")}
                  placeholder="Insira a descrição aqui..."
                  className="mt-2 min-h-[120px]"
                />
                {errors.descricao && (
                  <p className="text-destructive text-sm mt-1">{errors.descricao.message}</p>
                )}
              </div>

              {/* Modalidade e Formato */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modalidade" className="text-foreground">
                    Modalidade
                  </Label>
                  <Select value={watch("modalidade")} onValueChange={(value) => setValue("modalidade", value as "indoor" | "outdoor")}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Selecione a modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indoor">Indoor</SelectItem>
                      <SelectItem value="outdoor">Outdoor</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.modalidade && (
                    <p className="text-destructive text-sm mt-1">{errors.modalidade.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="formato" className="text-foreground">
                    Formato
                  </Label>
                  <Select
                    value={watch("formato")}
                    onValueChange={(value) => {
                      setValue("formato", value as "oficial" | "patrocinada" | "personalizado");
                      // Padrão do "Preencher ranking": sim nas corridas da RunLab, não nas personalizadas de parceiros
                      // (só enquanto ninguém mexeu no campo).
                      if (!preencherTocado) setValue("preencherRanking", value !== "personalizado");
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Selecione o formato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oficial">Oficial</SelectItem>
                      <SelectItem value="patrocinada">Patrocinada</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.formato && (
                    <p className="text-destructive text-sm mt-1">{errors.formato.message}</p>
                  )}
                </div>
              </div>

              {/* Observações do formato (apenas para Personalizado) */}
              {watch("formato") === "personalizado" && (
                <div>
                  <Label htmlFor="formatoObservacoes" className="text-foreground">
                    Observações do formato
                  </Label>
                  <Textarea
                    id="formatoObservacoes"
                    {...register("formatoObservacoes")}
                    placeholder="Descreva os detalhes do formato personalizado..."
                    className="mt-2 min-h-[100px]"
                  />
                </div>
              )}

              {/* Classificação do ranking no app (competitions.ranking_mode) */}
              <div>
                <Label htmlFor="classificacaoRanking" className="text-foreground">
                  Classificação do ranking
                </Label>
                <Select value={watch("classificacaoRanking") ?? "tempo"} onValueChange={(value) => setValue("classificacaoRanking", value as "tempo" | "atividades")}>
                  <SelectTrigger id="classificacaoRanking" className="mt-2" data-classificacao-ranking>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tempo">Mais rápido</SelectItem>
                    <SelectItem value="atividades">Mais atividades concluídas</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {watch("classificacaoRanking") === "atividades"
                    ? "Fica na frente quem concluir mais atividades na corrida (todas as distâncias juntas). Empate: mais km somados e, depois, quem terminou antes a última atividade."
                    : "Fica na frente o menor tempo, em cada distância."}
                </p>
              </div>

              {/* Preencher ranking com os perfis da casa (competitions.fill_ranking) */}
              <PreencherRankingField
                value={watch("preencherRanking") ?? true}
                onChange={(v) => {
                  setPreencherTocado(true);
                  setValue("preencherRanking", v);
                }}
                temCampeonato={!!watch("campeonato") && watch("campeonato") !== "none"}
                rankingPorAtividades={watch("classificacaoRanking") === "atividades"}
              />

              {/* Banners */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Banner da competição */}
                <div className="bg-[#1A1A1A] p-4 sm:p-6 rounded-lg">
                  <Label className="text-foreground">Banner da competição</Label>
                  <div
                    className="mt-4 bg-[#262626] border-2 border-dashed border-[#CCF725] rounded-lg p-5 sm:p-8 text-center hover:border-[#CCF725]/80 transition-colors cursor-pointer"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "true"); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.removeAttribute("data-drag"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.removeAttribute("data-drag");
                      const file = e.dataTransfer.files?.[0];
                      if (file) setBannerFromFile(file);
                    }}
                  >
                    <input
                      type="file"
                      id="banner"
                      accept="image/*"
                      onChange={handleBannerUpload}
                      className="hidden"
                    />
                    <label htmlFor="banner" className="cursor-pointer block">
                      {bannerImage ? (
                        <img src={bannerImage} alt="Banner" className="max-h-32 mx-auto" />
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-[#171717] rounded-full flex items-center justify-center mx-auto mb-3">
                            <Upload className="h-6 w-6 text-[#CCF725]" />
                          </div>
                          <p className="text-sm text-[#CCF725] mb-3">
                            Arraste e solte o arquivo aqui
                          </p>
                          {/* span (asChild): um <button> dentro do <label> não abre o seletor de arquivo no navegador */}
                          <Button asChild variant="outline" size="sm" className="cursor-pointer border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725]/10">
                            <span>Procurar arquivo</span>
                          </Button>
                          <p className="text-xs text-muted-foreground mt-3">
                            Recomendado: 1200 x 600 px, JPG ou PNG, até 2 MB
                          </p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {/* Mini banner */}
                <div className="bg-[#1A1A1A] p-4 sm:p-6 rounded-lg">
                  <Label className="text-foreground">
                    Mini banner <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <div
                    className="mt-4 bg-[#262626] border-2 border-dashed border-[#CCF725] rounded-lg p-5 sm:p-8 text-center hover:border-[#CCF725]/80 transition-colors cursor-pointer"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "true"); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.removeAttribute("data-drag"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.removeAttribute("data-drag");
                      const file = e.dataTransfer.files?.[0];
                      if (file) setMiniBannerFromFile(file);
                    }}
                  >
                    <input
                      type="file"
                      id="miniBanner"
                      accept="image/*"
                      onChange={handleMiniBannerUpload}
                      className="hidden"
                    />
                    <label htmlFor="miniBanner" className="cursor-pointer block">
                      {miniBannerImage ? (
                        <img src={miniBannerImage} alt="Mini Banner" className="max-h-32 mx-auto" />
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-[#171717] rounded-full flex items-center justify-center mx-auto mb-3">
                            <Upload className="h-6 w-6 text-[#CCF725]" />
                          </div>
                          <p className="text-sm text-[#CCF725] mb-3">
                            Arraste e solte o arquivo aqui
                          </p>
                          {/* span (asChild): um <button> dentro do <label> não abre o seletor de arquivo no navegador */}
                          <Button asChild variant="outline" size="sm" className="cursor-pointer border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725]/10">
                            <span>Procurar arquivo</span>
                          </Button>
                          <p className="text-xs text-muted-foreground mt-3">
                            Recomendado: 400 x 400 px, JPG ou PNG, até 1 MB
                          </p>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* Vincular campeonato */}
              <div>
                <Label htmlFor="campeonato" className="text-foreground">
                  Vincular campeonato <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  value={watch("campeonato") ?? ""}
                  onValueChange={(value) => setValue("campeonato", value)}
                  disabled={championshipsLoading}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue
                      placeholder={
                        championshipsLoading
                          ? "Carregando..."
                          : championships.length === 0
                            ? "Nenhum campeonato cadastrado"
                            : "Selecione o campeonato a ser vinculado"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {championships.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!championshipsLoading && championships.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cadastre campeonatos na aba &quot;Campeonatos&quot; da Gestão de competições para vinculá-los aqui.
                  </p>
                )}
              </div>

              {/* Distâncias permitidas */}
              <div>
                <Label className="text-foreground">Distância(s) permitida(s)</Label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {distances.map((distance) => (
                    <Button
                      key={distance.value}
                      type="button"
                      variant={selectedDistances.includes(distance.value) ? "default" : "outline"}
                      onClick={() => toggleDistance(distance.value)}
                      className="rounded-full"
                    >
                      {distance.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant={selectedDistances.includes("outro") ? "default" : "outline"}
                    onClick={() => toggleDistance("outro")}
                    className="rounded-full"
                  >
                    Outro
                  </Button>
                </div>
                {selectedDistances.includes("outro") && (
                  <>
                    <Input
                      placeholder="Ex.: 2, 4, 6 (em km)"
                      className="mt-3"
                      value={outraDistancia}
                      onChange={(e) => setOutraDistancia(e.target.value)}
                      data-outras-distancias
                    />
                    <p className="text-xs text-[#CCF725] mt-2" data-previa-distancias>
                      {parseOutrasDistancias(outraDistancia).length > 0
                        ? `Vai criar: ${listaKm(parseOutrasDistancias(outraDistancia))}`
                        : "Digite uma ou mais distâncias em km, separadas por vírgula."}
                    </p>
                  </>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Para outras distâncias, escolha Outro. Pode digitar várias, separadas por vírgula (2, 4, 6); para decimal, use ponto (7.5).
                </p>
              </div>
            </div>
          </div>

          {/* Período */}
          <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Período</h2>
            
            <div className="space-y-6">
              {/* Período de inscrições */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <Label className="text-foreground">Período de inscrições</Label>
                  <p className="text-sm text-red-500">Inscrições encerram às 23h59 do dia final.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !watch("inscricaoInicio") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {watch("inscricaoInicio") ? format(watch("inscricaoInicio")!, "dd/MM/yyyy") : "De: DD/MM/AAAA"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={watch("inscricaoInicio") ?? undefined}
                          onSelect={(d) => setValue("inscricaoInicio", d ?? undefined)}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !watch("inscricaoFim") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {watch("inscricaoFim") ? format(watch("inscricaoFim")!, "dd/MM/yyyy") : "Até: DD/MM/AAAA"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={watch("inscricaoFim") ?? undefined}
                          onSelect={(d) => setValue("inscricaoFim", d ?? undefined)}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Período da competição */}
              <div>
                <Label className="text-foreground mb-2 block">Período da competição</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !watch("competicaoInicio") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {watch("competicaoInicio") ? format(watch("competicaoInicio")!, "dd/MM/yyyy") : "De: DD/MM/AAAA"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={watch("competicaoInicio") ?? undefined}
                          onSelect={(d) => setValue("competicaoInicio", d ?? undefined)}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !watch("competicaoFim") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {watch("competicaoFim") ? format(watch("competicaoFim")!, "dd/MM/yyyy") : "Até: DD/MM/AAAA"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={watch("competicaoFim") ?? undefined}
                          onSelect={(d) => setValue("competicaoFim", d ?? undefined)}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Regras */}
          <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Regras</h2>
            
            <div className="space-y-6">
              {/* Tentativas ilimitadas */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="tentativasIlimitadas"
                  checked={tentativasIlimitadas}
                  onCheckedChange={(checked) => setTentativasIlimitadas(checked as boolean)}
                />
                <Label
                  htmlFor="tentativasIlimitadas"
                  className="text-foreground font-normal cursor-pointer"
                >
                  Tentativas ilimitadas
                </Label>
              </div>

              {/* Número máximo de inscritos */}
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <Checkbox
                    id="limiteInscritos"
                    checked={limiteInscritos}
                    onCheckedChange={(checked) => setLimiteInscritos(checked as boolean)}
                  />
                  <Label
                    htmlFor="limiteInscritos"
                    className="text-foreground font-normal cursor-pointer"
                  >
                    Número máximo de inscritos
                  </Label>
                </div>
                {limiteInscritos && (
                  <Input
                    type="number"
                    placeholder="Ex: 100"
                    className="mt-2"
                    value={maxInscritos}
                    onChange={(e) => setMaxInscritos(e.target.value)}
                    min={1}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Premiações */}
          <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Premiações</h2>
            
            <div className="space-y-6">
              {/* Sim/Não Radio */}
              <RadioGroup value={temPremiacoes} onValueChange={setTemPremiacoes} className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="premiacoes-sim" />
                  <Label htmlFor="premiacoes-sim" className="text-foreground font-normal cursor-pointer">
                    Sim
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="premiacoes-nao" />
                  <Label htmlFor="premiacoes-nao" className="text-foreground font-normal cursor-pointer">
                    Não
                  </Label>
                </div>
              </RadioGroup>

              {/* Opções de quantidade - só aparecem se "Sim" */}
              {temPremiacoes === "sim" && (
                <div>
                  <Label className="text-foreground mb-3 block">
                    Nº de pessoas que poderão ganhar recompensa
                  </Label>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant={quantidadePremiacoes === "1-5" ? "default" : "outline"}
                      onClick={() => setQuantidadePremiacoes("1-5")}
                      className="rounded-full"
                    >
                      1–5
                    </Button>
                    <Button
                      type="button"
                      variant={quantidadePremiacoes === "6-10" ? "default" : "outline"}
                      onClick={() => setQuantidadePremiacoes("6-10")}
                      className="rounded-full"
                    >
                      6–10
                    </Button>
                    <Button
                      type="button"
                      variant={quantidadePremiacoes === "11-20" ? "default" : "outline"}
                      onClick={() => setQuantidadePremiacoes("11-20")}
                      className="rounded-full"
                    >
                      11–20
                    </Button>
                    <Button
                      type="button"
                      variant={quantidadePremiacoes === "outro" ? "default" : "outline"}
                      onClick={() => setQuantidadePremiacoes("outro")}
                      className="rounded-full"
                    >
                      Outro
                    </Button>
                  </div>
                  
                  {/* Input só aparece quando "Outro" está selecionado */}
                  {quantidadePremiacoes === "outro" && (
                    <Input
                      placeholder="Insira outra quantidade"
                      className="mt-3"
                      type="text"
                      value={outraQuantidadePremiacoes}
                      onChange={(e) => setOutraQuantidadePremiacoes(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Inscrição e checkout */}
          <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Inscrição e checkout</h2>
            
            <div className="space-y-6">
              {/* Tipo de competição */}
              <div>
                <Label htmlFor="tipoCompeticao" className="text-foreground">
                  Tipo de competição
                </Label>
                <Select value={watch("tipoCompeticao") ?? ""} onValueChange={(v) => setValue("tipoCompeticao", v as "gratuita" | "paga")}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione: Gratuita ou Paga" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gratuita">Gratuita</SelectItem>
                    <SelectItem value="paga">Paga</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {watch("tipoCompeticao") === "paga" && (
                <>
                  {/* Lotes dinâmicos */}
                  {lotes.map((lote, index) => (
                    <div key={lote.id}>
                      {index > 0 && <div className="border-t border-border mb-6" />}
                      <div className="space-y-4">
                        {/* Possuir Kit Incluso */}
                        <div>
                          <Label className="text-foreground text-sm mb-2 block">Possuir Kit Incluso?</Label>
                          <RadioGroup
                            value={lote.possuiKit}
                            onValueChange={(value) => {
                              const novosLotes = [...lotes];
                              novosLotes[index].possuiKit = value as "sim" | "nao";
                              setLotes(novosLotes);
                            }}
                            className="flex gap-6"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="sim" id={`kit-sim-${lote.id}`} />
                              <Label htmlFor={`kit-sim-${lote.id}`} className="text-foreground font-normal cursor-pointer">
                                Sim
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="nao" id={`kit-nao-${lote.id}`} />
                              <Label htmlFor={`kit-nao-${lote.id}`} className="text-foreground font-normal cursor-pointer">
                                Não
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>

                        {/* Nome do lote */}
                        <div>
                          <Label className="text-foreground text-sm">
                            Nome do lote {index + 1}
                          </Label>
                          <Input
                            placeholder={index === 0 ? "Ex.: Inscrição avulsa" : "Ex.: Inscrição com kit"}
                            className="mt-2"
                            value={lote.nome}
                            onChange={(e) => {
                              const novosLotes = [...lotes];
                              novosLotes[index].nome = e.target.value;
                              setLotes(novosLotes);
                            }}
                          />
                        </div>

                        {/* Valor */}
                        <div>
                          <Input
                            type="text"
                            placeholder="R$ 0,00"
                            value={lote.valor}
                            onChange={(e) => {
                              const novosLotes = [...lotes];
                              novosLotes[index].valor = formatValorMask(e.target.value);
                              setLotes(novosLotes);
                            }}
                          />
                        </div>

                        {/* Descrição */}
                        <div>
                          <Label className="text-foreground text-sm mb-2 block">Descrição</Label>
                          <Textarea
                            placeholder="Ex.: Medalha garantida a todos os inscritos"
                            className="min-h-[100px]"
                            value={lote.descricao}
                            onChange={(e) => {
                              const novosLotes = [...lotes];
                              novosLotes[index].descricao = e.target.value;
                              setLotes(novosLotes);
                            }}
                          />
                        </div>

                        {/* Permitir compra com créditos */}
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`creditos-${lote.id}`}
                            checked={lote.permitirCreditos}
                            onCheckedChange={(checked) => {
                              const novosLotes = [...lotes];
                              novosLotes[index].permitirCreditos = checked as boolean;
                              setLotes(novosLotes);
                            }}
                          />
                          <Label
                            htmlFor={`creditos-${lote.id}`}
                            className="text-foreground text-sm font-normal cursor-pointer"
                          >
                            Permitir compra com créditos de assinatura
                          </Label>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Botão adicionar opção */}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={adicionarLote}
                      className="border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725]/10"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar opção de valor
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Documentos */}
          <div className="space-y-6 bg-card border border-border/50 rounded-2xl p-5 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-6">Documentos (opcional)</h2>
            <p className="text-sm text-muted-foreground -mt-4 mb-2">
              Envie até 3 documentos (regulamento, edital, etc). Eles ficam disponíveis para download no app.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { file: documento1, setter: setDocumento1, key: "documento1" },
                { file: documento2, setter: setDocumento2, key: "documento2" },
                { file: documento3, setter: setDocumento3, key: "documento3" },
              ].map(({ file, setter, key }) => (
                <div
                  key={key}
                  className="relative rounded-[20px] bg-[#1A1A1A] p-5 sm:p-8 flex flex-col items-center justify-center gap-3 min-h-[200px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDocumentoDrop(e, setter)}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "#CCF725" }}
                  >
                    <CloudUpload className="w-6 h-6" style={{ color: "#1A1A1A" }} />
                  </div>
                  <p className="text-xs text-center" style={{ color: "#CCF725" }}>
                    Arraste e solte o arquivo aqui
                  </p>
                  <input
                    type="file"
                    id={`${key}-upload`}
                    className="hidden"
                    onChange={(e) => handleDocumentoChange(e, setter)}
                  />
                  <label htmlFor={`${key}-upload`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725] hover:text-[#1A1A1A] bg-transparent text-xs"
                      asChild
                    >
                      <span>Procurar arquivo</span>
                    </Button>
                  </label>
                  {file && (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-xs text-[#CCF725] truncate max-w-[120px]">{file.name}</p>
                      <button
                        type="button"
                        onClick={() => setter(null)}
                        className="w-5 h-5 rounded-full flex items-center justify-center hover:brightness-90"
                        style={{ backgroundColor: "#CCF725" }}
                      >
                        <X className="w-3 h-3" style={{ color: "#1A1A1A" }} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Kit da corrida (peças físicas) */}
          <div className="space-y-6 bg-card border border-border/50 rounded-2xl p-5 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-2">Kit da corrida (peças físicas)</h2>
            <p className="text-sm text-muted-foreground -mt-1 mb-2">
              Vale para as inscrições com kit desta corrida: a camiseta e a medalha que vão na caixa.
            </p>
            <KitCorridaCampos value={kitCorrida} onChange={setKitCorrida} disabled={isSubmitting} />
          </div>

          {/* Patrocinadores */}
          <div className="space-y-6 bg-card border border-border/50 rounded-2xl p-5 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-6">Patrocinadores (opcional)</h2>
            <PatrocinadoresCampos itens={patrocinadores} onChange={setPatrocinadores} disabled={isSubmitting} />
          </div>

          {/* Badge da corrida (não é a medalha física) */}
          <div className="space-y-6 bg-card border border-border/50 rounded-2xl p-5 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-6">Badge da corrida (opcional)</h2>
            <MedalhaCorridaCampos value={medalha} onChange={setMedalha} tituloCorrida={watch("nome") ?? ""} disabled={isSubmitting} />
          </div>

          {/* Publicação no app */}
          <div className="space-y-6 bg-card border border-border/50 rounded-2xl p-5 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-6">Publicação no app</h2>
            <p className="text-sm text-muted-foreground -mt-4 mb-2">
              Quando a corrida aparece no app e no site de compra.
            </p>
            <PublicacaoAppCampos value={publicacao} onChange={setPublicacao} disabled={isSubmitting} />
          </div>

          {/* Botão final */}
          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              className="bg-[#CCF725] text-[#171717] hover:bg-[#CCF725]/90 font-semibold px-8"
              disabled={isSubmitting}
            >
              <Check className="h-4 w-4 mr-2" />
              {isSubmitting
                ? "Salvando..."
                : publicacao.modo === "now"
                  ? "Salvar e publicar"
                  : publicacao.modo === "schedule"
                    ? "Salvar e programar"
                    : "Salvar oculta"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default CadastrarCampeonato;
