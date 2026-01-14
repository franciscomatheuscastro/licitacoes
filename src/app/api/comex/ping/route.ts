import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const r = await fetch("https://api-comexstat.mdic.gov.br/general/dates/years", { cache: "no-store" });
    const t = await r.text();
    return NextResponse.json({ ok: true, status: r.status, body: t.slice(0, 200) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}
