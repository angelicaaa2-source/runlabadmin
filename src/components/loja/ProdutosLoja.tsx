import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageUp, Loader2, Trash2, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";

/**
 * Loja do checkout, etapa 1 (24/11/2026): produtos físicos que podem aparecer no
 * checkout. Nome, categoria, opções e estoque vêm do Dash (cópia em
 * store_products e store_product_options); aqui se decide preço, se aparece,
 * em que inscrições aparece no "Leve também" (janela depois do Continuar,
 * 26/11/2026), descrição e fotos. Camiseta: um
 * produto por modelo, opções = tamanhos. Boné e medalha: opções = cor ou fita,
 * cada uma com foto.
 */

interface OpcaoLoja {
  id: string;
  name: string;
  stock: number;
  dash_active: boolean;
  is_visible: boolean;
  image_url: string | null;
  sort_order: number;
}

interface ProdutoLoja {
  id: string;
  category: "camisa" | "bone" | "medalha" | "outro";
  name: string;
  variation_label: string;
  dash_active: boolean;
  price: number | null;
  is_visible: boolean;
  show_in_general_checkout: boolean;
  /** Opção na Inscrição com kit (modelo e tamanho/cor escolhidos no checkout). */
  in_kit: boolean;
  /** "Leve também": depois de quais inscrições aparece (slugs dos planos). Vazio = não aparece. */
  upsell_plan_slugs: string[];
  page_slug: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  synced_at: string | null;
  store_product_options: OpcaoLoja[];
}

const CATEGORIAS: { id: ProdutoLoja["category"]; titulo: string }[] = [
  { id: "camisa", titulo: "Camisas" },
  { id: "bone", titulo: "Bonés" },
  { id: "medalha", titulo: "Medalhas" },
];

/** Categorias em que cada opção (cor ou fita) tem foto própria. */
const FOTO_POR_OPCAO = new Set<ProdutoLoja["category"]>(["bone", "medalha"]);

/** Inscrições do checkout geral, na ordem da tela (slugs dos planos). */
const INSCRICOES_LEVE_TAMBEM: { slug: string; nome: string; curto: string }[] = [
  { slug: "challenge-ticket", nome: "Inscrição avulsa", curto: "avulsa" },
  { slug: "challenge-pack", nome: "Inscrição com kit", curto: "kit" },
  { slug: "runlab-club", nome: "RunLab Club", curto: "Club" },
];

const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const BOTAO_LIMAO = { backgroundColor: "#CCF725", color: "#1A1A1A" };

function formataReais(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function precoParaTexto(valor: number | null) {
  return valor == null ? "" : valor.toFixed(2).replace(".", ",");
}

function textoParaPreco(texto: string): number | null | "invalido" {
  const limpo = texto.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0) return "invalido";
  return Math.round(n * 100) / 100;
}

const PLURAL: Record<string, string> = { Tamanho: "Tamanhos", Cor: "Cores", Fita: "Fitas", Modelo: "Modelos", Variação: "Variações" };

