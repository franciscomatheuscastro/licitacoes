"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

function aguardar(
  milissegundos: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milissegundos
      );
    }
  );
}

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

type ResultadoLote = {
  sucesso: boolean;

  encontradas?: number;

  salvas?: number;

  erros?: number;

  paginasProcessadas?: number;

  quantidadeRecebida?: number;

  paginaInicial?: number;

  paginaFinal?: number;

  proximaPagina?: number | null;

  concluida?: boolean;

  totalPaginasPNCP?: number | null;

  limiteTotalAtingido?: boolean;

  erro?: string;
};

type Progresso = {
  paginas: number;

  encontradas: number;

  salvas: number;

  erros: number;

  quantidadeRecebida: number;

  paginaAtual: number;

  totalPaginasPNCP:
    number | null;
};

async function lerResposta(
  resposta: Response
): Promise<ResultadoLote> {
  const contentType =
    resposta.headers.get(
      "content-type"
    ) || "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      return (
        await resposta.json()
      ) as ResultadoLote;
    } catch {
      throw new Error(
        "O servidor retornou uma resposta inválida."
      );
    }
  }

  await resposta
    .text()
    .catch(() => "");

  if (
    resposta.status ===
    504
  ) {
    throw new Error(
      "Esta etapa da pesquisa demorou mais do que o permitido pelo servidor."
    );
  }

  if (
    resposta.status ===
    429
  ) {
    throw new Error(
      "O PNCP atingiu temporariamente o limite de consultas. Aguarde alguns instantes e tente novamente."
    );
  }

  if (
    resposta.status >= 500
  ) {
    throw new Error(
      "O servidor não conseguiu concluir esta etapa da pesquisa."
    );
  }

  throw new Error(
    `Erro ${resposta.status} ao realizar a pesquisa.`
  );
}

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
    useState<ResultadoLote | null>(
      null
    );

  const [
    progresso,
    setProgresso,
  ] =
    useState<Progresso | null>(
      null
    );

  async function pesquisar(
    event: FormEvent
  ) {
    event.preventDefault();

    if (pesquisando) {
      return;
    }

    if (
      encerramentoInicio &&
      encerramentoFim &&
      encerramentoInicio >
        encerramentoFim
    ) {
      setResultado({
        sucesso: false,

        erro:
          "A data inicial não pode ser posterior à data final.",
      });

      return;
    }

    setPesquisando(true);

    setResultado(null);

    setProgresso({
      paginas: 0,
      encontradas: 0,
      salvas: 0,
      erros: 0,
      quantidadeRecebida: 0,
      paginaAtual: 1,
      totalPaginasPNCP:
        null,
    });

    let paginaInicial =
      1;

    let totalPaginas =
      0;

    let totalEncontradas =
      0;

    let totalSalvas =
      0;

    let totalErros =
      0;

    let totalRecebidas =
      0;

    let totalPaginasPNCP:
      number | null = null;

    let limiteTotalAtingido =
      false;

    try {
      /*
       * Segurança contra loop inesperado.
       *
       * 200 páginas / 8 por lote = 25 lotes.
       */
      for (
        let lote = 1;
        lote <= 30;
        lote++
      ) {
        const resposta =
          await fetch(
            "/api/licitacoes/buscar",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",
              },

              cache:
                "no-store",

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

                  paginaInicial,
                }),
            }
          );

        const dados =
          await lerResposta(
            resposta
          );

        if (
          !resposta.ok ||
          !dados.sucesso
        ) {
          throw new Error(
            dados.erro ||
              "Não foi possível concluir esta etapa da pesquisa."
          );
        }

        totalPaginas +=
          dados.paginasProcessadas ||
          0;

        totalEncontradas +=
          dados.encontradas ||
          0;

        totalSalvas +=
          dados.salvas ||
          0;

        totalErros +=
          dados.erros ||
          0;

        totalRecebidas +=
          dados.quantidadeRecebida ||
          0;

        if (
          dados.totalPaginasPNCP
        ) {
          totalPaginasPNCP =
            dados.totalPaginasPNCP;
        }

        if (
          dados.limiteTotalAtingido
        ) {
          limiteTotalAtingido =
            true;
        }

        setProgresso({
          paginas:
            totalPaginas,

          encontradas:
            totalEncontradas,

          salvas:
            totalSalvas,

          erros:
            totalErros,

          quantidadeRecebida:
            totalRecebidas,

          paginaAtual:
            dados.paginaFinal ||
            paginaInicial,

          totalPaginasPNCP,
        });

        /*
         * Terminou naturalmente.
         */
        if (
          dados.concluida ||
          !dados.proximaPagina
        ) {
          break;
        }

        paginaInicial =
          dados.proximaPagina;

        /*
         * Intervalo entre LOTES.
         *
         * O servidor já espera entre páginas.
         */
        await aguardar(
          2000
        );
      }

      setResultado({
        sucesso: true,

        encontradas:
          totalEncontradas,

        salvas:
          totalSalvas,

        erros:
          totalErros,

        paginasProcessadas:
          totalPaginas,

        quantidadeRecebida:
          totalRecebidas,

        totalPaginasPNCP,

        limiteTotalAtingido,
      });

      router.refresh();
    } catch (erro) {
      /*
       * Os lotes anteriores já foram
       * persistidos no Railway.
       */
      router.refresh();

      setResultado({
        sucesso: false,

        erro:
          erro instanceof Error
            ? totalPaginas >
              0
              ? `${erro.message} As ${totalPaginas} páginas processadas anteriormente já foram salvas.`
              : erro.message
            : "Não foi possível concluir a pesquisa.",
      });
    } finally {
      setPesquisando(
        false
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResultado(null);

          setProgresso(null);

          setAberto(true);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
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
          <div className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  Pesquisar licitações
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-600">
                  Consulte o PNCP e salve as
                  oportunidades encontradas.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  pesquisando
                }
                onClick={() =>
                  setAberto(
                    false
                  )
                }
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
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
                  disabled={
                    pesquisando
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />

                <p className="mt-2 text-xs font-medium text-slate-500">
                  A pesquisa considera objeto,
                  informações complementares e
                  órgão.
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
                    disabled={
                      pesquisando
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm"
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
                    disabled={
                      pesquisando
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm"
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
                      disabled={
                        pesquisando
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm"
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
                      disabled={
                        pesquisando
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {pesquisando &&
                progresso && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />

                      <div>
                        <p className="text-sm font-bold text-blue-900">
                          Pesquisando no PNCP...
                        </p>

                        <p className="mt-1 text-xs font-medium text-blue-700">
                          Os resultados são salvos
                          lote a lote.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-medium text-blue-800">
                      <p>
                        Páginas:{" "}
                        <strong>
                          {
                            progresso.paginas
                          }
                          {progresso.totalPaginasPNCP
                            ? ` / ${Math.min(
                                progresso.totalPaginasPNCP,
                                200
                              )}`
                            : ""}
                        </strong>
                      </p>

                      <p>
                        Página atual:{" "}
                        <strong>
                          {
                            progresso.paginaAtual
                          }
                        </strong>
                      </p>

                      <p>
                        Encontradas:{" "}
                        <strong>
                          {
                            progresso.encontradas
                          }
                        </strong>
                      </p>

                      <p>
                        Salvas:{" "}
                        <strong>
                          {
                            progresso.salvas
                          }
                        </strong>
                      </p>
                    </div>
                  </div>
                )}

              {resultado &&
                !pesquisando && (
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

                        {resultado
                          .limiteTotalAtingido && (
                          <p className="mt-3 border-t border-emerald-200 pt-3 text-xs font-medium text-emerald-800">
                            A pesquisa atingiu o
                            limite técnico de 200
                            páginas.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-red-900">
                          Pesquisa interrompida.
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
                    setAberto(
                      false
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    pesquisando
                  }
                  className="inline-flex min-w-[155px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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