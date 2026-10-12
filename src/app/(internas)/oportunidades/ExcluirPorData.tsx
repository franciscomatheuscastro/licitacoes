"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { dataInicial?: string };

type Previa = {
  sucesso: boolean;
  excluiveis?: number;
  protegidas?: number;
  erro?: string;
};

export default function ExcluirPorData({ dataInicial = "" }: Props) {
  const router = useRouter();
  const [data, setData] = useState(dataInicial);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setData(dataInicial);
  }, [dataInicial]);

  async function excluirPorData() {
    if (!data || ocupado) return;
    setOcupado(true);

    try {
      const consulta = await fetch(
        `/api/oportunidades/excluir-por-data?data=${encodeURIComponent(data)}`,
        { cache: "no-store" }
      );
      const previa = (await consulta.json().catch(() => ({}))) as Previa;
      if (!consulta.ok || !previa.sucesso) {
        throw new Error(previa.erro || "Não foi possível verificar as licitações da data.");
      }

      const excluiveis = previa.excluiveis || 0;
      const protegidas = previa.protegidas || 0;
      const dataExibicao = data.split("-").reverse().join("/");

      if (!excluiveis) {
        window.alert(
          `Não há oportunidades liberadas para exclusão com encerramento em ${dataExibicao}.` +
          (protegidas ? `\n${protegidas} oportunidade(s) protegida(s) por status.` : "")
        );
        return;
      }

      const confirmado = window.confirm(
        `EXCLUSÃO DEFINITIVA POR DATA\n\n` +
        `Data de encerramento: ${dataExibicao}\n` +
        `Oportunidades que serão excluídas: ${excluiveis}\n` +
        `Protegidas (Participando/Ganha): ${protegidas}\n\n` +
        `Confirma a exclusão? Esta ação não pode ser desfeita.\n` +
        `Atenção: uma nova pesquisa poderá importar essas licitações novamente.`
      );
      if (!confirmado) return;

      const resposta = await fetch("/api/oportunidades/excluir-por-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, confirmar: true }),
        cache: "no-store",
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível excluir as oportunidades.");
      }

      window.alert(
        `${resultado.excluidas ?? 0} oportunidade(s) excluída(s) com encerramento em ${dataExibicao}.`
      );
      router.refresh();
    } catch (erro) {
      window.alert(
        erro instanceof Error ? erro.message : "Erro ao excluir oportunidades por data."
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div>
        <label htmlFor="data-exclusao" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
          Encerramento em
        </label>
        <input
          id="data-exclusao"
          type="date"
          value={data}
          onChange={(event) => setData(event.target.value)}
          disabled={ocupado}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 sm:w-[175px]"
        />
      </div>
      <button
        type="button"
        onClick={excluirPorData}
        disabled={!data || ocupado}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ocupado ? "Verificando..." : "Excluir por data"}
      </button>
    </div>
  );
}
