"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { Licitacao } from "@/lib/types";

function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function splitTerms(s: string) {
  return (s || "")
    .split(/[,]+|\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function fmt(v: string) {
  if (v.length >= 10 && v.includes("-")) return v.slice(0, 10).split("-").reverse().join("/");
  return v;
}

type IncludeMode = "any" | "all";

export default function Results() {
  const sp = useSearchParams();
  const qsKey = sp.toString();

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const [rawItems, setRawItems] = useState<Licitacao[]>([]);
  const [items, setItems] = useState<Licitacao[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [hasMore, setHasMore] = useState(true);

  const MAX_PAGES = 100;

  // ✅ Anti-race + cancelamento
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // ✅ Dedupe incremental
  const rawMapRef = useRef<Map<string, Licitacao>>(new Map());
  const rawListRef = useRef<Licitacao[]>([]);

  // ✅ Virtualização usando scroll da página (SEM scroll interno)
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [viewportH, setViewportH] = useState(720);
  const [listTop, setListTop] = useState(0);

  const ITEM_H = 182; // ajuste fino se necessário
  const OVERSCAN = 10;

  // ✅ mede altura da viewport
  useEffect(() => {
    const onResize = () => setViewportH(Math.max(420, window.innerHeight));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ captura scroll do BODY (um scroll só)
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY || 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ✅ calcula o TOP do container no documento (pra virtualização local)
  useEffect(() => {
    const calcTop = () => {
      if (!listRef.current) return;
      const rect = listRef.current.getBoundingClientRect();
      setListTop(rect.top + (window.scrollY || 0));
    };
    calcTop();

    window.addEventListener("resize", calcTop);
    window.addEventListener("scroll", calcTop, { passive: true });
    return () => {
      window.removeEventListener("resize", calcTop);
      window.removeEventListener("scroll", calcTop as any);
    };
  }, []);

  const uiFilters = useMemo(() => {
    const include = splitTerms(sp.get("include") || "").map(norm);
    const exclude = splitTerms(sp.get("exclude") || "").map(norm);
    const includeMode = ((sp.get("includeMode") || "any") as IncludeMode);
    return { include, exclude, includeMode };
  }, [qsKey]);

  function withCache(it: Licitacao): Licitacao {
    if (it._t) return it;
    const text = `${it.titulo} ${it.orgao ?? ""} ${it.modalidade ?? ""} ${it.municipio ?? ""} ${it.uf ?? ""}`;
    return { ...it, _t: norm(text) };
  }

  const applyInterfaceFilters = useCallback(
    (allRaw: Licitacao[]) => {
      const { include, exclude, includeMode } = uiFilters;

      return allRaw.filter((it) => {
        const t = it._t ?? "";

        if (include.length > 0) {
          const ok =
            includeMode === "all"
              ? include.every((term) => t.includes(term))
              : include.some((term) => t.includes(term));
          if (!ok) return false;
        }

        if (exclude.length > 0) {
          const bad = exclude.some((term) => t.includes(term));
          if (bad) return false;
        }

        return true;
      });
    },
    [uiFilters]
  );

  function resetRawStore() {
    rawMapRef.current = new Map();
    rawListRef.current = [];
  }

  function addFetchedIncremental(fetched: Licitacao[]) {
    const map = rawMapRef.current;
    const list = rawListRef.current;

    for (const it of fetched) {
      if (!map.has(it.id)) {
        map.set(it.id, it);
        list.push(it);
      } else {
        map.set(it.id, it);
      }
    }

    return [...list];
  }

  async function safeJson(res: Response) {
    try {
      return await res.json();
    } catch {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: txt?.slice(0, 240) || "Resposta inválida" };
    }
  }

  function isRetryableStatus(status: number) {
    return status === 503 || status === 500 || status === 429;
  }

  function getRetryAfterMs(res: Response) {
    const ra = res.headers.get("Retry-After");
    const sec = ra ? Number(ra) : NaN;
    if (!Number.isNaN(sec) && sec > 0) return sec * 1000;
    return 0;
  }

  async function fetchPageOnce(nextPage: number, signal: AbortSignal) {
    const apiParams = new URLSearchParams();

    const keys = ["q", "uf", "codigoModalidadeContratacao", "dataIni", "dataFim", "pageSize"];
    for (const k of keys) {
      const v = sp.get(k);
      if (v) apiParams.set(k, v);
    }

    const ps = Math.max(10, Math.min(50, Number(apiParams.get("pageSize") || "50")));
    apiParams.set("pageSize", String(ps));
    apiParams.set("page", String(nextPage));
    setPageSize(ps);

    const res = await fetch(`/api/licitacoes?${apiParams.toString()}`, { signal });
    const data = await safeJson(res);

    if (!res.ok || !data.ok) {
      const errMsg = data?.error || `Falha na busca (HTTP ${res.status})`;
      const retryAfterMs = getRetryAfterMs(res);
      const status = res.status || 500;
      const e: any = new Error(errMsg);
      e.status = status;
      e.retryAfterMs = retryAfterMs;
      throw e;
    }

    const fetched: Licitacao[] = (data.items || []).map(withCache);
    const morePossible = fetched.length >= (data.pageSize || ps);

    return { fetched, morePossible, ps };
  }

  async function fetchPageWithRetry(nextPage: number, signal: AbortSignal, maxAttempts = 12) {
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fetchPageOnce(nextPage, signal);
      } catch (e: any) {
        lastErr = e;
        if (e?.name === "AbortError") throw e;

        const status = Number(e?.status || 500);
        const retryable = isRetryableStatus(status) || String(e?.message || "").toLowerCase().includes("timeout");
        if (!retryable) throw e;

        const retryAfter = Number(e?.retryAfterMs || 0);
        const backoff = Math.min(20_000, 600 * Math.pow(2, attempt - 1));
        const jitter = Math.floor(Math.random() * 250);
        const wait = Math.max(retryAfter, backoff) + jitter;

        setError(
          `PNCP instável (página ${nextPage}). Tentativa ${attempt}/${maxAttempts}. Aguardando ${Math.ceil(wait / 1000)}s...`
        );

        await new Promise<void>((r) => setTimeout(() => r(), wait));
      }
    }

    throw lastErr;
  }

  async function loadFirstPage(runId: number) {
    setError(null);
    setHasMore(true);
    setPage(1);
    setRawItems([]);
    setItems([]);

    resetRawStore();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const { fetched, morePossible } = await fetchPageWithRetry(1, controller.signal, 8);

    if (runId !== runIdRef.current) return;

    const mergedRaw = addFetchedIncremental(fetched);
    setRawItems(mergedRaw);
    setItems(applyInterfaceFilters(mergedRaw));
    setHasMore(morePossible);
    setPage(1);

    // ✅ volta pro topo (opcional)
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const onLoadMore = async () => {
    if (loading || loadingAll || loadingMore) return;

    const myRun = runIdRef.current;

    try {
      setError(null);
      setLoadingMore(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const next = page + 1;
      const { fetched, morePossible } = await fetchPageWithRetry(next, controller.signal, 8);

      if (myRun !== runIdRef.current) return;

      const mergedRaw = addFetchedIncremental(fetched);
      setRawItems(mergedRaw);
      setItems(applyInterfaceFilters(mergedRaw));
      setHasMore(morePossible);
      setPage(next);

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Erro ao carregar mais");
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const onLoadAll = async () => {
    if (loading || loadingAll || loadingMore) return;

    const myRun = runIdRef.current;

    try {
      setError(null);
      setLoadingAll(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let curPage = page;
      let curHasMore = hasMore;

      let batch = 0;

      while (curHasMore && curPage < MAX_PAGES) {
        if (myRun !== runIdRef.current) return;

        const next = curPage + 1;
        const { fetched, morePossible } = await fetchPageWithRetry(next, controller.signal, 14);

        if (myRun !== runIdRef.current) return;

        const mergedRaw = addFetchedIncremental(fetched);

        curPage = next;
        curHasMore = morePossible;

        setPage(curPage);
        setHasMore(curHasMore);

        batch++;
        if (batch >= 4 || !curHasMore || curPage >= MAX_PAGES) {
          setRawItems(mergedRaw);
          setItems(applyInterfaceFilters(mergedRaw));
          batch = 0;
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }

        await new Promise((r) => setTimeout(r, 140));
      }

      setError(null);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Erro ao carregar tudo");
      setHasMore(false);
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    runIdRef.current += 1;
    const myRun = runIdRef.current;

    const run = async () => {
      try {
        setLoading(true);
        setLoadingAll(false);
        setLoadingMore(false);
        await loadFirstPage(myRun);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Erro inesperado");
        setRawItems([]);
        setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qsKey]);

  // ===== Virtualização pelo scroll do documento =====
  const localScroll = Math.max(0, scrollY - listTop);
  const totalH = items.length * ITEM_H;

  const start = Math.max(0, Math.floor(localScroll / ITEM_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ITEM_H) + OVERSCAN * 2;
  const end = Math.min(items.length, start + visibleCount);

  const visible = items.slice(start, end);
  const padTop = start * ITEM_H;
  const padBot = Math.max(0, totalH - padTop - visible.length * ITEM_H);

  return (
    <section style={{ marginTop: 8 }}>
      <div style={resultsHeader}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Resultados</h2>
        {loading && <span style={{ color: "#A1A1AA" }}>carregando…</span>}
      </div>

      <div style={{ color: "#A1A1AA", fontSize: 12, marginBottom: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span>
          Página: <b style={{ color: "#EDEDED" }}>{page}</b> / {MAX_PAGES}
        </span>
        <span>
          Brutos PNCP: <b style={{ color: "#EDEDED" }}>{rawItems.length}</b>
        </span>
        <span>
          Filtrados: <b style={{ color: "#EDEDED" }}>{items.length}</b>
        </span>
      </div>

      {error && (
        <div style={boxError}>
          <b>Erro:</b> {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && <div style={box}>Nada encontrado com esses filtros.</div>}

      {/* ✅ SEM overflow/altura fixa -> 1 scroll apenas (BODY) */}
      <div ref={listRef} style={{ paddingRight: 6 }}>
        <div style={{ height: padTop }} />
        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((it) => (
            <article key={it.id} style={card}>
              <div style={rowTop}>
                <div style={title}>{it.titulo}</div>
                {it.url && (
                  <a href={it.url} target="_blank" rel="noreferrer" style={cta}>
                    Abrir edital →
                  </a>
                )}
              </div>

              <div style={meta}>
                {it.orgao ?? "Órgão não informado"} • {it.municipio ?? "--"} / {it.uf ?? "--"} •{" "}
                <b style={{ color: "#EDEDED" }}>{it.modalidade ?? "--"}</b> • {it.fonte}
              </div>

              <div style={chips}>
                {it.valorEstimado != null && <span style={chip}>💰 R$ {it.valorEstimado.toLocaleString("pt-BR")}</span>}
                {it.dataPublicacao && <span style={chip}>📅 Publicado: {fmt(it.dataPublicacao)}</span>}
                {it.prazoEncerramento && <span style={chipWarning}>⏰ Encerra: {fmt(it.prazoEncerramento)}</span>}
              </div>
            </article>
          ))}
        </div>
        <div style={{ height: padBot }} />
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        {hasMore && rawItems.length > 0 && (
          <>
            <button onClick={onLoadMore} disabled={loadingMore || loadingAll || loading} style={btn}>
              {loadingMore ? "Carregando..." : `Ver mais ( +${pageSize} )`}
            </button>

            <button onClick={onLoadAll} disabled={loadingAll || loadingMore || loading} style={btnPrimary}>
              {loadingAll ? "Carregando tudo..." : "Carregar tudo (até 100 páginas)"}
            </button>
          </>
        )}

        {!hasMore && rawItems.length > 0 && (
          <div style={{ color: "#A1A1AA", fontSize: 12 }}>Fim dos resultados para este filtro/período.</div>
        )}
      </div>
    </section>
  );
}

// ===== Styles =====
const resultsHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
};

const card: React.CSSProperties = {
  borderRadius: 16,
  padding: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#EDEDED",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};

const rowTop: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  justifyContent: "space-between",
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
  background: "rgba(34,211,238,0.10)",
  border: "1px solid rgba(34,211,238,0.18)",
  color: "#CFFAFE",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
};

const chipWarning: React.CSSProperties = {
  background: "rgba(248,113,113,0.10)",
  border: "1px solid rgba(248,113,113,0.18)",
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
  border: "1px solid rgba(34,211,238,0.25)",
  background: "rgba(34,211,238,0.08)",
  whiteSpace: "nowrap",
};

const box: React.CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#A1A1AA",
};

const boxError: React.CSSProperties = {
  ...box,
  border: "1px solid rgba(248,113,113,0.20)",
  background: "rgba(248,113,113,0.08)",
  color: "#FECACA",
};

const btn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#EDEDED",
  cursor: "pointer",
  fontWeight: 800,
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(34,211,238,0.25)",
  background: "rgba(34,211,238,0.10)",
  color: "#CFFAFE",
};