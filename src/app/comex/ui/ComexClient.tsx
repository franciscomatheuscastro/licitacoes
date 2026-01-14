"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TopItem = { key: string; fob: number; kg: number; n: number };

function moneyUSD(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}

export default function ComexClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const nowYear = new Date().getFullYear();

  const [produto, setProduto] = useState(sp.get("produto") ?? "");
  const [ncm, setNcm] = useState(sp.get("ncm") ?? "");
  const [yearStart, setYearStart] = useState(sp.get("yearStart") ?? String(nowYear - 1));
  const [yearEnd, setYearEnd] = useState(sp.get("yearEnd") ?? String(nowYear - 1));
  const [monthStart, setMonthStart] = useState(sp.get("monthStart") ?? "01");
  const [monthEnd, setMonthEnd] = useState(sp.get("monthEnd") ?? "12");
  const [top, setTop] = useState(sp.get("top") ?? "10");

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const canSearch = useMemo(() => ncm.replace(/\D/g, "").length === 8, [ncm]);

  async function buscar() {
    try {
      setLoading(true);
      setError(null);

      const qs = new URLSearchParams();
      if (produto.trim()) qs.set("produto", produto.trim());
      qs.set("ncm", ncm.replace(/\D/g, ""));
      qs.set("yearStart", yearStart);
      qs.set("yearEnd", yearEnd);
      qs.set("monthStart", monthStart);
      qs.set("monthEnd", monthEnd);
      qs.set("top", top);

      router.replace(`/comex?${qs.toString()}`);

      const r = await fetch(`/api/comex?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();

      if (!j.ok) throw new Error(j.error || "Falha na consulta");
      setResp(j);
    } catch (e: any) {
      setError(e?.message ?? "Erro inesperado");
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  const topUF: TopItem[] = resp?.topUF ?? [];
  const topPais: TopItem[] = resp?.topPais ?? [];

  const clampNote =
    resp?.yearsAvailable?.max &&
    (Number(yearStart) > Number(resp.yearsAvailable.max) || Number(yearEnd) > Number(resp.yearsAvailable.max))
      ? `Obs: a API limitou o ano para ${resp.yearsAvailable.max} (último disponível).`
      : null;

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={header}>
        <div style={{ fontSize: 42, fontWeight: 900, color: "#EDEDED" }}>Radar Comex (Importação)</div>
        <div style={{ color: "#A1A1AA" }}>
          Use NCM para ver <b style={{ color: "#EDEDED" }}>Top UFs</b> e <b style={{ color: "#EDEDED" }}>Top países</b>. Depois, prospecte
          importadoras/distribuidores com base nesses sinais.
        </div>
      </div>

      <div style={panel}>
        <div style={grid}>
          <div style={field}>
            <label style={label}>Produto / categoria (apenas referência)</label>
            <input
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              placeholder="Ex: estetoscópio, autoclave, bomba de infusão..."
              style={input}
            />
          </div>

          <div style={field}>
            <label style={label}>NCM (8 dígitos)</label>
            <input value={ncm} onChange={(e) => setNcm(e.target.value)} placeholder="Ex: 90189099" style={input} />
          </div>
        </div>

        <div style={grid2}>
          <div style={field}>
            <label style={label}>Ano inicial</label>
            <input value={yearStart} onChange={(e) => setYearStart(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Ano final</label>
            <input value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} style={input} />
          </div>

          <div style={field}>
            <label style={label}>Mês inicial</label>
            <input value={monthStart} onChange={(e) => setMonthStart(e.target.value)} placeholder="01" style={input} />
          </div>

          <div style={field}>
            <label style={label}>Mês final</label>
            <input value={monthEnd} onChange={(e) => setMonthEnd(e.target.value)} placeholder="12" style={input} />
          </div>

          <div style={field}>
            <label style={label}>Top resultados</label>
            <input value={top} onChange={(e) => setTop(e.target.value)} style={input} />
          </div>

          <button onClick={buscar} disabled={!canSearch || loading} style={{ ...btn, opacity: !canSearch || loading ? 0.6 : 1 }}>
            {loading ? "Consultando..." : "Consultar Comex"}
          </button>
        </div>

        <div style={{ color: "#A1A1AA", fontSize: 12 }}>
          Obs: Comex Stat é agregado e não mostra empresas. Ele te dá os “hotspots” (UF/país) pra você prospectar importadoras por fora.
          {clampNote ? <div style={{ marginTop: 6, color: "#FDE68A" }}>{clampNote}</div> : null}
        </div>
      </div>

      {error && <div style={errorBox}>Erro: {error}</div>}

      {resp && (
        <>
          <div style={kpis}>
            <div style={kpiCard}>
              <div style={kpiLabel}>Total (aprox.)</div>
              <div style={kpiValue}>{moneyUSD(resp.total?.fob ?? 0)}</div>
              <div style={kpiSub}>Peso (kg): {(resp.total?.kg ?? 0).toLocaleString("pt-BR")}</div>
            </div>

            <div style={kpiCard}>
              <div style={kpiLabel}>NCM</div>
              <div style={kpiValue}>{resp.ncm}</div>
              <div style={kpiSub}>
                Período: {resp.periodo?.yearStart}–{resp.periodo?.yearEnd} • {resp.periodo?.monthStart}–{resp.periodo?.monthEnd}
              </div>
              <div style={kpiSub}>
                Anos disponíveis: {resp.yearsAvailable?.min}–{resp.yearsAvailable?.max}
              </div>
            </div>
          </div>

          <div style={cols}>
            <div style={box}>
              <div style={boxTitle}>Top UFs importadoras</div>
              <div style={{ display: "grid", gap: 10 }}>
                {topUF.map((x) => (
                  <div key={x.key} style={row}>
                    <div style={{ fontWeight: 900 }}>{x.key}</div>
                    <div style={{ color: "#A1A1AA" }}>{moneyUSD(x.fob)}</div>
                  </div>
                ))}
                {!topUF.length ? <div style={{ color: "#A1A1AA" }}>Sem dados para esse período/NCM.</div> : null}
              </div>
            </div>

            <div style={box}>
              <div style={boxTitle}>Top países de origem</div>
              <div style={{ display: "grid", gap: 10 }}>
                {topPais.map((x) => (
                  <div key={x.key} style={row}>
                    <div style={{ fontWeight: 900 }}>{x.key}</div>
                    <div style={{ color: "#A1A1AA" }}>{moneyUSD(x.fob)}</div>
                  </div>
                ))}
                {!topPais.length ? <div style={{ color: "#A1A1AA" }}>Sem dados para esse período/NCM.</div> : null}
              </div>
            </div>
          </div>

          <div style={box}>
            <div style={boxTitle}>Próximo passo (leads)</div>
            <div style={{ color: "#A1A1AA" }}>
              Use esses sinais para montar lista de importadoras/distribuidores:
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                <li>
                  Buscar: <b style={{ color: "#EDEDED" }}>“importadora {produto || "produto"} NCM {resp.ncm} {topUF[0]?.key || ""}”</b>
                </li>
                <li>
                  Buscar por UF: <b style={{ color: "#EDEDED" }}>“distribuidor hospitalar {topUF[0]?.key || ""}”</b>
                </li>
                <li>
                  Se Top País for China/Índia: considerar <b style={{ color: "#EDEDED" }}>importação direta</b> como plano B.
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const header: React.CSSProperties = { display: "grid", gap: 6 };

const panel: React.CSSProperties = {
  borderRadius: 18,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.50)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr",
  gap: 12,
  marginBottom: 12,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto",
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

const errorBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.20)",
  background: "rgba(248,113,113,0.08)",
  color: "#FECACA",
};

const kpis: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

const kpiCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

const kpiLabel: React.CSSProperties = { color: "#A1A1AA", fontSize: 12 };
const kpiValue: React.CSSProperties = { color: "#EDEDED", fontWeight: 900, fontSize: 22, marginTop: 6 };
const kpiSub: React.CSSProperties = { color: "#A1A1AA", fontSize: 12, marginTop: 6 };

const cols: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

const box: React.CSSProperties = {
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
};

const boxTitle: React.CSSProperties = { fontWeight: 900, color: "#EDEDED", marginBottom: 10 };

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.25)",
};
