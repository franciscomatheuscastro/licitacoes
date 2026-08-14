// src/backend/licitacoes/ServicoBuscaLicitacoes.ts

import {
  buscarLicitacoesRadar,
  type FiltrosPesquisaRadar,
} from "@/lib/pncp";

import RepositorioLicitacao from "./RepositorioLicitacao";

export default class ServicoBuscaLicitacoes {
  static async executar(
    filtros: FiltrosPesquisaRadar
  ) {
    const resultadoPNCP =
      await buscarLicitacoesRadar(
        filtros
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
            : "Erro desconhecido";

        errosDetalhados.push(
          mensagem
        );

        console.error(
          "[LICITAÇÃO] Erro ao salvar:",
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

      paginasProcessadas:
        resultadoPNCP
          .paginasProcessadas,

      quantidadeRecebida:
        resultadoPNCP
          .quantidadeRecebida,

      errosDetalhados,
    };
  }
}