import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageUp, Loader2, RotateCcw } from "lucide-react";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Loja do checkout (começo da fase 3 do novo checkout, 23/11/2026): foto de
 * cada produto da tela única. A foto vai para o bucket público "sistema",
 * pasta checkout/planos, e o endereço fica em plans.image_url. Sem foto
 * própria, o checkout usa a foto padrão do site.
 */

interface PlanoLoja {
  id: string;
  slug: string;
  name: string;
  price: number;
  is_active: boolean;
  has_kit: boolean;
  image_url: string | null;
  sort_order: number;
}

const NOMES: Record<string, string> = {
  "challenge-ticket": "Inscrição avulsa",
  "challenge-pack": "Inscrição com kit",
  "runlab-club": "RunLab Club",
};

const TAMANHO_MAXIMO = 3 * 1024 * 1024;

function formataReais(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function usePlanos() {
  return useQuery({
    queryKey: ["loja-checkout-planos"],
    queryFn: async (): Promise<PlanoLoja[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, slug, name, price, is_active, has_kit, image_url, sort_order")
        .order("is_active", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, price: Number(p.price) })) as PlanoLoja[];
    },
  });
}

function LinhaPlano({ plano, podeEditar, onMudou }: { plano: PlanoLoja; podeEditar: boolean; onMudou: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const nome = NOMES[plano.slug] ?? plano.name;

  const salvaUrl = async (url: string | null) => {
    const { data, error } = await supabase.from("plans").update({ image_url: url }).eq("id", plano.id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Sem permissão para alterar este produto.");
  };

  const enviaFoto = async (arquivo: File) => {
    if (!arquivo.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      toast.error("A foto passa de 3 MB. Diminua e tente de novo.");
      return;
    }
    setEnviando(true);
    try {
      const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const caminho = `checkout/planos/${plano.slug}-${Date.now()}.${ext}`;
      const { error: erroUpload } = await supabase.storage
        .from("sistema")
        .upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "3600" });
      if (erroUpload) throw new Error(erroUpload.message);
      const { data } = supabase.storage.from("sistema").getPublicUrl(caminho);
      await salvaUrl(data.publicUrl);
      toast.success(`Foto de ${nome} trocada`, { description: "Já aparece no checkout." });
      onMudou();
    } catch (e) {
      toast.error("Não foi possível trocar a foto", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const voltaPadrao = async () => {
    setEnviando(true);
    try {
      await salvaUrl(null);
      toast.success(`${nome} voltou para a foto padrão do site`);
      onMudou();
    } catch (e) {
      toast.error("Não foi possível alterar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-table-row p-4">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#262626]">
        {plano.image_url ? (
          <img src={plano.image_url} alt={`Foto de ${nome}`} className="h-full w-full object-cover" />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">
            {plano.has_kit ? "Foto padrão do site" : "Sem foto"}
          </span>
        )}
      </div>
      <div className="min-w-[200px] flex-1 space-y-1">
        <p className="font-semibold text-foreground">{nome}</p>
        <p className="text-sm text-muted-foreground">
          {plano.name} · {formataReais(plano.price)}
        </p>
        <Badge
          className={
            plano.is_active
              ? "bg-[#CCF725]/15 text-[#CCF725] hover:bg-[#CCF725]/15"
              : "bg-muted text-muted-foreground hover:bg-muted"
          }
        >
          {plano.is_active ? "No checkout" : "Fora do checkout"}
        </Badge>
      </div>
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void enviaFoto(arquivo);
            }}
          />
          <button
            type="button"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all hover:brightness-90 disabled:opacity-60"
            style={{ backgroundColor: "#CCF725", color: "#1A1A1A" }}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            {plano.image_url ? "Trocar foto" : "Enviar foto"}
          </button>
          {plano.image_url && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => void voltaPadrao()}
              className="inline-flex items-center gap-2 rounded-md bg-[#262626] px-4 py-2 text-sm text-foreground hover:bg-[#333] disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              Voltar à foto padrão
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const LojaCheckout = () => {
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("financeiro.edit");
  const queryClient = useQueryClient();
  const { data: planos, isLoading, error } = usePlanos();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto space-y-6 px-6 py-8 pt-24">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Loja do checkout</h1>
          <p className="text-sm text-muted-foreground">
            Foto de cada produto da tela de inscrição. JPG, PNG ou WebP até 3 MB, de preferência quadrada. A troca
            aparece no checkout na hora.
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
        <div className="space-y-3">
          {(planos ?? []).map((p) => (
            <LinhaPlano
              key={p.id}
              plano={p}
              podeEditar={podeEditar}
              onMudou={() => queryClient.invalidateQueries({ queryKey: ["loja-checkout-planos"] })}
            />
          ))}
        </div>
      </main>
    </div>
  );
};

export default LojaCheckout;
