import RepositorioLicitacao from "@/backend/licitacoes/RepositorioLicitacao";
import BotaoPesquisa from "./BotaoPesquisa";

export const dynamic = "force-dynamic";

function formatarMoeda(
  valor:
    | number
    | string
    | {
        toString(): string;
      }
    | null
) {
  if (valor === null || valor === undefined) {
    return "Não informado";
  }

  const numero = Number(valor.toString());

  if (!Number.isFinite(numero)) {
    return "Não informado";
  }

  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(valor: Date | null) {
  if (!valor) {
    return "Não informado";
  }

  return valor.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function labelStatus(status: string) {
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

function classeStatus(status: string) {
  switch (status) {
    case "NOVA":
      return "bg-blue-50 text-blue-700 border-blue-100";

    case "EM_ANALISE":
      return "bg-amber-50 text-amber-700 border-amber-100";

    case "INTERESSANTE":
      return "bg-violet-50 text-violet-700 border-violet-100";

    case "PARTICIPANDO":
      return "bg-cyan-50 text-cyan-700 border-cyan-100";

    case "GANHA":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";

    case "PERDIDA":
    case "DESCARTADA":
      return "bg-red-50 text-red-700 border-red-100";

    default:
      return "bg-slate-50 text-slate-700 border-slate-100";
  }
}

export default async function OportunidadesPage() {
  const licitacoes =
    await RepositorioLicitacao.listar();

  const novas =
    licitacoes.filter(
      (item) => item.status === "NOVA"
    ).length;

  const emAnalise =
    licitacoes.filter(
      (item) => item.status === "EM_ANALISE"
    ).length;

  const participando =
    licitacoes.filter(
      (item) => item.status === "PARTICIPANDO"
    ).length;

  const valorPotencial =
    licitacoes
      .filter(
        (item) =>
          item.status !== "DESCARTADA" &&
          item.status !== "PERDIDA"
      )
      .reduce((total, item) => {
        return (
          total +
          Number(
            item.valorEstimado?.toString() || 0
          )
        );
      }, 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Radar de Licitações
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Oportunidades
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Pesquise licitações no PNCP, armazene as oportunidades
                encontradas e acompanhe o pipeline comercial em um único lugar.
              </p>
            </div>

            <div className="shrink-0">
              <BotaoPesquisa />
            </div>
          </div>
        </section>

        {/* Indicadores */}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Resumo
            titulo="Novas"
            valor={String(novas)}
            subtitulo="Aguardando análise"
          />

          <Resumo
            titulo="Em análise"
            valor={String(emAnalise)}
            subtitulo="Em avaliação"
          />

          <Resumo
            titulo="Participando"
            valor={String(participando)}
            subtitulo="Processos ativos"
          />

          <Resumo
            titulo="Valor potencial"
            valor={valorPotencial.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
            subtitulo="Pipeline estimado"
          />
        </section>

        {/* Conteúdo */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Oportunidades encontradas
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {licitacoes.length === 0
                  ? "Nenhuma oportunidade armazenada."
                  : `${licitacoes.length} ${
                      licitacoes.length === 1
                        ? "oportunidade"
                        : "oportunidades"
                    } no radar.`}
              </p>
            </div>
          </div>

          {licitacoes.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-slate-100">
              {licitacoes.map((licitacao) => (
                <article
                  key={licitacao.id}
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
                          {labelStatus(licitacao.status)}
                        </span>

                        {licitacao.uf && (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                            {licitacao.uf}
                          </span>
                        )}

                        {licitacao.situacaoPNCP && (
                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                            {licitacao.situacaoPNCP}
                          </span>
                        )}
                      </div>

                      <h3 className="max-w-4xl text-base font-semibold leading-6 text-slate-900 sm:text-lg">
                        {licitacao.titulo}
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
                              .filter(Boolean)
                              .join(" / ") ||
                            "Não informado"
                          }
                        />

                        <Informacao
                          titulo="Valor estimado"
                          valor={formatarMoeda(
                            licitacao.valorEstimado
                          )}
                        />

                        <Informacao
                          titulo="Encerramento"
                          valor={formatarData(
                            licitacao.prazoEncerramento
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {licitacao.url && (
                        <a
                          href={licitacao.url}
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
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

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
          <p className="text-sm font-medium text-slate-500">
            {titulo}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {valor}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {subtitulo}
          </p>
        </div>

        <div className="h-10 w-10 rounded-xl bg-slate-100" />
      </div>
    </div>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <p className="mt-1.5 text-sm font-medium leading-5 text-slate-700">
        {valor}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center px-6 py-12">
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
          Seu radar ainda está vazio
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Faça uma pesquisa no PNCP para localizar novas licitações.
          As oportunidades encontradas serão salvas automaticamente aqui.
        </p>

        <div className="mt-5 inline-flex rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-500">
          Use o botão “Fazer pesquisa” acima
        </div>
      </div>
    </div>
  );
}