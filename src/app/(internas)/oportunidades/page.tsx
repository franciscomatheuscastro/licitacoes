import Link from "next/link";

import RepositorioLicitacao from "@/backend/licitacoes/RepositorioLicitacao";

import BotaoPesquisa from "./BotaoPesquisa";
import StatusOportunidade from "./StatusOportunidade";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  encIni?: string;
  encFim?: string;
}>;

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
    !Number.isFinite(
      numero
    )
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

/*
 * Converte Date para YYYY-MM-DD
 * considerando o horário de Brasília.
 */
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
    Record<
      string,
      string
    > = {};

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

    case "DESCARTADA":
      return "Descartada";

    case "PARTICIPANDO":
      return "Participando";

    case "GANHA":
      return "Ganha";

    case "PERDIDA":
      return "Perdida";

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

  /*
   * Todas as oportunidades já
   * armazenadas no Railway.
   */
  const todasLicitacoes =
    await RepositorioLicitacao
      .listar();

  /*
   * ===================================================
   * FILTRO DE ENCERRAMENTO
   * ===================================================
   *
   * Este filtro NÃO chama o PNCP.
   *
   * Ele apenas filtra os registros
   * já armazenados no banco.
   */
  const licitacoes =
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
   * Eles acompanham o período filtrado.
   */

  const novas =
    licitacoes.filter(
      (item) =>
        item.status ===
        "NOVA"
    ).length;

  const emAnalise =
    licitacoes.filter(
      (item) =>
        item.status ===
        "EM_ANALISE"
    ).length;

  const participando =
    licitacoes.filter(
      (item) =>
        item.status ===
        "PARTICIPANDO"
    ).length;

  const valorPotencial =
    licitacoes
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

  const possuiFiltro =
    Boolean(
      encerramentoInicio ||
        encerramentoFim
    );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* CABEÇALHO */}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
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

            <div className="shrink-0">
              <BotaoPesquisa />
            </div>
          </div>
        </section>

        {/* INDICADORES */}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Resumo
            titulo="Novas"
            valor={
              String(
                novas
              )
            }
            subtitulo="Aguardando análise"
          />

          <Resumo
            titulo="Em análise"
            valor={
              String(
                emAnalise
              )
            }
            subtitulo="Em avaliação"
          />

          <Resumo
            titulo="Participando"
            valor={
              String(
                participando
              )
            }
            subtitulo="Processos ativos"
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
              Filtre as oportunidades já
              encontradas pela data de
              encerramento das propostas.
            </p>
          </div>

          <form
            method="GET"
            action="/oportunidades"
            className="flex flex-col gap-4 lg:flex-row lg:items-end"
          >
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
                  Limpar
                </Link>
              )}
            </div>
          </form>
        </section>

        {/* OPORTUNIDADES */}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Oportunidades encontradas
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {licitacoes.length ===
                0
                  ? possuiFiltro
                    ? "Nenhuma oportunidade encontrada neste período."
                    : "Nenhuma oportunidade armazenada."
                  : `${licitacoes.length} ${
                      licitacoes.length ===
                      1
                        ? "oportunidade"
                        : "oportunidades"
                    } exibida${
                      licitacoes.length ===
                      1
                        ? ""
                        : "s"
                    }.`}
              </p>
            </div>

            {possuiFiltro && (
              <div className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                Filtro ativo
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
                        {/* TAGS */}

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

                        {/* TÍTULO */}

                        <h3 className="max-w-4xl text-base font-semibold leading-6 text-slate-900 sm:text-lg">
                          {
                            licitacao.titulo
                          }
                        </h3>

                        {/* INFORMAÇÕES */}

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

                      {/* AÇÕES */}

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
 * CARD DE INDICADOR
 * =====================================================
 */

function Resumo({
  titulo,
  valor,
  subtitulo,
}: {
  titulo: string;
  valor: string;
  subtitulo: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
}

/*
 * =====================================================
 * INFORMAÇÃO
 * =====================================================
 */

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

/*
 * =====================================================
 * EMPTY STATE
 * =====================================================
 */

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
            ? "Nenhuma oportunidade neste período"
            : "Seu radar ainda está vazio"}
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          {filtrado
            ? "Altere o intervalo de encerramento ou limpe o filtro para visualizar outras oportunidades."
            : "Faça uma pesquisa no PNCP para localizar novas licitações. As oportunidades encontradas serão salvas automaticamente aqui."}
        </p>

        {filtrado ? (
          <Link
            href="/oportunidades"
            className="mt-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Limpar filtro
          </Link>
        ) : (
          <div className="mt-5 inline-flex rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600">
            Use o botão “Fazer pesquisa” acima
          </div>
        )}
      </div>
    </div>
  );
}