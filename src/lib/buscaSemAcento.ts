/**
 * Busca de nome sem depender de acento nem de maiúscula: "junior" acha "Júnior" e "júnior" acha "Junior".
 * Gera uma expressão regular para o filtro `imatch` do PostgREST (~* no Postgres), trocando cada vogal,
 * "c" e "n" por todas as variações com acento. Não precisa de mudança no banco.
 * Devolve null se, tirando acentos e símbolos, o termo ficar vazio.
 */
const VARIACOES: Record<string, string> = {
  a: "aáàâãäAÁÀÂÃÄ",
  e: "eéèêëEÉÈÊË",
  i: "iíìîïIÍÌÎÏ",
  o: "oóòôõöOÓÒÔÕÖ",
  u: "uúùûüUÚÙÛÜ",
  c: "cçCÇ",
  n: "nñNÑ",
};

export function padraoSemAcento(termo: string): string | null {
  const limpo = termo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Só letras, números e espaço: o resto (vírgula, ponto, parênteses, símbolos de regex) quebraria o filtro.
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return null;
  return [...limpo].map((ch) => (VARIACOES[ch] ? `[${VARIACOES[ch]}]` : ch)).join("");
}

/** Texto sem acento e em minúsculas, para comparar nomes na tela ("Júnior" -> "junior"). */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
