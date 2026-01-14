"use client";

import { useMemo, useRef, useState } from "react";

type Item = {
  orgao: string;
  objeto: string;
  dataPublicacao?: string | null;
  processoUrl: string;
  fonte?: string;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "--";
  const d = iso.includes("T") ? iso.split("T")[0] : iso;
  return d.includes("-") ? d.split("-").reverse().join("/") : d;
}

export default function MarcasPage() {
  const [termo, setTermo] = useState("cimento");
  const [dataInicial, setDataInicial] = useState("2025-10-01");
  const [dataFinal, setDataFinal] = useState("2025-12-31");

  const [uf, setUf] = useState("");
  const [modalidade, setModalidade] = useState("6");

  const [maxPages, setMaxPages] = useState("30");
  const [pageSize, setPageSize] = useState("50");
  const [target, setTarget] = useState("30");

  const [onlyPortalCompras, setOnlyPortalCompras] = useState(true);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    page: number;
    scannedPages: number;
    scannedItems: number;
    found: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const canSearch = useMemo(() => termo.trim().length >= 3, [termo]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  async function buscarTempoReal(mode: "mais" | "tudo") {
    if (!canSearch) return;

    stop();

    setError(null);
    setLoading(true);

    if (mode === "tudo") setItems([]);

    const ac = new AbortController();
    abortRef.current = ac;

    const qs = new URLSearchParams();
    qs.set("termo", termo.trim());
    qs.set("dataInicial", dataInicial);
    qs.set("dataFinal", dataFinal);

    if (uf.trim()) qs.set("uf", uf.trim().toUpperCase());
    if (modalidade.trim()) qs.set("codigoModalidadeContratacao", modalidade.trim());

    qs.set("maxPages", maxPages);
    qs.set("tamanhoPagina", pageSize);
    qs.set("target", mode === "tudo" ? "300" : target);

    if (onlyPortalCompras) qs.set("onlyPortalCompras", "1");

    try {
      const res = await fetch(`/api/marcas/stream?${qs.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem stream no response");

      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += dec.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          const msg = JSON.parse(line);

          if (msg.type === "error") setError(msg.message || "Erro");

          if (msg.type === "progress") {
            setStatus({
              page: msg.page,
              scannedPages: msg.scannedPages,
              scannedItems: msg.scannedItems,
              found: msg.found,
            });
          }

          if (msg.type === "item") {
            const it: Item = msg.item;
            setItems((prev) => {
              const key = it.processoUrl;
              const exists = prev.some((p) => p.processoUrl === key);
              return exists ? prev : [...prev, it];
            });
          }

          if (msg.type === "done") {
            setStatus((s) =>
              s
                ? { ...s, scannedPages: msg.scannedPages, scannedItems: msg.scannedItems, found: msg.found }
                : { page: 0, scannedPages: msg.scannedPages, scannedItems: msg.scannedItems, found: msg.found }
            );
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message ?? "Erro inesperado");
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <section style={{ padding: 24, color: "#EDEDED", display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 44, fontWeight: 900 }}>Radar de Marcas (Documentos Oficiais)</div>
        <div style={{ color: "#A1A1AA" }}>
          Aqui só aparece publicação que tem <b style={{ color: "#EDEDED" }}>link direto do processo</b>. Se quiser, travamos em{" "}
          <b style={{ color: "#EDEDED" }}>Portal de Compras Públicas</b>.
        </div>
      </div>

      <div style={panel}>
        <div style={grid}>
          <div style={field}>
            <label style={label}>Produto / termo</label>
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex: cimento, estetoscópio" style={input} />
          </div>

          <div style={field}>
            <label style={label}>UF (opcional)</label>
            <input value={uf} onChange={(e) => setUf(e.target.value)} placeholder="Ex: RS" style={input} />
          </div>

          <div style={field}>
            <label style={label}>Modalidade (código, opcional)</label>
            <input value={modalidade} onChange={(e) => setModalidade(e.target.value)} placeholder="Ex: 8" style={input} />
          </div>
        </div>

        <div style={grid2}>
          <div style={field}>
            <label style={label}>Data inicial</label>
            <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} style={input} />
          </div>
          <div style={field}>
            <label style={label}>Data final</label>
            <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Páginas pra varrer (max)</label>
            <input value={maxPages} onChange={(e) => setMaxPages(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Itens por página (até 50)</label>
            <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Resultados por rodada (com link)</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} style={input} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1AA", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={onlyPortalCompras}
              onChange={(e) => setOnlyPortalCompras(e.target.checked)}
            />
            Somente Portal de Compras Públicas (portaldecompraspublicas.com.br)
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button
            onClick={() => buscarTempoReal("tudo")}
            disabled={!canSearch || loading}
            style={{ ...btn, opacity: !canSearch || loading ? 0.6 : 1 }}
          >
            {loading ? "Buscando..." : "Buscar (tempo real)"}
          </button>

          <button
            onClick={() => buscarTempoReal("mais")}
            disabled={!canSearch || loading}
            style={{ ...btn2, opacity: !canSearch || loading ? 0.6 : 1 }}
          >
            Carregar mais
          </button>

          <button onClick={stop} disabled={!loading} style={{ ...btnStop, opacity: !loading ? 0.6 : 1 }}>
            Parar
          </button>
        </div>

        {status && (
          <div style={{ color: "#A1A1AA", fontSize: 12, marginTop: 10 }}>
            Página: {status.page} • Varreu {status.scannedPages} páginas / {status.scannedItems} itens • Encontrados (com link):{" "}
            <b style={{ color: "#EDEDED" }}>{items.length}</b>
          </div>
        )}
      </div>

      {error && <div style={errorBox}>Erro: {error}</div>}

      <div style={{ display: "grid", gap: 14 }}>
        {items.map((r, i) => (
          <article key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{r.orgao}</div>
                <div style={{ color: "#A1A1AA", fontSize: 12, marginTop: 4 }}>
                  Publicado: {fmtDate(r.dataPublicacao)} • Fonte: <b style={{ color: "#EDEDED" }}>{r.fonte || "--"}</b>
                </div>
              </div>

              <a href={r.processoUrl} target="_blank" rel="noreferrer" style={btnLink}>
                Abrir processo ↗
              </a>
            </div>

            <div style={{ marginTop: 10, opacity: 0.95 }}>{r.objeto}</div>
          </article>
        ))}
      </div>

      {!loading && items.length === 0 && !error && (
        <div style={emptyBox}>
          Nenhuma publicação com link direto foi encontrada nesse período. Tente:
          <ul style={{ marginTop: 6, paddingLeft: 18 }}>
            <li>trocar o termo (ex.: “cimento CP-II”)</li>
            <li>aumentar o período</li>
            <li>desmarcar “Somente Portal de Compras Públicas”</li>
            <li>aumentar “Páginas pra varrer”</li>
          </ul>
        </div>
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
};

const grid2: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
  gap: 12,
  alignItems: "end",
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

const btn2: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#EDEDED",
  cursor: "pointer",
  fontWeight: 900,
};

const btnStop: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(248,113,113,0.25)",
  background: "rgba(248,113,113,0.10)",
  color: "#FECACA",
  cursor: "pointer",
  fontWeight: 900,
};

const btnLink: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(34,211,238,0.25)",
  background: "rgba(34,211,238,0.10)",
  color: "#CFFAFE",
  textDecoration: "none",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const card: React.CSSProperties = {
  borderRadius: 16,
  padding: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#EDEDED",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
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
