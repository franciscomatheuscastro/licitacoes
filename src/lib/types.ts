// src/lib/types.ts

export type Licitacao = {
  id: string;
  titulo: string;
  orgao?: string;
  uf?: string;
  municipio?: string;

  modalidade?: string; // nome vindo do PNCP
  valorEstimado?: number;

  dataPublicacao?: string; // ISO ou YYYY-MM-DD
  prazoEncerramento?: string; // ISO ou YYYY-MM-DD

  url?: string;
  fonte: "PNCP";

  // ✅ cache interno (não vem da API)
  _t?: string;
};

export type SearchParams = {
  q?: string; // busca base no PNCP (opcional)
  uf?: string;
  codigoModalidadeContratacao?: string;

  // Publicação
  dataIni?: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD

  // ✅ Encerramento (novo)
  encIni?: string; // YYYY-MM-DD
  encFim?: string; // YYYY-MM-DD

  page?: string;
  pageSize?: string;
};