import { Licitacao, SearchParams } from "./types";

const baseUrl = process.env.PNCP_BASE_URL;

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

// PNCP: período máximo 365 dias → quebrar em janelas
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

function mapPncpToLicitacao(it: any): Licitacao {
  const id =
    String(it?.numeroControlePNCP ?? "") ||
    `${it?.orgaoEntidade?.cnpj ?? "semcnpj"}_${it?.anoCompra ?? "0"}_${it?.sequencialCompra ?? "0"}`;

  return {
    id,
    titulo: String(it?.objetoCompra ?? it?.objeto ?? it?.titulo ?? "Sem título"),
    orgao: it?.orgaoEntidade?.razaoSocial ?? undefined,
    uf: it?.unidadeOrgao?.ufSigla ?? it?.orgaoEntidade?.uf ?? undefined,
    municipio: it?.unidadeOrgao?.municipioNome ?? it?.orgaoEntidade?.municipio ?? undefined,
    modalidade: it?.modalidadeNome ?? undefined, // nome vindo do PNCP
    valorEstimado: Number(it?.valorTotalEstimado ?? 0) || undefined,
    dataPublicacao: it?.dataPublicacaoPncp ?? it?.dataInclusao ?? undefined,
    prazoEncerramento: it?.dataEncerramentoProposta ?? undefined,
    url: it?.linkSistemaOrigem ?? it?.linkProcessoEletronico ?? undefined,
    fonte: "PNCP",
  };
}

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

  for (const w of windows) {
    const url = new URL(`${baseUrl}/contratacoes/publicacao`);

    if (params.q?.trim()) url.searchParams.set("palavraChave", params.q.trim());
    if (params.uf?.trim()) url.searchParams.set("uf", params.uf.trim());

    url.searchParams.set("dataInicial", w.ini);
    url.searchParams.set("dataFinal", w.fim);
    url.searchParams.set("codigoModalidadeContratacao", codigoModalidadeContratacao);
    url.searchParams.set("pagina", String(page));
    url.searchParams.set("tamanhoPagina", String(tamanhoPagina));

    const res = await fetch(url.toString(), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`PNCP erro ${res.status}: ${text.slice(0, 300)}`);

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`PNCP resposta não-JSON: ${text.slice(0, 200)}`);
    }

    const items = Array.isArray(json?.data) ? json.data : [];
    for (const raw of items) {
      const lic = mapPncpToLicitacao(raw);
      if (!seen.has(lic.id)) {
        seen.add(lic.id);
        all.push(lic);
      }
    }
  }

  // ✅ sem exclusão automática
  return all;
}
