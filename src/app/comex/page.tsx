import { Suspense } from "react";
import ComexClient from "./ui/ComexClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 20, color: "#A1A1AA" }}>Carregando...</div>}>
      <ComexClient />
    </Suspense>
  );
}
