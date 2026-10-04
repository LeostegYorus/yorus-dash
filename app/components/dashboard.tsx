/* eslint-disable @next/next/no-img-element -- Local SVG brand mark does not need raster optimization. */
"use client";

import { useEffect, useMemo, useState } from "react";
import BlockWorkspace from "./block-editor";
import DashboardBuilder from "./dashboard-builder";

export type Client = {
  id: string;
  name: string;
  currency: string;
  metaConnected: boolean;
  gaConnected: boolean;
};
export type Session = {
  user: { email: string; role: string };
  clients: Client[];
};
type Level = "campaign" | "adset" | "ad";
type Tab =
  "Meu painel" | "Visão geral" | "Campanhas" | "Conjuntos" | "Anúncios" | "Perfil dos leads" | "Custos e decisão" | "Metodologia";
export type Insight = {
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  spend: number;
  impressions: number;
  clicks: number;
  dateStart: string;
  dateStop: string;
};
export type DashboardResult = {
  client: Pick<Client, "id" | "name" | "currency">;
  provider: "meta";
  scope: { account: string; level: Level };
  dateRange: { start: string; end: string };
  collectedAt: string;
  status: "succeeded" | "partial";
  warnings: string[];
  rows: Insight[];
};
const tabs: Tab[] = [
  "Meu painel",
  "Visão geral",
  "Campanhas",
  "Conjuntos",
  "Anúncios",
  "Perfil dos leads",
  "Custos e decisão",
  "Metodologia",
];
const levels: Record<Exclude<Tab, "Metodologia" | "Meu painel">, Level> = {
  "Visão geral": "campaign",
  Campanhas: "campaign",
  Conjuntos: "adset",
  Anúncios: "ad",
  "Perfil dos leads": "campaign",
  "Custos e decisão": "campaign",
};
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const earlier = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const number = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const money = (n: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
const nameFor = (row: Insight, level: Level) =>
  level === "ad"
    ? row.adName || row.adId || "Sem identificação"
    : level === "adset"
      ? row.adsetName || row.adsetId || "Sem identificação"
      : row.campaignName || row.campaignId || "Sem identificação";
const rate = (numerator: number, denominator: number, factor: number) =>
  denominator ? (numerator / denominator) * factor : null;

function DataTable({
  data,
  sorted,
  sort,
  descending,
  onSort,
}: {
  data: DashboardResult;
  sorted: Insight[];
  sort: keyof Pick<Insight, "spend" | "impressions" | "clicks">;
  descending: boolean;
  onSort: (
    key: keyof Pick<Insight, "spend" | "impressions" | "clicks">,
  ) => void;
}) {
  const max = Math.max(...data.rows.map((row) => row.spend), 0);
  return (
    <div className="table-scroll">
      <table>
        <caption>
          Desempenho por{" "}
          {data.scope.level === "ad"
            ? "anúncio"
            : data.scope.level === "adset"
              ? "conjunto"
              : "campanha"}{" "}
          no período selecionado
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {data.scope.level === "ad"
                ? "Anúncio"
                : data.scope.level === "adset"
                  ? "Conjunto"
                  : "Campanha"}
            </th>
            {(["spend", "impressions", "clicks"] as const).map((key) => (
              <th
                scope="col"
                key={key}
                aria-sort={
                  sort === key
                    ? descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
              >
                <button onClick={() => onSort(key)}>
                  {key === "spend"
                    ? "Investimento"
                    : key === "impressions"
                      ? "Impressões"
                      : "Cliques totais"}{" "}
                  <span aria-hidden="true">
                    {sort === key ? (descending ? "↓" : "↑") : "↕"}
                  </span>
                </button>
              </th>
            ))}
            <th scope="col">CTR</th>
            <th scope="col">Participação</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={`${row.campaignId ?? ""}-${row.adsetId ?? ""}-${row.adId ?? ""}-${index}`}
            >
              <th scope="row">
                <span className="row-name">
                  {nameFor(row, data.scope.level)}
                </span>
                <span className="row-id">
                  {data.scope.level === "ad"
                    ? row.adId
                    : data.scope.level === "adset"
                      ? row.adsetId
                      : row.campaignId}
                </span>
              </th>
              <td>{money(row.spend, data.client.currency)}</td>
              <td>{number(row.impressions)}</td>
              <td>{number(row.clicks)}</td>
              <td>
                {rate(row.clicks, row.impressions, 100) === null
                  ? "—"
                  : `${rate(row.clicks, row.impressions, 100)!.toFixed(2).replace(".", ",")}%`}
              </td>
              <td>
                <div className="bar-cell">
                  <span
                    className="bar-track"
                    role="img"
                    aria-label={`${nameFor(row, data.scope.level)}: ${money(row.spend, data.client.currency)} de investimento`}
                  >
                    <span
                      className="bar-fill"
                      style={{ width: `${max ? (row.spend / max) * 100 : 0}%` }}
                    />
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard({
  session,
  onLogout,
  logoutError,
}: {
  session: Session;
  onLogout: () => void;
  logoutError: string;
}) {
  const [clientId, setClientId] = useState(session.clients[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("Meu painel");
  const [start, setStart] = useState(earlier);
  const [end, setEnd] = useState(yesterday);
  const [data, setData] = useState<DashboardResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [sort, setSort] =
    useState<keyof Pick<Insight, "spend" | "impressions" | "clicks">>("spend");
  const [descending, setDescending] = useState(true);
  const sorted = useMemo(
    () =>
      [...(data?.rows ?? [])].sort((a, b) =>
        descending ? b[sort] - a[sort] : a[sort] - b[sort],
      ),
    [data, sort, descending],
  );
  function changeSort(key: typeof sort) {
    if (sort === key) setDescending(!descending);
    else {
      setSort(key);
      setDescending(true);
    }
  }
  const client = session.clients.find((item) => item.id === clientId);
  const blockTab = tab === "Visão geral" ? "overview" : tab === "Perfil dos leads" ? "profile" : tab === "Custos e decisão" ? "costs" : null;
  const blocksOnly = tab === "Perfil dos leads" || tab === "Custos e decisão";
  const level = tab === "Metodologia" || tab === "Meu painel" ? "campaign" : levels[tab];

  useEffect(() => {
    if (!clientId || tab === "Meu painel" || tab === "Metodologia" || blocksOnly || !client?.metaConnected || !start || !end || end < start)
      return;
    const controller = new AbortController();
    const params = new URLSearchParams({ client: clientId, start, end, level });
    fetch(`/api/dashboard?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sua sessão expirou. Entre novamente."
              : response.status === 403
                ? "Você não tem acesso a este cliente."
                : response.status === 503
                  ? "Fonte de dados indisponível. Verifique a configuração."
                  : "Não foi possível consultar os dados.",
          );
        return response.json() as Promise<DashboardResult>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          if (payload.client?.id !== clientId || payload.scope?.level !== level)
            throw new Error(
              "A resposta não corresponde ao cliente ou nível selecionado.",
            );
          setData(payload);
          setPhase("ready");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível consultar os dados.",
          );
          setPhase("error");
        }
      });
    return () => controller.abort();
  }, [clientId, client?.metaConnected, start, end, level, tab, blocksOnly, retry]);

  function changeClient(id: string) {
    setData(null);
    setPhase("loading");
    setClientId(id);
  }
  function changeTab(value: Tab) {
    setData(null);
    setPhase("loading");
    setTab(value);
  }
  function changeDate(which: "start" | "end", value: string) {
    setData(null);
    setPhase("loading");
    (which === "start" ? setStart : setEnd)(value);
  }
  const totals = data?.rows.reduce(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
    }),
    { spend: 0, impressions: 0, clicks: 0 },
  );

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <img
            src="/brand/yorus-symbol-orange.svg"
            width="34"
            height="34"
            alt=""
          />
          <span>
            yorus<span className="brand-period">.</span>
          </span>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <label className="client-label" htmlFor="client">
          Cliente
        </label>
        <select
          id="client"
          value={clientId}
          onChange={(event) => changeClient(event.target.value)}
        >
          {session.clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <nav aria-label="Navegação do painel">
          {tabs.map((value) => (
            <button
              className={tab === value ? "nav-item active" : "nav-item"}
              key={value}
              aria-current={tab === value ? "page" : undefined}
              onClick={() => changeTab(value)}
            >
              {value}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>{session.user.email}</span>
          <button onClick={onLogout}>Sair</button>
        </div>
      </aside>
      <main className={tab === "Meu painel" ? "main-content builder-main" : "main-content"}>
        <header className="topline">
          <div>
            <p className="eyebrow">YORUS / INTELIGÊNCIA DE MÍDIA</p>
            <h1>{tab}</h1>
            <p className="subtitle">
              {client?.name ?? "Nenhum cliente autorizado"}{" "}
              <span className="separator">/</span> {tab === "Meu painel" ? "Construtor de dashboards" : blocksOnly ? "Blocos do cliente" : "Meta Ads"}
            </p>
          </div>
          {!blocksOnly && tab !== "Meu painel" && <div className="source-chip">
            META ADS <span>FONTE DE MÍDIA</span>
          </div>}
        </header>
        {tab !== "Meu painel" && (blocksOnly || client?.metaConnected) && <div className="toolbar">
          <div className="date-fields">
            <label>
              De{" "}
              <input
                aria-label="Data inicial"
                type="date"
                value={start}
                max={end}
                onChange={(event) => changeDate("start", event.target.value)}
              />
            </label>
            <label>
              Até{" "}
              <input
                aria-label="Data final"
                type="date"
                value={end}
                min={start}
                max={today}
                onChange={(event) => changeDate("end", event.target.value)}
              />
            </label>
          </div>
          <span className="scope-label">
            {blocksOnly ? "Datas aplicam-se apenas aos blocos Meta, quando houver" : <>Recorte:{" "}
            {tab === "Metodologia"
              ? "metodologia"
              : level === "ad"
                ? "anúncios"
                : level === "adset"
                  ? "conjuntos"
                  : "campanhas"}</>}
          </span>
        </div>}
        {logoutError && (
          <div role="alert" className="notice">
            {logoutError}
          </div>
        )}
        {tab !== "Meu painel" && !blocksOnly && end === today && (
          <p className="live-day-note" role="note">
            Dia em andamento: os dados de hoje podem estar incompletos.
          </p>
        )}
        {tab !== "Meu painel" && !blocksOnly && tab !== "Metodologia" &&
          phase === "ready" &&
          data &&
          (data.status === "partial" || data.warnings.length > 0) && (
            <div role="alert" className="notice">
              Consulta parcial:{" "}
              {data.warnings.length
                ? data.warnings.join("; ")
                : "Os dados podem estar incompletos."}
            </div>
          )}
        {tab === "Visão geral" && clientId && !client?.metaConnected && <BlockWorkspace key={clientId} clientId={clientId} tab="overview" admin={session.user.role === "admin"} currency={client?.currency ?? "BRL"} meta={null} />}
        {tab === "Meu painel" && clientId ? (
          <DashboardBuilder key={clientId} clientId={clientId} clientName={client?.name} admin={session.user.role === "admin"} currency={client?.currency ?? "BRL"} metaConnected={Boolean(client?.metaConnected)} />
        ) : tab === "Metodologia" ? (
          <section className="method">
            <h2>O que estes números mostram</h2>
            <p>
              Dados de mídia da Meta Ads para o cliente e período selecionados.
              Cliques representam todos os cliques, não apenas cliques no link.
            </p>
            <div className="method-grid">
              <article>
                <h3>Métricas de mídia</h3>
                <p>
                  Investimento, impressões e cliques são totais do recorte. CTR
                  = cliques totais / impressões. CPM = investimento / impressões
                  × 1.000.
                </p>
              </article>
              <article>
                <h3>Limites da leitura</h3>
                <p>
                  Não há dados de qualidade de leads, CRM, vendas ou CAC
                  validados. Não é possível atribuir resultado comercial a estes
                  números.
                </p>
              </article>
              <article>
                <h3>Outras fontes</h3>
                <p>
                  GA4 pendente de configuração. Sessões do site não são
                  equivalentes a cliques da Meta.
                </p>
              </article>
              <article>
                <h3>Blocos configuráveis</h3>
                <p>Perguntas sem respostas são apenas uma estrutura. Contagens manuais têm fonte e período próprios; não são conciliadas com campanhas Meta nem comprovam atribuição.</p>
              </article>
            </div>
          </section>
        ) : !clientId ? (
          <section className="state-panel">
            <h2>Nenhum cliente disponível</h2>
            <p>Solicite acesso a um cliente para consultar dados de mídia.</p>
          </section>
        ) : blocksOnly ? (
          <BlockWorkspace key={`${clientId}-${blockTab}`} clientId={clientId} tab={blockTab!} admin={session.user.role === "admin"} currency={client?.currency ?? "BRL"} meta={null} metaStart={start} metaEnd={end} />
        ) : end < start ? (
          <p role="alert">
            A data final deve ser igual ou posterior à data inicial.
          </p>
        ) : !client?.metaConnected ? (
          <section className="notice source-unavailable">
            <h2>Meta Ads não conectado</h2>
            <p>Não há métricas de mídia para este cliente. Os blocos configuráveis continuam disponíveis sem ligação com campanhas.</p>
          </section>
        ) : phase === "loading" ? (
          <section className="loading-panel" role="status" aria-busy="true">
            <p>Carregando dados de mídia...</p>
            <div className="skeleton-grid">
              <i />
              <i />
              <i />
              <i />
            </div>
            <i className="skeleton-wide" />
          </section>
        ) : phase === "error" ? (
          <section className="state-panel">
            <h2>Consulta indisponível</h2>
            <p role="alert">{error}</p>
            <button
              onClick={() => {
                setData(null);
                setPhase("loading");
                setRetry((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </section>
        ) : !data?.rows.length ? (
          <section className="state-panel">
            <h2>Nenhum dado de mídia neste período</h2>
            <p>
              Altere as datas ou confirme que a fonte Meta Ads está conectada
              para este cliente.
            </p>
          </section>
        ) : (
          <>
            <div className="data-meta">
              <span>
                Período: {data.dateRange.start} a {data.dateRange.end}
              </span>
              <span>
                Consultado em{" "}
                {new Date(data.collectedAt).toLocaleString("pt-BR")}
              </span>
              <span>
                {data.status === "partial"
                  ? "Consulta parcial"
                  : "Dados recebidos"}
              </span>
            </div>
            <section className="kpi-grid" aria-label="Indicadores de mídia">
              <article>
                <span>Investimento</span>
                <strong>
                  {money(totals?.spend ?? 0, data.client.currency)}
                </strong>
                <small>Total investido na Meta</small>
              </article>
              <article>
                <span>Impressões</span>
                <strong>{number(totals?.impressions ?? 0)}</strong>
                <small>Exibições dos anúncios</small>
              </article>
              <article>
                <span>Cliques totais</span>
                <strong>{number(totals?.clicks ?? 0)}</strong>
                <small>Todos os cliques, não apenas no link</small>
              </article>
              <article>
                <span>CPM</span>
                <strong>
                  {totals &&
                  rate(totals.spend, totals.impressions, 1000) !== null
                    ? money(
                        rate(totals.spend, totals.impressions, 1000)!,
                        data.client.currency,
                      )
                    : "Indisponível"}
                </strong>
                <small>Custo por mil impressões</small>
              </article>
            </section>
          </>
        )}
        {tab === "Visão geral" && clientId && client?.metaConnected && <BlockWorkspace key={clientId} clientId={clientId} tab="overview" admin={session.user.role === "admin"} currency={client?.currency ?? "BRL"} meta={phase === "ready" && data?.client.id === clientId && data.scope.level === "campaign" ? data : null} />}
        {tab !== "Meu painel" && tab !== "Metodologia" && !blocksOnly && phase === "ready" && data && data.rows.length > 0 && end >= start && (
            <section className="detail-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">META ADS / {tab.toUpperCase()}</p>
                  <h2>
                    Distribuição por{" "}
                    {level === "ad"
                      ? "anúncio"
                      : level === "adset"
                        ? "conjunto"
                        : "campanha"}
                  </h2>
                  <p>Valores exclusivamente do período e cliente selecionados.</p>
                </div>
                <button className="export-button" onClick={() => exportCsv(data, sorted)}>Exportar CSV</button>
              </div>
              <DataTable key={`${clientId}-${level}-${start}-${end}`} data={data} sorted={sorted} sort={sort} descending={descending} onSort={changeSort} />
            </section>
        )}
        <footer className="footer-note">
          <span>Meta Ads: mídia, não resultado comercial.</span>
          <span>GA4 pendente · Blocos manuais não são conciliados com a Meta</span>
        </footer>
      </main>
    </div>
  );
}

function exportCsv(data: DashboardResult, visibleRows: Insight[]) {
  const escape = (value: string | number) => {
    const text = String(value);
    const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const header = [
    "cliente",
    "nível",
    "nome",
    "id",
    "início",
    "fim",
    "investimento",
    "impressões",
    "cliques totais",
  ];
  const csv = [
    header,
    ...visibleRows.map((row) => [
      data.client.name,
      data.scope.level,
      nameFor(row, data.scope.level),
      data.scope.level === "ad"
        ? (row.adId ?? "")
        : data.scope.level === "adset"
          ? (row.adsetId ?? "")
          : (row.campaignId ?? ""),
      row.dateStart,
      row.dateStop,
      row.spend,
      row.impressions,
      row.clicks,
    ]),
  ]
    .map((line) => line.map(escape).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `yorus-${data.client.id}-${data.scope.level}-${data.dateRange.start}-${data.dateRange.end}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
