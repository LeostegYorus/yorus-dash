import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardBuilder from "../components/dashboard-builder";
import { parseBuilderDocument } from "../../lib/builder-types";

const reply = (value: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const props = { clientId: "alpha", admin: true, currency: "BRL", metaConnected: false };
function store(initial: { version: number; datasets: unknown[]; widgets: unknown[] } = { version: 0, datasets: [], widgets: [] }) {
  let document = initial;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== "/api/clients/alpha/builder") return reply({}, 503);
    if (init?.method === "PUT") {
      const payload = parseBuilderDocument(JSON.parse(String(init.body)));
      expect(payload.version).toBe(document.version);
      document = { ...payload, version: document.version + 1 };
    }
    return reply(document);
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, get document() { return document; } };
}
afterEach(() => vi.unstubAllGlobals());
const dataset = { id: "1e4162b2-4bc9-40a0-966e-e7882d8b2080", name: "Leads", sourceLabel: "Planilha comercial", periodStart: "2026-08-01", periodEnd: "2026-08-31", fields: [{ id: "taxa", label: "Taxa", type: "number" }, { id: "canal", label: "Canal", type: "text" }], rows: [{ taxa: 0.25, canal: "Site" }, { taxa: 0.5, canal: "Busca" }] };
const manualWidget = { id: "c4cc1c7d-869a-4e1c-871d-e1f3c7d425a1", kind: "data", title: "Conversão", width: 6, source: { kind: "manual", datasetId: dataset.id }, visualization: "metric", measure: "taxa", aggregation: "avg", format: "number" };
const metaWidget = { id: "73c02eab-f267-44f4-93e5-e72fd58a18e1", kind: "data", title: "Gasto", width: 6, source: { kind: "meta", level: "campaign" }, visualization: "metric", measure: "spend", aggregation: "sum", format: "currency" };

it("creates a manual dataset and data widget with versioned persistence", async () => {
  const api = store();
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("button", { name: "Novo conjunto manual" }));
  await user.type(screen.getByLabelText("Nome do conjunto"), "Vendas");
  await user.type(screen.getByLabelText("Fonte do conjunto"), "Planilha financeira");
  await user.type(screen.getByLabelText("Início do período manual"), "2026-08-01");
  await user.type(screen.getByLabelText("Fim do período manual"), "2026-08-31");
  await user.type(screen.getByLabelText("Nome do campo"), "Canal");
  await user.click(screen.getByRole("button", { name: "Adicionar campo" }));
  await user.type(screen.getByLabelText("Nome do campo"), "Receita");
  await user.selectOptions(screen.getByLabelText("Tipo do campo"), "number");
  await user.click(screen.getByRole("button", { name: "Adicionar campo" }));
  await user.click(screen.getByRole("button", { name: "Adicionar linha" }));
  await user.type(screen.getByLabelText("Linha 1: Canal"), "Site");
  await user.type(screen.getByLabelText("Linha 1: Receita"), "120.5");
  await user.click(screen.getByRole("button", { name: "Salvar conjunto" }));
  await waitFor(() => expect(api.document.datasets).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Adicionar visualização" }));
  await user.type(screen.getByLabelText("Título da visualização"), "Receita total");
  await user.selectOptions(screen.getByLabelText("Medida"), "receita");
  await user.selectOptions(screen.getByLabelText("Formato"), "currency");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  const card = await screen.findByRole("article", { name: "Receita total" });
  expect(within(card).getByText(/R\$\s?120,50/)).toBeInTheDocument();
  expect(api.document.widgets).toMatchObject([{ title: "Receita total", kind: "data", source: { kind: "manual" }, measure: "receita", format: "currency" }]);
  expect(api.document.datasets).toMatchObject([{ name: "Vendas", fields: [{ id: "canal", type: "text" }, { id: "receita", type: "number" }], rows: [{ canal: "Site", receita: 120.5 }] }]);
  expect(api.fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2);
});

