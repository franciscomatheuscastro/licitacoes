import { NextResponse } from "next/server";

import { searchPncp } from "@/lib/pncp";
import type {
  Licitacao,
  SearchParams,
} from "@/lib/types";

/*
 * Configuração da rota para produção.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * A Vercel pode aplicar limites diferentes conforme
 * o plano. Esta configuração informa o limite desejado.
 */
export const maxDuration = 60;

type SearchPayload = {
  page: number;
  pageSize: number;
  rawCount: number;
  morePossible: boolean;
  total: number;
  items: Licitacao[];
};

type CacheEntry = {
  timestamp: number;
  data: SearchPayload;
};

type GlobalPncpStore = typeof globalThis & {
  __PNCP_CACHE__?: Map<
    string,
    CacheEntry
  >;

  __PNCP_INFLIGHT__?: Map<
    string,
    Promise<SearchPayload>
  >;
};

const globalStore =
  globalThis as GlobalPncpStore;

globalStore.__PNCP_CACHE__ ??=
  new Map();

globalStore.__PNCP_INFLIGHT__ ??=
  new Map();

const CACHE =
  globalStore.__PNCP_CACHE__;

const INFLIGHT =
  globalStore.__PNCP_INFLIGHT__;

/*
 * Cache curto para reduzir consultas repetidas ao PNCP.
 *
 * Observação: em ambiente serverless, este cache é
 * oportunístico. Ele pode ser perdido quando a instância
 * da função for encerrada.
 */
const CACHE_TTL_MS = 60_000;

/*
 * Em produção, não devemos fazer seis tentativas longas.
 *
 * Total:
 * - primeira tentativa;
 * - mais uma tentativa em caso de instabilidade.
 */
const MAX_ATTEMPTS = 2;

/*
 * Cada tentativa pode aguardar até 12 segundos.
 *
 * Com duas tentativas e backoff, a execução fica
 * dentro de uma janela mais compatível com a Vercel.
 */
const PNCP_TIMEOUT_MS = 12_000;
const BASE_BACKOFF_MS = 700;

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(
      resolve,
      milliseconds
    );
  });
}

function createCacheKey(
  params: SearchParams
) {
  const searchParams =
    new URLSearchParams();

  if (params.q) {
    searchParams.set(
      "q",
      params.q
    );
  }

  if (params.uf) {
    searchParams.set(
      "uf",
      params.uf
    );
  }

  if (
    params.codigoModalidadeContratacao
  ) {
    searchParams.set(
      "codigoModalidadeContratacao",
      params.codigoModalidadeContratacao
    );
  }

  if (params.dataIni) {
    searchParams.set(
      "dataIni",
      params.dataIni
    );
  }

  if (params.dataFim) {
    searchParams.set(
      "dataFim",
      params.dataFim
    );
  }

  if (params.encIni) {
    searchParams.set(
      "encIni",
      params.encIni
    );
  }

  if (params.encFim) {
    searchParams.set(
      "encFim",
      params.encFim
    );
  }

  searchParams.set(
    "page",
    String(params.page ?? "1")
  );

  searchParams.set(
    "pageSize",
    String(params.pageSize ?? "50")
  );

  return searchParams.toString();
}

function getErrorMessage(
  error: unknown
) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(
    error || "Erro inesperado"
  );
}

