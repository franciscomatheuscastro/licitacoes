import Link from "next/link";

import RepositorioLicitacao from "@/backend/licitacoes/RepositorioLicitacao";

import BotaoPesquisa from "./BotaoPesquisa";
import StatusOportunidade from "./StatusOportunidade";

export const dynamic =
  "force-dynamic";

type SearchParams = Promise<{
  encIni?: string;
  encFim?: string;
  status?: string;
}>;

const STATUS_VALIDOS = [
  "NOVA",
  "EM_ANALISE",
  "INTERESSANTE",
  "PARTICIPANDO",
  "GANHA",
  "PERDIDA",
  "DESCARTADA",
];

/*
 * =====================================================
 * FORMATAÇÃO
 * =====================================================
 */

function formatarMoeda(
  valor:
    | number
    | string
    | {
        toString(): string;
      }
    | null
) {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "Não informado";
  }

  const numero =
    Number(
      valor.toString()
    );

  if (
    !Number.isFinite(numero)
  ) {
    return "Não informado";
  }

  return numero.toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  );
}

function formatarData(
  valor: Date | null
) {
  if (!valor) {
    return "Não informado";
  }

  return valor.toLocaleString(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      dateStyle: "short",
      timeStyle: "short",
    }
  );
}

function obterDataLocal(
  valor: Date | null
) {
  if (!valor) {
    return null;
  }

  const partes =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Sao_Paulo",

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      valor
    );

  const dados:
    Record<string, string> =
    {};

  for (
    const parte of partes
  ) {
    if (
      parte.type !==
      "literal"
    ) {
      dados[
        parte.type
      ] = parte.value;
    }
  }

  return `${dados.year}-${dados.month}-${dados.day}`;
}

/*
 * =====================================================
 * STATUS
 * =====================================================
 */

function labelStatus(
  status: string
) {
  switch (status) {
    case "NOVA":
      return "Nova";

    case "EM_ANALISE":
      return "Em análise";

    case "INTERESSANTE":
      return "Interessante";

    case "PARTICIPANDO":
      return "Participando";

    case "GANHA":
      return "Ganha";

    case "PERDIDA":
      return "Perdida";

    case "DESCARTADA":
      return "Descartada";

    default:
      return status;
  }
}

function classeStatus(
  status: string
) {
  switch (status) {
    case "NOVA":
      return (
        "border-blue-100 " +
        "bg-blue-50 " +
        "text-blue-700"
      );

    case "EM_ANALISE":
      return (
        "border-amber-100 " +
        "bg-amber-50 " +
        "text-amber-700"
      );

    case "INTERESSANTE":
      return (
        "border-violet-100 " +
        "bg-violet-50 " +
        "text-violet-700"
      );

    case "PARTICIPANDO":
      return (
        "border-cyan-100 " +
        "bg-cyan-50 " +
        "text-cyan-700"
      );

    case "GANHA":
      return (
        "border-emerald-100 " +
        "bg-emerald-50 " +
        "text-emerald-700"
      );

    case "PERDIDA":
    case "DESCARTADA":
      return (
        "border-red-100 " +
        "bg-red-50 " +
        "text-red-700"
      );

    default:
      return (
        "border-slate-100 " +
        "bg-slate-50 " +
        "text-slate-700"
      );
  }
}

/*
 * =====================================================
 * PÁGINA
 * =====================================================
 */

