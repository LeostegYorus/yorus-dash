/* eslint-disable @next/next/no-img-element -- Local SVG brand mark does not need raster optimization. */
"use client";

import { useEffect, useState } from "react";
import Dashboard, { type Session } from "./components/dashboard";

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [logoutError, setLogoutError] = useState("");

  async function loadSession() {
    setPhase("loading");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (response.status === 401) {
        setPhase("login");
        return;
      }
      if (!response.ok)
        throw new Error("Não foi possível verificar sua sessão.");
      setSession((await response.json()) as Session);
      setPhase("ready");
    } catch {
      setMessage("Não foi possível verificar sua sessão.");
      setPhase("error");
    }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          setPhase("login");
          return;
        }
        if (!response.ok) throw new Error("Sessão indisponível");
        const payload = (await response.json()) as Session;
        if (active) {
          setSession(payload);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (active) {
          setMessage("Não foi possível verificar sua sessão.");
          setPhase("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setPhase("loading");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? "E-mail ou senha inválidos."
            : response.status === 503
              ? "Serviço de acesso indisponível. Tente novamente mais tarde."
              : "Não foi possível entrar. Tente novamente.",
        );
        setPhase("login");
        return;
      }
      await loadSession();
    } catch {
      setMessage("Não foi possível entrar. Tente novamente.");
      setPhase("login");
    }
  }

  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      setSession(null);
      setPhase("login");
    } catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
    }
  }

  if (phase === "loading")
    return (
      <main className="auth-status" aria-busy="true">
        <div className="auth-status-card">
          <img
            src="/brand/yorus-symbol-orange.svg"
            width="36"
            height="36"
            alt=""
          />
          <p className="eyebrow">YORUS / DASH</p>
          <p role="status">Carregando painel...</p>
        </div>
      </main>
    );
  if (phase === "error")
    return (
      <main className="auth-status">
        <div className="auth-status-card">
          <img
            src="/brand/yorus-symbol-orange.svg"
            width="36"
            height="36"
            alt=""
          />
          <p className="eyebrow">YORUS / DASH</p>
          <h1>Acesso indisponível</h1>
          <p role="alert">{message}</p>
          <button onClick={() => void loadSession()}>Tentar novamente</button>
        </div>
      </main>
    );
  if (phase === "login")
    return (
      <main className="login-shell">
        <form onSubmit={login} className="login-card">
          <img
            src="/brand/yorus-symbol-orange.svg"
            width="40"
            height="40"
            alt=""
          />
          <p className="eyebrow">YORUS / DASH</p>
          <h1>Acesso ao painel</h1>
          <p>Entre para visualizar os dados dos seus clientes autorizados.</p>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {message && <p role="alert">{message}</p>}
          <button type="submit">Entrar</button>
        </form>
      </main>
    );
  return session ? (
    <Dashboard
      session={session}
      logoutError={logoutError}
      onLogout={() => void logout()}
    />
  ) : null;
}
