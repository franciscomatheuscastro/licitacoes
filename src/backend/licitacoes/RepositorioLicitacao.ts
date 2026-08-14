// src/backend/licitacoes/RepositorioLicitacao.ts

import { prisma } from "@/lib/prisma";

import {
  criarIdentificadorPNCP,
  type LicitacaoPNCP,
} from "@/lib/pncp";

function converterData(
  valor?: string
) {
  if (!valor) {
    return null;
  }

  const data =
    new Date(valor);

  if (
    Number.isNaN(
      data.getTime()
    )
  ) {
    return null;
  }

  return data;
}

export default class RepositorioLicitacao {
  static async salvarDoPNCP(
    item: LicitacaoPNCP
  ) {
    const numeroControlePNCP =
      criarIdentificadorPNCP(
        item
      );

    if (
      !numeroControlePNCP
    ) {
      throw new Error(
        "Não foi possível identificar a licitação."
      );
    }

    const titulo =
      item.objetoCompra
        ?.trim() ||
      "Objeto não informado";

    const url =
      item
        .linkSistemaOrigem ||
      item
        .linkProcessoEletronico ||
      null;

    const dataPublicacao =
      converterData(
        item
          .dataPublicacaoPncp ||
          item.dataInclusao
      );

    const prazoEncerramento =
      converterData(
        item
          .dataEncerramentoProposta
      );

    const valor =
      Number(
        item
          .valorTotalEstimado
      );

    const valorEstimado =
      Number.isFinite(
        valor
      )
        ? valor
        : null;

    return prisma
      .licitacao
      .upsert({
        where: {
          numeroControlePNCP,
        },

        create: {
          numeroControlePNCP,

          titulo,

          orgao:
            item
              .orgaoEntidade
              ?.razaoSocial ||
            null,

          municipio:
            item
              .unidadeOrgao
              ?.municipioNome ||
            null,

          uf:
            item
              .unidadeOrgao
              ?.ufSigla ||
            null,

          valorEstimado,

          dataPublicacao,

          prazoEncerramento,

          situacaoPNCP:
            item
              .situacaoCompraNome ||
            null,

          url,

          status:
            "NOVA",

          verificadaEm:
            new Date(),
        },

        /*
         * IMPORTANTE:
         *
         * Ao encontrar novamente,
         * atualizamos dados do PNCP,
         * mas NÃO alteramos status,
         * favorita ou observação.
         *
         * Assim o trabalho do usuário
         * não é perdido.
         */
        update: {
          titulo,

          orgao:
            item
              .orgaoEntidade
              ?.razaoSocial ||
            null,

          municipio:
            item
              .unidadeOrgao
              ?.municipioNome ||
            null,

          uf:
            item
              .unidadeOrgao
              ?.ufSigla ||
            null,

          valorEstimado,

          dataPublicacao,

          prazoEncerramento,

          situacaoPNCP:
            item
              .situacaoCompraNome ||
            null,

          url,

          verificadaEm:
            new Date(),
        },
      });
  }

  static async listar() {
    return prisma
      .licitacao
      .findMany({
        orderBy: [
          {
            prazoEncerramento:
              "asc",
          },

          {
            criadaEm:
              "desc",
          },
        ],
      });
  }

  static async buscarPorId(
    id: string
  ) {
    return prisma
      .licitacao
      .findUnique({
        where: {
          id,
        },
      });
  }
}