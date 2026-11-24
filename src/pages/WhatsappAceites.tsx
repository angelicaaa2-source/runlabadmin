import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { supabase } from "@/lib/supabase";

/**
 * WhatsApp: quem aceitou marketing (24/11/2026). Lista quem marcou, no
 * checkout, a caixinha "Quero receber lembretes das etapas, novidades e
 * ofertas da RunLab pelo WhatsApp. Posso cancelar quando quiser." e não
 * cancelou depois. Vem da view whatsapp_marketing_status (a linha mais recente
 * de cada telefone em whatsapp_consents); só admin lê.
 */

interface Aceite {
  phone: string;
  full_name: string | null;
  email: string | null;
  updated_at: string;
  source: string;
  consent_version: string;
}

const PAGINA = 1000;

async function buscaAceites(): Promise<Aceite[]> {
  const todos: Aceite[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("whatsapp_marketing_status")
      .select("phone, full_name, email, updated_at, source, consent_version")
      .eq("purpose", "marketing")
      .eq("granted", true)
      .order("updated_at", { ascending: false })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as Aceite[]));
    if (!data || data.length < PAGINA) return todos;
  }
}

function formataTelefone(t: string) {
  const d = t.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

function formataData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const ORIGEM: Record<string, string> = { checkout: "Checkout" };

function celulaCsv(v: string) {
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function baixaCsv(aceites: Aceite[]) {
  const linhas = [
    ["Nome", "Telefone", "E-mail", "Aceitou em", "Origem", "Versão do texto"].join(";"),
    ...aceites.map((a) =>
      [
        a.full_name ?? "",
        a.phone,
        a.email ?? "",
        formataData(a.updated_at),
        ORIGEM[a.source] ?? a.source,
        a.consent_version,
      ]
        .map(celulaCsv)
        .join(";"),
    ),
  ];
  const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `whatsapp-aceites-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const WhatsappAceites = () => {
  const { data: aceites, isLoading, error } = useQuery({ queryKey: ["whatsapp-aceites"], queryFn: buscaAceites });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto space-y-6 px-6 py-8 pt-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">WhatsApp: quem aceitou ofertas</h1>
            <p className="text-sm text-muted-foreground">
              Pessoas que marcaram no checkout: "Quero receber lembretes das etapas, novidades e ofertas da RunLab pelo
              WhatsApp. Posso cancelar quando quiser." Lembretes, novidades e ofertas pelo WhatsApp só para quem está
              nesta lista. Mensagens da compra (inscrição e pagamento) vão para todos.
            </p>
          </div>
          <button
            type="button"
            disabled={!aceites?.length}
            onClick={() => aceites && baixaCsv(aceites)}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all hover:brightness-90 disabled:opacity-60"
            style={{ backgroundColor: "#CCF725", color: "#1A1A1A" }}
          >
            <Download className="h-4 w-4" />
            Baixar lista (CSV)
          </button>
        </div>

        {isLoading && (
          <p className="text-muted-foreground">
            <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
            Carregando...
          </p>
        )}
        {error && (
          <p className="text-destructive">
            Não foi possível carregar a lista. {error instanceof Error ? error.message : ""}
          </p>
        )}

        {aceites && (
          <>
            <p className="text-sm text-foreground">
              {aceites.length === 1 ? "1 pessoa aceitou" : `${aceites.length.toLocaleString("pt-BR")} pessoas aceitaram`}
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Telefone</th>
                    <th className="px-4 py-2 font-medium">E-mail</th>
                    <th className="px-4 py-2 font-medium">Aceitou em</th>
                    <th className="px-4 py-2 font-medium">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {aceites.map((a) => (
                    <tr key={a.phone} className="border-t border-border">
                      <td className="px-4 py-2 text-foreground">{a.full_name ?? "–"}</td>
                      <td className="px-4 py-2 tabular-nums text-foreground">{formataTelefone(a.phone)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{a.email ?? "–"}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{formataData(a.updated_at)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{ORIGEM[a.source] ?? a.source}</td>
                    </tr>
                  ))}
                  {aceites.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        Ninguém marcou a caixinha ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default WhatsappAceites;
