import { Suspense } from "react";
import FornecedoresClient from "./ui/FornecedoresClient";

export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "42px 18px",
        background: "radial-gradient(80% 60% at 50% 0%, rgba(34,211,238,0.10), transparent 60%), #050505",
        color: "#EDEDED",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 42, margin: 0, fontWeight: 900, letterSpacing: -0.6 }}>
          Encontrar Fornecedores
        </h1>
        <p style={{ marginTop: 8, marginBottom: 18, color: "#A1A1AA" }}>
          Digite um produto/subcategoria e veja fornecedores que já fecharam contratos similares no PNCP.
        </p>

        <Suspense fallback={<div style={{ color: "#A1A1AA" }}>Carregando…</div>}>
          <FornecedoresClient />
        </Suspense>
      </div>
    </main>
  );
}
