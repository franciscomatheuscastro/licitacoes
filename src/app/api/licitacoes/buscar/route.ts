// src/app/api/licitacoes/buscar/route.ts

import {
  NextResponse,
} from "next/server";

import {
  revalidatePath,
} from "next/cache";

import ServicoBuscaLicitacoes from "@/backend/licitacoes/ServicoBuscaLicitacoes";

import {
  LIMITE_TOTAL_PAGINAS,
  type FiltrosPesquisaRadar,
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

  paginaInicial?: unknown;
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

function numeroPagina(
  valor: unknown
) {
  const numero =
    Number(valor);

  if (
    !Number.isFinite(numero) ||
    numero < 1
  ) {
    return 1;
  }

  return Math.min(
    LIMITE_TOTAL_PAGINAS,
    Math.floor(numero)
  );
}

function respostaJson(
  body: Record<
    string,
    unknown
  >,
  status = 200
) {
  const resposta =
    NextResponse.json(
      body,
      {
        status,
      }
    );

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
      "demorou mais"
    )
  ) {
    return {
      status: 504,

      mensagem:
        "O PNCP demorou mais do que o esperado para responder. Tente novamente.",
    };
  }

  return {
    status: 500,

    mensagem:
      "Não foi possível concluir esta etapa da pesquisa. Tente novamente.",
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

    const paginaInicial =
      numeroPagina(
        body.paginaInicial
      );

    const resultado =
      await ServicoBuscaLicitacoes
        .executar(
          filtros,
          paginaInicial
        );

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