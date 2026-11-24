/**
 * Patrocinadores da corrida: cada corrida tem os seus (logo, nome e link), gravados de uma vez pela
 * admin_set_competition_sponsors. O app mostra os nomes no card do feed e os logos na página da corrida; o link
 * fica salvo e só vira clicável numa próxima versão do app.
 */
import { supabase } from "@/lib/supabase";

export type ItemPatrocinador = {
  chave: string;
  id: string | null;
  nome: string;
  link: string;
  logoUrl: string | null;
  arquivo: File | null;
};

export const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_MAX_BYTES = 1024 * 1024;
export const MAX_PATROCINADORES = 12;

let contador = 0;
export function novoItem(): ItemPatrocinador {
  contador += 1;
  return { chave: `novo-${Date.now()}-${contador}`, id: null, nome: "", link: "", logoUrl: null, arquivo: null };
}

/** "www.marca.com" vira "https://www.marca.com"; vazio continua vazio. */
export function normalizaLink(link: string): string {
  const l = link.trim();
  if (!l) return "";
  return /^https?:\/\//i.test(l) ? l : `https://${l}`;
}

export function erroDoItem(item: ItemPatrocinador): string | null {
  if (!item.nome.trim()) return "Escreva o nome da marca.";
  if (item.nome.trim().length > 60) return "O nome pode ter no máximo 60 letras.";
  const link = normalizaLink(item.link);
  if (link && (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link) || link.length > 500)) return "Link inválido. Ex.: https://www.marca.com.br";
  if (item.arquivo && !LOGO_TIPOS.includes(item.arquivo.type)) return "Logo em PNG, JPG ou WebP.";
  if (item.arquivo && item.arquivo.size > LOGO_MAX_BYTES) return "O logo pode ter no máximo 1 MB.";
  return null;
}

/** Primeiro erro da lista, já com a posição ("Patrocinador 2: ..."), ou null. */
export function erroDaLista(itens: ItemPatrocinador[]): string | null {
  if (itens.length > MAX_PATROCINADORES) return `No máximo ${MAX_PATROCINADORES} patrocinadores por corrida.`;
  for (let i = 0; i < itens.length; i++) {
    const e = erroDoItem(itens[i]);
    if (e) return `Patrocinador ${i + 1}: ${e}`;
  }
  return null;
}

/** Retrato da lista para saber se mudou desde que abriu a tela. */
export function assinatura(itens: ItemPatrocinador[]): string {
  return JSON.stringify(
    itens.map((i) => [i.id, i.nome.trim(), normalizaLink(i.link), i.logoUrl, i.arquivo ? `${i.arquivo.name}:${i.arquivo.size}` : null]),
  );
}

export async function carregarPatrocinadores(competitionId: string): Promise<ItemPatrocinador[]> {
  const { data: comp, error } = await supabase
    .from("competitions")
    .select("competition_sponsors")
    .eq("id", competitionId)
    .single();
  if (error) throw error;
  const ids = ((comp as { competition_sponsors: string[] | null }).competition_sponsors ?? []).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: rows, error: e2 } = await supabase
    .from("competition_sponsors")
    .select("id, name, logo_url, link_url")
    .in("id", ids);
  if (e2) throw e2;
  const porId = new Map(((rows ?? []) as { id: string; name: string; logo_url: string | null; link_url: string | null }[]).map((r) => [r.id, r]));
  return ids
    .map((id) => porId.get(id))
    .filter((r): r is { id: string; name: string; logo_url: string | null; link_url: string | null } => !!r)
    .map((r) => ({ chave: r.id, id: r.id, nome: r.name, link: r.link_url ?? "", logoUrl: r.logo_url, arquivo: null }));
}

export const PATROCINIO_ERROS: [string, string][] = [
  ["FORBIDDEN", "Você não tem permissão para editar os patrocinadores."],
  ["NAME_INVALID", "Todo patrocinador precisa de nome (até 60 letras)."],
  ["LINK_INVALID", "Algum link está inválido. Use o endereço completo, ex.: https://www.marca.com.br"],
  ["LOGO_INVALID", "Não foi possível usar o logo enviado. Tente de novo."],
  ["TOO_MANY", `No máximo ${MAX_PATROCINADORES} patrocinadores por corrida.`],
];

export function mensagemPatrocinio(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  const achou = PATROCINIO_ERROS.find(([k]) => msg.includes(k));
  return achou ? achou[1] : msg || "Tente de novo.";
}

/** Envia os logos novos e grava a lista inteira (na ordem) da corrida. */
export async function salvarPatrocinadores(competitionId: string, itens: ItemPatrocinador[]): Promise<number> {
  const lista: { id: string | null; name: string; logo_url: string | null; link_url: string | null }[] = [];
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    let logoUrl = it.logoUrl;
    if (it.arquivo) {
      const ext = it.arquivo.type === "image/png" ? "png" : it.arquivo.type === "image/webp" ? "webp" : "jpg";
      const path = `competitions/${competitionId}/patrocinadores/${Date.now()}-${i + 1}.${ext}`;
      const { error: upErr } = await supabase.storage.from("sistema").upload(path, it.arquivo, { contentType: it.arquivo.type });
      if (upErr) throw new Error(`Falha ao enviar o logo de "${it.nome.trim()}": ${upErr.message}`);
      logoUrl = supabase.storage.from("sistema").getPublicUrl(path).data.publicUrl;
    }
    lista.push({ id: it.id, name: it.nome.trim(), logo_url: logoUrl, link_url: normalizaLink(it.link) || null });
  }
  const { data, error } = await supabase.rpc("admin_set_competition_sponsors", {
    p_competition_id: competitionId,
    p_sponsors: lista,
  });
  if (error) throw error;
  return (data as { count: number }).count;
}
