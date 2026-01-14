import { NextResponse } from "next/server";

/**
 * Endpoint correto do PNCP (o mesmo que você validou no navegador)
 * https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
 */
const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

function toYYYYMMDD(iso: string) {
  // "2025-01-01" -> "20250101"
  return iso.replaceAll("-", "");
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const termo = (searchParams.get("termo") ?? "").trim();
    const dataInicialISO = searchParams.get("dataInicial") ?? "";
    const dataFinalISO = searchParams.get("dataFinal") ?? "";

    // PNCP exige modalidade nesse endpoint
    const codigoModalidadeContratacao = (searchParams.get("codigoModalidadeContratacao") ?? "8").trim();

    const pagina = String(clampInt(searchParams.get("pagina"), 1, 1, 99999));

    // ⚠️ publicacao costuma aceitar até 50 (você já pegou erro com 200)
    const tamanhoPagina = String(clampInt(searchParams.get("tamanhoPagina"), 20, 1, 50));

    const uf = (searchParams.get("uf") ?? "").trim().toUpperCase();

    if (!termo || !dataInicialISO || !dataFinalISO) {
      return NextResponse.json(
        { ok: false, error: "Parâmetros obrigatórios: termo, dataInicial, dataFinal" },
        { status: 400 }
      );
    }

    const qs = new URLSearchParams();
    qs.set("palavraChave", termo); // ✅ filtra no PNCP (bem melhor que filtrar JSON inteiro depois)
    qs.set("dataInicial", toYYYYMMDD(dataInicialISO)); // ✅ yyyyMMdd
    qs.set("dataFinal", toYYYYMMDD(dataFinalISO));     // ✅ yyyyMMdd
    qs.set("codigoModalidadeContratacao", codigoModalidadeContratacao);
    qs.set("pagina", pagina);
    qs.set("tamanhoPagina", tamanhoPagina);

    if (uf) qs.set("uf", uf);

    const url = `${PNCP_BASE}?${qs.toString()}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      // devolve erro de forma legível
      return NextResponse.json(
        { ok: false, error: `PNCP ${res.status}: ${text.slice(0, 300)}` },
        { status: 500 }
      );
    }

    // tenta parsear JSON
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: `PNCP retornou algo que não é JSON: ${text.slice(0, 200)}` },
        { status: 500 }
      );
    }

    // Mapeia resultados
    const data = Array.isArray(json?.data) ? json.data : [];

    const itens = data.map((item: any) => ({
      orgao: item?.orgaoEntidade?.razaoSocial ?? "--",
      objeto: item?.objetoCompra ?? "--",
      dataPublicacao: item?.dataPublicacaoPncp ?? item?.dataPublicacao ?? null,

      // ⚠️ depende do que o PNCP devolver. Se não vier documentos aqui, vai ser vazio.
      documentos: Array.isArray(item?.documentos)
        ? item.documentos.map((doc: any) => ({
            nome: doc?.titulo ?? doc?.nome ?? doc?.descricao ?? "Documento",
            tipo: doc?.tipoDocumento ?? doc?.tipo ?? "",
            url: doc?.url ?? doc?.link ?? "",
          }))
        : [],
    }));

    return NextResponse.json({
      ok: true,
      request: {
        termo,
        dataInicial: toYYYYMMDD(dataInicialISO),
        dataFinal: toYYYYMMDD(dataFinalISO),
        codigoModalidadeContratacao,
        pagina: Number(pagina),
        tamanhoPagina: Number(tamanhoPagina),
        uf: uf || null,
      },
      totalRecebido: data.length,
      itens,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Erro inesperado" },
      { status: 500 }
    );
  }
}