function isPncpUnstable(
  message: string
) {
  const normalized =
    message.toLowerCase();

  return (
    normalized.includes("jdbc") ||
    normalized.includes(
      "failed to obtain"
    ) ||
    normalized.includes(
      "internal server error"
    ) ||
    normalized.includes(
      "pncp erro 500"
    ) ||
    normalized.includes(
      "erro na comunicação com o banco"
    ) ||
    normalized.includes(
      "timeout"
    ) ||
    normalized.includes(
      "network"
    ) ||
    normalized.includes(
      "fetch failed"
    ) ||
    normalized.includes(
      "econnreset"
    ) ||
    normalized.includes(
      "etimedout"
    ) ||
    normalized.includes(
      "socket hang up"
    )
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number
): Promise<T> {
  return new Promise<T>(
    (resolve, reject) => {
      const timeout =
        setTimeout(() => {
          reject(
            new Error(
              `Timeout PNCP após ${milliseconds}ms`
            )
          );
        }, milliseconds);

      promise
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    }
  );
}

async function executeWithRetry<T>(
  operation: () => Promise<T>
): Promise<T> {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const message =
        getErrorMessage(error);

      const retryable =
        isPncpUnstable(message);

      const isLastAttempt =
        attempt >= MAX_ATTEMPTS;

      if (
        !retryable ||
        isLastAttempt
      ) {
        throw error;
      }

      const backoff =
        BASE_BACKOFF_MS *
        Math.pow(
          2,
          attempt - 1
        );

      const jitter =
        Math.floor(
          Math.random() * 250
        );

      await sleep(
        backoff + jitter
      );
    }
  }

  throw (
    lastError ??
    new Error(
      "Falha ao consultar o PNCP."
    )
  );
}

function parsePositiveInteger(
  value: string | null,
  fallback: number
) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.floor(parsed);
}

function dateOnlyTimestamp(
  value?: string
) {
  if (!value) {
    return null;
  }

  const datePart =
    value.slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      datePart
    )
  ) {
    return null;
  }

  const timestamp =
    new Date(
      `${datePart}T00:00:00.000Z`
    ).getTime();

  return Number.isNaN(timestamp)
    ? null
    : timestamp;
}

function isDateInsideRange(
  value: string | undefined,
  initialDate?: string,
  finalDate?: string
) {
  const current =
    dateOnlyTimestamp(value);

  if (current === null) {
    return false;
  }

  const initial =
    initialDate
      ? dateOnlyTimestamp(
          initialDate
        )
      : null;

  const final =
    finalDate
      ? dateOnlyTimestamp(
          finalDate
        )
      : null;

  if (
    initial !== null &&
    current < initial
  ) {
    return false;
  }

  if (
    final !== null &&
    current > final
  ) {
    return false;
  }

  return true;
}

function createNoStoreResponse(
  body: Record<string, unknown>,
  status = 200
) {
  const response =
    NextResponse.json(
      body,
      {
        status,
      }
    );

  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  return response;
}

function removeExpiredCacheEntries() {
  const now = Date.now();

  for (
    const [key, entry]
    of CACHE.entries()
  ) {
    if (
      now - entry.timestamp >
      CACHE_TTL_MS
    ) {
      CACHE.delete(key);
    }
  }
}

async function executeSearch(
  params: SearchParams,
  page: number,
  pageSize: number
): Promise<SearchPayload> {
  const rawResult =
    await executeWithRetry(
      async () => {
        const controller =
          new AbortController();

        const timeout =
          setTimeout(() => {
            controller.abort();
          }, PNCP_TIMEOUT_MS);

        try {
          return await searchPncp(
            params,
            controller.signal
          );
        } finally {
          clearTimeout(timeout);
        }
      }
    );

  const rawItems: Licitacao[] =
    Array.isArray(rawResult)
      ? rawResult
      : [];

  /*
   * morePossible precisa ser calculado antes
   * do filtro local de encerramento.
   *
   * Mesmo que nenhuma licitação da página atual
   * tenha a data de encerramento solicitada,
   * outras páginas ainda podem conter resultados.
   */
  const rawCount =
    rawItems.length;

  const morePossible =
    rawCount >= pageSize;

  let filteredItems =
    rawItems;

  if (
    params.encIni ||
    params.encFim
  ) {
    filteredItems =
      rawItems.filter(
        (item) =>
          isDateInsideRange(
            item.prazoEncerramento,
            params.encIni,
            params.encFim
          )
      );
  }

  return {
    page,
    pageSize,
    rawCount,
    morePossible,
    total:
      filteredItems.length,
    items: filteredItems,
  };
}

