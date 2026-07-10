import { createSignal, Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import { useApp } from "~/state/app";

export default function LoginPage() {
  const app = useApp();
  const [mode, setMode] = createSignal<"login" | "signup">("login");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode() === "login"
          ? await authClient.signIn.email({ email: email(), password: password() })
          : await authClient.signUp.email({ email: email(), password: password(), name: name() || email() });
      if (res.error) {
        setError(res.error.message ?? "failed");
      } else {
        // full reload re-initializes the store with the session cookie
        window.location.href = "/";
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="login-page">
      <div class="card login-card">
        <Show
          when={app.server()?.db}
          fallback={
            <p class="muted">
              No database is configured on this deployment — the app runs in local mode and accounts are
              unavailable. Your data is stored in this browser.
            </p>
          }
        >
          <h2>{mode() === "login" ? "Log in" : "Create account"}</h2>
          <Show when={app.server()?.user}>
            <p class="muted">
              Logged in as {app.server()!.user!.email}.{" "}
              <button
                onClick={() =>
                  void authClient.signOut().then(() => {
                    window.location.href = "/";
                  })
                }
              >
                Log out
              </button>
            </p>
          </Show>
          <Show when={app.server()?.wca}>
            <button
              class="primary wca-btn"
              disabled={busy()}
              onClick={() =>
                void authClient.signIn
                  .oauth2({ providerId: "wca", callbackURL: "/" })
                  .then((res) => {
                    if (res.error) setError(res.error.message ?? "WCA sign-in failed");
                  })
                  .catch((err) => setError(`${err}`))
              }
            >
              Sign in with WCA
            </button>
            <div class="login-divider muted">or use email</div>
          </Show>
          <form onSubmit={submit} class="login-form">
            <Show when={mode() === "signup"}>
              <input placeholder="name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            </Show>
            <input
              type="email"
              required
              placeholder="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="password (min 8 chars)"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
            <button class="primary" type="submit" disabled={busy()}>
              {busy() ? "…" : mode() === "login" ? "Log in" : "Sign up"}
            </button>
          </form>
          <Show when={error()}>
            <p class="bad">{error()}</p>
          </Show>
          <p class="muted">
            {mode() === "login" ? (
              <>
                No account?{" "}
                <a href="#" onClick={(e) => (e.preventDefault(), setMode("signup"))}>
                  Sign up
                </a>
              </>
            ) : (
              <>
                Have an account?{" "}
                <a href="#" onClick={(e) => (e.preventDefault(), setMode("login"))}>
                  Log in
                </a>
              </>
            )}
          </p>
          <p class="muted">
            Without logging in you use the app as a shared guest — solves land in the public default
            account.
          </p>
        </Show>
      </div>
    </div>
  );
}
