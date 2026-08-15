// src/lib/pncp.ts

import type {
  Licitacao,
  SearchParams,
} from "@/lib/types";

const PNCP_URL =
  "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

const TAMANHO_PAGINA = 50;

/*
 * IMPORTANTE:
 *
 * Esta pesquisa acontece dentro de uma Route Handler da Vercel.
 * Não podemos percorrer 200 páginas em uma única requisição.
 *
 * 8 páginas x 50 registros = até 400 registros brutos.
 *
 * Depois podemos evoluir para uma busca em lotes/background
 * para percorrer todas as páginas sem limite de execução HTTP.
 */
const LIMITE_PAGINAS = 200;

/*
 * Intervalo entre páginas para reduzir risco de HTTP 429.
 */
const INTERVALO_ENTRE_PAGINAS_MS = 2000;

/*
 * Mantemos poucas tentativas para não estourar
 * o tempo total da função em produção.
 */
const MAX_TENTATIVAS = 2;

/*
 * Timeout individual da chamada ao PNCP.
 */
const TIMEOUT_PNCP_MS = 12000;

export interface LicitacaoPNCP {
  numeroControlePNCP?: string;

  objetoCompra?: string;
  informacaoComplementar?: string;

  valorTotalEstimado?: number;

  dataPublicacaoPncp?: string;
  dataInclusao?: string;

  dataEncerramentoProposta?: string;

  situacaoCompraNome?: string;

  modalidadeNome?: string;
  modalidadeId?: number;

  linkSistemaOrigem?: string;
  linkProcessoEletronico?: string;

  anoCompra?: number;
  sequencialCompra?: number;

  orgaoEntidade?: {
    cnpj?: string;
    razaoSocial?: string;
  };

  unidadeOrgao?: {
    nomeUnidade?: string;
    municipioNome?: string;
    ufSigla?: string;
  };
}

interface RespostaPNCP {
  data?: LicitacaoPNCP[];

  totalPaginas?: number;
  totalDePaginas?: number;
  totalPages?: number;
}

export interface FiltrosPesquisaRadar {
  termo?: string;

  uf?: string;

  codigoModalidadeContratacao?: string;

  encerramentoInicio?: string;
  encerramentoFim?: string;
}

export interface ResultadoPesquisaRadar {
  itens: LicitacaoPNCP[];

  paginasProcessadas: number;

  quantidadeRecebida: number;

  limitePaginasAtingido: boolean;
}

/*
 * =====================================================
 * UTILITÁRIOS
 * =====================================================
 */

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

export function normalizarTexto(
  texto: unknown
) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim();
}

function dataHojeBrasil() {
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
      new Date()
    );

  const valores:
    Record<string, string> =
    {};

  for (const parte of partes) {
    if (
      parte.type !== "literal"
    ) {
      valores[
        parte.type
      ] = parte.value;
    }
  }

  return `${valores.year}-${valores.month}-${valores.day}`;
}

function formatarDataPNCP(
  valor: string
) {
  return valor.replaceAll(
    "-",
    ""
  );
}

/*
 * Próximo dia útil.
 */
