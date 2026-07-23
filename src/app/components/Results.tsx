"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSearchParams } from "next/navigation";

import type { Licitacao } from "@/lib/types";

type IncludeMode = "any" | "all";

type FetchPageResult = {
  fetched: Licitacao[];
  morePossible: boolean;
  pageSize: number;
};

type RequestError = Error & {
  status?: number;
  retryAfterMs?: number;
};

function normalizeText(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim();
}

function splitTerms(value: string) {
  return (value || "")
    .split(/[,;]+|\s+/)
    .map((term) =>
      normalizeText(term)
    )
    .filter(Boolean);
}

function formatDate(value: string) {
  if (
    value.length >= 10 &&
    value.includes("-")
  ) {
    return value
      .slice(0, 10)
      .split("-")
      .reverse()
      .join("/");
  }

  return value;
}

function wait(
  milliseconds: number,
  signal?: AbortSignal
) {
  return new Promise<void>(
    (resolve, reject) => {
      if (signal?.aborted) {
        const error = new DOMException(
          "Operação cancelada",
          "AbortError"
        );

        reject(error);
        return;
      }

      const timeout = window.setTimeout(
        () => {
          signal?.removeEventListener(
            "abort",
            handleAbort
          );

          resolve();
        },
        milliseconds
      );

      function handleAbort() {
        window.clearTimeout(timeout);

        const error = new DOMException(
          "Operação cancelada",
          "AbortError"
        );

        reject(error);
      }

      signal?.addEventListener(
        "abort",
        handleAbort,
        {
          once: true,
        }
      );
    }
  );
}

