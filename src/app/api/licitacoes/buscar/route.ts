// src/app/api/licitacoes/buscar/route.ts

import {
  NextResponse,
} from "next/server";

import {
  revalidatePath,
} from "next/cache";

import ServicoBuscaLicitacoes from "@/backend/licitacoes/ServicoBuscaLicitacoes";

import type {
  FiltrosPesquisaRadar,
} from "@/lib/pncp";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  60;

type BodyPesquisa = {
  termo?: unknown;

  uf?: unknown;

  codigoModalidadeContratacao?: unknown;

  encerramentoInicio?: unknown;

  encerramentoFim?: unknown;
};

function textoOpcional(
  valor: unknown
) {
  if (
    typeof valor !==
    "string"
  ) {
    return undefined;
  }

  const texto =
    valor.trim();

  return texto ||
    undefined;
}

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as BodyPesquisa;

    const filtros:
      FiltrosPesquisaRadar =
    {
      termo:
        textoOpcional(
          body.termo
        ),

      uf:
        textoOpcional(
          body.uf
        )
          ?.toUpperCase(),

      codigoModalidadeContratacao:
        textoOpcional(
          body
            .codigoModalidadeContratacao
        ) ||
        "6",

      encerramentoInicio:
        textoOpcional(
          body
            .encerramentoInicio
        ),

      encerramentoFim:
        textoOpcional(
          body
            .encerramentoFim
        ),
    };

    /*
     * Validação das datas.
     */
    if (
      filtros
        .encerramentoInicio &&
      filtros
        .encerramentoFim &&
      filtros
        .encerramentoInicio >
        filtros
          .encerramentoFim
    ) {
      return NextResponse.json(
        {
          sucesso: false,

          erro:
            "A data inicial não pode ser posterior à data final.",
        },

        {
          status: 400,
        }
      );
    }

    const resultado =
      await ServicoBuscaLicitacoes
        .executar(
          filtros
        );

    /*
     * Faz a página de oportunidades
     * buscar novamente os dados
     * depois da pesquisa.
     */
    revalidatePath(
      "/oportunidades"
    );

    return NextResponse.json({
      sucesso: true,

      ...resultado,
    });
  } catch (erro) {
    console.error(
      "[RADAR] Erro na pesquisa:",
      erro
    );

    const mensagem =
      erro instanceof Error
        ? erro.message
        : "Erro desconhecido.";

    return NextResponse.json(
      {
        sucesso: false,
        erro: mensagem,
      },

      {
        status: 500,
      }
    );
  }
}