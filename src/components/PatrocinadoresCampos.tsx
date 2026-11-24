import { useEffect, useMemo } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGO_TIPOS, MAX_PATROCINADORES, erroDoItem, novoItem, type ItemPatrocinador } from "@/lib/patrocinadores";

interface PatrocinadoresCamposProps {
  itens: ItemPatrocinador[];
  onChange: (itens: ItemPatrocinador[]) => void;
  disabled?: boolean;
}

/** Endereço para mostrar o logo: o arquivo escolhido agora ou o logo já salvo. */
function useLogos(itens: ItemPatrocinador[]) {
  const urls = useMemo(
    () => itens.map((i) => (i.arquivo ? URL.createObjectURL(i.arquivo) : i.logoUrl)),
    [itens],
  );
  useEffect(
    () => () => {
      urls.forEach((u, idx) => {
        if (u && itens[idx]?.arquivo) URL.revokeObjectURL(u);
      });
    },
    [urls, itens],
  );
  return urls;
}

/**
 * Patrocinadores da corrida no cadastro e na edição: cada marca com logo, nome e link, na ordem em que aparecem.
 * Mostra a prévia de como fica no app (logos com 19 pt de altura na página da corrida; nomes no card do feed).
 */
export const PatrocinadoresCampos = ({ itens, onChange, disabled = false }: PatrocinadoresCamposProps) => {
  const logos = useLogos(itens);

  const altera = (idx: number, parcial: Partial<ItemPatrocinador>) =>
    onChange(itens.map((it, i) => (i === idx ? { ...it, ...parcial } : it)));
  const move = (idx: number, delta: number) => {
    const alvo = idx + delta;
    if (alvo < 0 || alvo >= itens.length) return;
    const nova = [...itens];
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    onChange(nova);
  };
  const remove = (idx: number) => onChange(itens.filter((_, i) => i !== idx));

  return (
    <div data-campos-patrocinadores className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Cadastre as marcas desta corrida, na ordem em que devem aparecer. No app, os logos aparecem na página da corrida e
        os nomes no card do feed. O link fica salvo, mas só vai ser clicável numa próxima versão do app.
      </p>

      {itens.map((it, idx) => {
        const erro = erroDoItem(it);
        const mostraErro = erro && (it.nome.trim() || it.link.trim() || it.arquivo);
        return (
          <div key={it.chave} data-patrocinador className="rounded-xl bg-[#1A1A1A] p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-4 md:items-end">
              <div className="flex flex-col gap-2 md:w-48">
                <div className="h-16 rounded-lg bg-[#191919] border border-border/40 flex items-center justify-center overflow-hidden px-3">
                  {logos[idx] ? (
                    <img src={logos[idx] as string} alt={it.nome || "Logo"} className="max-h-12 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem logo</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    id={`patro-logo-${it.chave}`}
                    data-patro-logo
                    type="file"
                    accept={LOGO_TIPOS.join(",")}
                    className="hidden"
                    disabled={disabled}
                    onChange={(e) => altera(idx, { arquivo: e.target.files?.[0] ?? null })}
                  />
                  <label htmlFor={`patro-logo-${it.chave}`} className="flex-1">
                    <Button type="button" variant="outline" size="sm" className="w-full cursor-pointer gap-1 border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725] hover:text-[#1A1A1A] bg-transparent" asChild>
                      <span>
                        <Upload className="w-3.5 h-3.5" />
                        {logos[idx] ? "Trocar logo" : "Enviar logo"}
                      </span>
                    </Button>
                  </label>
                  {logos[idx] && (
                    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => altera(idx, { arquivo: null, logoUrl: null })} className="text-muted-foreground">
                      Tirar
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`patro-nome-${it.chave}`}>Nome da marca</Label>
                  <Input
                    id={`patro-nome-${it.chave}`}
                    data-patro-nome
                    maxLength={60}
                    placeholder="Ex.: Loja Corre Mais"
                    value={it.nome}
                    disabled={disabled}
                    onChange={(e) => altera(idx, { nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`patro-link-${it.chave}`}>Link (opcional)</Label>
                  <Input
                    id={`patro-link-${it.chave}`}
                    data-patro-link
                    maxLength={500}
                    placeholder="https://www.marca.com.br"
                    value={it.link}
                    disabled={disabled}
                    onChange={(e) => altera(idx, { link: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex md:flex-col gap-1 justify-end">
                <Button type="button" variant="ghost" size="icon" title="Subir" disabled={disabled || idx === 0} onClick={() => move(idx, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" title="Descer" disabled={disabled || idx === itens.length - 1} onClick={() => move(idx, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" title="Remover" data-patro-remover disabled={disabled} onClick={() => remove(idx)} className="text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {mostraErro && <p className="text-sm text-destructive">{erro}</p>}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        data-patro-adicionar
        disabled={disabled || itens.length >= MAX_PATROCINADORES}
        onClick={() => onChange([...itens, novoItem()])}
        className="gap-2 border-[#CCF725] text-[#CCF725] hover:bg-[#CCF725] hover:text-[#1A1A1A] bg-transparent"
      >
        <Plus className="w-4 h-4" />
        Adicionar patrocinador
      </Button>

      {itens.some((i) => i.nome.trim()) && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Assim aparece na página da corrida no app:</p>
          <div data-previa-patrocinadores className="rounded-2xl p-4 max-w-sm" style={{ backgroundColor: "#191919" }}>
            <p className="text-base font-medium mb-4" style={{ color: "#F5F5F5" }}>Patrocinadores</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-4">
              {itens.filter((i) => i.nome.trim()).map((it) => {
                const idx = itens.indexOf(it);
                return logos[idx] ? (
                  <img key={it.chave} src={logos[idx] as string} alt={it.nome} style={{ height: 19 }} className="object-contain" />
                ) : (
                  <span
                    key={it.chave}
                    className="inline-flex items-center justify-center rounded px-2 text-[10px] font-medium"
                    style={{ minWidth: 79, height: 19, backgroundColor: "#B2B2B2", color: "#121212" }}
                  >
                    {it.nome.trim()}
                  </span>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            No card do feed (hoje): "Patrocinadores: {itens.filter((i) => i.nome.trim()).map((i) => i.nome.trim()).join(" • ")}"
          </p>
          <p className="text-xs text-muted-foreground">
            Logo ideal: PNG com fundo transparente, horizontal, versão clara (o fundo no app é escuro), recortado rente ao
            desenho, com pelo menos 600 px de largura e até 1 MB.
          </p>
        </div>
      )}
    </div>
  );
};