it("selects a chart on the canvas and persists its width and height from the inspector", async () => {
  const api = store({ version: 1, datasets: [dataset], widgets: [manualWidget] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  await user.click(card);
  await user.selectOptions(screen.getByLabelText("Largura no canvas"), "8");
  await waitFor(() => expect(api.document.widgets[0]).toMatchObject({ width: 8, position: { x: 0, y: 0, height: 5 } }));
  await user.selectOptions(screen.getByLabelText("Altura no canvas"), "7");
  await waitFor(() => expect(api.document.widgets[0]).toMatchObject({ width: 8, position: { x: 0, y: 0, height: 7 } }));
  expect(card).toHaveAttribute("data-selected", "true");
});

it("drags a selected chart two columns and resizes it on the canvas, saving both coordinates", async () => {
  const api = store({ version: 1, datasets: [dataset], widgets: [manualWidget] });
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  const grid = card.closest(".builder-grid") as HTMLElement;
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ width: 1200, height: 1000, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 1000, toJSON: () => ({}) });
  const grip = within(card).getByRole("button", { name: "Arrastar Conversão" });
  fireEvent.pointerDown(grip, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 300, clientY: 188 });
  fireEvent.pointerUp(grip, { pointerId: 1, clientX: 300, clientY: 188 });
  await waitFor(() => expect(api.document.widgets[0]).toMatchObject({ width: 6, position: { x: 2, y: 2, height: 5 } }));
  const handle = within(card).getByRole("button", { name: "Redimensionar Conversão" });
  fireEvent.pointerDown(handle, { pointerId: 2, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 300, clientY: 188 });
  fireEvent.pointerUp(handle, { pointerId: 2, clientX: 300, clientY: 188 });
  await waitFor(() => expect(api.document.widgets[0]).toMatchObject({ width: 8, position: { x: 2, y: 2, height: 7 } }));
});