export function calcularProximoDiaUtil() {
  const hojeTexto =
    dataHojeBrasil();

  const [
    ano,
    mes,
    dia,
  ] = hojeTexto
    .split("-")
    .map(Number);

  const data =
    new Date(
      Date.UTC(
        ano,
        mes - 1,
        dia,
        12
      )
    );

  const diaSemana =
    data.getUTCDay();

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

  data.setUTCDate(
    data.getUTCDate() +
      adicionar
  );

  const anoFinal =
    data.getUTCFullYear();

  const mesFinal =
    String(
      data.getUTCMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const diaFinal =
    String(
      data.getUTCDate()
    ).padStart(
      2,
      "0"
    );

  return `${anoFinal}-${mesFinal}-${diaFinal}`;
}

export function criarIdentificadorPNCP(
  item: LicitacaoPNCP
) {
  if (
    item.numeroControlePNCP
  ) {
    return item
      .numeroControlePNCP;
  }

  const cnpj =
    item.orgaoEntidade
      ?.cnpj;

  const ano =
    item.anoCompra;

  const sequencial =
    item.sequencialCompra;

  if (
    !cnpj ||
    !ano ||
    !sequencial
  ) {
    return null;
  }

  return `${cnpj}_${ano}_${sequencial}`;
}

function converterParaLicitacao(
  item: LicitacaoPNCP
): Licitacao | null {
  const id =
    criarIdentificadorPNCP(
      item
    );

  if (!id) {
    return null;
  }

  return {
    id,

    titulo:
      item.objetoCompra?.trim() ||
      "Objeto não informado",

    orgao:
      item.orgaoEntidade
        ?.razaoSocial,

    uf:
      item.unidadeOrgao
        ?.ufSigla,

    municipio:
      item.unidadeOrgao
        ?.municipioNome,

    modalidade:
      item.modalidadeNome,

    valorEstimado:
      item.valorTotalEstimado,

    dataPublicacao:
      item.dataPublicacaoPncp ||
      item.dataInclusao,

    prazoEncerramento:
      item.dataEncerramentoProposta,

    url:
      item.linkSistemaOrigem ||
      item.linkProcessoEletronico,

    fonte: "PNCP",
  };
}

/*
 * =====================================================
 * ERROS
 * =====================================================
 */

function erroTemporario(
  status: number
) {
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function mensagemErroPNCP(
  status: number
) {
  if (status === 429) {
    return (
      "O PNCP atingiu temporariamente o limite de consultas. " +
      "Aguarde alguns instantes e tente novamente."
    );
  }

  if (
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return (
      "O PNCP está temporariamente indisponível ou instável. " +
      "Tente realizar a pesquisa novamente em alguns instantes."
    );
  }

  return null;
}

/*
 * =====================================================
 * CONSULTA PNCP
 * =====================================================
 */

async function consultarPaginaPNCP({
  dataFinal,
  modalidade,
  pagina,
  tamanhoPagina,
  signal,
}: {
  dataFinal: string;

  modalidade?: string;

  pagina: number;

  tamanhoPagina: number;

  signal?: AbortSignal;
}): Promise<RespostaPNCP> {
  const url =
    new URL(PNCP_URL);

  url.searchParams.set(
    "dataFinal",
    formatarDataPNCP(
      dataFinal
    )
  );

  if (modalidade) {
    url.searchParams.set(
      "codigoModalidadeContratacao",
      modalidade
    );
  }

  url.searchParams.set(
    "pagina",
    String(pagina)
  );

  url.searchParams.set(
    "tamanhoPagina",
    String(tamanhoPagina)
  );

  let ultimoErro:
    Error | null = null;

  for (
    let tentativa = 1;
    tentativa <=
    MAX_TENTATIVAS;
    tentativa++
  ) {
    if (signal?.aborted) {
      throw new Error(
        "Consulta ao PNCP cancelada."
      );
    }

    const controller =
      new AbortController();

    const cancelar =
      () => {
        controller.abort();
      };

    signal?.addEventListener(
      "abort",
      cancelar,
      {
        once: true,
      }
    );

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        TIMEOUT_PNCP_MS
      );

    try {
      const resposta =
        await fetch(
          url.toString(),
          {
            method: "GET",

            headers: {
              Accept:
                "application/json",
            },

            cache:
              "no-store",

            signal:
              controller.signal,
          }
        );

      /*
       * SUCESSO
       */
      if (resposta.ok) {
        try {
          return (
            await resposta.json()
          ) as RespostaPNCP;
        } catch {
          throw new Error(
            "O PNCP retornou uma resposta inválida."
          );
        }
      }

      /*
       * FALHAS TEMPORÁRIAS
       */
      if (
        erroTemporario(
          resposta.status
        )
      ) {
        ultimoErro =
          new Error(
            mensagemErroPNCP(
              resposta.status
            ) ||
              `PNCP erro ${resposta.status}.`
          );

        if (
          tentativa <
          MAX_TENTATIVAS
        ) {
          const espera =
            resposta.status ===
            429
              ? 5000
              : 2000;

          await aguardar(
            espera
          );

          continue;
        }

        throw ultimoErro;
      }

      /*
       * OUTROS ERROS HTTP
       */
      const corpo =
        await resposta
          .text()
          .catch(
            () => ""
          );

      throw new Error(
        `PNCP erro ${resposta.status}${
          corpo
            ? `: ${corpo.slice(
                0,
                200
              )}`
            : ""
        }`
      );
    } catch (erro) {
      if (
        erro instanceof Error
      ) {
        if (
          erro.message.startsWith(
            "PNCP erro"
          ) ||
          erro.message.includes(
            "limite de consultas"
          ) ||
          erro.message.includes(
            "temporariamente indisponível"
          ) ||
          erro.message.includes(
            "resposta inválida"
          )
        ) {
          throw erro;
        }

        ultimoErro = erro;
      } else {
        ultimoErro =
          new Error(
            "Erro desconhecido ao consultar o PNCP."
          );
      }

      if (signal?.aborted) {
        throw new Error(
          "Consulta ao PNCP cancelada."
        );
      }

      if (
        tentativa <
        MAX_TENTATIVAS
      ) {
        await aguardar(
          2000
        );

        continue;
      }
    } finally {
      clearTimeout(
        timeout
      );

      signal?.removeEventListener(
        "abort",
        cancelar
      );
    }
  }

  if (
    ultimoErro?.name ===
    "AbortError"
  ) {
    throw new Error(
      "O PNCP demorou mais do que o esperado para responder."
    );
  }

  throw (
    ultimoErro ||
    new Error(
      "Não foi possível consultar o PNCP."
    )
  );
}

/*
 * =====================================================
 * FILTROS
 * =====================================================
 */

function itemAtendeFiltros(
  item: LicitacaoPNCP,
  filtros: FiltrosPesquisaRadar
) {
  const termo =
    normalizarTexto(
      filtros.termo
    );

  if (termo) {
    const textoItem =
      normalizarTexto(
        [
          item.objetoCompra,

          item
            .informacaoComplementar,

          item
            .orgaoEntidade
            ?.razaoSocial,

          item
            .unidadeOrgao
            ?.nomeUnidade,

          item
            .unidadeOrgao
            ?.municipioNome,
        ]
          .filter(Boolean)
          .join(" ")
      );

    if (
      !textoItem.includes(
        termo
      )
    ) {
      return false;
    }
  }

  if (filtros.uf) {
    const ufItem =
      item.unidadeOrgao
        ?.ufSigla
        ?.toUpperCase();

    if (
      ufItem !==
      filtros.uf.toUpperCase()
    ) {
      return false;
    }
  }

  const encerramento =
    item
      .dataEncerramentoProposta
      ?.slice(
        0,
        10
      );

  if (
    filtros
      .encerramentoInicio
  ) {
    if (
      !encerramento ||
      encerramento <
        filtros
          .encerramentoInicio
    ) {
      return false;
    }
  }

  if (
    filtros
      .encerramentoFim
  ) {
    if (
      !encerramento ||
      encerramento >
        filtros
          .encerramentoFim
    ) {
      return false;
    }
  }

  /*
   * Regra mantida do fluxo n8n:
   * somente oportunidades com valor.
   */
  const valor =
    Number(
      item
        .valorTotalEstimado ||
        0
    );

  if (
    !Number.isFinite(
      valor
    ) ||
    valor <= 0
  ) {
    return false;
  }

  const link =
    item
      .linkSistemaOrigem ||
    item
      .linkProcessoEletronico;

  if (!link) {
    return false;
  }

  const situacao =
    normalizarTexto(
      item
        .situacaoCompraNome
    );

  if (
    situacao.includes(
      "anulada"
    ) ||
    situacao.includes(
      "suspensa"
    ) ||
    situacao.includes(
      "revogada"
    )
  ) {
    return false;
  }

  return true;
}

/*
 * =====================================================
 * RADAR MANUAL
 * =====================================================
 */

export async function buscarLicitacoesRadar(
  filtros: FiltrosPesquisaRadar
): Promise<ResultadoPesquisaRadar> {
  const dataFinal =
    filtros
      .encerramentoFim ||
    calcularProximoDiaUtil();

  let pagina = 1;

  let paginasProcessadas =
    0;

  let quantidadeRecebida =
    0;

  let limitePaginasAtingido =
    false;

  const mapa =
    new Map<
      string,
      LicitacaoPNCP
    >();

  while (
    pagina <=
    LIMITE_PAGINAS
  ) {
    const dados =
      await consultarPaginaPNCP({
        dataFinal,

        modalidade:
          filtros
            .codigoModalidadeContratacao ||
          "6",

        pagina,

        tamanhoPagina:
          TAMANHO_PAGINA,
      });

    paginasProcessadas++;

    const itens =
      Array.isArray(
        dados.data
      )
        ? dados.data
        : [];

    quantidadeRecebida +=
      itens.length;

    for (
      const item of itens
    ) {
      if (
        !itemAtendeFiltros(
          item,
          filtros
        )
      ) {
        continue;
      }

      const id =
        criarIdentificadorPNCP(
          item
        );

      if (!id) {
        continue;
      }

      if (
        !mapa.has(id)
      ) {
        mapa.set(
          id,
          item
        );
      }
    }

    const totalPaginas =
      Number(
        dados.totalPaginas ??
          dados.totalDePaginas ??
          dados.totalPages ??
          0
      ) || 0;

    const terminouPeloTotal =
      totalPaginas > 0 &&
      pagina >=
        totalPaginas;

    const terminouPelaQuantidade =
      itens.length <
      TAMANHO_PAGINA;

    if (
      terminouPeloTotal ||
      terminouPelaQuantidade
    ) {
      break;
    }

    /*
     * Sabemos que existem mais páginas,
     * mas atingimos nosso limite técnico.
     */
    if (
      pagina >=
      LIMITE_PAGINAS
    ) {
      limitePaginasAtingido =
        true;

      break;
    }

    pagina++;

    await aguardar(
      INTERVALO_ENTRE_PAGINAS_MS
    );
  }

  return {
    itens: [
      ...mapa.values(),
    ],

    paginasProcessadas,

    quantidadeRecebida,

    limitePaginasAtingido,
  };
}

/*
 * =====================================================
 * PESQUISA ANTIGA
 * =====================================================
 */

export async function searchPncp(
  params: SearchParams,
  signal?: AbortSignal
): Promise<Licitacao[]> {
  const pagina =
    Math.max(
      1,
      Number(
        params.page || 1
      )
    );

  const tamanhoPagina =
    Math.max(
      10,
      Math.min(
        50,
        Number(
          params.pageSize ||
            50
        )
      )
    );

  const dataFinal =
    params.dataFim ||
    params.encFim ||
    dataHojeBrasil();

  const dados =
    await consultarPaginaPNCP({
      dataFinal,

      modalidade:
        params
          .codigoModalidadeContratacao,

      pagina,

      tamanhoPagina,

      signal,
    });

  const itens =
    Array.isArray(
      dados.data
    )
      ? dados.data
      : [];

  const termo =
    normalizarTexto(
      params.q
    );

  let filtrados =
    itens.filter(
      (item) => {
        if (termo) {
          const texto =
            normalizarTexto(
              [
                item.objetoCompra,

                item
                  .informacaoComplementar,

                item
                  .orgaoEntidade
                  ?.razaoSocial,

                item
                  .unidadeOrgao
                  ?.nomeUnidade,

                item
                  .unidadeOrgao
                  ?.municipioNome,
              ]
                .filter(
                  Boolean
                )
                .join(
                  " "
                )
            );

          if (
            !texto.includes(
              termo
            )
          ) {
            return false;
          }
        }

        if (params.uf) {
          if (
            item
              .unidadeOrgao
              ?.ufSigla
              ?.toUpperCase() !==
            params.uf
              .toUpperCase()
          ) {
            return false;
          }
        }

        return true;
      }
    );

  if (params.dataIni) {
    filtrados =
      filtrados.filter(
        (item) => {
          const data =
            (
              item
                .dataPublicacaoPncp ||
              item.dataInclusao ||
              ""
            ).slice(
              0,
              10
            );

          return (
            Boolean(data) &&
            data >=
              params.dataIni!
          );
        }
      );
  }

  if (params.dataFim) {
    filtrados =
      filtrados.filter(
        (item) => {
          const data =
            (
              item
                .dataPublicacaoPncp ||
              item.dataInclusao ||
              ""
            ).slice(
              0,
              10
            );

          return (
            Boolean(data) &&
            data <=
              params.dataFim!
          );
        }
      );
  }

  return filtrados
    .map(
      converterParaLicitacao
    )
    .filter(
      (
        item
      ): item is Licitacao =>
        item !== null
    );
}