import { NextResponse } from "next/server";
import { searchPncp } from "@/lib/pncp";
import { SearchParams } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const params: SearchParams = {
      q: searchParams.get("q") ?? undefined,
      uf: searchParams.get("uf") ?? undefined,
      codigoModalidadeContratacao: searchParams.get("codigoModalidadeContratacao") ?? undefined,
      dataIni: searchParams.get("dataIni") ?? undefined,
      dataFim: searchParams.get("dataFim") ?? undefined,
      page: searchParams.get("page") ?? "1",
      pageSize: searchParams.get("pageSize") ?? "50",
    };

    const items = await searchPncp(params);

    return NextResponse.json({
      ok: true,
      page: Number(params.page ?? 1),
      pageSize: Number(params.pageSize ?? 50),
      total: items.length,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