export default function Results() {
  const searchParams =
    useSearchParams();

  const fullQueryKey =
    searchParams.toString();

  /*
   * Chave contendo somente os filtros que
   * realmente consultam a API.
   *
   * include, exclude e includeMode não entram
   * aqui, pois são filtros locais.
   */
  const apiQueryKey = useMemo(() => {
    const params =
      new URLSearchParams();

    const apiKeys = [
      "q",
      "uf",
      "codigoModalidadeContratacao",
      "dataIni",
      "dataFim",
      "encIni",
      "encFim",
      "pageSize",
    ];

    for (const key of apiKeys) {
      const value =
        searchParams.get(key);

      if (value) {
        params.set(key, value);
      }
    }

    return params.toString();
  }, [fullQueryKey, searchParams]);

  const interfaceFilters =
    useMemo(() => {
      const include = splitTerms(
        searchParams.get("include") ||
          ""
      );

      const exclude = splitTerms(
        searchParams.get("exclude") ||
          ""
      );

      const mode =
        searchParams.get(
          "includeMode"
        );

      const includeMode: IncludeMode =
        mode === "all"
          ? "all"
          : "any";

      return {
        include,
        exclude,
        includeMode,
      };
    }, [fullQueryKey, searchParams]);

  const [loading, setLoading] =
    useState(false);

  const [
    loadingMore,
    setLoadingMore,
  ] = useState(false);

  const [
    loadingAll,
    setLoadingAll,
  ] = useState(false);

  const [rawItems, setRawItems] =
    useState<Licitacao[]>([]);

  const [items, setItems] =
    useState<Licitacao[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  const [statusMessage, setStatusMessage] =
    useState<string | null>(null);

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(50);

  const [hasMore, setHasMore] =
    useState(true);

  const MAX_PAGES = 200;

  /*
   * Controle contra respostas antigas e
   * cancelamento de requisições.
   */
  const runIdRef = useRef(0);

  const abortRef =
    useRef<AbortController | null>(
      null
    );

  /*
   * Estrutura incremental para deduplicação.
   */
  const rawMapRef = useRef<
    Map<string, Licitacao>
  >(new Map());

  const rawListRef = useRef<
    Licitacao[]
  >([]);

  /*
   * Virtualização da lista usando o scroll
   * principal da página.
   */
  const listRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [scrollY, setScrollY] =
    useState(0);

  const [viewportHeight, setViewportHeight] =
    useState(720);

  const [listTop, setListTop] =
    useState(0);

  const ITEM_HEIGHT = 182;
  const OVERSCAN = 10;

  useEffect(() => {
    function handleResize() {
      setViewportHeight(
        Math.max(
          420,
          window.innerHeight
        )
      );
    }

    handleResize();

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  useEffect(() => {
    function handleScroll() {
      setScrollY(
        window.scrollY || 0
      );
    }

    handleScroll();

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      }
    );

    return () => {
      window.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, []);

  const calculateListTop =
    useCallback(() => {
      if (!listRef.current) {
        return;
      }

      const rect =
        listRef.current.getBoundingClientRect();

      setListTop(
        rect.top +
          (window.scrollY || 0)
      );
    }, []);

  useEffect(() => {
    calculateListTop();

    window.addEventListener(
      "resize",
      calculateListTop
    );

    return () => {
      window.removeEventListener(
        "resize",
        calculateListTop
      );
    };
  }, [calculateListTop]);

  useEffect(() => {
    calculateListTop();
  }, [
    items.length,
    calculateListTop,
  ]);

  const withSearchCache =
    useCallback(
      (
        item: Licitacao
      ): Licitacao => {
        const cachedItem =
          item as Licitacao & {
            _t?: string;
          };

        if (cachedItem._t) {
          return item;
        }

        const searchableText = [
          item.titulo,
          item.orgao ?? "",
          item.modalidade ?? "",
          item.municipio ?? "",
          item.uf ?? "",
        ].join(" ");

        return {
          ...item,
          _t: normalizeText(
            searchableText
          ),
        } as Licitacao;
      },
      []
    );

  const applyInterfaceFilters =
    useCallback(
      (
        sourceItems: Licitacao[]
      ) => {
        const {
          include,
          exclude,
          includeMode,
        } = interfaceFilters;

        return sourceItems.filter(
          (item) => {
            const cachedItem =
              item as Licitacao & {
                _t?: string;
              };

            const searchableText =
              cachedItem._t ||
              normalizeText(
                [
                  item.titulo,
                  item.orgao ?? "",
                  item.modalidade ?? "",
                  item.municipio ?? "",
                  item.uf ?? "",
                ].join(" ")
              );

            if (
              include.length > 0
            ) {
              const includeMatches =
                includeMode === "all"
                  ? include.every(
                      (term) =>
                        searchableText.includes(
                          term
                        )
                    )
                  : include.some(
                      (term) =>
                        searchableText.includes(
                          term
                        )
                    );

              if (!includeMatches) {
                return false;
              }
            }

            if (
              exclude.length > 0
            ) {
              const hasExcludedTerm =
                exclude.some(
                  (term) =>
                    searchableText.includes(
                      term
                    )
                );

              if (hasExcludedTerm) {
                return false;
              }
            }

            return true;
          }
        );
      },
      [interfaceFilters]
    );

  function resetRawStore() {
    rawMapRef.current =
      new Map();

    rawListRef.current = [];
  }

  function addFetchedIncremental(
    fetchedItems: Licitacao[]
  ) {
    const map =
      rawMapRef.current;

    const list =
      rawListRef.current;

    for (const item of fetchedItems) {
      const existingItem =
        map.get(item.id);

      if (!existingItem) {
        map.set(item.id, item);
        list.push(item);
        continue;
      }

      map.set(item.id, item);

      const existingIndex =
        list.findIndex(
          (currentItem) =>
            currentItem.id === item.id
        );

      if (existingIndex >= 0) {
        list[existingIndex] = item;
      }
    }

    return [...list];
  }

  async function safeJson(
    response: Response
  ) {
    const clonedResponse =
      response.clone();

    try {
      return await response.json();
    } catch {
      const text =
        await clonedResponse
          .text()
          .catch(() => "");

      return {
        ok: false,
        error:
          text.slice(0, 240) ||
          "Resposta inválida da API.",
      };
    }
  }

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

  function getRetryAfterMs(
    response: Response
  ) {
    const retryAfter =
      response.headers.get(
        "Retry-After"
      );

    if (!retryAfter) {
      return 0;
    }

    const seconds =
      Number(retryAfter);

    if (
      Number.isFinite(seconds) &&
      seconds > 0
    ) {
      return seconds * 1000;
    }

    return 0;
  }

  const fetchPageOnce =
    useCallback(
      async (
        nextPage: number,
        signal: AbortSignal
      ): Promise<FetchPageResult> => {
        const apiParams =
          new URLSearchParams(
            apiQueryKey
          );

        const parsedPageSize =
          Number(
            apiParams.get(
              "pageSize"
            ) || "50"
          );

        const safePageSize =
          Math.max(
            10,
            Math.min(
              50,
              Number.isFinite(
                parsedPageSize
              )
                ? parsedPageSize
                : 50
            )
          );

        apiParams.set(
          "pageSize",
          String(safePageSize)
        );

        apiParams.set(
          "page",
          String(nextPage)
        );

        const response =
          await fetch(
            `/api/licitacoes?${apiParams.toString()}`,
            {
              signal,
              cache: "no-store",
            }
          );

        const data =
          await safeJson(response);

        if (
          !response.ok ||
          !data?.ok
        ) {
          const requestError =
            new Error(
              data?.error ||
                `Falha na busca. HTTP ${response.status}.`
            ) as RequestError;

          requestError.status =
            response.status || 500;

          requestError.retryAfterMs =
            getRetryAfterMs(
              response
            );

          throw requestError;
        }

        const fetched: Licitacao[] =
          (
            Array.isArray(data.items)
              ? data.items
              : []
          ).map(withSearchCache);

        const morePossible =
          typeof data.morePossible ===
          "boolean"
            ? data.morePossible
            : fetched.length >=
              safePageSize;

        setPageSize(
          safePageSize
        );

        return {
          fetched,
          morePossible,
          pageSize: safePageSize,
        };
      },
      [
        apiQueryKey,
        withSearchCache,
      ]
    );

  const fetchPageWithRetry =
    useCallback(
      async (
        nextPage: number,
        signal: AbortSignal,
        maxAttempts = 8
      ): Promise<FetchPageResult> => {
        let lastError:
          | RequestError
          | null = null;

        for (
          let attempt = 1;
          attempt <= maxAttempts;
          attempt++
        ) {
          try {
            return await fetchPageOnce(
              nextPage,
              signal
            );
          } catch (caughtError) {
            const requestError =
              caughtError as RequestError;

            lastError =
              requestError;

            if (
              requestError.name ===
              "AbortError"
            ) {
              throw requestError;
            }

            const status =
              Number(
                requestError.status ||
                  500
              );

            const message =
              String(
                requestError.message ||
                  ""
              ).toLowerCase();

            const retryable =
              isRetryableStatus(
                status
              ) ||
              message.includes(
                "timeout"
              ) ||
              message.includes(
                "temporariamente"
              );

            if (!retryable) {
              throw requestError;
            }

            if (
              attempt === maxAttempts
            ) {
              break;
            }

            const retryAfter =
              Number(
                requestError.retryAfterMs ||
                  0
              );

            const exponentialBackoff =
              Math.min(
                15_000,
                600 *
                  Math.pow(
                    2,
                    attempt - 1
                  )
              );

            const jitter =
              Math.floor(
                Math.random() *
                  300
              );

            const delay =
              Math.max(
                retryAfter,
                exponentialBackoff
              ) + jitter;

            setStatusMessage(
              `PNCP instável na página ${nextPage}. Tentativa ${attempt}/${maxAttempts}. Nova tentativa em ${Math.ceil(
                delay / 1000
              )} segundos...`
            );

            await wait(
              delay,
              signal
            );
          }
        }

        throw (
          lastError ||
          new Error(
            "Não foi possível consultar o PNCP."
          )
        );
      },
      [fetchPageOnce]
    );

  const loadFirstPage =
    useCallback(
      async (
        runId: number
      ) => {
        setError(null);
        setStatusMessage(
          "Consultando a primeira página do PNCP..."
        );

        setHasMore(true);
        setPage(1);
        setRawItems([]);
        setItems([]);

        resetRawStore();

        abortRef.current?.abort();

        const controller =
          new AbortController();

        abortRef.current =
          controller;

        const {
          fetched,
          morePossible,
        } =
          await fetchPageWithRetry(
            1,
            controller.signal,
            8
          );

        if (
          runId !==
          runIdRef.current
        ) {
          return;
        }

        const mergedRaw =
          addFetchedIncremental(
            fetched
          );

        setRawItems(mergedRaw);

        setItems(
          applyInterfaceFilters(
            mergedRaw
          )
        );

        setHasMore(
          morePossible
        );

        setPage(1);

        setStatusMessage(null);
      },
      [
        applyInterfaceFilters,
        fetchPageWithRetry,
      ]
    );

  const onLoadMore =
    useCallback(async () => {
      if (
        loading ||
        loadingAll ||
        loadingMore ||
        !hasMore
      ) {
        return;
      }

      const currentRunId =
        runIdRef.current;

      try {
        setError(null);
        setLoadingMore(true);

        const controller =
          new AbortController();

        abortRef.current?.abort();
        abortRef.current =
          controller;

        const nextPage =
          page + 1;

        setStatusMessage(
          `Carregando página ${nextPage}...`
        );

        const {
          fetched,
          morePossible,
        } =
          await fetchPageWithRetry(
            nextPage,
            controller.signal,
            8
          );

        if (
          currentRunId !==
          runIdRef.current
        ) {
          return;
        }

        const mergedRaw =
          addFetchedIncremental(
            fetched
          );

        setRawItems(mergedRaw);

        setItems(
          applyInterfaceFilters(
            mergedRaw
          )
        );

        setHasMore(
          morePossible
        );

        setPage(nextPage);
        setStatusMessage(null);
      } catch (caughtError) {
        const requestError =
          caughtError as Error;

        if (
          requestError.name ===
          "AbortError"
        ) {
          return;
        }

        setError(
          requestError.message ||
            "Erro ao carregar mais resultados."
        );
      } finally {
        setLoadingMore(false);
      }
    }, [
      loading,
      loadingAll,
      loadingMore,
      hasMore,
      page,
      fetchPageWithRetry,
      applyInterfaceFilters,
    ]);

  const onLoadAll =
    useCallback(async () => {
      if (
        loading ||
        loadingAll ||
        loadingMore ||
        !hasMore
      ) {
        return;
      }

      const currentRunId =
        runIdRef.current;

      try {
        setError(null);
        setLoadingAll(true);

        const controller =
          new AbortController();

        abortRef.current?.abort();
        abortRef.current =
          controller;

        let currentPage: number = page;
        let morePages: boolean = hasMore;

        let pagesSinceRender = 0;

        while (
          morePages &&
          currentPage < MAX_PAGES
        ) {
          if (
            currentRunId !==
            runIdRef.current
          ) {
            return;
          }

          const nextPage =
            currentPage + 1;

          setStatusMessage(
            `Carregando todas as oportunidades: página ${nextPage} de até ${MAX_PAGES}...`
          );

          const {
            fetched,
            morePossible,
          } =
            await fetchPageWithRetry(
              nextPage,
              controller.signal,
              10
            );

          if (
            currentRunId !==
            runIdRef.current
          ) {
            return;
          }

          const mergedRaw =
            addFetchedIncremental(
              fetched
            );

          currentPage =
            nextPage;

          morePages =
            morePossible;

          setPage(currentPage);
          setHasMore(morePages);

          pagesSinceRender++;

          if (
            pagesSinceRender >= 3 ||
            !morePages ||
            currentPage >=
              MAX_PAGES
          ) {
            setRawItems(
              mergedRaw
            );

            setItems(
              applyInterfaceFilters(
                mergedRaw
              )
            );

            pagesSinceRender = 0;

            await new Promise<void>(
              (resolve) => {
                requestAnimationFrame(
                  () => resolve()
                );
              }
            );
          }

          await wait(
            180,
            controller.signal
          );
        }

        const finalRawItems = [
          ...rawListRef.current,
        ];

        setRawItems(
          finalRawItems
        );

        setItems(
          applyInterfaceFilters(
            finalRawItems
          )
        );

        if (
          currentPage >=
            MAX_PAGES &&
          morePages
        ) {
          setStatusMessage(
            `Limite operacional de ${MAX_PAGES} páginas atingido.`
          );
        } else {
          setStatusMessage(
            "Carregamento concluído."
          );

          window.setTimeout(() => {
            setStatusMessage(null);
          }, 2500);
        }
      } catch (caughtError) {
        const requestError =
          caughtError as Error;

        if (
          requestError.name ===
          "AbortError"
        ) {
          return;
        }

        setError(
          requestError.message ||
            "Erro ao carregar todas as páginas."
        );
      } finally {
        setLoadingAll(false);
      }
    }, [
      loading,
      loadingAll,
      loadingMore,
      hasMore,
      page,
      fetchPageWithRetry,
      applyInterfaceFilters,
    ]);

  /*
   * Nova busca no PNCP somente quando os
   * filtros da API mudarem.
   */
  useEffect(() => {
    runIdRef.current += 1;

    const currentRunId =
      runIdRef.current;

    async function run() {
      try {
        setLoading(true);
        setLoadingAll(false);
        setLoadingMore(false);

        await loadFirstPage(
          currentRunId
        );
      } catch (caughtError) {
        const requestError =
          caughtError as Error;

        if (
          requestError.name ===
          "AbortError"
        ) {
          return;
        }

        setError(
          requestError.message ||
            "Erro inesperado ao consultar o PNCP."
        );

        setRawItems([]);
        setItems([]);
        setHasMore(false);
        setStatusMessage(null);
      } finally {
        if (
          currentRunId ===
          runIdRef.current
        ) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      abortRef.current?.abort();
    };
  }, [
    apiQueryKey,
    loadFirstPage,
  ]);

  /*
   * Quando somente include, exclude ou
   * includeMode mudarem, reaplica o filtro
   * local sem consultar novamente a API.
   */
  useEffect(() => {
    const currentRawItems = [
      ...rawListRef.current,
    ];

    setRawItems(
      currentRawItems
    );

    setItems(
      applyInterfaceFilters(
        currentRawItems
      )
    );
  }, [
    applyInterfaceFilters,
  ]);

  const localScroll =
    Math.max(
      0,
      scrollY - listTop
    );

  const totalHeight =
    items.length *
    ITEM_HEIGHT;

  const startIndex =
    Math.max(
      0,
      Math.floor(
        localScroll /
          ITEM_HEIGHT
      ) - OVERSCAN
    );

  const visibleCount =
    Math.ceil(
      viewportHeight /
        ITEM_HEIGHT
    ) +
    OVERSCAN * 2;

  const endIndex =
    Math.min(
      items.length,
      startIndex +
        visibleCount
    );

  const visibleItems =
    items.slice(
      startIndex,
      endIndex
    );

  const paddingTop =
    startIndex *
    ITEM_HEIGHT;

  const paddingBottom =
    Math.max(
      0,
      totalHeight -
        paddingTop -
        visibleItems.length *
          ITEM_HEIGHT
    );

  const showActions =
    hasMore && !error;

  return (
    <section
      style={{
        marginTop: 16,
      }}
    >
      <div style={resultsHeader}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            margin: 0,
          }}
        >
          Resultados
        </h2>

        {loading && (
          <span
            style={{
              color: "#A1A1AA",
              fontSize: 13,
            }}
          >
            Carregando...
          </span>
        )}
      </div>

      <div style={metrics}>
        <span>
          Página:{" "}
          <strong
            style={{
              color: "#EDEDED",
            }}
          >
            {page}
          </strong>{" "}
          / {MAX_PAGES}
        </span>

        <span>
          Brutos PNCP:{" "}
          <strong
            style={{
              color: "#EDEDED",
            }}
          >
            {rawItems.length}
          </strong>
        </span>

        <span>
          Filtrados:{" "}
          <strong
            style={{
              color: "#EDEDED",
            }}
          >
            {items.length}
          </strong>
        </span>
      </div>

      {statusMessage && (
        <div style={statusBox}>
          <span
            style={{
              display:
                "inline-block",
              marginRight: 8,
            }}
          >
            {loadingAll ||
            loadingMore ||
            loading
              ? "⏳"
              : "✅"}
          </span>

          {statusMessage}
        </div>
      )}

      {error && (
        <div style={boxError}>
          <strong>Erro:</strong>{" "}
          {error}
        </div>
      )}

      {!loading &&
        !error &&
        items.length === 0 && (
          <div style={box}>
            {hasMore
              ? "Nenhum resultado filtrado nesta página. Clique em “Ver mais” ou “Carregar tudo” para pesquisar outras páginas do PNCP."
              : "Nada foi encontrado com os filtros informados."}
          </div>
        )}

      <div
        ref={listRef}
        style={{
          paddingRight: 6,
        }}
      >
        <div
          style={{
            height: paddingTop,
          }}
        />

        <div
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          {visibleItems.map(
            (item) => (
              <article
                key={item.id}
                style={card}
              >
                <div style={rowTop}>
                  <div style={title}>
                    {item.titulo}
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      style={cta}
                    >
                      Abrir edital →
                    </a>
                  )}
                </div>

                <div style={meta}>
                  {item.orgao ??
                    "Órgão não informado"}{" "}
                  •{" "}
                  {item.municipio ??
                    "--"}{" "}
                  / {item.uf ?? "--"} •{" "}
                  <strong
                    style={{
                      color:
                        "#EDEDED",
                    }}
                  >
                    {item.modalidade ??
                      "--"}
                  </strong>{" "}
                  • {item.fonte}
                </div>

                <div style={chips}>
                  {item.valorEstimado !=
                    null && (
                    <span style={chip}>
                      💰 R${" "}
                      {item.valorEstimado.toLocaleString(
                        "pt-BR",
                        {
                          minimumFractionDigits:
                            2,
                          maximumFractionDigits:
                            2,
                        }
                      )}
                    </span>
                  )}

                  {item.dataPublicacao && (
                    <span style={chip}>
                      📅 Publicado:{" "}
                      {formatDate(
                        item.dataPublicacao
                      )}
                    </span>
                  )}

                  {item.prazoEncerramento && (
                    <span
                      style={
                        chipWarning
                      }
                    >
                      ⏰ Encerra:{" "}
                      {formatDate(
                        item.prazoEncerramento
                      )}
                    </span>
                  )}
                </div>
              </article>
            )
          )}
        </div>

        <div
          style={{
            height:
              paddingBottom,
          }}
        />
      </div>

      <div style={actions}>
        {showActions && (
          <>
            <button
              type="button"
              onClick={
                onLoadMore
              }
              disabled={
                loadingMore ||
                loadingAll ||
                loading
              }
              style={{
                ...button,
                opacity:
                  loadingMore ||
                  loadingAll ||
                  loading
                    ? 0.6
                    : 1,
              }}
            >
              {loadingMore
                ? `Carregando página ${
                    page + 1
                  }...`
                : `Ver mais (+${pageSize})`}
            </button>

            <button
              type="button"
              onClick={
                onLoadAll
              }
              disabled={
                loadingAll ||
                loadingMore ||
                loading
              }
              style={{
                ...buttonPrimary,
                opacity:
                  loadingAll ||
                  loadingMore ||
                  loading
                    ? 0.6
                    : 1,
              }}
            >
              {loadingAll
                ? `Carregando tudo — página ${page}/${MAX_PAGES}`
                : `Carregar tudo — até ${MAX_PAGES} páginas`}
            </button>
          </>
        )}

        {!hasMore &&
          rawItems.length > 0 && (
            <div
              style={{
                color:
                  "#A1A1AA",
                fontSize: 12,
              }}
            >
              Fim dos resultados para
              este filtro e período.
            </div>
          )}
      </div>
    </section>
  );
}

