import { Suspense } from "react";
import Filters from "@/app/components/Filters";
import Results from "@/app/components/Results";

function LoadingBlock() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        color: "#A1A1AA",
      }}
    >
      Carregando interface…
    </div>
  );
}

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
        <h1 style={{ fontSize: 46, margin: 0, fontWeight: 900, letterSpacing: -0.6 }}>
          Radar de Licitações
        </h1>
        <p style={{ marginTop: 8, marginBottom: 18, color: "#A1A1AA" }}>
          MVP para pesquisa e triagem com filtros (fonte: PNCP).
        </p>

        {/* ✅ IMPORTANTÍSSIMO: useSearchParams dentro de Suspense */}
        <Suspense fallback={<LoadingBlock />}>
          <div
            style={{
              borderRadius: 18,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.50)",
            }}
          >
            <Filters />
          </div>

          <Results />
        </Suspense>
      </div>
    </main>
  );
}
