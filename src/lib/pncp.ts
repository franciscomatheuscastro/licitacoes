import type {
  Licitacao,
  SearchParams,
} from "./types";

const baseUrl =
  process.env.PNCP_BASE_URL;

const PNCP_TIMEOUT_MS = 10_000;

/*
 * O retry ficará centralizado na rota da API.
 * Aqui realizamos somente uma tentativa por chamada.
 */
const PNCP_MAX_ATTEMPTS = 1;

// ======================================================
// Datas
// ======================================================

function hojeISO() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function diasAtrasISO(days: number) {
  const date = new Date();

  date.setUTCDate(
    date.getUTCDate() - days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function toYYYYMMDD(
  input: string
) {
  return input.replaceAll("-", "");
}

function safePageSize(
  pageSize?: string
) {
  const parsed =
    Number(pageSize ?? 20);

  const valid =
    Number.isFinite(parsed)
      ? Math.floor(parsed)
      : 20;

  return Math.max(
    10,
    Math.min(50, valid)
  );
}

function safePage(
  page?: string
) {
  const parsed =
    Number(page ?? 1);

  const valid =
    Number.isFinite(parsed)
      ? Math.floor(parsed)
      : 1;

  return Math.max(1, valid);
}

// ======================================================
// Janelas de datas
// PNCP aceita período máximo de 365 dias
// ======================================================

function parseYYYYMMDD(
  value: string
) {
  const year =
    Number(value.slice(0, 4));

  const month =
    Number(value.slice(4, 6)) - 1;

  const day =
    Number(value.slice(6, 8));

  return new Date(
    Date.UTC(
      year,
      month,
      day
    )
  );
}

function formatYYYYMMDD(
  date: Date
) {
  const year =
    date.getUTCFullYear();

  const month =
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getUTCDate()
    ).padStart(2, "0");

  return `${year}${month}${day}`;
}

function addDays(
  date: Date,
  days: number
) {
  const result =
    new Date(date.getTime());

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result;
}

function splitIntoWindows(
  start: string,
  end: string
) {
  const windows: Array<{
    ini: string;
    fim: string;
  }> = [];

  let current =
    parseYYYYMMDD(start);

  const finalDate =
    parseYYYYMMDD(end);

  while (
    current.getTime() <=
    finalDate.getTime()
  ) {
    const maximumEnd =
      addDays(current, 364);

    const windowEnd =
      maximumEnd.getTime() <=
      finalDate.getTime()
        ? maximumEnd
        : finalDate;

    windows.push({
      ini:
        formatYYYYMMDD(current),

      fim:
        formatYYYYMMDD(windowEnd),
    });

    current =
      addDays(windowEnd, 1);
  }

  return windows;
}

// ======================================================
// Mapeamento
// ======================================================

function mapPncpToLicitacao(
  item: any
): Licitacao {
  const id =
    String(
      item?.numeroControlePNCP ??
        ""
    ) ||
    [
      item?.orgaoEntidade?.cnpj ??
        "semcnpj",

      item?.anoCompra ?? "0",

      item?.sequencialCompra ??
        "0",
    ].join("_");

  const estimatedValue =
    Number(
      item?.valorTotalEstimado ??
        0
    );

  return {
    id,

    titulo: String(
      item?.objetoCompra ??
        item?.objeto ??
        item?.titulo ??
        "Sem título"
    ),

    orgao:
      item?.orgaoEntidade
        ?.razaoSocial ??
      undefined,

    uf:
      item?.unidadeOrgao
        ?.ufSigla ??
      item?.orgaoEntidade?.uf ??
      undefined,

    municipio:
      item?.unidadeOrgao
        ?.municipioNome ??
      item?.orgaoEntidade
        ?.municipio ??
      undefined,

    modalidade:
      item?.modalidadeNome ??
      undefined,

    valorEstimado:
      Number.isFinite(
        estimatedValue
      ) &&
      estimatedValue > 0
        ? estimatedValue
        : undefined,

    dataPublicacao:
      item?.dataPublicacaoPncp ??
      item?.dataInclusao ??
      undefined,

    prazoEncerramento:
      item?.dataEncerramentoProposta ??
      undefined,

    url:
      item?.linkSistemaOrigem ??
      item?.linkProcessoEletronico ??
      undefined,

    fonte: "PNCP",
  };
}

// ======================================================
// Controle de cancelamento
// ======================================================

function createAbortError() {
  return new DOMException(
    "Operação cancelada",
    "AbortError"
  );
}

function createCombinedSignal(
  externalSignal:
    | AbortSignal
    | undefined,
  timeoutMs: number
) {
  const controller =
    new AbortController();

  const abortFromExternal =
    () => {
      controller.abort(
        externalSignal?.reason
      );
    };

  if (externalSignal?.aborted) {
    controller.abort(
      externalSignal.reason
    );
  } else {
    externalSignal?.addEventListener(
      "abort",
      abortFromExternal,
      {
        once: true,
      }
    );
  }

  const timeout =
    setTimeout(() => {
      controller.abort(
        new Error(
          `Timeout PNCP após ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

  function cleanup() {
    clearTimeout(timeout);

    externalSignal?.removeEventListener(
      "abort",
      abortFromExternal
    );
  }

  return {
    signal: controller.signal,
    cleanup,
  };
}

// ======================================================
// Consulta HTTP
// ======================================================

function isRetryableStatus(
  status: number
) {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

async function fetchPncpJson(
  url: string,
  options?: {
    timeoutMs?: number;
    maxAttempts?: number;
    signal?: AbortSignal;
  }
) {
  const timeoutMs =
    options?.timeoutMs ??
    PNCP_TIMEOUT_MS;

  const maxAttempts =
    Math.max(
      1,
      options?.maxAttempts ??
        PNCP_MAX_ATTEMPTS
    );

  let lastError:
    | unknown
    | null = null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    if (
      options?.signal?.aborted
    ) {
      throw createAbortError();
    }

    const {
      signal,
      cleanup,
    } = createCombinedSignal(
      options?.signal,
      timeoutMs
    );

    try {
      const response =
        await fetch(url, {
          method: "GET",

          headers: {
            Accept:
              "application/json",

            "User-Agent":
              "Radar-Licitacoes/1.0",
          },

          cache: "no-store",
          signal,
        });

      const responseText =
        await response
          .text()
          .catch(() => "");

      if (!response.ok) {
        const detail =
          responseText
            .slice(0, 300)
            .trim() ||
          response.statusText ||
          "Erro no PNCP";

        const error =
          new Error(
            `PNCP erro ${response.status}: ${detail}`
          ) as Error & {
            status?: number;
          };

        error.status =
          response.status;

        /*
         * Não efetuamos retry interno por padrão.
         * A rota da API decidirá se deve tentar novamente.
         */
        throw error;
      }

      try {
        return JSON.parse(
          responseText
        );
      } catch {
        throw new Error(
          `PNCP retornou uma resposta inválida: ${responseText.slice(
            0,
            200
          )}`
        );
      }
    } catch (error: any) {
      lastError = error;

      if (
        options?.signal?.aborted
      ) {
        throw createAbortError();
      }

      if (
        error?.name ===
        "AbortError"
      ) {
        throw new Error(
          `Timeout PNCP após ${timeoutMs}ms`
        );
      }

      const status =
        Number(
          error?.status || 0
        );

      const canRetry =
        attempt < maxAttempts &&
        (isRetryableStatus(
          status
        ) ||
          String(
            error?.message || ""
          )
            .toLowerCase()
            .includes(
              "fetch failed"
            ));

      if (!canRetry) {
        throw error;
      }
    } finally {
      cleanup();
    }
  }

  throw (
    lastError ??
    new Error(
      "Falha ao consultar o PNCP."
    )
  );
}

// ======================================================
// API pública
// ======================================================

export async function searchPncp(
  params: SearchParams,
  signal?: AbortSignal
): Promise<Licitacao[]> {
  if (!baseUrl) {
    throw new Error(
      "PNCP_BASE_URL não definida nas variáveis de ambiente."
    );
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const initialDateISO =
    params.dataIni ??
    diasAtrasISO(90);

  const finalDateISO =
    params.dataFim ??
    hojeISO();

  if (
    initialDateISO >
    finalDateISO
  ) {
    throw new Error(
      "A data inicial não pode ser posterior à data final."
    );
  }

  const initialDate =
    toYYYYMMDD(
      initialDateISO
    );

  const finalDate =
    toYYYYMMDD(
      finalDateISO
    );

  const modalityCode =
    params
      .codigoModalidadeContratacao
      ?.trim() || "8";

  const page =
    safePage(params.page);

  const pageSize =
    safePageSize(
      params.pageSize
    );

  const dateWindows =
    splitIntoWindows(
      initialDate,
      finalDate
    );

  const result:
    Licitacao[] = [];

  const seen =
    new Set<string>();

  for (
    const dateWindow
    of dateWindows
  ) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const normalizedBaseUrl =
      baseUrl.replace(
        /\/+$/,
        ""
      );

    const url =
      new URL(
        `${normalizedBaseUrl}/contratacoes/publicacao`
      );

    const searchTerm =
      params.q?.trim();

    const uf =
      params.uf
        ?.trim()
        .toUpperCase();

    if (searchTerm) {
      url.searchParams.set(
        "palavraChave",
        searchTerm
      );
    }

    if (uf) {
      url.searchParams.set(
        "uf",
        uf
      );
    }

    url.searchParams.set(
      "dataInicial",
      dateWindow.ini
    );

    url.searchParams.set(
      "dataFinal",
      dateWindow.fim
    );

    url.searchParams.set(
      "codigoModalidadeContratacao",
      modalityCode
    );

    url.searchParams.set(
      "pagina",
      String(page)
    );

    url.searchParams.set(
      "tamanhoPagina",
      String(pageSize)
    );

    const json =
      await fetchPncpJson(
        url.toString(),
        {
          timeoutMs:
            PNCP_TIMEOUT_MS,

          maxAttempts:
            PNCP_MAX_ATTEMPTS,

          signal,
        }
      );

    const rawItems =
      Array.isArray(
        json?.data
      )
        ? json.data
        : [];

    for (
      const rawItem
      of rawItems
    ) {
      const licitacao =
        mapPncpToLicitacao(
          rawItem
        );

      if (
        seen.has(
          licitacao.id
        )
      ) {
        continue;
      }

      seen.add(
        licitacao.id
      );

      result.push(
        licitacao
      );
    }
  }

  return result;
}