it("does not write a document when a chart handle is pressed without moving", async () => {
  const api = store({ version: 1, datasets: [dataset], widgets: [manualWidget] });
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  const grid = card.closest(".builder-grid") as HTMLElement;
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({ width: 1200, height: 1000, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 1000, toJSON: () => ({}) });
  const grip = within(card).getByRole("button", { name: "Arrastar Conversão" });
  fireEvent.pointerDown(grip, { pointerId: 4, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(grip, { pointerId: 4, clientX: 100, clientY: 100 });
  expect(api.fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

it("does not save a chart when a keyboard move hits the canvas edge", async () => {
  const api = store({ version: 1, datasets: [dataset], widgets: [manualWidget] });
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  fireEvent.keyDown(within(card).getByRole("button", { name: "Arrastar Conversão" }), { key: "ArrowLeft" });
  expect(api.fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

it("keeps a chart's placed geometry when editing its data title", async () => {
  const placed = { ...manualWidget, width: 8, position: { x: 2, y: 2, height: 7 } };
  const api = store({ version: 1, datasets: [dataset], widgets: [placed] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("article", { name: "Conversão" }));
  await user.click(screen.getByRole("button", { name: "Editar dados e formato" }));
  await user.clear(screen.getByLabelText("Título da visualização"));
  await user.type(screen.getByLabelText("Título da visualização"), "Conversão revisada");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  await waitFor(() => expect(api.document.widgets[0]).toMatchObject({ title: "Conversão revisada", width: 8, position: { x: 2, y: 2, height: 7 } }));
});

it("adds a connected Meta bar chart to an empty canvas from the chart palette", async () => {
  const api = store();
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} metaConnected />);
  await user.click(await screen.findByRole("button", { name: "Adicionar gráfico de barras" }));
  await waitFor(() => expect(api.document.widgets).toHaveLength(1));
  expect(api.document.widgets[0]).toMatchObject({ kind: "data", source: { kind: "meta", level: "campaign" }, visualization: "bar", dimension: "campaignName", measure: "spend", position: { x: 0, y: 0, height: 7 } });
  const chart = await screen.findByRole("article", { name: "Gasto por campanha" });
  expect(chart).toHaveAttribute("data-selected", "true");
  expect(within(chart).getByRole("button", { name: "Redimensionar Gasto por campanha" })).toBeInTheDocument();
});

it("clamps a chart inside the canvas when its width is changed in the edit form", async () => {
  const placed = { ...manualWidget, position: { x: 6, y: 0, height: 5 } };
  const api = store({ version: 1, datasets: [dataset], widgets: [placed] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("article", { name: "Conversão" }));
  await user.click(screen.getByRole("button", { name: "Editar dados e formato" }));
  await user.selectOptions(screen.getByLabelText("Largura"), "8");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  await waitFor(() => expect(api.document.widgets[0]).toMatchObject({ width: 8, position: { x: 4, y: 0, height: 5 } }));
});

it("does not let a viewer manipulate the canvas", async () => {
  store({ version: 1, datasets: [dataset], widgets: [manualWidget] });
  render(<DashboardBuilder {...props} admin={false} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  expect(within(card).queryByRole("button", { name: /Redimensionar Conversão/ })).not.toBeInTheDocument();
  expect(within(card).queryByRole("button", { name: /Mover Conversão/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Largura no canvas")).not.toBeInTheDocument();
});

it("formats the average of manual numeric rows without a Meta date filter", async () => {
  store({ version: 3, datasets: [dataset], widgets: [manualWidget] });
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  expect(within(card).getByText("0,38")).toBeInTheDocument();
  expect(within(card).getByText(/Planilha comercial/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Início Meta")).not.toBeInTheDocument();
});

it("makes viewer read-only while rendering saved widgets", async () => {
  const api = store({ version: 2, datasets: [dataset], widgets: [manualWidget] });
  render(<DashboardBuilder {...props} admin={false} />);
  expect(await screen.findByRole("article", { name: "Conversão" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Adicionar visualização" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Novo conjunto manual" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Editar Conversão/ })).not.toBeInTheDocument();
  expect(api.fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

it("discards an old client's late response on prop switch", async () => {
  let oldReply!: (response: unknown) => void;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "PUT") return Promise.resolve(reply({}, 503));
    if (url === "/api/clients/alpha/builder") return new Promise(resolve => { oldReply = resolve; });
    if (url === "/api/clients/beta/builder") return Promise.resolve(reply({ version: 0, datasets: [], widgets: [] }));
    return Promise.resolve(reply({}, 503));
  });
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<DashboardBuilder {...props} />);
  await waitFor(() => expect(oldReply).toBeDefined());
  rerender(<DashboardBuilder {...props} clientId="beta" />);
  expect(await screen.findByText("Canvas vazio")).toBeInTheDocument();
  oldReply(reply({ version: 1, datasets: [dataset], widgets: [manualWidget] }));
  expect(screen.queryByRole("article", { name: "Conversão" })).not.toBeInTheDocument();
  expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
});

it("keeps disconnected Meta unavailable without a dashboard request or percent editor option", async () => {
  const api = store({ version: 1, datasets: [], widgets: [metaWidget] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Gasto" });
  expect(within(card).getByText("Meta Ads não conectado.")).toBeInTheDocument();
  expect(api.fetcher.mock.calls.some(([url]) => url.startsWith("/api/dashboard?"))).toBe(false);
  expect(screen.getByText("GA4").closest(".builder-source")).toHaveTextContent("Não conectado");
  await user.click(screen.getByRole("button", { name: "Adicionar visualização" }));
  expect(within(screen.getByLabelText("Fonte")).queryByRole("option", { name: "Meta Ads" })).not.toBeInTheDocument();
});

it("creates a backend-compatible hyphenated slug for multiword field labels", async () => {
  const api = store();
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("button", { name: "Novo conjunto manual" }));
  await user.type(screen.getByLabelText("Nome do conjunto"), "Custos");
  await user.type(screen.getByLabelText("Fonte do conjunto"), "Planilha");
  await user.type(screen.getByLabelText("Início do período manual"), "2026-08-01");
  await user.type(screen.getByLabelText("Fim do período manual"), "2026-08-31");
  await user.type(screen.getByLabelText("Nome do campo"), "Valor informado");
  await user.selectOptions(screen.getByLabelText("Tipo do campo"), "number");
  await user.click(screen.getByRole("button", { name: "Adicionar campo" }));
  await user.click(screen.getByRole("button", { name: "Salvar conjunto" }));
  await waitFor(() => expect(api.document.datasets).toHaveLength(1));
  expect((api.document.datasets[0] as typeof dataset).fields[0].id).toBe("valor-informado");
});

it("isolates invalid Meta responses per widget and never shows their rows", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith("/api/clients/")) return reply({ version: 1, datasets: [dataset], widgets: [manualWidget, metaWidget] });
    const query = new URL(url, "https://local.test").searchParams;
    return reply({ provider: "meta", client: { id: "another-client" }, scope: { level: "campaign" }, dateRange: { start: query.get("start"), end: query.get("end") }, status: "succeeded", warnings: [], rows: [{ spend: 999, clicks: 5, impressions: 100 }] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<DashboardBuilder {...props} metaConnected />);
  expect(await within(await screen.findByRole("article", { name: "Gasto" })).findByText(/Resposta Meta não corresponde/)).toBeInTheDocument();
  expect(within(screen.getByRole("article", { name: "Conversão" })).getByText("0,38")).toBeInTheDocument();
  expect(screen.queryByText(/R\$\s?999/)).not.toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([url]) => url.startsWith("/api/dashboard?"))).toHaveLength(1);
});

it("handles optimistic version conflicts without claiming the widget saved", async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PUT" ? reply({}, 409) : reply({ version: 4, datasets: [dataset], widgets: [manualWidget] }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("article", { name: "Conversão" }));
  await user.click(screen.getByRole("button", { name: "Editar dados e formato" }));
  await user.clear(screen.getByLabelText("Título da visualização"));
  await user.type(screen.getByLabelText("Título da visualização"), "Alteração local");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Outra pessoa alterou/);
  expect(screen.getByRole("button", { name: "Recarregar painel" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Conversão" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Alteração local" })).not.toBeInTheDocument();
});

it("rejects malformed builder responses without crashing the workspace", async () => {
  const fetcher = vi.fn(async () => reply({ version: 1, blocks: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<DashboardBuilder {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/resposta|carregar/i);
  expect(screen.queryByRole("button", { name: "Adicionar visualização" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
});

it("requires a dimension for grouped bars before sending a widget", async () => {
  const api = store({ version: 1, datasets: [dataset], widgets: [] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("button", { name: "Adicionar visualização" }));
  await user.type(screen.getByLabelText("Título da visualização"), "Por canal");
  await user.selectOptions(screen.getByLabelText("Visualização"), "bar");
  await user.selectOptions(screen.getByLabelText("Medida"), "taxa");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/dimensão/);
  expect(api.fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  await user.selectOptions(screen.getByLabelText("Dimensão"), "canal");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  await waitFor(() => expect(api.document.widgets).toHaveLength(1));
  expect(api.document.widgets[0]).toMatchObject({ visualization: "bar", dimension: "canal" });
  expect(within(screen.getByRole("article", { name: "Por canal" })).getByText("Busca")).toBeInTheDocument();
});

it("requires text content before persisting a text widget", async () => {
  const api = store();
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("button", { name: "Adicionar visualização" }));
  await user.selectOptions(screen.getByLabelText("Tipo"), "text");
  await user.type(screen.getByLabelText("Título da visualização"), "Nota");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/conteúdo/);
  expect(api.document.widgets).toHaveLength(0);
  await user.type(screen.getByLabelText("Conteúdo"), "Resultado informado pela equipe.");
  await user.selectOptions(screen.getByLabelText("Largura"), "12");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  await waitFor(() => expect(api.document.widgets).toHaveLength(1));
  expect(api.document.widgets[0]).toMatchObject({ kind: "text", width: 12, body: "Resultado informado pela equipe." });
});

it("moves a chart by keyboard and relocates an occupied tile", async () => {
  const note = { id: "8b956e8e-2fd7-407f-8378-d0fb98579447", kind: "text", title: "Contexto", width: 6, body: "Leitura do período." };
  const api = store({ version: 2, datasets: [dataset], widgets: [note, manualWidget] });
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  fireEvent.keyDown(within(card).getByRole("button", { name: "Arrastar Conversão" }), { key: "ArrowLeft" });
  await waitFor(() => expect(api.document.widgets[1]).toMatchObject({ position: { x: 5, y: 0, height: 5 } }));
  expect(api.document.widgets[0]).toMatchObject({ position: { x: 0, y: 5, height: 5 } });
});

it("does not present an explicitly null manual numeric cell as a measured zero", async () => {
  const emptyMeasure = { ...dataset, rows: [{ canal: "Site", taxa: null }] };
  const input = { version: 1, datasets: [emptyMeasure], widgets: [manualWidget] };
  expect(parseBuilderDocument(input).datasets[0].rows[0].taxa).toBeNull();
  store(input);
  render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole("article", { name: "Conversão" });
  expect(within(card).getByText("Sem valores informados")).toBeInTheDocument();
  expect(within(card).queryByText("0")).not.toBeInTheDocument();
});

it("counts rows from a text field without inventing numeric values", async () => {
  const textOnly = { ...dataset, fields: [{ id: "canal", label: "Canal", type: "text" }], rows: [{ canal: "Site" }, { canal: "Busca" }] };
  const api = store({ version: 1, datasets: [textOnly], widgets: [] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole("button", { name: "Adicionar visualização" }));
  await user.type(screen.getByLabelText("Título da visualização"), "Leads registrados");
  await user.selectOptions(screen.getByLabelText("Agregação"), "count");
  expect(within(screen.getByLabelText("Medida")).getByRole("option", { name: "Canal" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Medida"), "canal");
  await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
  await waitFor(() => expect(api.document.widgets).toHaveLength(1));
  expect(within(screen.getByRole("article", { name: "Leads registrados" })).getByText("2")).toBeInTheDocument();
});

it("does not offer percent for raw Meta measures", async () => {
  store({ version: 1, datasets: [dataset], widgets: [metaWidget] });
  const user = userEvent.setup();
  render(<DashboardBuilder {...props} metaConnected />);
  await user.click(await screen.findByRole("article", { name: "Gasto" }));
  await user.click(screen.getByRole("button", { name: "Editar dados e formato" }));
  expect(within(screen.getByLabelText("Formato")).queryByRole("option", { name: /Percentual/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Fonte"), "manual");
  expect(within(screen.getByLabelText("Formato")).queryByRole("option", { name: /Percentual/ })).not.toBeInTheDocument();
});
