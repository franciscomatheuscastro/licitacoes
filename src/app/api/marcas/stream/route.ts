import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PncpPage = {
  data?: any[];
  totalPaginas?: number;
};

function safeInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function norm(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pncpDate(d: string) {
  // PNCP exige yyyyMMdd
  const v = (d || "").trim().replaceAll("-", ""); // 2025-10-01 -> 20251001
  return v;
}

function isHttpUrl(x: unknown): x is string {
  return typeof x === "string" && /^https?:\/\/\S+/i.test(x);
}

function collectUrlsDeep(obj: any, out: string[] = [], seen = new Set<any>()) {
  if (!obj || seen.has(obj)) return out;

  if (typeof obj === "string") {
    if (isHttpUrl(obj)) out.push(obj);
    return out;
  }

  if (typeof obj !== "object") return out;
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (const it of obj) collectUrlsDeep(it, out, seen);
    return out;
  }

  for (const k of Object.keys(obj)) {
    collectUrlsDeep(obj[k], out, seen);
  }
  return out;
}

function pickProcessUrl(item: any) {
  const urls = collectUrlsDeep(item);

  // prioridade: Portal de Compras Públicas
  const pcp = urls.find((u) => {
    try {
      return new URL(u).hostname.includes("portaldecompraspublicas.com.br");
    } catch {
      return false;
    }
  });
  if (pcp) return pcp;

  // depois: compras.gov.br / serpro
  const comprasGov = urls.find((u) => {
    try {
      const h = new URL(u).hostname;
      return h.includes("compras.gov.br") || h.includes("serpro.gov.br");
    } catch {
      return false;
    }
  });
  if (comprasGov) return comprasGov;

  // fallback: primeira URL
  return urls[0] ?? "";
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const termoRaw = (searchParams.get("termo") ?? "").trim();

  const dataInicialRaw = (searchParams.get("dataInicial") ?? "").trim(); // yyyy-mm-dd
  const dataFinalRaw = (searchParams.get("dataFinal") ?? "").trim(); // yyyy-mm-dd

  const uf = (searchParams.get("uf") ?? "").trim().toUpperCase();
  const codigoModalidadeContratacao = (searchParams.get("codigoModalidadeContratacao") ?? "").trim();
  const onlyPortalCompras = (searchParams.get("onlyPortalCompras") ?? "0") === "1";

  const maxPages = safeInt(searchParams.get("maxPages"), 30, 1, 200);
  const tamanhoPagina = safeInt(searchParams.get("tamanhoPagina"), 50, 1, 50);
  const target = safeInt(searchParams.get("target"), 30, 1, 500);

  if (!termoRaw || termoRaw.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Informe termo com pelo menos 3 caracteres." },
      { status: 400 }
    );
  }
  if (!dataInicialRaw || !dataFinalRaw) {
    return NextResponse.json(
      { ok: false, error: "Informe dataInicial e dataFinal (yyyy-mm-dd)." },
      { status: 400 }
    );
  }

  const dataInicial = pncpDate(dataInicialRaw);
  const dataFinal = pncpDate(dataFinalRaw);

  if (!/^\d{8}$/.test(dataInicial) || !/^\d{8}$/.test(dataFinal)) {
    return NextResponse.json(
      { ok: false, error: "Datas inválidas. Use yyyy-mm-dd (ex: 2025-10-01)." },
      { status: 400 }
    );
  }

  // ✅ endpoint correto
  const PNCP_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

  const termoN = norm(termoRaw);
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let scannedPages = 0;
      let scannedItems = 0;
      let found = 0;
      let closed = false;

      function send(obj: any) {
        if (closed) return;
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      }

      function close() {
        if (closed) return;
        closed = true;
        controller.close();
      }

      try {
        for (let page = 1; page <= maxPages; page++) {
          const qs = new URLSearchParams();
          qs.set("dataInicial", dataInicial);
          qs.set("dataFinal", dataFinal);
          qs.set("pagina", String(page));
          qs.set("tamanhoPagina", String(tamanhoPagina));

          if (codigoModalidadeContratacao) qs.set("codigoModalidadeContratacao", codigoModalidadeContratacao);
          if (uf) qs.set("uf", uf);

          const url = `${PNCP_URL}?${qs.toString()}`;

          const res = await fetch(url, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });

          const text = await res.text().catch(() => "");
          if (!res.ok) {
            // PNCP às vezes retorna erro em JSON
            const maybe = tryParseJson(text);
            const msg =
              (maybe && (maybe.message || maybe.mensagem)) ||
              text.slice(0, 240) ||
              "Erro ao consultar PNCP";

            send({ type: "error", message: `PNCP erro ${res.status}: ${msg}` });
            break;
          }

          const json = (tryParseJson(text) as PncpPage) || {};
          const arr = Array.isArray(json?.data) ? json.data : [];

          scannedPages++;
          scannedItems += arr.length;

          send({ type: "progress", page, scannedPages, scannedItems, found });

          for (const item of arr) {
            const blob = norm(JSON.stringify(item));
            if (!blob.includes(termoN)) continue;

            const processoUrl = pickProcessUrl(item);
            if (!processoUrl) continue;

            if (onlyPortalCompras) {
              const h = hostOf(processoUrl);
              if (!h.includes("portaldecompraspublicas.com.br")) continue;
            }

            const orgao =
              item?.orgaoEntidade?.razaoSocial ||
              item?.orgaoEntidade?.nome ||
              item?.orgao?.nome ||
              "Órgão não informado";

            const objeto =
              item?.objetoCompra ||
              item?.objeto ||
              item?.descricao ||
              "Objeto não informado";

            const dataPub =
              item?.dataPublicacao ||
              item?.dataPublicacaoPncp ||
              item?.data ||
              null;

            const fonte = hostOf(processoUrl);

            found++;
            send({
              type: "item",
              item: {
                orgao,
                objeto,
                dataPublicacao: dataPub,
                processoUrl,
                fonte,
              },
            });

            if (found >= target) {
              send({ type: "done", scannedPages, scannedItems, found });
              close();
              return;
            }
          }

          if (arr.length === 0) break;
        }

        send({ type: "done", scannedPages, scannedItems, found });
        close();
      } catch (e: any) {
        send({ type: "error", message: e?.message ?? "Erro inesperado" });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
