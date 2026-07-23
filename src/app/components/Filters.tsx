"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

function useDebounced<T>(
  value: T,
  delay: number
): T {
  const [debounced, setDebounced] =
    useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [value, delay]);

  return debounced;
}

const MODALIDADES = [
  {
    code: "8",
    label:
      "Modalidade 8 (nome aparece nos cards)",
  },
  {
    code: "5",
    label:
      "Modalidade 5 (nome aparece nos cards)",
  },
  {
    code: "6",
    label:
      "Modalidade 6 (nome aparece nos cards)",
  },
  {
    code: "1",
    label:
      "Modalidade 1 (nome aparece nos cards)",
  },
  {
    code: "7",
    label:
      "Modalidade 7 (nome aparece nos cards)",
  },
];

type IncludeMode = "any" | "all";

export default function Filters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /*
   * Os estados são inicializados pela URL apenas
   * na montagem do componente.
   *
   * Não reidratamos os estados a cada alteração da
   * URL, pois isso gerava ciclo e cancelava o
   * carregamento do Results.
   */
  const [q, setQ] = useState(
    () => searchParams.get("q") || ""
  );

  const [uf, setUf] = useState(
    () => searchParams.get("uf") || ""
  );

  const [
    codigoModalidadeContratacao,
    setCodigoModalidadeContratacao,
  ] = useState(
    () =>
      searchParams.get(
        "codigoModalidadeContratacao"
      ) || "8"
  );

  const [dataIni, setDataIni] =
    useState(
      () =>
        searchParams.get("dataIni") || ""
    );

  const [dataFim, setDataFim] =
    useState(
      () =>
        searchParams.get("dataFim") || ""
    );

  const [encIni, setEncIni] =
    useState(
      () =>
        searchParams.get("encIni") || ""
    );

  const [encFim, setEncFim] =
    useState(
      () =>
        searchParams.get("encFim") || ""
    );

  const [pageSize, setPageSize] =
    useState(
      () =>
        searchParams.get("pageSize") ||
        "50"
    );

  const [includeText, setIncludeText] =
    useState(
      () =>
        searchParams.get("include") || ""
    );

  const [excludeText, setExcludeText] =
    useState(
      () =>
        searchParams.get("exclude") || ""
    );

  const [includeMode, setIncludeMode] =
    useState<IncludeMode>(() => {
      const value =
        searchParams.get("includeMode");

      return value === "all"
        ? "all"
        : "any";
    });

  const debouncedQ = useDebounced(q, 500);

  const debouncedInclude =
    useDebounced(includeText, 350);

  const debouncedExclude =
    useDebounced(excludeText, 350);

  /*
   * Evita disparar router.replace repetidamente
   * para a mesma URL.
   */
  const lastAppliedQueryRef =
    useRef<string>("");

  const queryString = useMemo(() => {
    const next = new URLSearchParams();

    const normalizedQ =
      debouncedQ.trim();

    const normalizedUf = uf
      .trim()
      .toUpperCase();

    if (normalizedQ) {
      next.set("q", normalizedQ);
    }

    if (normalizedUf) {
      next.set("uf", normalizedUf);
    }

    next.set(
      "codigoModalidadeContratacao",
      codigoModalidadeContratacao
    );

    if (dataIni) {
      next.set("dataIni", dataIni);
    }

    if (dataFim) {
      next.set("dataFim", dataFim);
    }

    if (encIni) {
      next.set("encIni", encIni);
    }

    if (encFim) {
      next.set("encFim", encFim);
    }

    const parsedPageSize =
      Number(pageSize || 50);

    const safePageSize = Math.max(
      10,
      Math.min(
        50,
        Number.isFinite(parsedPageSize)
          ? parsedPageSize
          : 50
      )
    );

    next.set(
      "pageSize",
      String(safePageSize)
    );

    /*
     * Sempre volta para a página 1 quando os
     * filtros são alterados.
     */
    next.set("page", "1");

    const normalizedInclude =
      debouncedInclude.trim();

    const normalizedExclude =
      debouncedExclude.trim();

    if (normalizedInclude) {
      next.set(
        "include",
        normalizedInclude
      );
    }

    if (normalizedExclude) {
      next.set(
        "exclude",
        normalizedExclude
      );
    }

    next.set(
      "includeMode",
      includeMode
    );

    return next.toString();
  }, [
    debouncedQ,
    uf,
    codigoModalidadeContratacao,
    dataIni,
    dataFim,
    encIni,
    encFim,
    pageSize,
    debouncedInclude,
    debouncedExclude,
    includeMode,
  ]);

  useEffect(() => {
    const currentQuery =
      searchParams.toString();

    if (currentQuery === queryString) {
      lastAppliedQueryRef.current =
        queryString;

      return;
    }

    if (
      lastAppliedQueryRef.current ===
      queryString
    ) {
      return;
    }

    lastAppliedQueryRef.current =
      queryString;

    router.replace(`?${queryString}`, {
      scroll: false,
    });
  }, [
    queryString,
    router,
    searchParams,
  ]);

  return (
    <section
      style={{
        display: "grid",
        gap: 12,
      }}
    >
      <div style={grid3}>
        <div style={field}>
          <label style={label}>
            Busca (PNCP)
          </label>

          <input
            placeholder="Ex: autoclave, bomba de infusão, equipamento médico..."
            value={q}
            onChange={(event) =>
              setQ(event.target.value)
            }
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>UF</label>

          <input
            placeholder="Ex: RS"
            value={uf}
            onChange={(event) =>
              setUf(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, "")
                  .slice(0, 2)
              )
            }
            style={input}
            maxLength={2}
          />
        </div>

        <div style={field}>
          <label style={label}>
            Modalidade (código)
          </label>

          <select
            value={
              codigoModalidadeContratacao
            }
            onChange={(event) =>
              setCodigoModalidadeContratacao(
                event.target.value
              )
            }
            style={input}
          >
            {MODALIDADES.map(
              (modalidade) => (
                <option
                  key={modalidade.code}
                  value={modalidade.code}
                >
                  {modalidade.label}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <div style={grid3}>
        <div style={field}>
          <label style={label}>
            Publicado (início)
          </label>

          <input
            type="date"
            value={dataIni}
            onChange={(event) =>
              setDataIni(
                event.target.value
              )
            }
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>
            Publicado (fim)
          </label>

          <input
            type="date"
            value={dataFim}
            onChange={(event) =>
              setDataFim(
                event.target.value
              )
            }
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>
            Tamanho da página
          </label>

          <select
            value={pageSize}
            onChange={(event) =>
              setPageSize(
                event.target.value
              )
            }
            style={input}
          >
            <option value="10">
              10 por página
            </option>

            <option value="20">
              20 por página
            </option>

            <option value="50">
              50 por página
            </option>
          </select>
        </div>
      </div>

      <div style={grid3}>
        <div style={field}>
          <label style={label}>
            Encerramento (início)
          </label>

          <input
            type="date"
            value={encIni}
            onChange={(event) =>
              setEncIni(
                event.target.value
              )
            }
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>
            Encerramento (fim)
          </label>

          <input
            type="date"
            value={encFim}
            onChange={(event) =>
              setEncFim(
                event.target.value
              )
            }
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>
            Período estratégico
          </label>

          <div style={hintBox}>
            Use o encerramento para focar
            nas oportunidades mais próximas.
          </div>
        </div>
      </div>

      <div style={grid3}>
        <div style={field}>
          <label style={label}>
            Incluir (palavras-chave)
          </label>

          <input
            placeholder="Ex: médico, hospitalar, autoclave"
            value={includeText}
            onChange={(event) =>
              setIncludeText(
                event.target.value
              )
            }
            style={input}
          />
        </div>

        <div style={field}>
          <label style={label}>
            Modo do incluir
          </label>

          <select
            value={includeMode}
            onChange={(event) =>
              setIncludeMode(
                event.target
                  .value as IncludeMode
              )
            }
            style={input}
          >
            <option value="any">
              QUALQUER (OR) — recomendado
            </option>

            <option value="all">
              TODOS (AND) — mais restrito
            </option>
          </select>
        </div>

        <div style={field}>
          <label style={label}>
            Excluir
          </label>

          <input
            placeholder="Ex: obra, pavimentação, drenagem, asfalto"
            value={excludeText}
            onChange={(event) =>
              setExcludeText(
                event.target.value
              )
            }
            style={input}
          />
        </div>
      </div>

      <div style={hint}>
        Se o campo “Incluir” estiver
        muito restritivo, utilize{" "}
        <strong
          style={{
            color: "#EDEDED",
          }}
        >
          QUALQUER (OR)
        </strong>
        . O sistema mostrará resultados
        contendo pelo menos um dos termos.
      </div>
    </section>
  );
}

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
  gap: 12,
};

const field: React.CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#A1A1AA",
};

const input: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "11px 12px",
  border:
    "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  background: "rgba(0,0,0,0.35)",
  color: "#EDEDED",
  outline: "none",
};

const hint: React.CSSProperties = {
  fontSize: 12,
  color: "#A1A1AA",
};

const hintBox: React.CSSProperties = {
  minHeight: 43,
  display: "flex",
  alignItems: "center",
  fontSize: 12,
  lineHeight: 1.4,
  color: "#A1A1AA",
};