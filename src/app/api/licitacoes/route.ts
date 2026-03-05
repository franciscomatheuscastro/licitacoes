import { NextResponse } from "next/server";
import { searchPncp } from "@/lib/pncp";
import type { SearchParams } from "@/lib/types";

type CacheEntry = { ts: number; data: any };
const g = globalThis as any;

g.__PNCP_CACHE__ ??= new Map<string, CacheEntry>();
g.__PNCP_INFLIGHT__ ??= new Map<string, Promise<any>>();
g.__PNCP_SEM__ ??= { cur: 0, max: 1 }; // ✅ concorrência baixa para não “estressar” o PNCP

const CACHE: Map<string, CacheEntry> = g.__PNCP_CACHE__;
const INFLIGHT: Map<string, Promise<any>> = g.__PNCP_INFLIGHT__;
const SEM: { cur: number; max: number } = g.__PNCP_SEM__;

// ✅ cache curto por página (ajuda muito em re-tentativas e re-render)
const CACHE_TTL_MS = 60_000;

// ✅ retry server-side (para erros típicos do PNCP)
const MAX_RETRIES = 5; // total até 6 tentativas
const BASE_BACKOFF_MS = 450;

// ✅ timeout por página (PNCP às vezes passa de 12s)
const PNCP_TIMEOUT_MS = 45_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function keyFromParams(p: SearchParams) {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.uf) sp.set("uf", p.uf);
  if (p.codigoModalidadeContratacao) sp.set("codigoModalidadeContratacao", p.codigoModalidadeContratacao);
  if (p.dataIni) sp.set("dataIni", p.dataIni);
  if (p.dataFim) sp.set("dataFim", p.dataFim);

  // ✅ Encerramento
  if (p.encIni) sp.set("encIni", p.encIni);
  if (p.encFim) sp.set("encFim", p.encFim);

  sp.set("page", String(p.page ?? "1"));
  sp.set("pageSize", String(p.pageSize ?? "50"));
  return sp.toString();
}

function looksLikePncpUnstable(msg: string) {
  const t = (msg || "").toLowerCase();
  return (
    t.includes("jdbc") ||
    t.includes("failed to obtain") ||
    t.includes("internal server error") ||
    t.includes("pncp erro 500") ||
    t.includes("erro na comunicação com o banco") ||
    t.includes("timeout") ||
    t.includes("network") ||
    t.includes("fetch failed")
  );
}

async function withConcurrency<T>(fn: () => Promise<T>) {
  while (SEM.cur >= SEM.max) await sleep(50);
  SEM.cur++;
  try {
    return await fn();
  } finally {
    SEM.cur--;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number) {
  let t: any;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout PNCP após ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function withRetry<T>(fn: () => Promise<T>) {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = e?.message ?? String(e);

      const retryable = looksLikePncpUnstable(msg);
      if (!retryable || attempt === MAX_RETRIES) throw e;

      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 180);
      await sleep(backoff + jitter);
    }
  }

  throw lastErr;
}

function dateOnlyMs(iso?: string) {
  if (!iso) return null;
  const d = iso.slice(0, 10); // aceita "YYYY-MM-DD" ou "YYYY-MM-DDTHH..."
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(d + "T00:00:00.000Z").getTime();
}

function inRange(dateIso: string | undefined, ini?: string, fim?: string) {
  const v = dateOnlyMs(dateIso);
  if (v == null) return false;

  const a = ini ? dateOnlyMs(ini) : null;
  const b = fim ? dateOnlyMs(fim) : null;

  if (a != null && v < a) return false;
  if (b != null && v > b) return false;
  return true;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const params: SearchParams = {
      q: searchParams.get("q") ?? undefined,
      uf: searchParams.get("uf") ?? undefined,
      codigoModalidadeContratacao: searchParams.get("codigoModalidadeContratacao") ?? undefined,
      dataIni: searchParams.get("dataIni") ?? undefined,
      dataFim: searchParams.get("dataFim") ?? undefined,

      // ✅ Encerramento
      encIni: searchParams.get("encIni") ?? undefined,
      encFim: searchParams.get("encFim") ?? undefined,

      page: searchParams.get("page") ?? "1",
      pageSize: searchParams.get("pageSize") ?? "50",
    };

    // sanitiza
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(10, Math.min(50, Number(params.pageSize || 50)));
    params.page = String(page);
    params.pageSize = String(pageSize);

    const cacheKey = keyFromParams(params);

    // ✅ cache
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, ...cached.data, cached: true });
    }

    // ✅ inflight dedupe
    if (INFLIGHT.has(cacheKey)) {
      const data = await INFLIGHT.get(cacheKey)!;
      return NextResponse.json({ ok: true, ...data, cached: true, inflight: true });
    }

    const prom = withConcurrency(async () => {
      return await withRetry(async () => {
        const itemsRaw = await withTimeout(searchPncp(params), PNCP_TIMEOUT_MS);

        // ✅ bruto do PNCP (antes do filtro)
        const rawCount = Array.isArray(itemsRaw) ? itemsRaw.length : 0;

        // ✅ “tem mais” deve ser calculado pelo bruto
        const morePossible = rawCount >= pageSize;

        // ✅ filtro de encerramento (server-side)
        let items = itemsRaw;
        if (params.encIni || params.encFim) {
          items = itemsRaw.filter((it: any) => inRange(it.prazoEncerramento, params.encIni, params.encFim));
        }

        const payload = {
          page,
          pageSize,

          // ✅ novos campos (pra governança do front)
          rawCount,
          morePossible,

          // total agora é do conjunto filtrado (faz sentido pro usuário)
          total: items.length,
          items,
        };

        CACHE.set(cacheKey, { ts: Date.now(), data: payload });
        return payload;
      });
    });

    INFLIGHT.set(cacheKey, prom);

    try {
      const payload = await prom;
      return NextResponse.json({ ok: true, ...payload });
    } finally {
      INFLIGHT.delete(cacheKey);
    }
  } catch (e: any) {
    const msg = e?.message ?? "Erro inesperado";
    const pncpUnstable = looksLikePncpUnstable(msg);

    const res = NextResponse.json(
      {
        ok: false,
        error: pncpUnstable
          ? `PNCP instável/lento no momento. O sistema vai tentar novamente. Detalhe: ${msg}`
          : msg,
      },
      { status: pncpUnstable ? 503 : 500 }
    );

    if (pncpUnstable) res.headers.set("Retry-After", "2");
    return res;
  }
}