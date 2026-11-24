import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { todayInBrasilia } from "@/lib/corridas";
import { erroDaEscolha, escolhaIso, type EscolhaPublicacao, type ModoPublicacao } from "@/lib/publicacao";

interface PublicacaoAppCamposProps {
  value: EscolhaPublicacao;
  onChange: (value: EscolhaPublicacao) => void;
  disabled?: boolean;
  /** false quando a corrida já está no app e tem inscritos (não pode ser escondida). */
  podeEsconder?: boolean;
  inscritos?: number;
  /** Estado salvo hoje (só na edição). */
  estadoAtual?: string;
}

/**
 * Campos "Publicação no app" dentro do cadastro e da edição da corrida: publicar agora,
 * programar (data e hora de Brasília; o banco publica sozinho) ou deixar oculta (rascunho).
 */
export const PublicacaoAppCampos = ({
  value,
  onChange,
  disabled = false,
  podeEsconder = true,
  inscritos = 0,
  estadoAtual,
}: PublicacaoAppCamposProps) => {
  const erro = value.modo === "schedule" && value.data && value.hora ? erroDaEscolha(value) : null;
  const iso = escolhaIso(value);

  const opcao = (modo: ModoPublicacao, titulo: string, descricao: string, bloqueada = false) => (
    <div className={`flex items-start space-x-3 ${bloqueada ? "opacity-50" : ""}`}>
      <RadioGroupItem
        value={modo}
        id={`campo-pub-${modo}`}
        disabled={disabled || bloqueada}
        className="border-muted-foreground mt-1"
      />
      <Label
        htmlFor={`campo-pub-${modo}`}
        className={`text-foreground font-normal ${bloqueada ? "" : "cursor-pointer"}`}
      >
        {titulo}
        <span className="block text-xs text-muted-foreground mt-0.5">{descricao}</span>
      </Label>
    </div>
  );

  return (
    <div data-campos-publicacao className="space-y-4">
      {estadoAtual && (
        <p className="text-sm text-muted-foreground">
          Agora: <span data-estado-publicacao className="text-foreground">{estadoAtual}</span>
        </p>
      )}
      <RadioGroup
        value={value.modo}
        onValueChange={(v) => onChange({ ...value, modo: v as ModoPublicacao })}
        disabled={disabled}
        className="space-y-4"
      >
        {opcao("now", "Publicar agora", "Aparece no app e no site de compra assim que você salvar.")}
        {opcao(
          "schedule",
          "Programar publicação",
          "Fica oculta e aparece sozinha no app e no site de compra na data e hora marcadas (horário de Brasília).",
          !podeEsconder,
        )}
        {value.modo === "schedule" && podeEsconder && (
          <div className="grid grid-cols-2 gap-4 pl-7 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="campo-pub-data">Data</Label>
              <Input
                id="campo-pub-data"
                type="date"
                min={todayInBrasilia()}
                value={value.data}
                onChange={(e) => onChange({ ...value, data: e.target.value })}
                disabled={disabled}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campo-pub-hora">Hora</Label>
              <Input
                id="campo-pub-hora"
                type="time"
                value={value.hora}
                onChange={(e) => onChange({ ...value, hora: e.target.value })}
                disabled={disabled}
                className="bg-input border-border text-foreground"
              />
            </div>
            {erro ? (
              <p className="col-span-2 text-sm text-destructive">{erro}</p>
            ) : iso ? null : (
              <p className="col-span-2 text-xs text-muted-foreground">Escolha a data e a hora.</p>
            )}
          </div>
        )}
        {opcao(
          "hide",
          "Deixar oculta (rascunho)",
          "Ninguém vê no app nem no site de compra até você publicar ou programar.",
          !podeEsconder,
        )}
      </RadioGroup>
      {!podeEsconder && (
        <p className="text-sm text-muted-foreground">
          Essa corrida já tem {inscritos} inscrito{inscritos === 1 ? "" : "s"}, então não pode ser escondida do app.
        </p>
      )}
    </div>
  );
};
