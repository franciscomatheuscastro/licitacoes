"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  statusAtual: string;
};

const STATUS = [
  {
    valor: "NOVA",
    label: "Nova",
  },
  {
    valor: "EM_ANALISE",
    label: "Em análise",
  },
  {
    valor: "INTERESSANTE",
    label: "Interessante",
  },
  {
    valor: "PARTICIPANDO",
    label: "Participando",
  },
  {
    valor: "GANHA",
    label: "Ganha",
  },
  {
    valor: "PERDIDA",
    label: "Perdida",
  },
  {
    valor: "DESCARTADA",
    label: "Descartada",
  },
];

export default function StatusOportunidade({
  id,
  statusAtual,
}: Props) {
  const router = useRouter();

  const [status, setStatus] =
    useState(statusAtual);

  const [salvando, setSalvando] =
    useState(false);

  async function alterarStatus(
    novoStatus: string
  ) {
    if (
      salvando ||
      novoStatus === status
    ) {
      return;
    }

    const statusAnterior =
      status;

    setStatus(novoStatus);
    setSalvando(true);

    try {
      const resposta =
        await fetch(
          `/api/oportunidades/${id}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              status: novoStatus,
            }),
          }
        );

      const dados =
        await resposta.json();

      if (
        !resposta.ok ||
        !dados.sucesso
      ) {
        throw new Error(
          dados.erro ||
            "Erro ao alterar status."
        );
      }

      router.refresh();
    } catch (erro) {
      setStatus(statusAnterior);

      alert(
        erro instanceof Error
          ? erro.message
          : "Erro ao alterar status."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <select
      value={status}
      disabled={salvando}
      onChange={(event) =>
        alterarStatus(
          event.target.value
        )
      }
      className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60"
    >
      {STATUS.map((item) => (
        <option
          key={item.valor}
          value={item.valor}
        >
          {item.label}
        </option>
      ))}
    </select>
  );
}