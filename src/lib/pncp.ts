// src/lib/pncp.ts

import type {
  Licitacao,
  SearchParams,
} from "@/lib/types";

const PNCP_URL =
  "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

const TAMANHO_PAGINA = 50;

/*
 * Quantidade de páginas processadas
 * em cada chamada da Vercel.
 */
export const PAGINAS_POR_LOTE = 8;

/*
 * Limite total da pesquisa.
 *
 * 200 páginas x 50 registros
 * = até 10.000 registros brutos.
 */
export const LIMITE_TOTAL_PAGINAS = 200;

/*
 * Mesmo conceito do Wait usado no n8n.
 */
const INTERVALO_ENTRE_PAGINAS_MS = 2000;

const MAX_TENTATIVAS = 2;

const TIMEOUT_PNCP_MS = 12000;

/*
 * =====================================================
 * TIPOS PNCP
 * =====================================================
 */

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

/*
 * =====================================================
 * FILTROS
 * =====================================================
 */

export interface FiltrosPesquisaRadar {
  termo?: string;

  uf?: string;

  codigoModalidadeContratacao?: string;

  encerramentoInicio?: string;

  encerramentoFim?: string;
}

/*
 * =====================================================
 * RESULTADO DE UM LOTE
 * =====================================================
 */

export interface ResultadoPesquisaRadar {
  itens: LicitacaoPNCP[];

  paginaInicial: number;

  paginaFinal: number;

  paginasProcessadas: number;

  quantidadeRecebida: number;

  proximaPagina: number | null;

  concluida: boolean;

  totalPaginasPNCP: number | null;

  limiteTotalAtingido: boolean;
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
      data.getUTCMonth() +
        1
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

/*
 * =====================================================
 * IDENTIFICAÇÃO
 * =====================================================
 */

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

/*
 * =====================================================
 * CONVERSÃO PARA O FORMATO ANTIGO DO SISTEMA
 * =====================================================
 */

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
      item.objetoCompra
        ?.trim() ||
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
  if (
    status === 429
  ) {
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
      "Tente novamente em alguns instantes."
    );
  }

  return null;
}

/*
 * =====================================================
 * CONSULTA DE UMA PÁGINA
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
    new URL(
      PNCP_URL
    );

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
    String(
      pagina
    )
  );

  url.searchParams.set(
    "tamanhoPagina",
    String(
      tamanhoPagina
    )
  );

  let ultimoErro:
    Error | null = null;

  for (
    let tentativa = 1;
    tentativa <=
    MAX_TENTATIVAS;
    tentativa++
  ) {
    if (
      signal?.aborted
    ) {
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

      if (
        resposta.ok
      ) {
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
       * ERROS TEMPORÁRIOS
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
        signal?.aborted
      ) {
        throw new Error(
          "Consulta ao PNCP cancelada."
        );
      }

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

        ultimoErro =
          erro;
      } else {
        ultimoErro =
          new Error(
            "Erro desconhecido ao consultar o PNCP."
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
 * REGRA DE TEXTO DO RADAR
 * =====================================================
 *
 * IMPORTANTE:
 *
 * Esta regra replica o comportamento do n8n.
 *
 * No fluxo antigo, quando buscamos "medico",
 * aceitamos:
 *
 * medico
 * medica
 * medicos
 * medicas
 *
 * O texto analisado é:
 *
 * objetoCompra
 * informacaoComplementar
 * razaoSocial
 * nomeUnidade
 *
 * Não usamos municipioNome nesta regra porque
 * o fluxo n8n também não utilizava município
 * para identificar uma oportunidade médica.
 */

function itemAtendeTermoRadar(
  item: LicitacaoPNCP,
  termoInformado?: string
) {
  const termo =
    normalizarTexto(
      termoInformado
    );

  if (!termo) {
    return true;
  }

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
      ]
        .filter(Boolean)
        .join(" ")
    );

  /*
   * Regra idêntica à pesquisa
   * médica do n8n.
   */
  if (
    termo === "medico" ||
    termo === "medica" ||
    termo === "medicos" ||
    termo === "medicas"
  ) {
    return (
      texto.includes(
        "medico"
      ) ||
      texto.includes(
        "medica"
      ) ||
      texto.includes(
        "medicos"
      ) ||
      texto.includes(
        "medicas"
      )
    );
  }

  /*
   * Outros termos continuam
   * funcionando normalmente.
   */
  return texto.includes(
    termo
  );
}

/*
 * =====================================================
 * FILTRO LOCAL DO RADAR
 * =====================================================
 */

