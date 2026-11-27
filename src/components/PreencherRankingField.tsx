import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * "Preencher ranking" da corrida (competitions.fill_ranking, 28/11/2026): com "Sim", o ranking do app mostra também
 * os perfis da casa da RunLab (house_profiles). Padrão: sim nas corridas da RunLab, não nas personalizadas de parceiros.
 */
export function PreencherRankingField({
  value,
  onChange,
  temCampeonato,
  rankingPorAtividades,
  estilo = "cadastrar",
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  temCampeonato: boolean;
  rankingPorAtividades: boolean;
  /** Visual da tela onde o campo aparece (as duas telas têm estilos diferentes). */
  estilo?: "cadastrar" | "editar";
}) {
  const editar = estilo === "editar";
  const semEfeito = value && (temCampeonato || rankingPorAtividades);
  return (
    <div className={editar ? "mb-6" : undefined}>
      <Label htmlFor="preencherRanking" className={editar ? "text-sm text-muted-foreground mb-2 block" : "text-foreground"}>
        Preencher ranking
      </Label>
      <Select value={value ? "sim" : "nao"} onValueChange={(v) => onChange(v === "sim")}>
        <SelectTrigger id="preencherRanking" className={editar ? "bg-[#1A1A1A] border-border/30" : "mt-2"} data-preencher-ranking>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={editar ? "bg-[#1A1A1A] border-border/30" : undefined}>
          <SelectItem value="sim">Sim</SelectItem>
          <SelectItem value="nao">Não (apenas corredores reais)</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        {value
          ? "O ranking do app mostra também os perfis da casa da RunLab (5 personagens e 3 marcadores de ritmo, com o selo RL), sempre atrás do 1º corredor real. Eles não concorrem a nada e não entram nas exportações."
          : "O ranking do app mostra só quem correu de verdade. Use nas corridas personalizadas de parceiros."}
      </p>
      {semEfeito && (
        <p className="text-xs text-muted-foreground mt-1" data-preencher-sem-efeito>
          {temCampeonato
            ? "Nesta corrida eles não aparecem: é etapa de campeonato (para não mexer nos pontos)."
            : "Nesta corrida eles não aparecem: o ranking é por atividades concluídas."}
        </p>
      )}
    </div>
  );
}
