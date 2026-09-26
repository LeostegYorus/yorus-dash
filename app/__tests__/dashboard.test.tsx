import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "../page";

const clientA = {
  id: "alpha",
  name: "Cliente Alpha",
  currency: "BRL",
  metaConnected: true,
  gaConnected: false,
};
const clientB = {
  id: "beta",
  name: "Cliente Beta",
  currency: "BRL",
  metaConnected: true,
  gaConnected: false,
};
const session = {
  user: { email: "analista@exemplo.test", role: "viewer" },
  clients: [clientA, clientB],
};
const rows = [
  {
    campaignId: "c1",
    campaignName: "Campanha, principal",
    adsetId: "s1",
    adsetName: "Conjunto A",
    adId: "a1",
    adName: "Peça A",
    spend: 40,
    impressions: 2000,
    clicks: 20,
    dateStart: "2026-09-01",
    dateStop: "2026-09-10",
  },
  {
    campaignId: "c2",
    campaignName: "Campanha secundária",
    adsetId: "s2",
    adsetName: "Conjunto B",
    adId: "a2",
    adName: "Peça B",
    spend: 20,
    impressions: 1000,
    clicks: 10,
    dateStart: "2026-09-01",
    dateStop: "2026-09-10",
  },
];
const result = (level = "campaign", values = rows) => ({
  client: clientA,
  provider: "meta",
  scope: { account: "act_111", level },
  dateRange: { start: "2026-09-01", end: "2026-09-10" },
  collectedAt: "2026-09-11T10:00:00Z",
  status: "succeeded",
  warnings: [],
  rows: values,
});
const json = (value: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
});
let calls: string[];
let fetcher: ReturnType<typeof vi.fn>;
function setup(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
  calls = [];
  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/clients/") && url.endsWith("/blocks")) return json({ version: 0, blocks: [] });
    if (url.startsWith("/api/clients/") && url.endsWith("/builder")) return json({ version: 0, datasets: [], widgets: [] });
    calls.push(url);
    return impl(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
}
function authenticated(override?: (url: string) => Promise<unknown>) {
  setup(async (url) =>
    url === "/api/session"
      ? json(session)
      : override
        ? override(url)
        : json(
            result(
              new URL(url, "http://localhost").searchParams.get("level") ||
                "campaign",
            ),
          ),
  );
}
async function openLegacyOverview() {
  render(<Page />);
  await userEvent.click(await screen.findByRole("button", { name: "Visão geral" }));
}

beforeEach(() => {
  vi.stubGlobal("URL", URL);
});
afterEach(() => vi.unstubAllGlobals());

describe("dashboard UI", () => {
  it("renders loading, then a recoverable session error", async () => {
    let release!: (value: unknown) => void;
    setup(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<Page />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando painel");
    release(json({}, 503));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível verificar sua sessão.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
  });

  it("switches tenant and never carries prior metrics into a pending or empty result", async () => {
    let releaseBeta!: (value: unknown) => void;
    authenticated(async (url) =>
      new URL(url, "http://localhost").searchParams.get("client") === "beta"
        ? new Promise((resolve) => {
            releaseBeta = resolve;
          })
        : json(result()),
    );
    await openLegacyOverview();
    expect(await screen.findByText("Campanha, principal")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Cliente" }),
      "beta",
    );
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Carregando dados");
    releaseBeta(json({ ...result(), client: clientB, rows: [] }));
    expect(
      await screen.findByText(/nenhum dado de mídia neste período/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
    expect(calls.some((url) => url.includes("client=beta"))).toBe(true);
  });

  it("rejects a payload whose tenant or level does not match the active request", async () => {
    authenticated(async () => json({ ...result(), client: clientB }));
    await openLegacyOverview();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /resposta não corresponde/i,
    );
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
  });

  it("ignores an out-of-order response from the previous client", async () => {
    let finishAlpha!: (value: unknown) => void;
    setup(async (url) => {
      if (url === "/api/session") return json(session);
      if (
        new URL(url, "http://localhost").searchParams.get("client") === "alpha"
      )
        return new Promise((resolve) => {
          finishAlpha = resolve;
        });
      return json({
        ...result(),
        client: clientB,
        rows: [{ ...rows[1], campaignName: "Somente Beta" }],
      });
    });
    await openLegacyOverview();
    await waitFor(() => expect(calls.filter((url) => url.startsWith("/api/dashboard"))).toHaveLength(1));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Cliente" }),
      "beta",
    );
    expect(await screen.findByText("Somente Beta")).toBeInTheDocument();
    finishAlpha(json(result()));
    await waitFor(() =>
      expect(screen.getByText("Somente Beta")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveValue(
      "beta",
    );
  });

  it("ignores an out-of-order response for a previous date range", async () => {
    let finishOld!: (value: unknown) => void;
    setup(async (url) => {
      if (url === "/api/session") return json(session);
      if (
        new URL(url, "http://localhost").searchParams.get("start") !==
        "2026-09-01"
      )
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      return json({
        ...result(),
        rows: [{ ...rows[1], campaignName: "Novo recorte" }],
      });
    });
    await openLegacyOverview();
    await waitFor(() => expect(calls.filter((url) => url.startsWith("/api/dashboard"))).toHaveLength(1));
    await userEvent.clear(screen.getByLabelText("Data inicial"));
    await userEvent.type(screen.getByLabelText("Data inicial"), "2026-09-01");
    expect(await screen.findByText("Novo recorte")).toBeInTheDocument();
    finishOld(json(result()));
    await waitFor(() =>
      expect(screen.getByText("Novo recorte")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
  });

  it("changes tabs and requests the matching Meta level without inventing GA data", async () => {
    authenticated(async (url) =>
      json(
        result(
          new URL(url, "http://localhost").searchParams.get("level") ||
            "campaign",
        ),
      ),
    );
    await openLegacyOverview();
    expect(
      await screen.findByRole("heading", { name: "Distribuição por campanha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/todos os cliques, não apenas no link/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Conjuntos" }));
    expect(
      await screen.findByRole("heading", { name: "Distribuição por conjunto" }),
    ).toBeInTheDocument();
    expect(calls.some((url) => url.includes("level=adset"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Anúncios" }));
    expect(
      await screen.findByRole("heading", { name: "Distribuição por anúncio" }),
    ).toBeInTheDocument();
    expect(calls.some((url) => url.includes("level=ad"))).toBe(true);
    const count = calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Metodologia" }));
    expect(
      screen.getByText(/não há dados de qualidade de leads/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/GA4 pendente de configuração/i),
    ).toBeInTheDocument();
    expect(calls.length).toBe(count);
  });

  it("passes selected dates to the server and removes prior rows while reloading", async () => {
    let resolveDate!: (value: unknown) => void;
    authenticated(async (url) =>
      new URL(url, "http://localhost").searchParams.get("start") ===
      "2026-09-01"
        ? new Promise((resolve) => {
            resolveDate = resolve;
          })
        : json(result()),
    );
    await openLegacyOverview();
    expect(await screen.findByText("Campanha, principal")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Data inicial"));
    await userEvent.type(screen.getByLabelText("Data inicial"), "2026-09-01");
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((url) => url.includes("start=2026-09-01"))).toBe(true),
    );
    resolveDate(json(result()));
    expect(await screen.findByText("Campanha, principal")).toBeInTheDocument();
  });

  it("defaults to the last 30 complete UTC days and marks a selected live day", async () => {
    authenticated();
    await openLegacyOverview();
    await screen.findByRole("table");
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const startDay = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(screen.getByLabelText("Data final")).toHaveValue(yesterday);
    expect(screen.getByLabelText("Data inicial")).toHaveValue(startDay);
    await userEvent.clear(screen.getByLabelText("Data final"));
    await userEvent.type(
      screen.getByLabelText("Data final"),
      new Date().toISOString().slice(0, 10),
    );
    expect(await screen.findByText(/dia em andamento/i)).toBeInTheDocument();
  });

  it("preserves a partial warning even when the returned row set is empty", async () => {
    authenticated(async () =>
      json({
        ...result(),
        status: "partial",
        warnings: ["Meta insights truncated after 5 pages"],
        rows: [],
      }),
    );
    await openLegacyOverview();
    expect(
      await screen.findByText(/nenhum dado de mídia neste período/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Meta insights truncated after 5 pages",
    );
  });

  it("shows partial source warnings and a null CTR without a percent suffix", async () => {
    authenticated(async () =>
      json({
        ...result(),
        status: "partial",
        warnings: ["Meta insights truncated after 5 pages"],
        rows: [{ ...rows[0], impressions: 0 }],
      }),
    );
    await openLegacyOverview();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Meta insights truncated after 5 pages",
    );
    expect(screen.getByRole("table")).toHaveTextContent("—");
    expect(screen.getByRole("table")).not.toHaveTextContent("—%");
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it("exports the visible sort order and exact displayed rows as escaped CSV", async () => {
    authenticated();
    const blobs: Blob[] = [];
    const makeUrl = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:report";
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: makeUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      await openLegacyOverview();
      const table = await screen.findByRole("table");
      await userEvent.click(
        within(table).getByRole("button", { name: /investimento/i }),
      );
      expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
        "Campanha secundária",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Exportar CSV" }),
      );
      expect(makeUrl).toHaveBeenCalledTimes(1);
      const csv = await blobs[0].text();
      expect(csv).toContain('"Campanha, principal"');
      expect(csv).not.toContain("Cliente Beta");
      expect(csv.indexOf("Campanha secundária")).toBeLessThan(
        csv.indexOf("Campanha, principal"),
      );
    } finally {
      click.mockRestore();
    }
  });

  it("exports external names as text rather than spreadsheet formulas", async () => {
    authenticated(async () =>
      json(
        result("campaign", [
          { ...rows[0], campaignName: '=HYPERLINK("https://example.invalid")' },
        ]),
      ),
    );
    const blobs: Blob[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:report";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      await openLegacyOverview();
      await screen.findByRole("table");
      await userEvent.click(
        screen.getByRole("button", { name: "Exportar CSV" }),
      );
      const csv = await blobs[0].text();
      expect(csv).toContain("\"'=HYPERLINK(");
      expect(csv).not.toContain('"=HYPERLINK(');
    } finally {
      click.mockRestore();
    }
  });

  it("shows a dashboard source error and retries without showing invented metrics", async () => {
    let attempts = 0;
    setup(async (url) =>
      url === "/api/session"
        ? json(session)
        : ++attempts === 1
          ? json({}, 503)
          : json(result()),
    );
    await openLegacyOverview();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Fonte de dados indisponível",
    );
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    expect(await screen.findByText("Campanha, principal")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("does not claim logout succeeded when the server rejects it", async () => {
    setup(async (url) =>
      url === "/api/session"
        ? json(session)
        : url === "/api/logout"
          ? json({}, 503)
          : json(result()),
    );
    await openLegacyOverview();
    await screen.findByText("Campanha, principal");
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /não foi possível sair/i,
    );
    expect(screen.getByText("Campanha, principal")).toBeInTheDocument();
  });

  it("posts logout and removes client data from the screen", async () => {
    setup(async (url) =>
      url === "/api/session"
        ? json(session)
        : url === "/api/logout"
          ? json({ ok: true })
          : json(result()),
    );
    await openLegacyOverview();
    await screen.findByText("Campanha, principal");
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(
      await screen.findByRole("heading", { name: "Acesso ao painel" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Campanha, principal")).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });

  it("brands login as Yorus Dash and distinguishes server configuration failure from bad credentials", async () => {
    setup(async (url) =>
      url === "/api/session" ? json({}, 401) : json({}, 503),
    );
    render(<Page />);
    expect(
      await screen.findByRole("heading", { name: "Acesso ao painel" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/YORUS \/ DASH/i)).toBeInTheDocument();
    expect(screen.queryByText(/DATA HUB/i)).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("E-mail"),
      "analista@exemplo.test",
    );
    await userEvent.type(screen.getByLabelText("Senha"), "senha");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /serviço de acesso indisponível/i,
    );
    expect(screen.queryByText(/senha inválidos/i)).not.toBeInTheDocument();
  });

  it("shows login on 401, sends credentials, and loads the authorized workspace", async () => {
    setup(async (url, init) => {
      if (url === "/api/session")
        return json(
          session,
          calls.filter((x) => x === url).length === 1 ? 401 : 200,
        );
      if (url === "/api/login") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          email: "analista@exemplo.test",
          password: "senha",
        });
        return json({ ok: true });
      }
      return json(result());
    });
    render(<Page />);
    expect(
      await screen.findByRole("heading", { name: /acesso ao painel/i }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("E-mail"),
      "analista@exemplo.test",
    );
    await userEvent.type(screen.getByLabelText("Senha"), "senha");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(
      await screen.findByRole("heading", { name: "Meu painel" }),
    ).toBeInTheDocument();
    expect(calls).toContain("/api/login");
  });
});
