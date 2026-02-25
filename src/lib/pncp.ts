import type { Licitacao, SearchParams } from "./types";

const baseUrl = process.env.PNCP_BASE_URL;

// ===== Utils datas =====
function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}
function diasAtrasISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function toYYYYMMDD(input: string) {
  return input.replaceAll("-", "");
}
function safePageSize(pageSize?: string) {
  const n = Number(pageSize ?? 20);
  const safe = Number.isFinite(n) ? n : 20;
  return Math.max(10, Math.min(50, safe)); // PNCP: >=10; usamos 50 máx
}
function safePage(page?: string) {
  const n = Number(page ?? 1);
  const safe = Number.isFinite(n) ? n : 1;
  return Math.max(1, safe);
}

// ===== Split em janelas (PNCP: período máx 365 dias) =====
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
function splitIntoWindows(start: string, end: string) {
  const windows: { ini: string; fim: string }[] = [];
  let cur = parseYYYYMMDD(start);
  const endDt = parseYYYYMMDD(end);

  while (cur <= endDt) {
    const winEnd = addDays(cur, 364);
    const fim = winEnd <= endDt ? winEnd : endDt;
    windows.push({ ini: fmtYYYYMMDD(cur), fim: fmtYYYYMMDD(fim) });
    cur = addDays(fim, 1);
  }
  return windows;
}

// ===== Mapping =====
function mapPncpToLicitacao(it: any): Licitacao {
  const id =
    String(it?.numeroControlePNCP ?? "") ||
    `${it?.orgaoEntidade?.cnpj ?? "semcnpj"}_${it?.anoCompra ?? "0"}_${it?.sequencialCompra ?? "0"}`;

  const valor = Number(it?.valorTotalEstimado ?? 0);
  return {
    id,
    titulo: String(it?.objetoCompra ?? it?.objeto ?? it?.titulo ?? "Sem título"),
    orgao: it?.orgaoEntidade?.razaoSocial ?? undefined,
    uf: it?.unidadeOrgao?.ufSigla ?? it?.orgaoEntidade?.uf ?? undefined,
    municipio: it?.unidadeOrgao?.municipioNome ?? it?.orgaoEntidade?.municipio ?? undefined,
    modalidade: it?.modalidadeNome ?? undefined,
    valorEstimado: Number.isFinite(valor) && valor > 0 ? valor : undefined,
    dataPublicacao: it?.dataPublicacaoPncp ?? it?.dataInclusao ?? undefined,
    prazoEncerramento: it?.dataEncerramentoProposta ?? undefined,
    url: it?.linkSistemaOrigem ?? it?.linkProcessoEletronico ?? undefined,
    fonte: "PNCP",
  };
}

// ===== Robust fetch (timeout + retry) =====
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(headers: Headers) {
  const ra = headers.get("Retry-After");
  if (!ra) return 0;
  const sec = Number(ra);
  if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  return 0;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store", // ✅ evita cache do Next atrapalhar
      signal: ctrl.signal,
    });

    const text = await res.text().catch(() => "");
    return { res, text };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Timeout PNCP após ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function fetchPncpJson(url: string, opts?: { timeoutMs?: number; maxAttempts?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 25_000;
  const maxAttempts = opts?.maxAttempts ?? 6;

  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { res, text } = await fetchTextWithTimeout(url, timeoutMs);

      if (!res.ok) {
        const msg = text.slice(0, 300) || res.statusText || "Erro PNCP";

        // retry só se status é típico de instabilidade
        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          const ra = parseRetryAfterMs(res.headers);
          const backoff = Math.min(20_000, 500 * Math.pow(2, attempt - 1));
          const jitter = Math.floor(Math.random() * 250);
          await sleep(Math.max(ra, backoff) + jitter);
          continue;
        }

        throw new Error(`PNCP erro ${res.status}: ${msg}`);
      }

      // parse JSON seguro
      try {
        return JSON.parse(text);
      } catch {
        // se não for JSON, pode ser erro intermitente da infra
        if (attempt < maxAttempts) {
          const backoff = Math.min(20_000, 500 * Math.pow(2, attempt - 1));
          const jitter = Math.floor(Math.random() * 250);
          await sleep(backoff + jitter);
          continue;
        }
        throw new Error(`PNCP resposta não-JSON: ${text.slice(0, 200)}`);
      }
    } catch (e: any) {
      lastErr = e;

      const msg = String(e?.message ?? e);

      const retryable =
        msg.toLowerCase().includes("timeout pncp") ||
        msg.toLowerCase().includes("fetch failed") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("jdbc") ||
        msg.toLowerCase().includes("internal server error");

      if (!retryable || attempt === maxAttempts) throw e;

      const backoff = Math.min(20_000, 600 * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }
  }

  throw lastErr;
}

// ===== Public API =====
export async function searchPncp(params: SearchParams): Promise<Licitacao[]> {
  if (!baseUrl) throw new Error("PNCP_BASE_URL não definido (.env.local)");

  const dataIniISO = params.dataIni ?? diasAtrasISO(90);
  const dataFimISO = params.dataFim ?? hojeISO();

  const dataInicial = toYYYYMMDD(dataIniISO);
  const dataFinal = toYYYYMMDD(dataFimISO);

  const codigoModalidadeContratacao = params.codigoModalidadeContratacao?.trim() || "8";
  const page = safePage(params.page);
  const tamanhoPagina = safePageSize(params.pageSize);

  const windows = splitIntoWindows(dataInicial, dataFinal);

  const all: Licitacao[] = [];
  const seen = new Set<string>();

  // ✅ Nota: você está pedindo UMA página por chamada.
  // O loop abaixo só repete pelas janelas de data (quando o período > 365 dias).
  for (const w of windows) {
    const url = new URL(`${baseUrl}/contratacoes/publicacao`);

    if (params.q?.trim()) url.searchParams.set("palavraChave", params.q.trim());
    if (params.uf?.trim()) url.searchParams.set("uf", params.uf.trim());

    url.searchParams.set("dataInicial", w.ini);
    url.searchParams.set("dataFinal", w.fim);
    url.searchParams.set("codigoModalidadeContratacao", codigoModalidadeContratacao);
    url.searchParams.set("pagina", String(page));
    url.searchParams.set("tamanhoPagina", String(tamanhoPagina));

    const json = await fetchPncpJson(url.toString(), {
      timeoutMs: 25_000,     // ✅ ajustável
      maxAttempts: 6,        // ✅ retry interno no PNCP
    });

    const items = Array.isArray(json?.data) ? json.data : [];

    for (const raw of items) {
      const lic = mapPncpToLicitacao(raw);
      if (!seen.has(lic.id)) {
        seen.add(lic.id);
        all.push(lic);
      }
    }
  }

  return all;
}