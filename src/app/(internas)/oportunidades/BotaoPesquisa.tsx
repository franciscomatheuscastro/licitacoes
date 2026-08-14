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

  limitePaginasAtingido?: boolean;

  erro?: string;
};

async function lerResposta(
  resposta: Response
): Promise<Resultado> {
  const contentType =
    resposta.headers.get(
      "content-type"
    ) || "";

  /*
   * Resposta normal da nossa API.
   */
  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      return (
        await resposta.json()
      ) as Resultado;
    } catch {
      throw new Error(
        "O servidor retornou uma resposta inválida."
      );
    }
  }

  /*
   * Quando a infraestrutura da Vercel encerra
   * a Function, ela pode responder texto/HTML.
   */
  const texto =
    await resposta
      .text()
      .catch(
        () => ""
      );

  if (
    resposta.status ===
    504
  ) {
    throw new Error(
      "A pesquisa demorou mais do que o permitido pelo servidor. Tente novamente ou utilize um período menor."
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
      "O servidor não conseguiu concluir a pesquisa. Tente novamente em alguns instantes."
    );
  }

  throw new Error(
    texto
      ? texto.slice(
          0,
          200
        )
      : `Erro ${resposta.status} ao realizar a pesquisa.`
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

    /*
     * Validação no cliente também.
     */
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

    try {
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
              }),
          }
        );

      /*
       * Não usamos resposta.json() diretamente.
       *
       * Em produção a Vercel pode responder
       * texto caso a Function seja interrompida.
       */
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
            "Não foi possível realizar a pesquisa."
        );
      }

      setResultado(
        dados
      );

      router.refresh();
    } catch (erro) {
      console.error(
        "[PESQUISA PNCP]",
        erro
      );

      setResultado({
        sucesso: false,

        erro:
          erro instanceof Error
            ? erro.message
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
            {/* CABEÇALHO */}

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
                  setAberto(
                    false
                  )
                }
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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
              {/* TERMO */}

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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:opacity-70"
                />

                <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                  A pesquisa considera objeto,
                  informações complementares e
                  órgão.
                </p>
              </div>

              {/* UF E MODALIDADE */}

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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:opacity-70"
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:opacity-70"
                  >
                    <option value="6">
                      Pregão eletrônico
                    </option>
                  </select>
                </div>
              </div>

              {/* ENCERRAMENTO */}

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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:opacity-70"
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:opacity-70"
                    />
                  </div>
                </div>
              </div>

              {/* PESQUISANDO */}

              {pesquisando && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />

                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      Consultando o PNCP...
                    </p>

                    <p className="mt-0.5 text-xs font-medium text-blue-700">
                      Isso pode levar alguns
                      segundos.
                    </p>
                  </div>
                </div>
              )}

              {/* RESULTADO */}

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
                          .limitePaginasAtingido && (
                          <p className="mt-3 border-t border-emerald-200 pt-3 text-xs font-medium leading-5 text-emerald-800">
                            A consulta atingiu o
                            limite técnico desta
                            pesquisa. Podem existir
                            outras oportunidades no
                            PNCP.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-red-900">
                          Não foi possível realizar
                          a pesquisa.
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

              {/* BOTÕES */}

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
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    pesquisando
                  }
                  className="inline-flex min-w-[155px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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