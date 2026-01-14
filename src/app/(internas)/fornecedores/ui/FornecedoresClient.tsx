"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type FornecedorAgg = {
  ni: string;
  nome: string;
  ocorrencias: number;
  valorTotal: number;
  ufs: string[];
  ultimaPublicacao?: string;
  exemplos: string[];
  score: number;
};

function fmtDate(v?: string) {
  if (!v) return "--";
  if (v.includes("T")) v = v.split("T")[0];
  if (v.includes("-")) return v.split("-").reverse().join("/");
  return v;
}

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toYYYYMMDD(iso: string) {
  return iso.replaceAll("-", "");
}

// janelas de 365 dias (client)
function parseYYYYMMDD(s: string) {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  return new Date(Date.UTC(y, m, d));
}
function fmtYYYYMMDD(dt: Date) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
function addDays(dt: Date, days: number) {
  const x = new Date(dt.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function splitIntoWindows(startYYYYMMDD: string, endYYYYMMDD: string) {
  const windows: { ini: string; fim: string }[] = [];
  let cur = parseYYYYMMDD(startYYYYMMDD);
  const endDt = parseYYYYMMDD(endYYYYMMDD);

  while (cur <= endDt) {
    const winEnd = addDays(cur, 364);
    const fim = winEnd <= endDt ? winEnd : endDt;
    windows.push({ ini: fmtYYYYMMDD(cur), fim: fmtYYYYMMDD(fim) });
    cur = addDays(fim, 1);
  }
  return windows;
}

export default function FornecedoresClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const [termo, setTermo] = useState(sp.get("termo") ?? "");
  const [dataIni, setDataIni] = useState(sp.get("dataIni") ?? "");
  const [dataFim, setDataFim] = useState(sp.get("dataFim") ?? "");
  const [ufOrg, setUfOrg] = useState(sp.get("ufOrg") ?? ""); // ✅ novo

  const [maxPages, setMaxPages] = useState(sp.get("maxPages") ?? "8");
  const [pageSize, setPageSize] = useState(sp.get("pageSize") ?? "200");
  const [top, setTop] = useState(sp.get("top") ?? "30");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    scannedPages: 0,
    scannedContracts: 0,
    fornecedores: 0,
    windowIndex: 0,
    windowTotal: 0,
    currentPage: 0,
    totalPaginasWindow: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorAgg[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const canSearch = useMemo(() => termo.trim().length >= 3, [termo]);

  function computeScore(a: Omit<FornecedorAgg, "score">) {
    // score simples: ocorrências + volume + diversidade de UF
    const score = a.ocorrencias * 10 + Math.log10(1 + a.valorTotal) * 5 + (a.ufs?.length ?? 0) * 2;
    return Math.round(score * 10) / 10;
  }

  function mergeAgg(current: Map<string, Omit<FornecedorAgg, "score">>, incoming: any[]) {
    for (const it of incoming) {
      const key = `${it.ni}__${it.nome}`;
      if (!current.has(key)) {
        current.set(key, {
          ni: it.ni,
          nome: it.nome,
          ocorrencias: 0,
          valorTotal: 0,
          ufs: [],
          ultimaPublicacao: it.ultimaPublicacao,
          exemplos: [],
        });
      }

      const a = current.get(key)!;
      a.ocorrencias += Number(it.ocorrencias || 0);
      a.valorTotal += Number(it.valorTotal || 0);

      // ufs merge
      const set = new Set([...(a.ufs || []), ...((it.ufs || []) as string[])]);
      a.ufs = Array.from(set).sort();

      // ultimaPublicacao max
      if (it.ultimaPublicacao && (!a.ultimaPublicacao || it.ultimaPublicacao > a.ultimaPublicacao)) {
        a.ultimaPublicacao = it.ultimaPublicacao;
      }

      // exemplos (até 3)
      const ex = (it.exemplos || []) as string[];
      for (const e of ex) {
        if (a.exemplos.length >= 3) break;
        if (!a.exemplos.includes(e)) a.exemplos.push(e);
      }
    }
  }

  async function buscar() {
    try {
      setLoading(true);
      setError(null);
      setFornecedores([]);
      setProgress({
        scannedPages: 0,
        scannedContracts: 0,
        fornecedores: 0,
        windowIndex: 0,
        windowTotal: 0,
        currentPage: 0,
        totalPaginasWindow: 0,
      });

      // abort anterior
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const termoTrim = termo.trim();
      const maxPagesN = clamp(Number(maxPages || 8), 1, 300);
      const pageSizeN = clamp(Number(pageSize || 200), 10, 500); // ✅ máximo real 500
      const topN = clamp(Number(top || 30), 5, 200);
      const uf = ufOrg.trim().toUpperCase();

      // datas padrão se vazio
      const dIni = dataIni || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dFim = dataFim || new Date().toISOString().slice(0, 10);

      // atualiza URL
      const qs = new URLSearchParams();
      qs.set("termo", termoTrim);
      qs.set("dataIni", dIni);
      qs.set("dataFim", dFim);
      if (uf) qs.set("ufOrg", uf);
      qs.set("maxPages", String(maxPagesN));
      qs.set("pageSize", String(pageSizeN));
      qs.set("top", String(topN));
      router.replace(`/fornecedores?${qs.toString()}`);

      // janelas
      const windows = splitIntoWindows(toYYYYMMDD(dIni), toYYYYMMDD(dFim));
      setProgress((p) => ({ ...p, windowTotal: windows.length }));

      const aggMap = new Map<string, Omit<FornecedorAgg, "score">>();

      for (let wi = 0; wi < windows.length; wi++) {
        const w = windows[wi];
        setProgress((p) => ({ ...p, windowIndex: wi + 1, currentPage: 0, totalPaginasWindow: 0 }));

        // varre páginas da janela
        for (let page = 1; page <= maxPagesN; page++) {
          if (ac.signal.aborted) throw new Error("Busca cancelada");

          const api = new URLSearchParams();
          api.set("termo", termoTrim);
          api.set("dataInicial", w.ini);
          api.set("dataFinal", w.fim);
          api.set("pagina", String(page));
          api.set("tamanhoPagina", String(pageSizeN));
          if (uf) api.set("ufOrg", uf);

          const r = await fetch(`/api/fornecedores/scan?${api.toString()}`, { signal: ac.signal });
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || "Falha na busca");

          // atualiza progresso
          setProgress((p) => ({
            ...p,
            scannedPages: p.scannedPages + 1,
            scannedContracts: p.scannedContracts + Number(j.scannedContracts || 0),
            currentPage: page,
            totalPaginasWindow: Number(j.totalPaginas || 0),
          }));

          // merge em tempo real
          mergeAgg(aggMap, j.items || []);

          // gera lista ordenada e atualiza UI (em tempo real)
          const list = Array.from(aggMap.values()).map((a) => ({ ...a, score: computeScore(a) }));
          list.sort((x, y) => y.score - x.score);
          setFornecedores(list.slice(0, topN));
          setProgress((p) => ({ ...p, fornecedores: list.length }));

          // condição de parada: fim das páginas reais
          const totalPag = Number(j.totalPaginas || 0);
          if (totalPag && page >= totalPag) break;

          // pequena pausa pra não “martelar”
          await new Promise((res) => setTimeout(res, 80));
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  function cancelar() {
    abortRef.current?.abort();
    setLoading(false);
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={panel}>
        <div style={grid}>
          <div style={field}>
            <label style={label}>Produto / subcategoria</label>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Ex: estetoscópio, autoclave, ultrassom..."
              style={input}
            />
          </div>

          <div style={field}>
            <label style={label}>Data inicial</label>
            <input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Data final</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={input} />
          </div>
        </div>

        <div style={grid2}>
          <div style={field}>
            <label style={label}>UF do órgão (opcional)</label>
            <input
              value={ufOrg}
              onChange={(e) => setUfOrg(e.target.value.toUpperCase())}
              placeholder="Ex: MT"
              style={input}
              maxLength={2}
            />
          </div>

          <div style={field}>
            <label style={label}>Páginas para varrer (max)</label>
            <input value={maxPages} onChange={(e) => setMaxPages(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Itens por página (até 500)</label>
            <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Top fornecedores</label>
            <input value={top} onChange={(e) => setTop(e.target.value)} style={input} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <button
              onClick={buscar}
              disabled={!canSearch || loading}
              style={{ ...btn, opacity: !canSearch || loading ? 0.6 : 1 }}
            >
              {loading ? "Buscando..." : "Buscar fornecedores"}
            </button>

            {loading && (
              <button onClick={cancelar} style={btnGhost}>
                Parar
              </button>
            )}
          </div>
        </div>

        <div style={{ color: "#A1A1AA", fontSize: 12 }}>
          Dica: “pageSize” acima de 500 não existe no PNCP. Seu valor será truncado para 500 automaticamente.
        </div>
      </div>

      {error && <div style={errorBox}>Erro: {error}</div>}

      {(loading || fornecedores.length > 0) && (
        <div style={{ color: "#A1A1AA", fontSize: 12 }}>
          Janela {progress.windowIndex}/{progress.windowTotal} • Página {progress.currentPage}
          {progress.totalPaginasWindow ? `/${progress.totalPaginasWindow}` : ""} • Varreu {progress.scannedPages} páginas /{" "}
          {progress.scannedContracts} contratos • Fornecedores encontrados: {progress.fornecedores} • Mostrando top:{" "}
          {fornecedores.length}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {fornecedores.map((f) => (
          <article key={`${f.ni}-${f.nome}`} style={card}>
            <div style={cardTop}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{f.nome}</div>
                <div style={{ color: "#A1A1AA", fontSize: 12 }}>
                  ID fornecedor: <b style={{ color: "#EDEDED" }}>{f.ni}</b> • UFs:{" "}
                  <b style={{ color: "#EDEDED" }}>{f.ufs?.length ? f.ufs.join(", ") : "--"}</b>
                </div>
              </div>
              <div style={scorePill}>Score {f.score}</div>
            </div>

            <div style={metaRow}>
              <span style={chip}>📌 Ocorrências: {f.ocorrencias}</span>
              <span style={chip}>💰 Volume: {money(f.valorTotal)}</span>
              <span style={chip}>🗓 Última publicação: {fmtDate(f.ultimaPublicacao)}</span>
            </div>

            {f.exemplos?.length ? (
              <div style={{ marginTop: 10, color: "#A1A1AA", fontSize: 12 }}>
                <b style={{ color: "#EDEDED" }}>Exemplos de objeto:</b>
                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                  {f.exemplos.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {!loading && !error && fornecedores.length === 0 && (
        <div style={emptyBox}>Nenhum fornecedor encontrado (tente termo mais genérico ou período maior).</div>
      )}
    </section>
  );
}

const panel: React.CSSProperties = {
  borderRadius: 18,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.50)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: 12,
  marginBottom: 12,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
  gap: 12,
  alignItems: "end",
  marginBottom: 10,
};

const field: React.CSSProperties = { display: "grid", gap: 6 };
const label: React.CSSProperties = { fontSize: 12, color: "#A1A1AA" };

const input: React.CSSProperties = {
  padding: "11px 12px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  background: "rgba(0,0,0,0.35)",
  color: "#EDEDED",
  outline: "none",
};

const btn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(34,211,238,0.25)",
  background: "rgba(34,211,238,0.10)",
  color: "#CFFAFE",
  cursor: "pointer",
  fontWeight: 900,
};

const btnGhost: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#EDEDED",
  cursor: "pointer",
  fontWeight: 900,
};

const card: React.CSSProperties = {
  borderRadius: 16,
  padding: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#EDEDED",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const scorePill: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(34,211,238,0.25)",
  background: "rgba(34,211,238,0.10)",
  color: "#CFFAFE",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const metaRow: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const chip: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#EDEDED",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
};

const errorBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.20)",
  background: "rgba(248,113,113,0.08)",
  color: "#FECACA",
};

const emptyBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#A1A1AA",
};