export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const parametros =
    await searchParams;

  const encerramentoInicio =
    typeof parametros.encIni ===
    "string"
      ? parametros.encIni
      : "";

  const encerramentoFim =
    typeof parametros.encFim ===
    "string"
      ? parametros.encFim
      : "";

  const statusSelecionado =
    typeof parametros.status ===
      "string" &&
    STATUS_VALIDOS.includes(
      parametros.status
    )
      ? parametros.status
      : "";

  /*
   * Todas as oportunidades do banco.
   */
  const todasLicitacoes =
    await RepositorioLicitacao
      .listar();

  /*
   * ===================================================
   * PRIMEIRO: FILTRO DE DATA
   * ===================================================
   *
   * Os indicadores serão calculados em cima
   * deste conjunto.
   */

  const licitacoesNoPeriodo =
    todasLicitacoes.filter(
      (item) => {
        if (
          !encerramentoInicio &&
          !encerramentoFim
        ) {
          return true;
        }

        const data =
          obterDataLocal(
            item.prazoEncerramento
          );

        if (!data) {
          return false;
        }

        if (
          encerramentoInicio &&
          data <
            encerramentoInicio
        ) {
          return false;
        }

        if (
          encerramentoFim &&
          data >
            encerramentoFim
        ) {
          return false;
        }

        return true;
      }
    );

  /*
   * ===================================================
   * INDICADORES
   * ===================================================
   *
   * Importante:
   * eles respeitam o período,
   * mas NÃO o filtro de status.
   *
   * Assim, mesmo estando em "Em análise",
   * você continua vendo quantas existem
   * nas outras categorias.
   */

  const novas =
    licitacoesNoPeriodo.filter(
      (item) =>
        item.status ===
        "NOVA"
    ).length;

  const emAnalise =
    licitacoesNoPeriodo.filter(
      (item) =>
        item.status ===
        "EM_ANALISE"
    ).length;

  const participando =
    licitacoesNoPeriodo.filter(
      (item) =>
        item.status ===
        "PARTICIPANDO"
    ).length;

  const valorPotencial =
    licitacoesNoPeriodo
      .filter(
        (item) =>
          item.status !==
            "DESCARTADA" &&
          item.status !==
            "PERDIDA"
      )
      .reduce(
        (
          total,
          item
        ) => {
          return (
            total +
            Number(
              item
                .valorEstimado
                ?.toString() ||
                0
            )
          );
        },
        0
      );

  /*
   * ===================================================
   * SEGUNDO: FILTRO DE STATUS
   * ===================================================
   */

  const licitacoes =
    statusSelecionado
      ? licitacoesNoPeriodo.filter(
          (item) =>
            item.status ===
            statusSelecionado
        )
      : licitacoesNoPeriodo;

  /*
   * ===================================================
   * LINKS DE STATUS
   * ===================================================
   *
   * Preservam as datas selecionadas.
   */

  function hrefStatus(
    status?: string
  ) {
    const query =
      new URLSearchParams();

    if (
      encerramentoInicio
    ) {
      query.set(
        "encIni",
        encerramentoInicio
      );
    }

    if (
      encerramentoFim
    ) {
      query.set(
        "encFim",
        encerramentoFim
      );
    }

    if (status) {
      query.set(
        "status",
        status
      );
    }

    const texto =
      query.toString();

    return texto
      ? `/oportunidades?${texto}`
      : "/oportunidades";
  }

  const possuiFiltroData =
    Boolean(
      encerramentoInicio ||
        encerramentoFim
    );

  const possuiFiltro =
    Boolean(
      possuiFiltroData ||
        statusSelecionado
    );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* CABEÇALHO */}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Radar de Licitações
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Oportunidades
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Pesquise licitações no PNCP,
                armazene as oportunidades
                encontradas e acompanhe o
                pipeline comercial em um
                único lugar.
              </p>
            </div>

            <BotaoPesquisa />
          </div>
        </section>

        {/* INDICADORES CLICÁVEIS */}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Resumo
            titulo="Novas"
            valor={
              String(novas)
            }
            subtitulo="Aguardando análise"
            href={
              hrefStatus(
                "NOVA"
              )
            }
            ativo={
              statusSelecionado ===
              "NOVA"
            }
            cor="blue"
          />

          <Resumo
            titulo="Em análise"
            valor={
              String(
                emAnalise
              )
            }
            subtitulo="Em avaliação"
            href={
              hrefStatus(
                "EM_ANALISE"
              )
            }
            ativo={
              statusSelecionado ===
              "EM_ANALISE"
            }
            cor="amber"
          />

          <Resumo
            titulo="Participando"
            valor={
              String(
                participando
              )
            }
            subtitulo="Processos ativos"
            href={
              hrefStatus(
                "PARTICIPANDO"
              )
            }
            ativo={
              statusSelecionado ===
              "PARTICIPANDO"
            }
            cor="cyan"
          />

          <Resumo
            titulo="Valor potencial"
            valor={
              valorPotencial
                .toLocaleString(
                  "pt-BR",
                  {
                    style:
                      "currency",

                    currency:
                      "BRL",
                  }
                )
            }
            subtitulo="Pipeline estimado"
          />
        </section>

        {/* FILTROS */}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Filtrar oportunidades
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Filtre por status e pela data
              de encerramento das propostas.
            </p>
          </div>

          {/* FILTROS RÁPIDOS DE STATUS */}

          <div className="mb-5 flex flex-wrap gap-2">
            <Link
              href={
                hrefStatus()
              }
              className={
                !statusSelecionado
                  ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              }
            >
              Todas (
              {
                licitacoesNoPeriodo.length
              }
              )
            </Link>

            <Link
              href={
                hrefStatus(
                  "NOVA"
                )
              }
              className={
                statusSelecionado ===
                "NOVA"
                  ? "rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              }
            >
              Novas ({novas})
            </Link>

            <Link
              href={
                hrefStatus(
                  "EM_ANALISE"
                )
              }
              className={
                statusSelecionado ===
                "EM_ANALISE"
                  ? "rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
              }
            >
              Em análise (
              {emAnalise})
            </Link>

            <Link
              href={
                hrefStatus(
                  "PARTICIPANDO"
                )
              }
              className={
                statusSelecionado ===
                "PARTICIPANDO"
                  ? "rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
              }
            >
              Participando (
              {participando})
            </Link>
          </div>

          {/* FILTRO DE DATA */}

          <form
            method="GET"
            action="/oportunidades"
            className="flex flex-col gap-4 lg:flex-row lg:items-end"
          >
            {statusSelecionado && (
              <input
                type="hidden"
                name="status"
                value={
                  statusSelecionado
                }
              />
            )}

            <div className="w-full lg:max-w-[220px]">
              <label
                htmlFor="encIni"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Encerramento de
              </label>

              <input
                id="encIni"
                name="encIni"
                type="date"
                defaultValue={
                  encerramentoInicio
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="w-full lg:max-w-[220px]">
              <label
                htmlFor="encFim"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Encerramento até
              </label>

              <input
                id="encFim"
                name="encFim"
                type="date"
                defaultValue={
                  encerramentoFim
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Aplicar filtro
              </button>

              {possuiFiltro && (
                <Link
                  href="/oportunidades"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Limpar tudo
                </Link>
              )}
            </div>
          </form>
        </section>

        {/* LISTA */}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {statusSelecionado
                  ? labelStatus(
                      statusSelecionado
                    )
                  : "Oportunidades encontradas"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {licitacoes.length ===
                0
                  ? "Nenhuma oportunidade encontrada com os filtros selecionados."
                  : `${licitacoes.length} ${
                      licitacoes.length ===
                      1
                        ? "oportunidade exibida"
                        : "oportunidades exibidas"
                    }.`}
              </p>
            </div>

            {possuiFiltro && (
              <div className="flex flex-wrap gap-2">
                {statusSelecionado && (
                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${classeStatus(
                      statusSelecionado
                    )}`}
                  >
                    {labelStatus(
                      statusSelecionado
                    )}
                  </span>
                )}

                {possuiFiltroData && (
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    Período filtrado
                  </span>
                )}
              </div>
            )}
          </div>

          {licitacoes.length ===
          0 ? (
            <EmptyState
              filtrado={
                possuiFiltro
              }
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {licitacoes.map(
                (
                  licitacao
                ) => (
                  <article
                    key={
                      licitacao.id
                    }
                    className="p-6 transition hover:bg-slate-50/70"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classeStatus(
                              licitacao.status
                            )}`}
                          >
                            {labelStatus(
                              licitacao.status
                            )}
                          </span>

                          {licitacao.uf && (
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                              {
                                licitacao.uf
                              }
                            </span>
                          )}

                          {licitacao.situacaoPNCP && (
                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {
                                licitacao
                                  .situacaoPNCP
                              }
                            </span>
                          )}
                        </div>

                        <h3 className="max-w-4xl text-base font-semibold leading-6 text-slate-900 sm:text-lg">
                          {
                            licitacao.titulo
                          }
                        </h3>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <Informacao
                            titulo="Órgão"
                            valor={
                              licitacao.orgao ||
                              "Não informado"
                            }
                          />

                          <Informacao
                            titulo="Local"
                            valor={
                              [
                                licitacao.municipio,
                                licitacao.uf,
                              ]
                                .filter(
                                  Boolean
                                )
                                .join(
                                  " / "
                                ) ||
                              "Não informado"
                            }
                          />

                          <Informacao
                            titulo="Valor estimado"
                            valor={
                              formatarMoeda(
                                licitacao.valorEstimado
                              )
                            }
                          />

                          <Informacao
                            titulo="Encerramento"
                            valor={
                              formatarData(
                                licitacao.prazoEncerramento
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <StatusOportunidade
                          id={
                            licitacao.id
                          }
                          statusAtual={
                            licitacao.status
                          }
                        />

                        {licitacao.url && (
                          <a
                            href={
                              licitacao.url
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Abrir licitação
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/*
 * =====================================================
 * INDICADOR
 * =====================================================
 */

function Resumo({
  titulo,
  valor,
  subtitulo,
  href,
  ativo = false,
  cor = "slate",
}: {
  titulo: string;
  valor: string;
  subtitulo: string;

  href?: string;

  ativo?: boolean;

  cor?:
    | "slate"
    | "blue"
    | "amber"
    | "cyan";
}) {
  const classeAtivo =
    ativo
      ? cor === "blue"
        ? "border-blue-400 ring-2 ring-blue-100"
        : cor === "amber"
          ? "border-amber-400 ring-2 ring-amber-100"
          : cor === "cyan"
            ? "border-cyan-400 ring-2 ring-cyan-100"
            : "border-slate-400 ring-2 ring-slate-100"
      : "border-slate-200";

  const conteudo = (
    <div
      className={`h-full rounded-2xl border bg-white p-5 shadow-sm transition ${classeAtivo} ${
        href
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600">
            {titulo}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {valor}
          </p>

          <p className="mt-1 text-xs font-medium text-slate-500">
            {subtitulo}
          </p>
        </div>

        <div className="h-10 w-10 rounded-xl bg-slate-100" />
      </div>
    </div>
  );

  if (!href) {
    return conteudo;
  }

  return (
    <Link
      href={href}
      className="block h-full"
    >
      {conteudo}
    </Link>
  );
}

function Informacao({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </p>

      <p className="mt-1.5 text-sm font-medium leading-5 text-slate-700">
        {valor}
      </p>
    </div>
  );
}

function EmptyState({
  filtrado,
}: {
  filtrado: boolean;
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-7 w-7 text-blue-600"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-4.35-4.35m1.35-5.15A6.5 6.5 0 1 1 5 11.5a6.5 6.5 0 0 1 13 0Z"
            />
          </svg>
        </div>

        <h3 className="mt-5 text-base font-semibold text-slate-900">
          {filtrado
            ? "Nenhuma oportunidade com estes filtros"
            : "Seu radar ainda está vazio"}
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          {filtrado
            ? "Altere os filtros selecionados ou limpe todos para visualizar outras oportunidades."
            : "Faça uma pesquisa no PNCP para localizar novas licitações."}
        </p>

        {filtrado && (
          <Link
            href="/oportunidades"
            className="mt-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Limpar filtros
          </Link>
        )}
      </div>
    </div>
  );
}