export async function GET(
  request: Request
) {
  try {
    const url =
      new URL(request.url);

    const input =
      url.searchParams;

    const page =
      parsePositiveInteger(
        input.get("page"),
        1
      );

    const requestedPageSize =
      parsePositiveInteger(
        input.get("pageSize"),
        50
      );

    const pageSize =
      Math.max(
        10,
        Math.min(
          50,
          requestedPageSize
        )
      );

    const uf =
      input
        .get("uf")
        ?.trim()
        .toUpperCase();

    const params: SearchParams = {
      q:
        input
          .get("q")
          ?.trim() ||
        undefined,

      uf:
        uf || undefined,

      codigoModalidadeContratacao:
        input
          .get(
            "codigoModalidadeContratacao"
          )
          ?.trim() ||
        undefined,

      dataIni:
        input
          .get("dataIni")
          ?.trim() ||
        undefined,

      dataFim:
        input
          .get("dataFim")
          ?.trim() ||
        undefined,

      encIni:
        input
          .get("encIni")
          ?.trim() ||
        undefined,

      encFim:
        input
          .get("encFim")
          ?.trim() ||
        undefined,

      page: String(page),
      pageSize:
        String(pageSize),
    };

    if (
      params.dataIni &&
      params.dataFim &&
      params.dataIni >
        params.dataFim
    ) {
      return createNoStoreResponse(
        {
          ok: false,
          error:
            "A data inicial de publicação não pode ser posterior à data final.",
        },
        400
      );
    }

    if (
      params.encIni &&
      params.encFim &&
      params.encIni >
        params.encFim
    ) {
      return createNoStoreResponse(
        {
          ok: false,
          error:
            "A data inicial de encerramento não pode ser posterior à data final.",
        },
        400
      );
    }

    removeExpiredCacheEntries();

    const cacheKey =
      createCacheKey(params);

    const cached =
      CACHE.get(cacheKey);

    if (
      cached &&
      Date.now() -
        cached.timestamp <
        CACHE_TTL_MS
    ) {
      return createNoStoreResponse({
        ok: true,
        ...cached.data,
        cached: true,
      });
    }

    /*
     * Se a mesma página já estiver sendo buscada,
     * reutiliza a Promise.
     */
    const existingRequest =
      INFLIGHT.get(cacheKey);

    if (existingRequest) {
      const data =
        await existingRequest;

      return createNoStoreResponse({
        ok: true,
        ...data,
        cached: false,
        inflight: true,
      });
    }

    const searchPromise =
      executeSearch(
        params,
        page,
        pageSize
      );

    INFLIGHT.set(
      cacheKey,
      searchPromise
    );

    try {
      const payload =
        await searchPromise;

      CACHE.set(cacheKey, {
        timestamp: Date.now(),
        data: payload,
      });

      return createNoStoreResponse({
        ok: true,
        ...payload,
        cached: false,
      });
    } finally {
      /*
       * Só remove se a Promise armazenada ainda for
       * exatamente esta requisição.
       */
      if (
        INFLIGHT.get(
          cacheKey
        ) === searchPromise
      ) {
        INFLIGHT.delete(
          cacheKey
        );
      }
    }
  } catch (error) {
    const message =
      getErrorMessage(error);

    const pncpUnstable =
      isPncpUnstable(message);

    console.error(
      "[API LICITAÇÕES]",
      {
        message,
        pncpUnstable,
        timestamp:
          new Date().toISOString(),
      }
    );

    const status =
      pncpUnstable
        ? 503
        : 500;

    const response =
      createNoStoreResponse(
        {
          ok: false,
          error: pncpUnstable
            ? `O PNCP está instável ou demorou para responder. Tente novamente em alguns segundos. Detalhe técnico: ${message}`
            : message,
        },
        status
      );

    if (pncpUnstable) {
      response.headers.set(
        "Retry-After",
        "3"
      );
    }

    return response;
  }
}