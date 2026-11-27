/**
 * Distâncias digitadas no campo "Outro" do cadastro e da edição de competição.
 * Aceita várias de uma vez, separadas por vírgula, ponto e vírgula, barra ou espaço:
 * "2, 4, 6", "2km 4km 6km" ou "2 e 4". Decimal com ponto: "7.5".
 * A vírgula separa distâncias, então "7,5" vira 7 km e 5 km; a prévia na tela mostra isso antes de salvar.
 */
export function parseOutrasDistancias(texto: string): number[] {
  const kms: number[] = [];
  for (const parte of texto.toLowerCase().replace(/km/g, " ").split(/[,;/+\s]+/)) {
    const t = parte.trim();
    if (!t) continue;
    const km = Number(t);
    if (Number.isFinite(km) && km > 0 && !kms.includes(km)) kms.push(km);
  }
  return kms;
}

/** Rótulo gravado em competition_distances.label (mesmo formato de antes: "7 km"). */
export const rotuloKm = (km: number): string => `${km} km`;

/** Texto da prévia: "2 km, 4 km e 6 km". */
export function listaKm(kms: number[]): string {
  const r = kms.map(rotuloKm);
  return r.length <= 1 ? r.join("") : `${r.slice(0, -1).join(", ")} e ${r[r.length - 1]}`;
}
