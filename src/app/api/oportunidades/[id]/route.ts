import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import RepositorioLicitacao from "@/backend/licitacoes/RepositorioLicitacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

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

export async function DELETE(request: Request, { params }: Contexto) {
  // IMPORTANTE: adicione aqui a validação da sessão/perfil administrador
  // utilizada em seu projeto; a checagem de origem abaixo NÃO é autenticação.
  if (!origemPermitida(request)) {
    return NextResponse.json(
      { sucesso: false, erro: "Origem da requisição não permitida." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json(
      { sucesso: false, erro: "Identificador inválido." },
      { status: 400 }
    );
  }

  try {
    const quantidade = await RepositorioLicitacao.excluirPorId(id);
    if (!quantidade) {
      return NextResponse.json(
        { sucesso: false, erro: "Oportunidade não encontrada." },
        { status: 404 }
      );
    }

    revalidatePath("/oportunidades");
    return NextResponse.json({ sucesso: true, excluidas: quantidade });
  } catch (erro) {
    console.error("[RADAR] Erro ao excluir oportunidade:", erro);
    return NextResponse.json(
      { sucesso: false, erro: "Não foi possível excluir a oportunidade." },
      { status: 500 }
    );
  }
}
