import { useEffect, useMemo, useState } from "react";
import { Award, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MEDALHA_TIPOS, erroDoArquivo, type EscolhaMedalha, type MedalhaAtual } from "@/lib/medalha";

interface MedalhaCorridaCamposProps {
  value: EscolhaMedalha;
  onChange: (value: EscolhaMedalha) => void;
  tituloCorrida: string;
  /** Medalha já cadastrada (só na edição). */
  atual?: MedalhaAtual | null;
  disabled?: boolean;
  /** Só na edição: remover (desativar) ou reativar na hora. */
  onRemover?: () => void;
  onReativar?: () => void;
  ocupado?: boolean;
}

/**
 * Seção "Medalha da corrida (opcional)" no cadastro e na edição: imagem, prévia como no app (recortada num
 * círculo), nome e descrição. Quem conclui uma tentativa na corrida ganha a medalha sozinho.
 */
export const MedalhaCorridaCampos = ({
  value,
  onChange,
  tituloCorrida,
  atual = null,
  disabled = false,
  onRemover,
  onReativar,
  ocupado = false,
}: MedalhaCorridaCamposProps) => {
  const [confirmaRemover, setConfirmaRemover] = useState(false);
  const previewArquivo = useMemo(() => (value.arquivo ? URL.createObjectURL(value.arquivo) : null), [value.arquivo]);
  useEffect(() => () => {
    if (previewArquivo) URL.revokeObjectURL(previewArquivo);
  }, [previewArquivo]);
  const preview = previewArquivo ?? atual?.image_url ?? null;
  const erro = erroDoArquivo(value.arquivo);
  const nomeMostrado = value.nome.trim() || atual?.name || tituloCorrida || "Nome da medalha";

  return (
    <div data-campos-medalha className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Quem concluir pelo menos uma tentativa nesta corrida ganha a medalha na hora, com a notificação "Nova Conquista!".
        Ela aparece em Recompensas no app (só para quem ganhou) e pode ser compartilhada. Se a corrida já tiver
        tentativas concluídas, quem já concluiu ganha assim que você salvar.
      </p>

      {atual && (
        <div data-estado-medalha className="flex flex-wrap items-center gap-3 text-sm">
          <span className={atual.is_active ? "text-green-400" : "text-red-400"}>
            {atual.is_active ? "Medalha ativa" : "Medalha removida (não aparece no app)"}
          </span>
          <span className="text-muted-foreground">
            · {atual.total} atleta{atual.total === 1 ? "" : "s"} {atual.total === 1 ? "recebeu" : "receberam"}
          </span>
          {atual.is_active && onRemover && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || ocupado}
              onClick={() => setConfirmaRemover(true)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              Remover medalha
            </Button>
          )}
          {!atual.is_active && onReativar && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || ocupado} onClick={onReativar} className="text-primary">
              Reativar medalha
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex flex-col items-center gap-3 md:w-48">
          <div
            data-previa-medalha
            className="w-[120px] h-[120px] rounded-full overflow-hidden flex items-center justify-center"
            style={{ border: "2px solid #CCF725", boxShadow: "0 0 12px rgba(204,247,37,0.15)", backgroundColor: "#1A2600" }}
          >
            {preview ? (
              <img src={preview} alt="Prévia da medalha" className="w-full h-full object-cover" />
            ) : (
              <Award className="w-10 h-10 text-[#CCF725]" />
            )}
          </div>
          <p className="text-xs text-center text-foreground font-medium max-w-[160px] break-words">{nomeMostrado}</p>
          <p className="text-[11px] text-center text-muted-foreground">Assim aparece no app</p>
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label>Imagem da medalha</Label>
            <div className="flex items-center gap-3">
              <input
                id="medalha-arquivo"
                type="file"
                accept={MEDALHA_TIPOS.join(",")}
                className="hidden"
                disabled={disabled}
                onChange={(e) => onChange({ ...value, arquivo: e.target.files?.[0] ?? null })}
              />
              <label htmlFor="medalha-arquivo">
                <Button type="button" variant="outline" className="cursor-pointer border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725] hover:text-[#1A1A1A] bg-transparent gap-2" asChild>
                  <span>
                    <Upload className="w-4 h-4" />
                    {preview ? "Trocar imagem" : "Escolher imagem"}
                  </span>
                </Button>
              </label>
              {value.arquivo && <span className="text-xs text-muted-foreground truncate max-w-[220px]">{value.arquivo.name}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG com fundo transparente, quadrada (512 x 512 ou maior), até 2 MB. O app mostra a medalha recortada num
              círculo: deixe o desenho importante no centro.
            </p>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="medalha-nome">Nome da medalha</Label>
              <Input
                id="medalha-nome"
                maxLength={60}
                placeholder={tituloCorrida || "Ex.: Finisher Etapa 8"}
                value={value.nome}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medalha-descricao">Descrição (opcional)</Label>
              <Input
                id="medalha-descricao"
                maxLength={200}
                placeholder={tituloCorrida ? `Concluiu a ${tituloCorrida}` : "Concluiu a corrida"}
                value={value.descricao}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, descricao: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmaRemover} onOpenChange={setConfirmaRemover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a medalha da corrida?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela some de Recompensas no app, inclusive para quem já ganhou, e ninguém mais ganha. Dá para reativar depois:
              quem tinha volta a ver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmaRemover(false);
                onRemover?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover medalha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
