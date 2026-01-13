export type Licitacao = {
  id: string;
  titulo: string;
  orgao?: string;
  uf?: string;
  municipio?: string;
  modalidade?: string; // nome vindo do PNCP
  valorEstimado?: number;
  dataPublicacao?: string;
  prazoEncerramento?: string;
  url?: string;
  fonte: "PNCP";
};

export type SearchParams = {
  q?: string; // busca base no PNCP (opcional)
  uf?: string;
  codigoModalidadeContratacao?: string;
  dataIni?: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD
  page?: string;
  pageSize?: string;
};
