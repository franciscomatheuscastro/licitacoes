"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

function proximoDiaUtil() {
  const agora =
    new Date();

  const data =
    new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate()
    );

  const diaSemana =
    data.getDay();

  let adicionar = 1;

  if (diaSemana === 5) {
    adicionar = 3;
  }

  if (diaSemana === 6) {
    adicionar = 2;
  }

  if (diaSemana === 0) {
    adicionar = 1;
  }

  data.setDate(
    data.getDate() +
      adicionar
  );

  const ano =
    data.getFullYear();

  const mes =
    String(
      data.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const dia =
    String(
      data.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${ano}-${mes}-${dia}`;
}

type Resultado = {
  sucesso: boolean;

  encontradas?: number;

  salvas?: number;

  erros?: number;

  paginasProcessadas?: number;

  quantidadeRecebida?: number;

  erro?: string;
};

export default function BotaoPesquisa() {
  const router =
    useRouter();

  const [
    aberto,
    setAberto,
  ] = useState(false);

  const [
    pesquisando,
    setPesquisando,
  ] = useState(false);

  const [
    termo,
    setTermo,
  ] = useState(
    "medico"
  );

  const [
    uf,
    setUf,
  ] = useState("");

  const [
    modalidade,
    setModalidade,
  ] = useState(
    "6"
  );

  const [
    encerramentoInicio,
    setEncerramentoInicio,
  ] = useState(
    proximoDiaUtil()
  );

  const [
    encerramentoFim,
    setEncerramentoFim,
  ] = useState(
    proximoDiaUtil()
  );

  const [
    resultado,
    setResultado,
  ] =
    useState<Resultado | null>(
      null
    );

  async function pesquisar(
    event: FormEvent
  ) {
    event.preventDefault();

    if (pesquisando) {
      return;
    }

    setPesquisando(true);
    setResultado(null);

    try {
      const resposta =
        await fetch(
          "/api/licitacoes/buscar",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                termo,

                uf:
                  uf ||
                  undefined,

                codigoModalidadeContratacao:
                  modalidade,

                encerramentoInicio:
                  encerramentoInicio ||
                  undefined,

                encerramentoFim:
                  encerramentoFim ||
                  undefined,
              }),
          }
        );

      const dados =
        (await resposta.json()) as Resultado;

      if (
        !resposta.ok ||
        !dados.sucesso
      ) {
        throw new Error(
          dados.erro ||
            "Não foi possível realizar a pesquisa."
        );
      }

      setResultado(
        dados
      );

      router.refresh();
    } catch (erro) {
      setResultado({
        sucesso: false,

        erro:
          erro instanceof Error
            ? erro.message
            : "Erro desconhecido.",
      });
    } finally {
      setPesquisando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResultado(null);
          setAberto(true);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-4.35-4.35m1.35-5.15A6.5 6.5 0 1 1 5 11.5a6.5 6.5 0 0 1 13 0Z"
          />
        </svg>

        Fazer pesquisa
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  Pesquisar licitações
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-600">
                  Consulte o PNCP e salve as oportunidades encontradas.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  pesquisando
                }
                onClick={() =>
                  setAberto(false)
                }
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              >
                Fechar
              </button>
            </div>

            <form
              onSubmit={
                pesquisar
              }
              className="space-y-5 px-6 py-5"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Termo de busca
                </label>

                <input
                  type="text"
                  value={
                    termo
                  }
                  onChange={(
                    event
                  ) =>
                    setTermo(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="Ex.: médico"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                  A pesquisa considera objeto, informações complementares e órgão.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    UF
                  </label>

                  <select
                    value={
                      uf
                    }
                    onChange={(
                      event
                    ) =>
                      setUf(
                        event
                          .target
                          .value
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">
                      Todas
                    </option>

                    {[
                      "AC",
                      "AL",
                      "AP",
                      "AM",
                      "BA",
                      "CE",
                      "DF",
                      "ES",
                      "GO",
                      "MA",
                      "MT",
                      "MS",
                      "MG",
                      "PA",
                      "PB",
                      "PR",
                      "PE",
                      "PI",
                      "RJ",
                      "RN",
                      "RS",
                      "RO",
                      "RR",
                      "SC",
                      "SP",
                      "SE",
                      "TO",
                    ].map(
                      (
                        estado
                      ) => (
                        <option
                          key={
                            estado
                          }
                          value={
                            estado
                          }
                        >
                          {
                            estado
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    Modalidade
                  </label>

                  <select
                    value={
                      modalidade
                    }
                    onChange={(
                      event
                    ) =>
                      setModalidade(
                        event
                          .target
                          .value
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="6">
                      Pregão eletrônico
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-slate-800">
                  Encerramento das propostas
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      De
                    </label>

                    <input
                      type="date"
                      value={
                        encerramentoInicio
                      }
                      onChange={(
                        event
                      ) =>
                        setEncerramentoInicio(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Até
                    </label>

                    <input
                      type="date"
                      value={
                        encerramentoFim
                      }
                      onChange={(
                        event
                      ) =>
                        setEncerramentoFim(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              {resultado && (
                <div
                  className={
                    resultado
                      .sucesso
                      ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                      : "rounded-xl border border-red-200 bg-red-50 p-4"
                  }
                >
                  {resultado
                    .sucesso ? (
                    <>
                      <p className="text-sm font-bold text-emerald-900">
                        Pesquisa concluída.
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium text-emerald-800">
                        <p>
                          Encontradas:{" "}
                          <strong>
                            {
                              resultado.encontradas
                            }
                          </strong>
                        </p>

                        <p>
                          Salvas:{" "}
                          <strong>
                            {
                              resultado.salvas
                            }
                          </strong>
                        </p>

                        <p>
                          Páginas:{" "}
                          <strong>
                            {
                              resultado.paginasProcessadas
                            }
                          </strong>
                        </p>

                        <p>
                          Erros:{" "}
                          <strong>
                            {
                              resultado.erros
                            }
                          </strong>
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-red-900">
                        Não foi possível realizar a pesquisa.
                      </p>

                      <p className="mt-2 text-sm font-medium leading-6 text-red-800">
                        {
                          resultado.erro
                        }
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  disabled={
                    pesquisando
                  }
                  onClick={() =>
                    setAberto(false)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    pesquisando
                  }
                  className="inline-flex min-w-[150px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pesquisando
                    ? "Pesquisando..."
                    : "Buscar no PNCP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}