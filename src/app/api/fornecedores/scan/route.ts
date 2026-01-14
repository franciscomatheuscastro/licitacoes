import { NextResponse } from "next/server";

type PncpContrato = {
  objetoContrato?: string;
  dataPublicacaoPncp?: string;
  valorGlobal?: number;
  valorInicial?: number;
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string };

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

function safeInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(req: Request) {
  try {
    const baseUrl = process.env.PNCP_BASE_URL_FORN; // https://pncp.gov.br/api/consulta
    if (!baseUrl) throw new Error("PNCP_BASE_URL_FORN não definido (.env.local)");

    const { searchParams } = new URL(req.url);

    // termo
    const termoRaw = (searchParams.get("termo") ?? "").trim();
    if (!termoRaw) return NextResponse.json({ ok: true, items: [], scannedContracts: 0, totalPaginas: 0 });

    const termoN = norm(termoRaw);

    // janela (YYYYMMDD) -> obrigatória no modo scan
    const dataInicial = (searchParams.get("dataInicial") ?? "").trim(); // YYYYMMDD
    const dataFinal = (searchParams.get("dataFinal") ?? "").trim();     // YYYYMMDD
    if (!dataInicial || !dataFinal) throw new Error("dataInicial/dataFinal são obrigatórios (YYYYMMDD)");

    // paginação
    const pagina = safeInt(searchParams.get("pagina"), 1, 1, 9999);
    const tamanhoPagina = safeInt(searchParams.get("tamanhoPagina"), 200, 10, 500); // máximo 500

    // filtro UF (opcional) do órgão comprador
    const ufOrg = (searchParams.get("ufOrg") ?? "").trim().toUpperCase(); // ex: MT

    const url = new URL(`${baseUrl}/v1/contratos`);
    url.searchParams.set("dataInicial", dataInicial);
    url.searchParams.set("dataFinal", dataFinal);
    url.searchParams.set("pagina", String(pagina));
    url.searchParams.set("tamanhoPagina", String(tamanhoPagina));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`PNCP erro ${res.status}: ${text.slice(0, 260)}`);

    const json = JSON.parse(text) as PncpPage<PncpContrato>;
    const contratos = Array.isArray(json.data) ? json.data : [];

    // agrega por fornecedor somente com os matches desta página
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

    for (const c of contratos) {
      const uf = (c.unidadeOrgao?.ufSigla ?? "").toUpperCase();
      if (ufOrg && ufOrg !== uf) continue;

      const objeto = c.objetoContrato ?? "";
      if (!objeto) continue;

      if (!norm(objeto).includes(termoN)) continue;

      const ni = (c.niFornecedor ?? "").trim();
      const nome = (c.nomeRazaoSocialFornecedor ?? "").trim();
      if (!ni || !nome) continue;

      const key = `${ni}__${nome}`;
      const valor = Number(c.valorGlobal ?? c.valorInicial ?? 0) || 0;
      const pub = c.dataPublicacaoPncp ?? undefined;

      if (!agg.has(key)) {
        agg.set(key, { ni, nome, ocorrencias: 0, valorTotal: 0, ufs: new Set<string>(), ultimaPublicacao: pub, exemplos: [] });
      }

      const a = agg.get(key)!;
      a.ocorrencias += 1;
      a.valorTotal += valor;
      if (uf) a.ufs.add(uf);

      if (pub && (!a.ultimaPublicacao || pub > a.ultimaPublicacao)) a.ultimaPublicacao = pub;
      if (a.exemplos.length < 3) a.exemplos.push(objeto.slice(0, 140));
    }

    const items = Array.from(agg.values()).map((a) => ({
      ni: a.ni,
      nome: a.nome,
      ocorrencias: a.ocorrencias,
      valorTotal: Math.round(a.valorTotal * 100) / 100,
      ufs: Array.from(a.ufs).sort(),
      ultimaPublicacao: a.ultimaPublicacao,
      exemplos: a.exemplos,
    }));

    return NextResponse.json({
      ok: true,
      totalPaginas: json.totalPaginas ?? 0,
      scannedContracts: contratos.length,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
