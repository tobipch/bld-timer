import { A, Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./styles/app.css";

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
        <div class="nav-right" id="nav-right" />
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
