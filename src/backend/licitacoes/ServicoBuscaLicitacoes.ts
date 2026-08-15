// src/backend/licitacoes/ServicoBuscaLicitacoes.ts

import {
  buscarLicitacoesRadar,
  PAGINAS_POR_LOTE,
  type FiltrosPesquisaRadar,
} from "@/lib/pncp";

import RepositorioLicitacao from "./RepositorioLicitacao";

export default class ServicoBuscaLicitacoes {
  static async executar(
    filtros: FiltrosPesquisaRadar,
    paginaInicial = 1
  ) {
    const resultadoPNCP =
      await buscarLicitacoesRadar(
        filtros,
        paginaInicial,
        PAGINAS_POR_LOTE
      );

    let salvas = 0;

    let erros = 0;

    const errosDetalhados:
      string[] = [];

    for (
      const item of
      resultadoPNCP.itens
    ) {
      try {
        await RepositorioLicitacao
          .salvarDoPNCP(
            item
          );

        salvas++;
      } catch (erro) {
        erros++;

        const mensagem =
          erro instanceof Error
            ? erro.message
            : "Erro desconhecido.";

        errosDetalhados.push(
          mensagem
        );

        console.error(
          "[RADAR] Erro ao salvar licitação:",
          erro
        );
      }
    }

    return {
      encontradas:
        resultadoPNCP
          .itens.length,

      salvas,

      erros,

      errosDetalhados,

      paginasProcessadas:
        resultadoPNCP
          .paginasProcessadas,

      quantidadeRecebida:
        resultadoPNCP
          .quantidadeRecebida,

      paginaInicial:
        resultadoPNCP
          .paginaInicial,

      paginaFinal:
        resultadoPNCP
          .paginaFinal,

      proximaPagina:
        resultadoPNCP
          .proximaPagina,

      concluida:
        resultadoPNCP
          .concluida,

      totalPaginasPNCP:
        resultadoPNCP
          .totalPaginasPNCP,

      limiteTotalAtingido:
        resultadoPNCP
          .limiteTotalAtingido,
    };
  }
}