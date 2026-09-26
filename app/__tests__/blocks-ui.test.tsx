import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard, { type Session } from "../components/dashboard";

const session: Session = {
  user: { email: "reader@example.test", role: "viewer" },
  clients: [
    { id: "alpha", name: "Cliente Alpha", currency: "BRL", metaConnected: true, gaConnected: false },
    { id: "beta", name: "Cliente Beta", currency: "BRL", metaConnected: true, gaConnected: false },
  ],
};
const question = {
  id: "d991b68d-f347-42e9-af44-6148e84a47ec",
  kind: "question",
  tab: "profile",
  title: "Momento de compra",
  question: "Quando pretende comprar?",
  options: [{ label: "Agora", count: null }, { label: "Depois", count: null }],
  updatedAt: "2026-09-26T12:00:00.000Z",
};
const json = (value: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
function mockRequests(handler: (url: string, init?: RequestInit) => Promise<unknown>) {
  const mock = vi.fn((url: string, init?: RequestInit) =>
    url.endsWith("/builder") ? Promise.resolve(json({ version: 0, datasets: [], widgets: [] })) : handler(url, init));
  vi.stubGlobal("fetch", mock);
  return mock;
}
afterEach(() => vi.unstubAllGlobals());

it("opens a manual-block preview without querying an unconfigured Meta source", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" }, clients: session.clients.map(client => ({ ...client, metaConnected: false })) };
  const demoNote = { id: "d5159d6f-4bb1-430b-a5cd-88a6c6f28850", kind: "note", tab: "overview", title: "Dados de demonstração", body: "Exemplo sintético.", evidenceType: "hypothesis", updatedAt: "2026-09-26T12:00:00.000Z" };
  const requests = mockRequests(async url => url.startsWith("/api/clients/")
    ? json({ version: 1, blocks: [demoNote] })
    : json({}, 503));
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Visão geral" }));
  expect(await screen.findByRole("article", { name: "Dados de demonstração" })).toBeInTheDocument();
  expect(screen.getByText(/meta ads não conectado/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Meta Ads não conectado" }).closest("section")).toHaveClass("source-unavailable");
  expect(screen.queryByText("Consulta indisponível")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
  expect(requests.mock.calls.some(([url]) => url.startsWith("/api/dashboard?"))).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  expect(await screen.findByRole("button", { name: "Adicionar bloco" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Campanhas" }));
  expect(screen.getByText(/meta ads não conectado/i)).toBeInTheDocument();
  expect(requests.mock.calls.some(([url]) => url.startsWith("/api/dashboard?"))).toBe(false);
});

it("shows configured questions independently of a failed Meta request without inventing responses", async () => {
  mockRequests(async (url) => url.startsWith("/api/clients/")
    ? json({ version: 1, blocks: [question] })
    : json({}, 503));
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  expect(await screen.findByText("Quando pretende comprar?")).toBeInTheDocument();
  expect(screen.getByText("Pergunta configurada · Sem contagens informadas")).toBeInTheDocument();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Adicionar bloco" })).not.toBeInTheDocument();
});

it("clears old blocks immediately and ignores a late response after switching clients", async () => {
  let resolveOld!: (value: unknown) => void;
  mockRequests(async (url) => {
    if (url === "/api/clients/alpha/blocks") return new Promise(resolve => { resolveOld = resolve; });
    if (url === "/api/clients/beta/blocks") return json({ version: 0, blocks: [] });
    return json({}, 503);
  });
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  await waitFor(() => expect(resolveOld).toBeDefined());
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Cliente" }), "beta");
  expect(await screen.findByText(/nenhum bloco neste espaço/i)).toBeInTheDocument();
  resolveOld(json({ version: 1, blocks: [question] }));
  expect(screen.queryByText("Quando pretende comprar?")).not.toBeInTheDocument();
});

it("removes loaded client A blocks synchronously when client B is selected", async () => {
  let releaseBeta!: (value: unknown) => void;
  mockRequests(async url => {
    if (url === "/api/clients/alpha/blocks") return json({ version: 1, blocks: [question] });
    if (url === "/api/clients/beta/blocks") return new Promise(resolve => { releaseBeta = resolve; });
    return json({}, 503);
  });
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  expect(await screen.findByText("Quando pretende comprar?")).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Cliente" }), "beta");
  expect(screen.queryByText("Quando pretende comprar?")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveValue("beta");
  await waitFor(() => expect(releaseBeta).toBeDefined());
  releaseBeta(json({ version: 0, blocks: [] }));
  expect(await screen.findByText(/nenhum bloco neste espaço/i)).toBeInTheDocument();
});

it("does not apply an old client's delayed save response to the newly selected client", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  let releaseSave!: (value: unknown) => void;
  const betaNote = { id: "bf31f412-8ec4-4026-af81-58a1ba9247b1", kind: "note", tab: "profile", title: "Somente Beta", body: "Informação de Beta", evidenceType: "hypothesis", updatedAt: "2026-09-26T12:00:00.000Z" };
  mockRequests(async (url, init) => {
    if (url === "/api/clients/alpha/blocks" && init?.method === "PUT") return new Promise(resolve => { releaseSave = resolve; });
    if (url === "/api/clients/alpha/blocks") return json({ version: 1, blocks: [question] });
    if (url === "/api/clients/beta/blocks") return json({ version: 1, blocks: [betaNote] });
    return json({}, 503);
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const card = await screen.findByRole("article", { name: "Momento de compra" });
  await userEvent.click(within(card).getByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  await waitFor(() => expect(releaseSave).toBeDefined());
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Cliente" }), "beta");
  expect(await screen.findByRole("article", { name: "Somente Beta" })).toBeInTheDocument();
  releaseSave(json({ version: 2, blocks: [question] }));
  expect(screen.getByRole("article", { name: "Somente Beta" })).toBeInTheDocument();
  expect(screen.queryByText("Quando pretende comprar?")).not.toBeInTheDocument();
});

it("closes the block editor when navigating between client sections", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  mockRequests(async url => url.startsWith("/api/clients/")
    ? json({ version: 1, blocks: [question] })
    : json({}, 503));
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const card = await screen.findByRole("article", { name: "Momento de compra" });
  await userEvent.click(within(card).getByRole("button", { name: "Editar" }));
  expect(screen.getByLabelText("Título do bloco")).toHaveValue("Momento de compra");
  await userEvent.click(screen.getByRole("button", { name: "Custos e decisão" }));
  expect(await screen.findByRole("button", { name: "Adicionar bloco" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Título do bloco")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Adicionar bloco" }));
  expect(screen.getByLabelText("Seção do painel")).toHaveValue("costs");
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  expect(await screen.findByRole("button", { name: "Adicionar bloco" })).toBeInTheDocument();
});

it("lets an admin create, edit, move and confirm deletion of a note", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  let doc = { version: 0, blocks: [] as Array<Record<string, unknown>> };
  const requests = mockRequests(async (url, init) => {
    if (url.startsWith("/api/dashboard")) return json({}, 503);
    if (init?.method === "PUT") {
      const incoming = JSON.parse(String(init.body));
      expect(incoming.version).toBe(doc.version);
      doc = { version: doc.version + 1, blocks: incoming.blocks };
      return json(doc);
    }
    return json(doc);
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Custos e decisão" }));
  await userEvent.click(await screen.findByRole("button", { name: "Adicionar bloco" }));
  await userEvent.selectOptions(screen.getByLabelText("Tipo de bloco"), "note");
  await userEvent.type(screen.getByLabelText("Título do bloco"), "Próxima ação");
  await userEvent.type(screen.getByLabelText("Conteúdo"), "Revisar o formulário.");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  const card = await screen.findByRole("article", { name: "Próxima ação" });
  expect(within(card).getByText("Revisar o formulário.")).toBeInTheDocument();
  expect(doc.blocks[0]).toMatchObject({ kind: "note", tab: "costs", title: "Próxima ação" });
  await userEvent.click(within(card).getByRole("button", { name: "Editar" }));
  await userEvent.clear(screen.getByLabelText("Conteúdo"));
  await userEvent.type(screen.getByLabelText("Conteúdo"), "Conferir as perguntas.");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  expect(await screen.findByText("Conferir as perguntas.")).toBeInTheDocument();
  const editedCard = screen.getByRole("article", { name: "Próxima ação" });
  await userEvent.click(within(editedCard).getByRole("button", { name: "Excluir" }));
  expect(within(editedCard).getByText(/excluir este bloco/i)).toBeInTheDocument();
  await userEvent.click(within(editedCard).getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(screen.queryByText("Conferir as perguntas.")).not.toBeInTheDocument());
  expect(requests.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(3);
});

it("does not re-fetch or hide configured blocks when Meta resolves later", async () => {
  let releaseMeta!: (value: unknown) => void;
  const requests = mockRequests(async url => url.startsWith("/api/clients/")
    ? json({ version: 1, blocks: [{ ...question, tab: "overview" }] })
    : new Promise(resolve => { releaseMeta = resolve; }));
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Visão geral" }));
  expect(await screen.findByText("Quando pretende comprar?")).toBeInTheDocument();
  releaseMeta(json({ client: session.clients[0], provider: "meta", scope: { account: "act_1", level: "campaign" }, dateRange: { start: "2026-09-01", end: "2026-09-10" }, collectedAt: "2026-09-11T10:00:00Z", status: "succeeded", warnings: [], rows: [{ campaignName: "Campanha Alpha", spend: 40, impressions: 2000, clicks: 20, dateStart: "2026-09-01", dateStop: "2026-09-10" }] }));
  expect(await screen.findByText("Campanha Alpha")).toBeInTheDocument();
  expect(screen.getByText("Quando pretende comprar?")).toBeInTheDocument();
  expect(requests.mock.calls.filter(([url]) => url.endsWith("/blocks"))).toHaveLength(1);
});

it("rejects an ambiguous BRL amount rather than sending a misparsed investment", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  const requests = mockRequests(async url => url.startsWith("/api/clients/") ? json({ version: 0, blocks: [] }) : json({}, 503));
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Custos e decisão" }));
  await userEvent.click(await screen.findByRole("button", { name: "Adicionar bloco" }));
  await userEvent.selectOptions(screen.getByLabelText("Tipo de bloco"), "investment");
  await userEvent.type(screen.getByLabelText("Título do bloco"), "Valor" );
  await userEvent.type(screen.getByLabelText(/Valor em BRL/), "1.234,56");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/sem separador de milhar/i);
  expect(requests.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

it("accepts BRL comma decimals exactly as centavos", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  let saved: Record<string, unknown> | null = null;
  mockRequests(async (url, init) => {
    if (url.startsWith("/api/dashboard")) return json({}, 503);
    if (init?.method === "PUT") { saved = JSON.parse(String(init.body)); return json({ version: 1, blocks: (saved as { blocks: unknown[] }).blocks }); }
    return json({ version: 0, blocks: [] });
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Custos e decisão" }));
  await userEvent.click(await screen.findByRole("button", { name: "Adicionar bloco" }));
  await userEvent.selectOptions(screen.getByLabelText("Tipo de bloco"), "investment");
  await userEvent.type(screen.getByLabelText("Título do bloco"), "Valor de julho");
  await userEvent.type(screen.getByLabelText(/Valor em BRL/), "1234,56");
  await userEvent.type(screen.getByLabelText("Início do período"), "2026-07-01");
  await userEvent.type(screen.getByLabelText("Fim do período"), "2026-07-31");
  await userEvent.type(screen.getByLabelText("Fonte do valor"), "Financeiro");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  await waitFor(() => expect(saved).not.toBeNull());
  expect((saved as unknown as { blocks: Array<{ amountCents: number }> }).blocks[0].amountCents).toBe(123456);
});

it("shows proportional distribution bars only for actual positive response totals", async () => {
  const withCounts = { ...question, id: "bd540879-121a-4b82-b994-127397971f99", title: "Finalidade", options: [{ label: "Moradia", count: 3 }, { label: "Investimento", count: 1 }], sourceLabel: "Formulário agregado", periodStart: "2026-08-01", periodEnd: "2026-08-31" };
  mockRequests(async url => url.startsWith("/api/clients/") ? json({ version: 1, blocks: [question, withCounts] }) : json({}, 503));
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const unknown = await screen.findByRole("article", { name: "Momento de compra" });
  const measured = screen.getByRole("article", { name: "Finalidade" });
  expect(within(unknown).getAllByText("não informado")).toHaveLength(2);
  expect(within(unknown).queryByTestId("distribution-bar")).not.toBeInTheDocument();
  expect(within(unknown).queryByText(/%/)).not.toBeInTheDocument();
  expect(within(measured).getAllByTestId("distribution-bar")).toHaveLength(2);
  expect(within(measured).getByText(/4 marcações agregadas informadas/)).toBeInTheDocument();
  expect(within(measured).getByText(/participação das marcações, não percentual de pessoas/i)).toBeInTheDocument();
  expect(within(measured).getByText(/2026-08-01 a 2026-08-31/)).toBeInTheDocument();
  expect(screen.getByText("Os filtros de mídia não alteram os dados informados manualmente.")).toBeInTheDocument();
});

it("requires explicit confirmation before replacing an alternative with recorded counts", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  const counted = { ...question, options: [{ label: "Agora", count: 3 }, { label: "Depois", count: 1 }], sourceLabel: "Formulário", periodStart: "2026-08-01", periodEnd: "2026-08-31" };
  const requests = mockRequests(async (url, init) => {
    if (url.startsWith("/api/dashboard")) return json({}, 503);
    if (init?.method === "PUT") return json({ version: 2, blocks: JSON.parse(String(init.body)).blocks });
    return json({ version: 1, blocks: [counted] });
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const card = await screen.findByRole("article", { name: "Momento de compra" });
  await userEvent.click(within(card).getByRole("button", { name: "Editar" }));
  await userEvent.clear(screen.getByLabelText("Alternativa 1"));
  await userEvent.type(screen.getByLabelText("Alternativa 1"), "Imediatamente");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  expect(requests.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  expect(screen.getByText(/alterar ou remover alternativas com contagens muda o significado/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Confirmar alteração das alternativas" }));
  await waitFor(() => expect(requests.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1));
});

it("moves adjacent blocks within the selected tab while retaining the document version", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  const first = { ...question, tab: "profile", title: "Primeiro" };
  const second = { ...question, tab: "profile", id: "a0873fab-618a-4455-bad0-1acd15bce005", title: "Segundo" };
  let saved: { version: number; blocks: Array<{ title: string }> } | null = null;
  mockRequests(async (url, init) => {
    if (url.startsWith("/api/dashboard")) return json({}, 503);
    if (init?.method === "PUT") { saved = JSON.parse(String(init.body)); return json({ ...saved, version: 4 }); }
    return json({ version: 3, blocks: [first, second] });
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const secondCard = await screen.findByRole("article", { name: "Segundo" });
  await userEvent.click(within(secondCard).getByRole("button", { name: "Mover Segundo para cima" }));
  await waitFor(() => expect(saved).not.toBeNull());
  expect(saved).toMatchObject({ version: 3, blocks: [{ title: "Segundo" }, { title: "Primeiro" }] });
});

it("loads Meta investment on costs without treating manual blocks as Meta spend", async () => {
  const metaBlock = { id: "876fa542-1243-42aa-b244-b6fa33c00212", kind: "investment", source: "meta", tab: "costs", title: "Gasto Meta", updatedAt: "2026-09-26T12:00:00.000Z" };
  const requests = mockRequests(async url => url.startsWith("/api/clients/") ? json({ version: 1, blocks: [metaBlock] }) : json({ client: session.clients[0], provider: "meta", scope: { account: "act_1", level: "campaign" }, dateRange: { start: new URL(url, "http://localhost").searchParams.get("start"), end: new URL(url, "http://localhost").searchParams.get("end") }, collectedAt: "2026-09-11T10:00:00Z", status: "succeeded", warnings: [], rows: [{ campaignName: "A", spend: 40, impressions: 2000, clicks: 20, dateStart: "2026-09-01", dateStop: "2026-09-10" }] }));
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Custos e decisão" }));
  const card = await screen.findByRole("article", { name: "Gasto Meta" });
  expect(await within(card).findByText(/R\$\s?40,00/)).toBeInTheDocument();
  expect(within(card).getByText(/Fonte: Meta Ads/)).toBeInTheDocument();
  expect(requests.mock.calls.some(([url]) => url.startsWith("/api/dashboard?") && url.includes("level=campaign"))).toBe(true);
});

it("loads a Meta investment block when placed in lead profile with its own date filter", async () => {
  const metaBlock = { id: "d293b7a3-2445-4e92-8c8b-c80b0e5b013c", kind: "investment", source: "meta", tab: "profile", title: "Gasto de mídia", updatedAt: "2026-09-26T12:00:00.000Z" };
  const requests = mockRequests(async url => url.startsWith("/api/clients/") ? json({ version: 1, blocks: [metaBlock] }) : json({ client: session.clients[0], provider: "meta", scope: { account: "act_1", level: "campaign" }, dateRange: { start: new URL(url, "http://localhost").searchParams.get("start"), end: new URL(url, "http://localhost").searchParams.get("end") }, collectedAt: "2026-09-11T10:00:00Z", status: "succeeded", warnings: [], rows: [{ campaignName: "A", spend: 40, impressions: 2000, clicks: 20, dateStart: "2026-09-01", dateStop: "2026-09-10" }] }));
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const card = await screen.findByRole("article", { name: "Gasto de mídia" });
  expect(await within(card).findByText(/R\$\s?40,00/)).toBeInTheDocument();
  expect(screen.getByLabelText("Data inicial")).toBeInTheDocument();
  expect(requests.mock.calls.some(([url]) => url.startsWith("/api/dashboard?") && url.includes("level=campaign"))).toBe(true);
});

it("keeps manual investment distinct from Meta totals and labels its own provenance", async () => {
  const investment = { id: "3b2c5f6d-9d14-4c07-b6da-100cf64b9001", kind: "investment", tab: "overview", title: "Orçamento informado", source: "manual", amountCents: 123400, periodStart: "2026-07-01", periodEnd: "2026-07-31", sourceLabel: "Planilha financeira", updatedAt: "2026-09-26T12:00:00.000Z" };
  mockRequests(async url => url.startsWith("/api/clients/")
    ? json({ version: 2, blocks: [investment] })
    : json({ client: session.clients[0], provider: "meta", scope: { account: "act_1", level: "campaign" }, dateRange: { start: "2026-09-01", end: "2026-09-10" }, collectedAt: "2026-09-11T10:00:00Z", status: "succeeded", warnings: [], rows: [{ campaignName: "Campanha Alpha", spend: 40, impressions: 2000, clicks: 20, dateStart: "2026-09-01", dateStop: "2026-09-10" }] }));
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Visão geral" }));
  const card = await screen.findByRole("article", { name: "Orçamento informado" });
  expect(within(card).getByText(/R\$\s?1\.234,00/)).toBeInTheDocument();
  expect(within(card).getByText(/informado manualmente/i)).toBeInTheDocument();
  expect(within(card).getByText(/Planilha financeira/)).toBeInTheDocument();
  expect(within(card).getByText(/2026-07-01 a 2026-07-31/)).toBeInTheDocument();
  expect(screen.getByText("Os filtros de mídia não alteram os dados informados manualmente.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Indicadores de mídia" })).toHaveTextContent(/R\$\s?40,00/);
});

it("moves an edited block to a different panel section without recreating it", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  let document = { version: 1, blocks: [question] };
  const requests = mockRequests(async (url, init) => {
    if (url.startsWith("/api/dashboard")) return json({}, 503);
    if (init?.method === "PUT") { const incoming = JSON.parse(String(init.body)); document = { version: 2, blocks: incoming.blocks }; return json(document); }
    return json(document);
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const card = await screen.findByRole("article", { name: "Momento de compra" });
  await userEvent.click(within(card).getByRole("button", { name: "Editar" }));
  await userEvent.selectOptions(screen.getByLabelText("Seção do painel"), "costs");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  await waitFor(() => expect(screen.queryByRole("article", { name: "Momento de compra" })).not.toBeInTheDocument());
  expect(requests.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  expect(document.blocks[0]).toMatchObject({ id: question.id, tab: "costs" });
  await userEvent.click(screen.getByRole("button", { name: "Custos e decisão" }));
  expect(await screen.findByRole("article", { name: "Momento de compra" })).toBeInTheDocument();
});

it("shows a version conflict without overwriting or claiming the edit was saved", async () => {
  const admin = { ...session, user: { ...session.user, role: "admin" } };
  const requests = mockRequests(async (url, init) => {
    if (url.startsWith("/api/dashboard")) return json({}, 503);
    if (init?.method === "PUT") return json({}, 409);
    return json({ version: 1, blocks: [question] });
  });
  render(<Dashboard session={admin} onLogout={() => {}} logoutError="" />);
  await userEvent.click(screen.getByRole("button", { name: "Perfil dos leads" }));
  const card = await screen.findByRole("article", { name: "Momento de compra" });
  await userEvent.click(within(card).getByRole("button", { name: "Editar" }));
  await userEvent.clear(screen.getByLabelText("Título do bloco"));
  await userEvent.type(screen.getByLabelText("Título do bloco"), "Título novo");
  await userEvent.click(screen.getByRole("button", { name: "Salvar bloco" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/outra pessoa alterou/i);
  expect(screen.getByRole("button", { name: "Recarregar blocos" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Momento de compra" })).toHaveTextContent("Momento de compra");
  expect(requests.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
});
