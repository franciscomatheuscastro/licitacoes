-- CreateTable
CREATE TABLE "ExecucaoBusca" (
    "id" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "sucesso" BOOLEAN NOT NULL DEFAULT false,
    "paginasProcessadas" INTEGER NOT NULL DEFAULT 0,
    "encontradas" INTEGER NOT NULL DEFAULT 0,
    "salvas" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "mensagemErro" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecucaoBusca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecucaoBusca_iniciadaEm_idx" ON "ExecucaoBusca"("iniciadaEm");

-- CreateIndex
CREATE INDEX "ExecucaoBusca_sucesso_idx" ON "ExecucaoBusca"("sucesso");
