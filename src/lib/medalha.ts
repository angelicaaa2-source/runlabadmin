/**
 * Medalha (badge) da corrida: quem conclui uma tentativa na corrida ganha (gatilho no banco) e ela aparece em
 * Recompensas no app, só para quem ganhou. Usa admin_set_competition_badge e admin_remove_competition_badge.
 */
import { supabase } from "@/lib/supabase";

export type EscolhaMedalha = { arquivo: File | null; nome: string; descricao: string };

export type MedalhaAtual = {
  id: string;
  name: string;
  description: string | null;
  image_url: string;
  is_active: boolean;
  total: number;
};

export const MEDALHA_TIPOS = ["image/png", "image/jpeg", "image/webp"];
export const MEDALHA_MAX_BYTES = 2 * 1024 * 1024;

export const MEDALHA_ERROS: [string, string][] = [
  ["FORBIDDEN", "Você não tem permissão para cadastrar a medalha da corrida."],
  ["IMAGE_REQUIRED", "Escolha a imagem da medalha."],
  ["NAME_INVALID", "O nome da medalha precisa ter de 3 a 60 letras."],
  ["DESCRIPTION_TOO_LONG", "A descrição pode ter no máximo 200 letras."],
];

export function mensagemMedalha(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  const achou = MEDALHA_ERROS.find(([k]) => msg.includes(k));
  return achou ? achou[1] : msg || "Tente de novo.";
}

/** Erro do arquivo escolhido (tipo e tamanho), ou null. */
export function erroDoArquivo(f: File | null): string | null {
  if (!f) return null;
  if (!MEDALHA_TIPOS.includes(f.type)) return "Use PNG, JPG ou WebP.";
  if (f.size > MEDALHA_MAX_BYTES) return "A imagem pode ter no máximo 2 MB.";
  return null;
}

export async function carregarMedalha(competitionId: string): Promise<MedalhaAtual | null> {
  const { data, error } = await supabase
    .from("badges")
    .select("id, name, description, image_url, is_active")
    .eq("competition_id", competitionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const b = data as Omit<MedalhaAtual, "total">;
  const { count } = await supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("badge_id", b.id);
  return { ...b, total: count ?? 0 };
}

/** true quando há algo para salvar (imagem nova, ou nome/descrição diferentes da medalha atual). */
export function medalhaMudou(e: EscolhaMedalha, atual: MedalhaAtual | null): boolean {
  if (e.arquivo) return true;
  if (!atual) return false;
  return e.nome.trim() !== atual.name || e.descricao.trim() !== (atual.description ?? "");
}

/**
 * Envia a imagem (se houver) e cria ou atualiza a medalha. Devolve quantos atletas ganharam agora
 * (quem já tinha concluído uma tentativa na corrida).
 */
export async function salvarMedalha(
  competitionId: string,
  e: EscolhaMedalha,
  tituloCorrida: string,
): Promise<{ awarded_now: number; total_awarded: number; created: boolean }> {
  let imageUrl: string | null = null;
  if (e.arquivo) {
    const ext = e.arquivo.type === "image/png" ? "png" : e.arquivo.type === "image/webp" ? "webp" : "jpg";
    const path = `competitions/${competitionId}/medalha-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("sistema").upload(path, e.arquivo, { contentType: e.arquivo.type });
    if (upErr) throw new Error(`Falha ao enviar a imagem da medalha: ${upErr.message}`);
    imageUrl = supabase.storage.from("sistema").getPublicUrl(path).data.publicUrl;
  }
  const nome = (e.nome.trim() || tituloCorrida.trim()).slice(0, 60);
  const { data, error } = await supabase.rpc("admin_set_competition_badge", {
    p_competition_id: competitionId,
    p_name: nome,
    p_description: e.descricao.trim() || null,
    p_image_url: imageUrl,
  });
  if (error) throw error;
  return data as { awarded_now: number; total_awarded: number; created: boolean };
}

export async function removerMedalha(competitionId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_remove_competition_badge", { p_competition_id: competitionId });
  if (error) throw error;
}
