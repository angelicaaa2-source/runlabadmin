import type { MouseEvent } from "react";

/**
 * No celular as abas ficam numa faixa que rola pro lado.
 * Ao tocar numa aba, centraliza ela na faixa pra mostrar as vizinhas.
 */
export const scrollTabIntoView = (event: MouseEvent<HTMLElement>) => {
  event.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
};
