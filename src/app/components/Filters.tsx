"use client";

import { useEffect, useMemo, useState } from "react";

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const MODALIDADES = [
  { code: "8", label: "Modalidade 8 (nome aparece nos cards)" },
  { code: "5", label: "Modalidade 5 (nome aparece nos cards)" },
  { code: "6", label: "Modalidade 6 (nome aparece nos cards)" },
  { code: "1", label: "Modalidade 1 (nome aparece nos cards)" },
  { code: "7", label: "Modalidade 7 (nome aparece nos cards)" },
];

export default function Filters() {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [codigoModalidadeContratacao, setCodigoModalidadeContratacao] = useState("8");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [pageSize, setPageSize] = useState("50");

  const [includeText, setIncludeText] = useState("");
  const [excludeText, setExcludeText] = useState("");

  // ✅ novo: modo do incluir
  const [includeMode, setIncludeMode] = useState<"any" | "all">("any");

  const dq = useDebounced(q, 400);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();

    if (dq) sp.set("q", dq);
    if (uf) sp.set("uf", uf);

    sp.set("codigoModalidadeContratacao", codigoModalidadeContratacao);

    if (dataIni) sp.set("dataIni", dataIni);
    if (dataFim) sp.set("dataFim", dataFim);

    const ps = Math.max(10, Math.min(50, Number(pageSize || 50)));
    sp.set("pageSize", String(ps));
    sp.set("page", "1");

    if (includeText.trim()) sp.set("include", includeText.trim());
    if (excludeText.trim()) sp.set("exclude", excludeText.trim());

    sp.set("includeMode", includeMode);

    return sp.toString();
  }, [dq, uf, codigoModalidadeContratacao, dataIni, dataFim, pageSize, includeText, excludeText, includeMode]);

  useEffect(() => {
    const url = `${window.location.pathname}?${queryString}`;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("popstate"));
  }, [queryString]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={grid3}>
        <div style={field}>
          <label style={label}>Busca (PNCP)</label>
          <input
            placeholder="Ex: autoclave, bomba infusão, equipamento médico..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>UF</label>
          <input
            placeholder="Ex: MT"
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase())}
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>Modalidade (código)</label>
          <select value={codigoModalidadeContratacao} onChange={(e) => setCodigoModalidadeContratacao(e.target.value)} style={input}>
            {MODALIDADES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={grid3}>
        <div style={field}>
          <label style={label}>Data inicial</label>
          <input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} style={input} />
        </div>

        <div style={field}>
          <label style={label}>Data final</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={input} />
        </div>

        <div style={field}>
          <label style={label}>Tamanho da página</label>
          <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} style={input}>
            <option value="10">10 por página</option>
            <option value="20">20 por página</option>
            <option value="50">50 por página</option>
          </select>
        </div>
      </div>

      <div style={grid3}>
        <div style={field}>
          <label style={label}>Incluir (palavras-chave)</label>
          <input
            placeholder="Ex: médico, hospitalar, autoclave"
            value={includeText}
            onChange={(e) => setIncludeText(e.target.value)}
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>Modo do Incluir</label>
          <select value={includeMode} onChange={(e) => setIncludeMode(e.target.value as any)} style={input}>
            <option value="any">QUALQUER (OR) — recomendado</option>
            <option value="all">TODOS (AND) — mais restrito</option>
          </select>
        </div>

        <div style={field}>
          <label style={label}>Excluir</label>
          <input
            placeholder="Ex: obra, pavimentação, drenagem, asfalto"
            value={excludeText}
            onChange={(e) => setExcludeText(e.target.value)}
            style={input}
          />
        </div>
      </div>

      <div style={hint}>
        Se “Incluir” estiver muito restrito, use <b>QUALQUER (OR)</b>. Assim aparece tudo que contém pelo menos 1 termo.
      </div>
    </section>
  );
}

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: 12,
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

const hint: React.CSSProperties = { fontSize: 12, color: "#A1A1AA" };
