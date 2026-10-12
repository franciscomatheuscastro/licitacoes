import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import RepositorioLicitacao from "@/backend/licitacoes/RepositorioLicitacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validarData(data: unknown): data is string {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return false;
  }
  const [ano, mes, dia] = data.split("-").map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  return teste.getUTCFullYear() === ano &&
    teste.getUTCMonth() === mes - 1 &&
    teste.getUTCDate() === dia;
}

function origemPermitida(request: Request) {
  const origem = request.headers.get("origin");
  if (!origem) return false;
  try {
    const origemHost = new URL(origem).host;
    const host = request.headers.get("x-forwarded-host") ||
      request.headers.get("host") || new URL(request.url).host;
    return origemHost === host;
  } catch {
    return false;
  }
}

/** Prévia para a caixa de confirmação, sem modificar o banco. */
export async function GET(request: Request) {
  // IMPORTANTE: conferir autenticação/autorização neste endpoint também.
  const data = new URL(request.url).searchParams.get("data");
  if (!validarData(data)) {
    return NextResponse.json(
      { sucesso: false, erro: "Informe uma data válida." },
      { status: 400 }
    );
  }

  try {
    const resumo = await RepositorioLicitacao.resumoExclusaoPorEncerramento(data);
    return NextResponse.json({ sucesso: true, data, ...resumo }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (erro) {
    console.error("[RADAR] Erro ao consultar exclusão por data:", erro);
    return NextResponse.json(
      { sucesso: false, erro: "Não foi possível consultar as oportunidades." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  // IMPORTANTE: adicione a checagem de administrador autenticado.
  // Same-origin é somente proteção adicional, não é autenticação.
  if (!origemPermitida(request)) {
    return NextResponse.json(
      { sucesso: false, erro: "Origem da requisição não permitida." },
      { status: 403 }
    );
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json(
      { sucesso: false, erro: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }

  const dados = corpo && typeof corpo === "object"
    ? corpo as Record<string, unknown>
    : {};
  const data = dados.data;

  if (!validarData(data) || dados.confirmar !== true) {
    return NextResponse.json(
      { sucesso: false, erro: "Data inválida ou confirmação ausente." },
      { status: 400 }
    );
  }

  try {
    const excluidas = await RepositorioLicitacao.excluirPorEncerramento(data);
    revalidatePath("/oportunidades");
    return NextResponse.json({ sucesso: true, data, excluidas });
  } catch (erro) {
    console.error("[RADAR] Erro ao excluir por data:", erro);
    return NextResponse.json(
      { sucesso: false, erro: "Não foi possível excluir as oportunidades." },
      { status: 500 }
    );
  }
}
