"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  titulo: string;
  status: string;
};

export default function ExcluirOportunidade({ id, titulo, status }: Props) {
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    if (excluindo) return;

    const avisoStatus = ["PARTICIPANDO", "GANHA"].includes(status)
      ? "\nATENÇÃO: esta oportunidade está classificada como " + status + "."
      : "";

    const confirmado = window.confirm(
      `Deseja EXCLUIR definitivamente esta oportunidade do banco?\n\n${titulo}${avisoStatus}\n\nEsta ação não pode ser desfeita. Uma nova pesquisa ao PNCP poderá cadastrá-la novamente.`
    );
    if (!confirmado) return;

    setExcluindo(true);
    try {
      const resposta = await fetch(
        `/api/oportunidades/${encodeURIComponent(id)}`,
        { method: "DELETE", cache: "no-store" }
      );
      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Não foi possível excluir a oportunidade.");
      }

      router.refresh();
    } catch (erro) {
      window.alert(
        erro instanceof Error ? erro.message : "Não foi possível excluir a oportunidade."
      );
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <button
      type="button"
      onClick={excluir}
      disabled={excluindo}
      title="Excluir esta oportunidade do banco"
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6" />
      </svg>
      {excluindo ? "Excluindo..." : "Excluir"}
    </button>
  );
}
