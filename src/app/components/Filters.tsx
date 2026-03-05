"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

type IncludeMode = "any" | "all";

export default function Filters() {
  const router = useRouter();
  const sp = useSearchParams();
  const qsKey = sp.toString();

  // ✅ inicializa estado a partir da URL (fonte de verdade)
  const [q, setQ] = useState(sp.get("q") || "");
  const [uf, setUf] = useState(sp.get("uf") || "");
  const [codigoModalidadeContratacao, setCodigoModalidadeContratacao] = useState(
    sp.get("codigoModalidadeContratacao") || "8"
  );

  // Publicação
  const [dataIni, setDataIni] = useState(sp.get("dataIni") || "");
  const [dataFim, setDataFim] = useState(sp.get("dataFim") || "");

  // ✅ Encerramento
  const [encIni, setEncIni] = useState(sp.get("encIni") || "");
  const [encFim, setEncFim] = useState(sp.get("encFim") || "");

  const [pageSize, setPageSize] = useState(sp.get("pageSize") || "50");

  const [includeText, setIncludeText] = useState(sp.get("include") || "");
  const [excludeText, setExcludeText] = useState(sp.get("exclude") || "");
  const [includeMode, setIncludeMode] = useState<IncludeMode>(
    (sp.get("includeMode") as IncludeMode) || "any"
  );

  // ✅ debounces (reduz pancada no backend)
  const dq = useDebounced(q, 400);
  const dInclude = useDebounced(includeText, 250);
  const dExclude = useDebounced(excludeText, 250);

  // ✅ se URL mudar por navegação/refresh, reidrata campos (governança)
  useEffect(() => {
    setQ(sp.get("q") || "");
    setUf(sp.get("uf") || "");
    setCodigoModalidadeContratacao(sp.get("codigoModalidadeContratacao") || "8");

    setDataIni(sp.get("dataIni") || "");
    setDataFim(sp.get("dataFim") || "");

    setEncIni(sp.get("encIni") || "");
    setEncFim(sp.get("encFim") || "");

    setPageSize(sp.get("pageSize") || "50");

    setIncludeText(sp.get("include") || "");
    setExcludeText(sp.get("exclude") || "");
    setIncludeMode(((sp.get("includeMode") || "any") as IncludeMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qsKey]);

  const queryString = useMemo(() => {
    const next = new URLSearchParams();

    if (dq) next.set("q", dq);
    if (uf) next.set("uf", uf);

    next.set("codigoModalidadeContratacao", codigoModalidadeContratacao);

    if (dataIni) next.set("dataIni", dataIni);
    if (dataFim) next.set("dataFim", dataFim);

    // ✅ Encerramento
    if (encIni) next.set("encIni", encIni);
    if (encFim) next.set("encFim", encFim);

    const ps = Math.max(10, Math.min(50, Number(pageSize || 50)));
    next.set("pageSize", String(ps));
    next.set("page", "1");

    if (dInclude.trim()) next.set("include", dInclude.trim());
    if (dExclude.trim()) next.set("exclude", dExclude.trim());

    next.set("includeMode", includeMode);

    return next.toString();
  }, [
    dq,
    uf,
    codigoModalidadeContratacao,
    dataIni,
    dataFim,
    encIni,
    encFim,
    pageSize,
    dInclude,
    dExclude,
    includeMode,
  ]);

  // ✅ Router-native: atualiza URL sem gambiarra de popstate
  useEffect(() => {
    router.replace(`?${queryString}`, { scroll: false });
  }, [queryString, router]);

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
            maxLength={2}
          />
        </div>

        <div style={field}>
          <label style={label}>Modalidade (código)</label>
          <select
            value={codigoModalidadeContratacao}
            onChange={(e) => setCodigoModalidadeContratacao(e.target.value)}
            style={input}
          >
            {MODALIDADES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Publicação */}
      <div style={grid3}>
        <div style={field}>
          <label style={label}>Publicado (início)</label>
          <input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} style={input} />
        </div>

        <div style={field}>
          <label style={label}>Publicado (fim)</label>
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

      {/* ✅ Encerramento */}
      <div style={grid3}>
        <div style={field}>
          <label style={label}>Encerramento (início)</label>
          <input type="date" value={encIni} onChange={(e) => setEncIni(e.target.value)} style={input} />
        </div>

        <div style={field}>
          <label style={label}>Encerramento (fim)</label>
          <input type="date" value={encFim} onChange={(e) => setEncFim(e.target.value)} style={input} />
        </div>

        <div style={field}>
          <label style={label}> </label>
          <div style={{ ...hint, marginTop: 2 }}>
            Dica: use Encerramento para focar em “oportunidades quentes”.
          </div>
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
          <select value={includeMode} onChange={(e) => setIncludeMode(e.target.value as IncludeMode)} style={input}>
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
        Se “Incluir” estiver muito restrito, use <b style={{ color: "#EDEDED" }}>QUALQUER (OR)</b>. Assim aparece tudo
        que contém pelo menos 1 termo.
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