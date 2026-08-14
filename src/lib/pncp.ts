// src/lib/pncp.ts

import type {
  Licitacao,
  SearchParams,
} from "@/lib/types";

const PNCP_URL =
  "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

const TAMANHO_PAGINA = 50;

/*
 * Como a pesquisa agora é feita manualmente por uma rota HTTP,
 * não podemos deixar uma execução percorrer centenas de páginas.
 *
 * 20 páginas x 50 registros = até 1.000 registros brutos.
 *
 * Depois podemos evoluir isso para processamento em background,
 * caso realmente seja necessário pesquisar volumes maiores.
 */
const LIMITE_PAGINAS = 200;

/*
 * Seu fluxo n8n aguardava entre uma página e outra.
 * Mantemos a mesma estratégia para evitar HTTP 429.
 */
const INTERVALO_ENTRE_PAGINAS_MS = 2000;

/*
 * Tentativas apenas para falhas temporárias.
 */
const MAX_TENTATIVAS = 3;

/*
 * Timeout individual de cada chamada ao PNCP.
 */
const TIMEOUT_PNCP_MS = 30000;

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
 * PESQUISA MANUAL DO RADAR
 * =====================================================
 */

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

  for (
    const parte of partes
  ) {
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
 *
 * Mantém a mesma lógica utilizada
 * anteriormente no fluxo n8n.
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

  /*
   * Sexta -> segunda.
   */
  if (diaSemana === 5) {
    adicionar = 3;
  }

  /*
   * Sábado -> segunda.
   */
  if (diaSemana === 6) {
    adicionar = 2;
  }

  /*
   * Domingo -> segunda.
   */
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
 * ERROS / RETRY
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
 * CONSULTA DE UMA PÁGINA DO PNCP
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
    /*
     * Se a rota externa cancelou a operação,
     * não devemos continuar tentando.
     */
    if (signal?.aborted) {
      throw new Error(
        "Consulta ao PNCP cancelada."
      );
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        TIMEOUT_PNCP_MS
      );

    /*
     * Permite respeitar também
     * um AbortSignal recebido de fora.
     */
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

      if (resposta.ok) {
        return (
          await resposta.json()
        ) as RespostaPNCP;
      }

      const mensagemAmigavel =
        mensagemErroPNCP(
          resposta.status
        );

      /*
       * Falha temporária.
       */
      if (
        erroTemporario(
          resposta.status
        )
      ) {
        ultimoErro =
          new Error(
            mensagemAmigavel ||
              `PNCP erro ${resposta.status}.`
          );

        /*
         * Se ainda há tentativas,
         * esperamos antes de repetir.
         */
        if (
          tentativa <
          MAX_TENTATIVAS
        ) {
          /*
           * 429 espera mais.
           */
          const espera =
            resposta.status ===
            429
              ? 5000
              : 2000 *
                tentativa;

          await aguardar(
            espera
          );

          continue;
        }

        throw ultimoErro;
      }

      /*
       * Outros erros não devem ser
       * repetidos automaticamente.
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
                300
              )}`
            : ""
        }`
      );
    } catch (erro) {
      if (
        erro instanceof Error
      ) {
        /*
         * Erros que nós mesmos geramos
         * por status HTTP.
         */
        if (
          erro.message.startsWith(
            "PNCP erro"
          ) ||
          erro.message.includes(
            "limite de consultas"
          ) ||
          erro.message.includes(
            "temporariamente indisponível"
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

      /*
       * Abort externo.
       */
      if (signal?.aborted) {
        throw new Error(
          "Consulta ao PNCP cancelada."
        );
      }

      /*
       * Timeout/rede:
       * tenta novamente.
       */
      if (
        tentativa <
        MAX_TENTATIVAS
      ) {
        await aguardar(
          2000 *
            tentativa
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

  throw (
    ultimoErro ||
    new Error(
      "Não foi possível consultar o PNCP."
    )
  );
}

/*
 * =====================================================
 * FILTROS DO RADAR
 * =====================================================
 */

function itemAtendeFiltros(
  item: LicitacaoPNCP,
  filtros: FiltrosPesquisaRadar
) {
  /*
   * TERMO
   */
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

  /*
   * UF
   */
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
   * Mantém a regra existente no n8n.
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
 * PESQUISA MANUAL DO RADAR
 * =====================================================
 *
 * Utilizada por:
 *
 * POST /api/licitacoes/buscar
 */
export async function buscarLicitacoesRadar(
  filtros: FiltrosPesquisaRadar
): Promise<ResultadoPesquisaRadar> {
  /*
   * Se não for informada data final,
   * mantém a regra de próximo dia útil.
   */
  const dataFinal =
    filtros
      .encerramentoFim ||
    calcularProximoDiaUtil();

  let pagina = 1;

  let paginasProcessadas =
    0;

  let quantidadeRecebida =
    0;

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

      /*
       * Não duplica a mesma oportunidade.
       */
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

    pagina++;

    /*
     * Mesma estratégia do n8n:
     * aguarda antes da próxima página.
     */
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
  };
}

/*
 * =====================================================
 * PESQUISA ANTIGA DO SISTEMA
 * =====================================================
 *
 * Mantida para compatibilidade com:
 *
 * GET /api/licitacoes
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
        /*
         * Busca textual.
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
         * UF.
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
   * Publicação inicial.
   */
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

  /*
   * Publicação final.
   */
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