import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ComexRow = Record<string, any>;

function safeInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeMonth(v: string | null, def: string) {
  const s = String(v ?? def).padStart(2, "0");
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > 12) return def;
  return String(n).padStart(2, "0");
}

// monta o JSON "filter" no padrão do /general?filter=...
function buildFilter(params: {
  yearStart: number;
  yearEnd: number;
  monthStart: string; // "01"
  monthEnd: string; // "12"
  ncm: string; // "90189099"
  details: Array<"uf" | "pais">;
}) {
  const detailDatabase = params.details.map((d) => {
    if (d === "uf") return { id: "noUf", text: "" };
    return { id: "noPaispt", text: "" };
  });

  return {
    yearStart: String(params.yearStart),
    yearEnd: String(params.yearEnd),

    // 1 export / 2 import
    typeForm: 2,

    // 1 valores / 2 detalhamento
    typeOrder: 1,

    // filtro por NCM (lista)
    filterList: [{ id: "noNcmpt" }],
    filterArray: [{ item: [params.ncm], idInput: "noNcmpt" }],

    detailDatabase,

    monthDetail: false,
    metricFOB: true,
    metricKG: true,
    metricStatistic: false,

    monthStart: params.monthStart,
    monthEnd: params.monthEnd,

    formQueue: "general",
    langDefault: "pt",
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "radar-licitacoes/1.0 (Next.js)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function callComexStat(filterObj: any) {
  // domínio oficial da API (docs)
  const bases = [
    "https://api-comexstat.mdic.gov.br",
    // fallback (caso exista no ambiente do usuário)
    "https://api.comexstat.mdic.gov.br",
  ];

  const filter = encodeURIComponent(JSON.stringify(filterObj));
  const path = `/general?filter=${filter}`;

  let lastErr: string | null = null;

  for (const base of bases) {
    const url = `${base}${path}`;

    // retry simples (3 tentativas)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetchWithTimeout(url, 20000);

        const text = await res.text().catch(() => "");
        if (!res.ok) {
          throw new Error(`ComexStat erro ${res.status}: ${text.slice(0, 240)}`);
        }

        // algumas respostas vêm compactadas; text ok
        const json = JSON.parse(text);
        return json;
      } catch (e: any) {
        lastErr = e?.message ?? String(e);

        // abort/timeout → tenta de novo com backoff
        if (attempt < 3) {
          await sleep(400 * attempt);
          continue;
        }
      }
    }
  }

  throw new Error(lastErr ?? "Falha ao consultar ComexStat");
}

async function getYearsRange() {
  // usa endpoint oficial para saber max/min
  const urls = [
    "https://api-comexstat.mdic.gov.br/general/dates/years",
    "https://api.comexstat.mdic.gov.br/general/dates/years",
  ];

  let lastErr: string | null = null;

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 12000);
      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(`years erro ${res.status}: ${text.slice(0, 240)}`);
      const j = JSON.parse(text);

      // formatos possíveis
      const data = j?.data ?? j;
      const min = Number(data?.min);
      const max = Number(data?.max);
      if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
    }
  }

  // fallback conservador se falhar (não quebra a API)
  return { min: 1997, max: new Date().getFullYear() - 1 };
}

function pickRows(resp: any): ComexRow[] {
  // A API pode responder com { data: [...] , success: true ... }
  if (resp && typeof resp === "object") {
    if (Array.isArray(resp.data)) return resp.data as ComexRow[];
    if (Array.isArray(resp.result)) return resp.result as ComexRow[];
  }

  // Alguns wrappers retornam array
  if (Array.isArray(resp)) {
    if (Array.isArray(resp[0])) return resp[0] as ComexRow[];
  }

  return [];
}

function groupAndTop(rows: ComexRow[], key: string, top: number) {
  const map = new Map<string, { key: string; fob: number; kg: number; n: number }>();

  for (const r of rows) {
    const k = String(r[key] ?? "—");

    // chaves comuns
    const fob = Number(r.vlFob ?? r.vlfob ?? r.valorFOB ?? r.fob ?? 0) || 0;
    const kg = Number(r.kgLiquido ?? r.kgLiq ?? r.kg ?? r.peso ?? 0) || 0;

    if (!map.has(k)) map.set(k, { key: k, fob: 0, kg: 0, n: 0 });
    const a = map.get(k)!;
    a.fob += fob;
    a.kg += kg;
    a.n += 1;
  }

  return Array.from(map.values())
    .sort((a, b) => b.fob - a.fob)
    .slice(0, top);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const ncm = (searchParams.get("ncm") ?? "").replace(/\D/g, "");
    if (ncm.length !== 8) {
      return NextResponse.json(
        { ok: false, error: "Informe um NCM com 8 dígitos (ex: 90189099)." },
        { status: 400 }
      );
    }

    const years = await getYearsRange();

    // clamp de anos para evitar 2026/futuro
    const yearStartRaw = safeInt(searchParams.get("yearStart"), years.max, years.min, years.max);
    const yearEndRaw = safeInt(searchParams.get("yearEnd"), years.max, years.min, years.max);

    const yearStart = Math.min(yearStartRaw, yearEndRaw);
    const yearEnd = Math.max(yearStartRaw, yearEndRaw);

    const monthStart = safeMonth(searchParams.get("monthStart"), "01");
    const monthEnd = safeMonth(searchParams.get("monthEnd"), "12");

    const top = safeInt(searchParams.get("top"), 10, 5, 50);

    // 1) UF
    const filterUF = buildFilter({ yearStart, yearEnd, monthStart, monthEnd, ncm, details: ["uf"] });
    const respUF = await callComexStat(filterUF);
    const rowsUF = pickRows(respUF);

    // 2) País
    const filterPais = buildFilter({ yearStart, yearEnd, monthStart, monthEnd, ncm, details: ["pais"] });
    const respPais = await callComexStat(filterPais);
    const rowsPais = pickRows(respPais);

    const topUF = groupAndTop(rowsUF, "noUf", top);
    const topPais = groupAndTop(rowsPais, "noPaispt", top);

    // total geral (aprox) — soma topPais (não é o total real absoluto)
    const totalFOB = topPais.reduce((s, x) => s + x.fob, 0);
    const totalKG = topPais.reduce((s, x) => s + x.kg, 0);

    return NextResponse.json({
      ok: true,
      ncm,
      periodo: { yearStart, yearEnd, monthStart, monthEnd },
      yearsAvailable: years,
      total: { fob: totalFOB, kg: totalKG },
      topUF,
      topPais,
      notes: [
        "Comex Stat é agregado: não lista empresas importadoras (nome/CNPJ).",
        "Use Top UF + Top País como 'hotspots' para prospecção fora do Comex.",
      ],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Erro inesperado" },
      { status: 500 }
    );
  }
}
