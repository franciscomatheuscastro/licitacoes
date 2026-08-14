-- CreateEnum
CREATE TYPE "StatusLicitacao" AS ENUM ('NOVA', 'EM_ANALISE', 'INTERESSANTE', 'DESCARTADA', 'PARTICIPANDO', 'GANHA', 'PERDIDA');

-- CreateTable
CREATE TABLE "Licitacao" (
    "id" TEXT NOT NULL,
    "numeroControlePNCP" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "orgao" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "valorEstimado" DECIMAL(65,30),
    "dataPublicacao" TIMESTAMP(3),
    "prazoEncerramento" TIMESTAMP(3),
    "situacaoPNCP" TEXT,
    "url" TEXT,
    "status" "StatusLicitacao" NOT NULL DEFAULT 'NOVA',
    "favorita" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,
    "verificadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Licitacao_numeroControlePNCP_key" ON "Licitacao"("numeroControlePNCP");

-- CreateIndex
CREATE INDEX "Licitacao_status_idx" ON "Licitacao"("status");

-- CreateIndex
CREATE INDEX "Licitacao_prazoEncerramento_idx" ON "Licitacao"("prazoEncerramento");

-- CreateIndex
CREATE INDEX "Licitacao_uf_idx" ON "Licitacao"("uf");