function itemAtendeFiltros(
  item: LicitacaoPNCP,
  filtros: FiltrosPesquisaRadar
) {
  /*
   * TERMO
   */

  if (
    !itemAtendeTermoRadar(
      item,
      filtros.termo
    )
  ) {
    return false;
  }

  /*
   * UF
   */

  if (
    filtros.uf
  ) {
    const ufItem =
      item.unidadeOrgao
        ?.ufSigla
        ?.toUpperCase();

    if (
      ufItem !==
      filtros.uf
        .toUpperCase()
    ) {
      return false;
    }
  }

  /*
   * ENCERRAMENTO
   */

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
   * VALOR ESTIMADO
   *
   * Mesma regra do n8n:
   * precisa ser maior que zero.
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

  /*
   * LINK
   */

  const link =
    item
      .linkSistemaOrigem ||
    item
      .linkProcessoEletronico;

  if (!link) {
    return false;
  }

  /*
   * SITUAÇÃO
   */

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
 * BUSCA EM LOTES
 * =====================================================
 */

export async function buscarLicitacoesRadar(
  filtros: FiltrosPesquisaRadar,

  paginaInicial = 1,

  paginasPorLote =
    PAGINAS_POR_LOTE
): Promise<ResultadoPesquisaRadar> {
  const dataFinal =
    filtros
      .encerramentoFim ||
    calcularProximoDiaUtil();

  const inicio =
    Math.max(
      1,
      Math.floor(
        paginaInicial
      )
    );

  const quantidadeLote =
    Math.max(
      1,
      Math.min(
        PAGINAS_POR_LOTE,

        Math.floor(
          paginasPorLote
        )
      )
    );

  const ultimaPaginaDoLote =
    Math.min(
      LIMITE_TOTAL_PAGINAS,

      inicio +
        quantidadeLote -
        1
    );

  let pagina =
    inicio;

  let paginasProcessadas =
    0;

  let quantidadeRecebida =
    0;

  let paginaFinal =
    inicio - 1;

  let concluida =
    false;

  let totalPaginasPNCP:
    number | null = null;

  let limiteTotalAtingido =
    false;

  /*
   * Remove duplicidade dentro
   * do lote atual.
   *
   * Entre lotes, o Prisma também
   * protege pelo numeroControlePNCP
   * com UPSERT.
   */

  const mapa =
    new Map<
      string,
      LicitacaoPNCP
    >();

  while (
    pagina <=
    ultimaPaginaDoLote
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

    paginaFinal =
      pagina;

    const itens =
      Array.isArray(
        dados.data
      )
        ? dados.data
        : [];

    quantidadeRecebida +=
      itens.length;

    /*
     * FILTRA OS ITENS
     */

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

    /*
     * TOTAL DE PÁGINAS
     */

    const total =
      Number(
        dados.totalPaginas ??
          dados.totalDePaginas ??
          dados.totalPages ??
          0
      ) || 0;

    if (
      total > 0
    ) {
      totalPaginasPNCP =
        total;
    }

    /*
     * PNCP terminou naturalmente.
     */

    const terminouPeloTotal =
      total > 0 &&
      pagina >=
        total;

    const terminouPelaQuantidade =
      itens.length <
      TAMANHO_PAGINA;

    if (
      terminouPeloTotal ||
      terminouPelaQuantidade
    ) {
      concluida =
        true;

      break;
    }

    /*
     * LIMITE DE SEGURANÇA
     */

    if (
      pagina >=
      LIMITE_TOTAL_PAGINAS
    ) {
      concluida =
        true;

      limiteTotalAtingido =
        true;

      break;
    }

    /*
     * FIM DO LOTE
     */

    if (
      pagina >=
      ultimaPaginaDoLote
    ) {
      break;
    }

    pagina++;

    /*
     * Espera entre páginas.
     */

    await aguardar(
      INTERVALO_ENTRE_PAGINAS_MS
    );
  }

  /*
   * ===================================================
   * PRÓXIMO LOTE
   * ===================================================
   */

  let proximaPagina:
    number | null = null;

  if (!concluida) {
    const candidata =
      paginaFinal + 1;

    if (
      candidata >
      LIMITE_TOTAL_PAGINAS
    ) {
      concluida =
        true;

      limiteTotalAtingido =
        true;
    } else {
      proximaPagina =
        candidata;
    }
  }

  return {
    itens: [
      ...mapa.values(),
    ],

    paginaInicial:
      inicio,

    paginaFinal,

    paginasProcessadas,

    quantidadeRecebida,

    proximaPagina,

    concluida,

    totalPaginasPNCP,

    limiteTotalAtingido,
  };
}

/*
 * =====================================================
 * PESQUISA ANTIGA
 * =====================================================
 *
 * NÃO alterar a lógica dessa função por causa do Radar.
 *
 * GET /api/licitacoes continua utilizando searchPncp()
 * e aqui mantemos a pesquisa genérica por termo.
 */

export async function searchPncp(
  params: SearchParams,

  signal?: AbortSignal
): Promise<Licitacao[]> {
  const pagina =
    Math.max(
      1,
      Number(
        params.page ||
          1
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
        /*
         * Pesquisa textual genérica.
         */

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

        /*
         * UF
         */

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

  /*
   * DATA INICIAL DE PUBLICAÇÃO
   */

  if (
    params.dataIni
  ) {
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

  /*
   * DATA FINAL DE PUBLICAÇÃO
   */

  if (
    params.dataFim
  ) {
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