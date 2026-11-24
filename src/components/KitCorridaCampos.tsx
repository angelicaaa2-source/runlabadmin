import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { carregarProdutosKit, type EscolhaKitCorrida, type ProdutoKit } from "@/lib/kitCorrida";

const SELECT =
  "h-11 w-full rounded-md border border-border bg-[#262626] px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";

/**
 * "Kit da corrida (peças físicas)": camiseta do kit e medalha do kit, no cadastro e na edição
 * da corrida. Vale para as inscrições com kit desta corrida.
 */
export function KitCorridaCampos({
  value,
  onChange,
  disabled,
}: {
  value: EscolhaKitCorrida;
  onChange: (v: EscolhaKitCorrida) => void;
  disabled?: boolean;
}) {
  const [produtos, setProdutos] = useState<ProdutoKit[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregarProdutosKit()
      .then(setProdutos)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar os produtos da loja."));
  }, []);

  if (erro) return <p className="text-sm text-destructive">{erro}</p>;
  if (!produtos) {
    return (
      <p className="text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Carregando produtos da loja...
      </p>
    );
  }

  const camisas = produtos.filter((p) => p.category === "camisa");
  const medalhas = produtos.filter((p) => p.category === "medalha");
  const medalha = medalhas.find((m) => m.id === value.medalhaId) ?? null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <label htmlFor="kit-camiseta" className="text-sm font-medium text-foreground">
          Camiseta do kit
        </label>
        <select
          id="kit-camiseta"
          className={SELECT}
          disabled={disabled}
          value={value.camisetaId ?? ""}
          onChange={(e) => onChange({ ...value, camisetaId: e.target.value || null })}
        >
          <option value="">A pessoa escolhe entre os modelos do kit</option>
          {camisas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Com um modelo escolhido aqui, a corrida tem camiseta própria: a pessoa só escolhe o tamanho.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="kit-medalha" className="text-sm font-medium text-foreground">
          Medalha do kit (peça física)
        </label>
        <select
          id="kit-medalha"
          className={SELECT}
          disabled={disabled}
          value={value.medalhaId ?? ""}
          onChange={(e) => onChange({ ...value, medalhaId: e.target.value || null, fitaId: null })}
        >
          <option value="">A equipe escolhe</option>
          {medalhas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {medalha && (
          <select
            id="kit-medalha-fita"
            aria-label="Fita da medalha do kit"
            className={SELECT}
            disabled={disabled}
            value={value.fitaId ?? ""}
            onChange={(e) => onChange({ ...value, fitaId: e.target.value || null })}
          >
            <option value="">A equipe escolhe a fita</option>
            {medalha.options.map((o) => (
              <option key={o.id} value={o.id}>
                Fita {o.name}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-muted-foreground">
          A pessoa não escolhe a medalha. Com modelo e fita definidos, a venda com kit já desconta a medalha do estoque
          do Dash; sem isso, a equipe lança a saída como hoje.
        </p>
      </div>
    </div>
  );
}