const resultsHeader: React.CSSProperties =
  {
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    marginBottom: 10,
  };

const metrics: React.CSSProperties = {
  color: "#A1A1AA",
  fontSize: 12,
  marginBottom: 10,
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
};

const card: React.CSSProperties = {
  minHeight: 145,
  boxSizing: "border-box",
  borderRadius: 16,
  padding: 18,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  border:
    "1px solid rgba(255,255,255,0.10)",
  color: "#EDEDED",
  boxShadow:
    "0 10px 30px rgba(0,0,0,0.35)",
};

const rowTop: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  justifyContent:
    "space-between",
};

const title: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#FFFFFF",
  lineHeight: 1.25,
  maxWidth: 780,
};

const meta: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#A1A1AA",
};

const chips: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const chip: React.CSSProperties = {
  background:
    "rgba(34,211,238,0.10)",
  border:
    "1px solid rgba(34,211,238,0.18)",
  color: "#CFFAFE",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
};

const chipWarning: React.CSSProperties =
  {
    background:
      "rgba(248,113,113,0.10)",
    border:
      "1px solid rgba(248,113,113,0.18)",
    color: "#FECACA",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
  };

const cta: React.CSSProperties = {
  textDecoration: "none",
  color: "#22D3EE",
  fontWeight: 800,
  fontSize: 13,
  padding: "10px 12px",
  borderRadius: 12,
  border:
    "1px solid rgba(34,211,238,0.25)",
  background:
    "rgba(34,211,238,0.08)",
  whiteSpace: "nowrap",
};

const box: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 10,
  padding: 12,
  borderRadius: 12,
  background:
    "rgba(255,255,255,0.04)",
  border:
    "1px solid rgba(255,255,255,0.08)",
  color: "#A1A1AA",
};

const statusBox: React.CSSProperties =
  {
    ...box,
    border:
      "1px solid rgba(34,211,238,0.20)",
    background:
      "rgba(34,211,238,0.06)",
    color: "#CFFAFE",
  };

const boxError: React.CSSProperties = {
  ...box,
  border:
    "1px solid rgba(248,113,113,0.20)",
  background:
    "rgba(248,113,113,0.08)",
  color: "#FECACA",
};

const actions: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const button: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border:
    "1px solid rgba(255,255,255,0.14)",
  background:
    "rgba(255,255,255,0.06)",
  color: "#EDEDED",
  cursor: "pointer",
  fontWeight: 800,
};

const buttonPrimary: React.CSSProperties =
  {
    ...button,
    border:
      "1px solid rgba(34,211,238,0.25)",
    background:
      "rgba(34,211,238,0.10)",
    color: "#CFFAFE",
  };