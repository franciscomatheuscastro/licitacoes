"use client";

import { useEffect, useMemo, useState } from "react";
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

function matchesAll(text: string, terms: string[]) {
  const t = norm(text);
  return terms.every((x) => t.includes(norm(x)));
}

function matchesAny(text: string, terms: string[]) {
  const t = norm(text);
  return terms.some((x) => t.includes(norm(x)));
}

function fmt(v: string) {
  if (v.length >= 10 && v.includes("-")) return v.slice(0, 10).split("-").reverse().join("/");
  return v;
}

type IncludeMode = "any" | "all";

export default function Results() {
  const sp = useSearchParams(); // ✅ SSR-safe: Next fornece isso no client
  const qsKey = sp.toString();  // muda quando a URL muda

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const [rawItems, setRawItems] = useState<Licitacao[]>([]);
  const [items, setItems] = useState<Licitacao[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [hasMore, setHasMore] = useState(true);

  const MAX_PAGES = 40;

  const uiFilters = useMemo(() => {
    const include = splitTerms(sp.get("include") || "");
    const exclude = splitTerms(sp.get("exclude") || "");
    const includeMode = ((sp.get("includeMode") || "any") as IncludeMode);
    return { include, exclude, includeMode };
  }, [qsKey]); // ✅ recalcula quando URL muda

  function dedupById(list: Licitacao[]) {
    const map = new Map<string, Licitacao>();
    for (const it of list) map.set(it.id, it);
    return Array.from(map.values());
  }

  function applyInterfaceFilters(allRaw: Licitacao[]) {
    const { include, exclude, includeMode } = uiFilters;

    return allRaw.filter((it) => {
      const text = `${it.titulo} ${it.orgao ?? ""} ${it.modalidade ?? ""} ${it.municipio ?? ""} ${it.uf ?? ""}`;

      if (include.length > 0) {
        const ok = includeMode === "all" ? matchesAll(text, include) : matchesAny(text, include);
        if (!ok) return false;
      }

      if (exclude.length > 0 && matchesAny(text, exclude)) return false;

      return true;
    });
  }

  async function fetchPage(nextPage: number) {
    // ✅ monta query só com params que a API entende
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

    const res = await fetch(`/api/licitacoes?${apiParams.toString()}`);
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || "Falha na busca");

    const fetched: Licitacao[] = data.items || [];
    const morePossible = fetched.length >= (data.pageSize || ps);

    return { fetched, morePossible };
  }

  async function loadFirstPage() {
    setError(null);
    setHasMore(true);
    setPage(1);
    setRawItems([]);
    setItems([]);

    const { fetched, morePossible } = await fetchPage(1);

    const mergedRaw = dedupById(fetched);
    setRawItems(mergedRaw);
    setItems(applyInterfaceFilters(mergedRaw));
    setHasMore(morePossible);
    setPage(1);
  }

  const onLoadMore = async () => {
    try {
      setLoadingMore(true);
      const next = page + 1;

      const { fetched, morePossible } = await fetchPage(next);

      const mergedRaw = dedupById([...rawItems, ...fetched]);
      setRawItems(mergedRaw);
      setItems(applyInterfaceFilters(mergedRaw));
      setHasMore(morePossible);
      setPage(next);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar mais");
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const onLoadAll = async () => {
    try {
      setLoadingAll(true);

      let curPage = page;
      let curRaw = [...rawItems];
      let curHasMore = hasMore;

      while (curHasMore && curPage < MAX_PAGES) {
        const next = curPage + 1;
        const { fetched, morePossible } = await fetchPage(next);

        curRaw = dedupById([...curRaw, ...fetched]);
        setRawItems(curRaw);
        setItems(applyInterfaceFilters(curRaw));

        curPage = next;
        curHasMore = morePossible;

        setPage(curPage);
        setHasMore(curHasMore);

        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar tudo");
      setHasMore(false);
    } finally {
      setLoadingAll(false);
    }
  };

  // ✅ aqui é onde busca dados: só roda no client e quando a URL muda
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        await loadFirstPage();
      } catch (e: any) {
        setError(e?.message ?? "Erro inesperado");
        setRawItems([]);
        setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qsKey]); // ✅ refaz quando filtros mudam

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

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((it) => (
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

      <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        {hasMore && rawItems.length > 0 && (
          <>
            <button onClick={onLoadMore} disabled={loadingMore || loadingAll} style={btn}>
              {loadingMore ? "Carregando..." : `Ver mais ( +${pageSize} )`}
            </button>

            <button onClick={onLoadAll} disabled={loadingAll || loadingMore} style={btnPrimary}>
              {loadingAll ? "Carregando tudo..." : "Carregar tudo"}
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
