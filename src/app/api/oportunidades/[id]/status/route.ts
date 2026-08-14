import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const STATUS_VALIDOS = [
  "NOVA",
  "EM_ANALISE",
  "INTERESSANTE",
  "DESCARTADA",
  "PARTICIPANDO",
  "GANHA",
  "PERDIDA",
] as const;

type StatusValido =
  (typeof STATUS_VALIDOS)[number];

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } =
      await context.params;

    const body =
      (await request.json()) as {
        status?: unknown;
      };

    if (
      typeof body.status !==
      "string"
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Status inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const status =
      body.status as StatusValido;

    if (
      !STATUS_VALIDOS.includes(
        status
      )
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Status não permitido.",
        },
        {
          status: 400,
        }
      );
    }

    const licitacao =
      await prisma.licitacao.update({
        where: {
          id,
        },

        data: {
          status,
        },

        select: {
          id: true,
          status: true,
        },
      });

    return NextResponse.json({
      sucesso: true,
      licitacao,
    });
  } catch (erro) {
    console.error(
      "[ALTERAR STATUS LICITAÇÃO]",
      erro
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          erro instanceof Error
            ? erro.message
            : "Erro ao alterar status.",
      },
      {
        status: 500,
      }
    );
  }
}