import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard, { type Session } from "../components/dashboard";

const session: Session = {
  user: { email: "admin@example.test", role: "admin" },
  clients: [{ id: "alpha", name: "Cliente Alpha", currency: "BRL", metaConnected: false, gaConnected: false }],
};

afterEach(() => vi.unstubAllGlobals());

it("opens the per-client dashboard builder first while retaining the legacy overview", async () => {
  const requests = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => url.includes("/builder")
      ? { version: 0, datasets: [], widgets: [] }
      : { version: 0, blocks: [] },
  }));
  vi.stubGlobal("fetch", requests);
  render(<Dashboard session={session} onLogout={() => {}} logoutError="" />);
  expect(screen.getByRole("heading", { level: 1, name: "Meu painel" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("builder-main");
  expect(await screen.findByRole("button", { name: /adicionar visualização/i })).toBeInTheDocument();
  expect(requests.mock.calls.some(([url]) => url.includes("/builder"))).toBe(true);
  expect(requests.mock.calls.some(([url]) => url.startsWith("/api/dashboard?"))).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Visão geral" }));
  expect(screen.getByRole("heading", { level: 1, name: "Visão geral" })).toBeInTheDocument();
});

it("does not show a former client's delayed builder document after switching clients", async () => {
  let releaseAlpha!: (value: unknown) => void;
  const twoClients: Session = {
    ...session,
    clients: [
      session.clients[0],
      { id: "beta", name: "Cliente Beta", currency: "BRL", metaConnected: false, gaConnected: false },
    ],
  };
  const requests = vi.fn(async (url: string) => {
    if (url === "/api/clients/alpha/builder") return new Promise(resolve => { releaseAlpha = resolve; });
    return {
      ok: true, status: 200,
      json: async () => ({ version: 1, datasets: [], widgets: [{
        id: "b545a303-1e21-4a27-890c-0bf5e14e76c0", kind: "text", title: "Somente Beta", body: "Informação de Beta", width: 6,
      }] }),
    };
  });
  vi.stubGlobal("fetch", requests);
  render(<Dashboard session={twoClients} onLogout={() => {}} logoutError="" />);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Cliente" }), "beta");
  expect(await screen.findByText("Somente Beta")).toBeInTheDocument();
  releaseAlpha({ ok: true, status: 200, json: async () => ({ version: 1, datasets: [], widgets: [{
    id: "c3beed5b-d79f-48e7-a28a-048d8204388e", kind: "text", title: "Somente Alpha", body: "Informação de Alpha", width: 6,
  }] }) });
  expect(screen.queryByText("Somente Alpha")).not.toBeInTheDocument();
});
