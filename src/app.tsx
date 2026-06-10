import { A, Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense } from "solid-js";
import { useApp } from "./state/app";
import "./styles/app.css";

function AccountArea() {
  const app = useApp();
  return (
    <Show
      when={app.server()?.db}
      fallback={<span class="muted nav-badge" title="No database configured — data stays in this browser">local</span>}
    >
      <Show
        when={app.server()?.user}
        fallback={
          <>
            <span class="warn nav-badge" title="Data goes to the shared guest account">
              guest
            </span>
            <A href="/login">Log in</A>
          </>
        }
      >
        {(u) => <A href="/login">{u().name || u().email}</A>}
      </Show>
    </Show>
  );
}

function Layout(props: { children?: any }) {
  return (
    <div class="app-shell">
      <nav class="top-nav">
        <A href="/" class="brand">
          BLD<span>Timer</span>
        </A>
        <div class="nav-links">
          <A href="/" end activeClass="active">
            Timer
          </A>
          <A href="/stats" activeClass="active">
            Stats
          </A>
          <A href="/algs" activeClass="active">
            Algs
          </A>
          <A href="/settings" activeClass="active">
            Settings
          </A>
        </div>
        <div class="nav-right">
          <AccountArea />
        </div>
      </nav>
      <main class="main-content">{props.children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Router root={(props) => <Layout><Suspense>{props.children}</Suspense></Layout>}>
      <FileRoutes />
    </Router>
  );
}
