import { NextResponse } from "next/server";

type PncpContrato = {
  numeroControlePNCP?: string;
  objetoContrato?: string;
  dataPublicacaoPncp?: string;
  valorGlobal?: number;
  valorInicial?: number;

  unidadeOrgao?: { ufSigla?: string; municipioNome?: string };

  // ✅ nomes corretos que o PNCP retorna
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
};

type PncpPage<T> = {
  data: T[];
  totalPaginas?: number;
};

function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function toYYYYMMDD(iso: string) {
  return iso.replaceAll("-", "");
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasAtrasISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function safeInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** ===== janelas de 365 dias ===== */
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

export async function GET(req: Request) {
  try {
    const baseUrl = process.env.PNCP_BASE_URL_FORN; // https://pncp.gov.br/api/consulta
    if (!baseUrl) throw new Error("PNCP_BASE_URL_FORN não definido (.env.local)");

    const { searchParams } = new URL(req.url);

    const termoRaw = (searchParams.get("termo") ?? "").trim();
    if (!termoRaw) {
      return NextResponse.json({ ok: true, termo: "", fornecedores: [], scannedPages: 0, scannedContracts: 0 });
    }

    const dataIniISO = searchParams.get("dataIni") ?? diasAtrasISO(365);
    const dataFimISO = searchParams.get("dataFim") ?? hojeISO();

    const tamanhoPagina = safeInt(searchParams.get("pageSize"), 200, 10, 500);
    const maxPages = safeInt(searchParams.get("maxPages"), 8, 1, 200);
    const top = safeInt(searchParams.get("top"), 30, 5, 200);

    const termoN = norm(termoRaw);

    type Agg = {
      ni: string;
      nome: string;
      ocorrencias: number;
      valorTotal: number;
      ufs: Set<string>;
      ultimaPublicacao?: string;
      exemplos: string[];
    };

    const agg = new Map<string, Agg>();

    let scannedPages = 0;
    let scannedContracts = 0;

    const start = toYYYYMMDD(dataIniISO);
    const end = toYYYYMMDD(dataFimISO);
    const windows = splitIntoWindows(start, end);

    for (const w of windows) {
      let totalPaginasWindow: number | undefined;

      for (let page = 1; page <= maxPages; page++) {
        const url = new URL(`${baseUrl}/v1/contratos`);
        url.searchParams.set("dataInicial", w.ini);
        url.searchParams.set("dataFinal", w.fim);
        url.searchParams.set("pagina", String(page));
        url.searchParams.set("tamanhoPagina", String(tamanhoPagina));

        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          next: { revalidate: 60 },
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) throw new Error(`PNCP erro ${res.status}: ${text.slice(0, 260)}`);

        const json = JSON.parse(text) as PncpPage<PncpContrato>;
        totalPaginasWindow = typeof json.totalPaginas === "number" ? json.totalPaginas : totalPaginasWindow;

        const contratos = Array.isArray(json.data) ? json.data : [];
        scannedPages++;
        scannedContracts += contratos.length;

        for (const c of contratos) {
          const objeto = c.objetoContrato ?? "";
          if (!objeto) continue;

          if (!norm(objeto).includes(termoN)) continue;

          // ✅ agora pega os campos certos
          const ni = (c.niFornecedor ?? "").trim();
          const nome = (c.nomeRazaoSocialFornecedor ?? "").trim();
          if (!ni || !nome) continue;

          const key = `${ni}__${nome}`;
          const uf = c.unidadeOrgao?.ufSigla ?? "";

          const valor = Number(c.valorGlobal ?? c.valorInicial ?? 0) || 0;
          const pub = c.dataPublicacaoPncp ?? undefined;

          if (!agg.has(key)) {
            agg.set(key, {
              ni,
              nome,
              ocorrencias: 0,
              valorTotal: 0,
              ufs: new Set<string>(),
              ultimaPublicacao: pub,
              exemplos: [],
            });
          }

          const a = agg.get(key)!;
          a.ocorrencias += 1;
          a.valorTotal += valor;
          if (uf) a.ufs.add(uf);

          if (pub && (!a.ultimaPublicacao || pub > a.ultimaPublicacao)) a.ultimaPublicacao = pub;

          if (a.exemplos.length < 3) a.exemplos.push(objeto.slice(0, 140));
        }

        if (typeof totalPaginasWindow === "number" && page >= totalPaginasWindow) break;
        if (contratos.length === 0) break;
      }
    }

    const fornecedores = Array.from(agg.values())
      .map((a) => {
        const score = a.ocorrencias * 10 + Math.log10(1 + a.valorTotal) * 5 + a.ufs.size * 2;
        return {
          ni: a.ni,
          nome: a.nome,
          score: Math.round(score * 10) / 10,
          ocorrencias: a.ocorrencias,
          valorTotal: Math.round(a.valorTotal * 100) / 100,
          ufs: Array.from(a.ufs).sort(),
          ultimaPublicacao: a.ultimaPublicacao,
          exemplos: a.exemplos,
        };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, top);

    return NextResponse.json({
      ok: true,
      termo: termoRaw,
      dataIni: dataIniISO,
      dataFim: dataFimISO,
      windows: windows.length,
      scannedPages,
      scannedContracts,
      totalFornecedores: fornecedores.length,
      fornecedores,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
