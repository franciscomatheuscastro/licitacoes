import { prisma } from "@/lib/prisma";

import {
  criarIdentificadorPNCP,
  type LicitacaoPNCP,
} from "@/lib/pncp";

const STATUS_PROTEGIDOS: ("PARTICIPANDO" | "GANHA")[] = [
  "PARTICIPANDO",
  "GANHA",
];

function converterData(valor?: string) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Intervalo [início, fim) do dia civil em America/Sao_Paulo.
 * Em 2026, São Paulo usa UTC-03:00, sem horário de verão.
 * Se a aplicação passar a trabalhar com datas históricas ou
 * outras zonas com DST, usar uma biblioteca de fuso horário.
 */
function periodoEncerramento(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error("Informe uma data válida no formato AAAA-MM-DD.");
  }

  const [ano, mes, dia] = data.split("-").map(Number);
  const dataUTC = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    dataUTC.getUTCFullYear() !== ano ||
    dataUTC.getUTCMonth() !== mes - 1 ||
    dataUTC.getUTCDate() !== dia
  ) {
    throw new Error("A data informada não existe.");
  }

  const inicio = new Date(`${data}T00:00:00-03:00`);
  dataUTC.setUTCDate(dataUTC.getUTCDate() + 1);
  const amanha = dataUTC.toISOString().slice(0, 10);
  const fim = new Date(`${amanha}T00:00:00-03:00`);

  return { gte: inicio, lt: fim };
}

export default class RepositorioLicitacao {
  static async salvarDoPNCP(item: LicitacaoPNCP) {
    const numeroControlePNCP = criarIdentificadorPNCP(item);

    if (!numeroControlePNCP) {
      throw new Error("Não foi possível identificar a licitação.");
    }

    const titulo = item.objetoCompra?.trim() || "Objeto não informado";
    const url = item.linkSistemaOrigem || item.linkProcessoEletronico || null;
    const dataPublicacao = converterData(
      item.dataPublicacaoPncp || item.dataInclusao
    );
    const prazoEncerramento = converterData(item.dataEncerramentoProposta);
    const valor = Number(item.valorTotalEstimado);
    const valorEstimado = Number.isFinite(valor) ? valor : null;

    return prisma.licitacao.upsert({
      where: { numeroControlePNCP },
      create: {
        numeroControlePNCP,
        titulo,
        orgao: item.orgaoEntidade?.razaoSocial || null,
        municipio: item.unidadeOrgao?.municipioNome || null,
        uf: item.unidadeOrgao?.ufSigla || null,
        valorEstimado,
        dataPublicacao,
        prazoEncerramento,
        situacaoPNCP: item.situacaoCompraNome || null,
        url,
        status: "NOVA",
        verificadaEm: new Date(),
      },
      // Atualiza dados PNCP, mas preserva status, favorita e observação.
      update: {
        titulo,
        orgao: item.orgaoEntidade?.razaoSocial || null,
        municipio: item.unidadeOrgao?.municipioNome || null,
        uf: item.unidadeOrgao?.ufSigla || null,
        valorEstimado,
        dataPublicacao,
        prazoEncerramento,
        situacaoPNCP: item.situacaoCompraNome || null,
        url,
        verificadaEm: new Date(),
      },
    });
  }

  static async listar() {
    return prisma.licitacao.findMany({
      orderBy: [
        { prazoEncerramento: "asc" },
        { criadaEm: "desc" },
      ],
    });
  }

  static async buscarPorId(id: string) {
    return prisma.licitacao.findUnique({ where: { id } });
  }

  /** Exclusão individual, independentemente do status, após confirmação na UI. */
  static async excluirPorId(id: string) {
    const resultado = await prisma.licitacao.deleteMany({
      where: { id },
    });
    return resultado.count;
  }

  /** Prévia exata: conta o que poderá e o que NÃO poderá ser excluído. */
  static async resumoExclusaoPorEncerramento(data: string) {
    const prazoEncerramento = periodoEncerramento(data);

    const [excluiveis, protegidas] = await Promise.all([
      prisma.licitacao.count({
        where: {
          prazoEncerramento,
          status: { notIn: STATUS_PROTEGIDOS },
        },
      }),
      prisma.licitacao.count({
        where: {
          prazoEncerramento,
          status: { in: STATUS_PROTEGIDOS },
        },
      }),
    ]);

    return { excluiveis, protegidas };
  }

  /**
   * Limpeza por data de ENCERRAMENTO, nunca por data de cadastro.
   * Não remove licitações GANHA ou PARTICIPANDO.
   */
  static async excluirPorEncerramento(data: string) {
    const prazoEncerramento = periodoEncerramento(data);
    const resultado = await prisma.licitacao.deleteMany({
      where: {
        prazoEncerramento,
        status: { notIn: STATUS_PROTEGIDOS },
      },
    });

    return resultado.count;
  }
}