function formataData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Sobe a foto para sistema/checkout/loja e devolve o endereço público. */
async function enviaFoto(arquivo: File, nomeBase: string): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
  if (arquivo.size > TAMANHO_MAXIMO) throw new Error("A foto passa de 3 MB. Diminua e tente de novo.");
  const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const caminho = `checkout/loja/${nomeBase}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("sistema")
    .upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  return supabase.storage.from("sistema").getPublicUrl(caminho).data.publicUrl;
}

async function atualizaProduto(id: string, campos: Partial<ProdutoLoja>) {
  const { data, error } = await supabase
    .from("store_products")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Sem permissão para alterar este produto.");
}

async function atualizaOpcao(id: string, campos: Partial<OpcaoLoja>) {
  const { data, error } = await supabase
    .from("store_product_options")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Sem permissão para alterar esta opção.");
}

function useProdutosLoja() {
  return useQuery({
    queryKey: ["loja-produtos"],
    queryFn: async (): Promise<ProdutoLoja[]> => {
      const { data, error } = await supabase
        .from("store_products")
        .select(
          "id, category, name, variation_label, dash_active, price, is_visible, show_in_general_checkout, in_kit, upsell_plan_slugs, page_slug, description, image_url, sort_order, synced_at, store_product_options(id, name, stock, dash_active, is_visible, image_url, sort_order)",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ProdutoLoja[]).map((p) => ({
        ...p,
        price: p.price == null ? null : Number(p.price),
        upsell_plan_slugs: Array.isArray(p.upsell_plan_slugs) ? p.upsell_plan_slugs : [],
        store_product_options: [...(p.store_product_options ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
  });
}

/** Botão de foto (enviar ou trocar) com remoção. */
function BotaoFoto({
  url,
  nomeBase,
  podeEditar,
  pequeno,
  onSalvar,
}: {
  url: string | null;
  nomeBase: string;
  podeEditar: boolean;
  pequeno?: boolean;
  onSalvar: (url: string | null) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const escolhe = async (arquivo: File) => {
    setEnviando(true);
    try {
      await onSalvar(await enviaFoto(arquivo, nomeBase));
      toast.success("Foto salva");
    } catch (e) {
      toast.error("Não foi possível salvar a foto", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setEnviando(true);
    try {
      await onSalvar(null);
      toast.success("Foto removida");
    } catch (e) {
      toast.error("Não foi possível remover", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  const tamanho = pequeno ? "h-14 w-14" : "h-24 w-24";
  return (
    <div className="flex items-center gap-2">
      <div className={`flex ${tamanho} shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#262626]`}>
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-1 text-center text-[11px] text-muted-foreground">Sem foto</span>
        )}
      </div>
      {podeEditar && (
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void escolhe(arquivo);
            }}
          />
          <button
            type="button"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:brightness-90 disabled:opacity-60"
            style={BOTAO_LIMAO}
          >
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
            {url ? "Trocar foto" : "Enviar foto"}
          </button>
          {url && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#262626] px-3 py-1.5 text-xs text-foreground hover:bg-[#333] disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Tirar foto
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LinhaOpcao({
  opcao,
  produto,
  podeEditar,
  onMudou,
}: {
  opcao: OpcaoLoja;
  produto: ProdutoLoja;
  podeEditar: boolean;
  onMudou: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const comFoto = FOTO_POR_OPCAO.has(produto.category);
  const esgotado = opcao.stock <= 0;

  const alterna = async (visivel: boolean) => {
    setSalvando(true);
    try {
      await atualizaOpcao(opcao.id, { is_visible: visivel });
      onMudou();
    } catch (e) {
      toast.error("Não foi possível alterar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-[#262626] px-3 py-2">
      {comFoto && (
        <BotaoFoto
          url={opcao.image_url}
          nomeBase={`${produto.page_slug ?? "produto"}-${opcao.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          podeEditar={podeEditar}
          pequeno
          onSalvar={async (url) => {
            await atualizaOpcao(opcao.id, { image_url: url });
            onMudou();
          }}
        />
      )}
      <div className="min-w-[120px] flex-1">
        <p className="text-sm font-medium text-foreground">{opcao.name}</p>
        <p className={`text-xs ${esgotado ? "text-destructive" : "text-muted-foreground"}`}>
          {esgotado ? "Esgotado no Dash" : `${opcao.stock} em estoque`}
          {!opcao.dash_active && " · desativado no Dash"}
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch
          checked={opcao.is_visible}
          disabled={!podeEditar || salvando}
          onCheckedChange={(v) => void alterna(v)}
          aria-label={`Mostrar ${opcao.name} no checkout`}
        />
        Mostrar
      </label>
    </div>
  );
}

function CartaoProduto({
  produto,
  podeEditar,
  onMudou,
  aberto,
  onAlterna,
}: {
  produto: ProdutoLoja;
  podeEditar: boolean;
  onMudou: () => void;
  /** Linha recolhida mostra só nome e situação; a seta abre o resto. */
  aberto: boolean;
  onAlterna: () => void;
}) {
  const [preco, setPreco] = useState(precoParaTexto(produto.price));
  const [descricao, setDescricao] = useState(produto.description ?? "");
  const [salvando, setSalvando] = useState(false);
  const mudouTexto = preco !== precoParaTexto(produto.price) || descricao !== (produto.description ?? "");
  const pecas = produto.store_product_options.filter((o) => o.dash_active).reduce((t, o) => t + Math.max(o.stock, 0), 0);
  const travado = !podeEditar || salvando || !produto.dash_active;

  const salvaTexto = async () => {
    const valor = textoParaPreco(preco);
    if (valor === "invalido") {
      toast.error("Preço inválido", { description: "Use só números, por exemplo 49,90." });
      return;
    }
    if (valor == null && produto.is_visible) {
      toast.error("Produto visível precisa de preço", { description: "Esconda o produto antes de tirar o preço." });
      return;
    }
    setSalvando(true);
    try {
      await atualizaProduto(produto.id, { price: valor, description: descricao.trim() || null });
      toast.success(`${produto.name} salvo`);
      onMudou();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };

  const alterna = async (campo: "is_visible" | "in_kit", valor: boolean) => {
    if (campo === "is_visible" && valor && produto.price == null) {
      toast.error("Coloque o preço e salve antes de mostrar no checkout.");
      return;
    }
    setSalvando(true);
    try {
      // Esconder o produto também tira do checkout geral e do "Leve também".
      const campos: Partial<ProdutoLoja> =
        campo === "is_visible" && !valor
          ? { is_visible: false, show_in_general_checkout: false, upsell_plan_slugs: [] }
          : { [campo]: valor };
      await atualizaProduto(produto.id, campos);
      onMudou();
    } catch (e) {
      toast.error("Não foi possível alterar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };

  /** "Leve também": liga ou desliga o produto depois de uma inscrição. */
  const alternaLeveTambem = async (slug: string, valor: boolean) => {
    if (valor && !produto.is_visible) {
      toast.error("Ligue \"À venda\" antes.");
      return;
    }
    const atual = produto.upsell_plan_slugs ?? [];
    const novo = valor ? [...new Set([...atual, slug])] : atual.filter((s) => s !== slug);
    // Mantém a ordem da tela (avulsa, kit, Club).
    const ordenado = INSCRICOES_LEVE_TAMBEM.map((i) => i.slug).filter((s) => novo.includes(s));
    setSalvando(true);
    try {
      await atualizaProduto(produto.id, { upsell_plan_slugs: ordenado });
      onMudou();
    } catch (e) {
      toast.error("Não foi possível alterar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };
  const leveTambem = INSCRICOES_LEVE_TAMBEM.filter((i) => produto.upsell_plan_slugs?.includes(i.slug));

  return (
    <div className="rounded-lg border border-border bg-table-row">
      <button
        type="button"
        onClick={onAlterna}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex-1 font-semibold text-foreground">{produto.name}</span>
        <span className="flex flex-wrap justify-end gap-2">
          <Badge
            className={
              produto.is_visible
                ? "bg-[#CCF725]/15 text-[#CCF725] hover:bg-[#CCF725]/15"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }
          >
            {produto.is_visible ? "À venda" : "Escondido"}
          </Badge>
          {leveTambem.length > 0 && (
            <Badge className="bg-[#CCF725]/15 text-[#CCF725] hover:bg-[#CCF725]/15">
              Leve também: {leveTambem.map((i) => i.curto).join(", ")}
            </Badge>
          )}
          {produto.in_kit && (
            <Badge className="bg-[#5BC0EB]/15 text-[#5BC0EB] hover:bg-[#5BC0EB]/15">No kit</Badge>
          )}
          {!produto.dash_active && (
            <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">Desativado no Dash</Badge>
          )}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {aberto && (
    <div className="space-y-4 border-t border-border p-4">
      <div className="flex flex-wrap items-start gap-4">
        <BotaoFoto
          url={produto.image_url}
          nomeBase={produto.page_slug ?? "produto"}
          podeEditar={podeEditar}
          onSalvar={async (url) => {
            await atualizaProduto(produto.id, { image_url: url });
            onMudou();
          }}
        />
        <div className="min-w-[220px] flex-1 space-y-1">
          <p className="text-sm text-muted-foreground">
            {produto.variation_label}: {produto.store_product_options.map((o) => o.name).join(", ")} · {pecas}{" "}
            {pecas === 1 ? "peça" : "peças"} no Dash
          </p>
          {produto.page_slug && (
            <p className="text-xs text-muted-foreground">Página própria: /loja/{produto.page_slug} (entra na etapa 2)</p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Switch
              checked={produto.is_visible}
              disabled={travado}
              onCheckedChange={(v) => void alterna("is_visible", v)}
            />
            <span>
              À venda
              <span className="block text-xs text-muted-foreground">Página própria do item e opcional nos checkouts de corrida</span>
            </span>
          </label>
          <fieldset className="space-y-1.5 text-sm text-foreground" disabled={travado || !produto.is_visible}>
            <legend>
              Leve também
              <span className="block text-xs text-muted-foreground">
                Janela depois do Continuar, no checkout geral. Aparece depois de:
              </span>
            </legend>
            {INSCRICOES_LEVE_TAMBEM.map((i) => (
              <label key={i.slug} className="flex items-center gap-2 pl-1">
                <Checkbox
                  checked={produto.upsell_plan_slugs?.includes(i.slug) ?? false}
                  disabled={travado || !produto.is_visible}
                  onCheckedChange={(v) => void alternaLeveTambem(i.slug, v === true)}
                />
                <span className={!produto.is_visible ? "text-muted-foreground" : undefined}>{i.nome}</span>
              </label>
            ))}
            {!produto.is_visible && (
              <span className="block text-xs text-muted-foreground">Ligue "À venda" para escolher.</span>
            )}
          </fieldset>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Switch
              checked={produto.in_kit}
              disabled={travado}
              onCheckedChange={(v) => void alterna("in_kit", v)}
            />
            <span>
              Faz parte do kit
              <span className="block text-xs text-muted-foreground">Vira opção na Inscrição com kit (modelo e tamanho)</span>
            </span>
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor={`preco-${produto.id}`} className="text-xs text-muted-foreground">
            Preço de venda (R$)
          </label>
          <Input
            id={`preco-${produto.id}`}
            inputMode="decimal"
            placeholder="49,90"
            value={preco}
            disabled={!podeEditar}
            onChange={(e) => setPreco(e.target.value)}
            className="bg-[#262626]"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`descricao-${produto.id}`} className="text-xs text-muted-foreground">
            Descrição curta no checkout
          </label>
          <Textarea
            id={`descricao-${produto.id}`}
            rows={2}
            placeholder="Ex.: camiseta oficial em tecido leve, entregue em casa."
            value={descricao}
            disabled={!podeEditar}
            onChange={(e) => setDescricao(e.target.value)}
            className="min-h-[40px] bg-[#262626]"
          />
        </div>
        {podeEditar && (
          <button
            type="button"
            disabled={!mudouTexto || salvando}
            onClick={() => void salvaTexto()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-all hover:brightness-90 disabled:opacity-40"
            style={BOTAO_LIMAO}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        )}
      </div>
      {produto.price != null && (
        <p className="-mt-2 text-xs text-muted-foreground">Preço salvo: {formataReais(produto.price)}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {FOTO_POR_OPCAO.has(produto.category)
            ? `${produto.variation_label}: foto de cada opção`
            : PLURAL[produto.variation_label] ?? produto.variation_label}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {produto.store_product_options.map((o) => (
            <LinhaOpcao key={o.id} opcao={o} produto={produto} podeEditar={podeEditar} onMudou={onMudou} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Opção esgotada no Dash some do checkout sozinha. "Mostrar" desligado esconde a opção mesmo com estoque.
        </p>
      </div>
    </div>
      )}
    </div>
  );
}

export function ProdutosLoja({ podeEditar }: { podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { data: produtos, isLoading, error } = useProdutosLoja();
  const recarrega = () => queryClient.invalidateQueries({ queryKey: ["loja-produtos"] });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alterna = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  const ultimaCopia = (produtos ?? [])
    .map((p) => p.synced_at)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Produtos</h2>
        <p className="text-sm text-muted-foreground">
          Camisas, bonés e medalhas do estoque do Dash (prêmios em "Outros" ficam de fora). O cadastro e o estoque são do Dash; aqui você
          decide o que fica à venda, o preço e as fotos. Produto novo chega escondido. Clique na linha para abrir.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {ultimaCopia ? `Última cópia do estoque do Dash em ${formataData(ultimaCopia)}.` : "Estoque do Dash ainda não copiado."}
        </p>
      </div>
      {isLoading && (
        <p className="text-muted-foreground">
          <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
          Carregando produtos...
        </p>
      )}
      {error && (
        <p className="text-destructive">
          Não foi possível carregar os produtos. {error instanceof Error ? error.message : ""}
        </p>
      )}
      {CATEGORIAS.map((c) => {
        const lista = (produtos ?? []).filter((p) => p.category === c.id);
        if (!lista.length) return null;
        return (
          <div key={c.id} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{c.titulo}</h3>
            {lista.map((p) => (
              <CartaoProduto
                key={`${p.id}-${p.price}-${p.description}`}
                produto={p}
                podeEditar={podeEditar}
                onMudou={recarrega}
                aberto={abertos.has(p.id)}
                onAlterna={() => alterna(p.id)}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}
