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

/*
 * Mantemos 60 segundos como teto da função.
 * A busca precisa ser desenhada para terminar
 * confortavelmente antes desse limite.
 */
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

function respostaJson(
  body: Record<string, unknown>,
  status = 200
) {
  const resposta =
    NextResponse.json(
      body,
      {
        status,
      }
    );

  /*
   * Evita cache dessa operação.
   */
  resposta.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  return resposta;
}

function mensagemAmigavel(
  erro: unknown
) {
  const mensagem =
    erro instanceof Error
      ? erro.message
      : "Erro desconhecido.";

  const normalizada =
    mensagem.toLowerCase();

  if (
    normalizada.includes(
      "limite de consultas"
    ) ||
    normalizada.includes(
      "429"
    )
  ) {
    return {
      status: 429,

      mensagem:
        "O PNCP atingiu temporariamente o limite de consultas. Aguarde alguns instantes e tente novamente.",
    };
  }

  if (
    normalizada.includes(
      "502"
    ) ||
    normalizada.includes(
      "503"
    ) ||
    normalizada.includes(
      "504"
    ) ||
    normalizada.includes(
      "temporariamente indisponível"
    ) ||
    normalizada.includes(
      "instável"
    )
  ) {
    return {
      status: 503,

      mensagem:
        "O PNCP está temporariamente indisponível ou instável. Tente novamente em alguns instantes.",
    };
  }

  if (
    normalizada.includes(
      "timeout"
    ) ||
    normalizada.includes(
      "abort"
    ) ||
    normalizada.includes(
      "cancelada"
    )
  ) {
    return {
      status: 504,

      mensagem:
        "A pesquisa demorou mais do que o esperado. Tente novamente ou reduza o período pesquisado.",
    };
  }

  return {
    status: 500,

    mensagem:
      "Não foi possível concluir a pesquisa. Tente novamente.",
  };
}

export async function POST(
  request: Request
) {
  try {
    let body:
      BodyPesquisa;

    try {
      body =
        (await request.json()) as BodyPesquisa;
    } catch {
      return respostaJson(
        {
          sucesso: false,

          erro:
            "Os dados enviados para a pesquisa são inválidos.",
        },
        400
      );
    }

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
     * Validação de intervalo.
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
      return respostaJson(
        {
          sucesso: false,

          erro:
            "A data inicial não pode ser posterior à data final.",
        },
        400
      );
    }

    const resultado =
      await ServicoBuscaLicitacoes
        .executar(
          filtros
        );

    /*
     * Faz a tela consultar novamente
     * as oportunidades salvas.
     */
    revalidatePath(
      "/oportunidades"
    );

    return respostaJson({
      sucesso: true,

      ...resultado,
    });
  } catch (erro) {
    console.error(
      "[RADAR] Erro na pesquisa:",
      erro
    );

    const tratado =
      mensagemAmigavel(
        erro
      );

    return respostaJson(
      {
        sucesso: false,

        erro:
          tratado.mensagem,
      },
      tratado.status
    );
  }
}