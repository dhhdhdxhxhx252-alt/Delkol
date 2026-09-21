import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/workspace.css";
import "./styles/popups.css";
import "./styles/delkol.css";
import "./styles/auth.css";
import "./styles/community.css";
import "./desktop.css";
import "./styles/accent.css";
import { mountDesktop } from "./desktop";
import { mountGlassFrame } from "./glassFrame";
import { LoadingScreen } from "./components/LoadingScreen";
import { AuthScreen } from "./components/AuthScreen";
import App from "./App";
import { HudScreen } from "./components/HudScreen";
import { getSessionAccount, signOut, type CloudAccount } from "./lib/supabase";

type DelkolBridge = {
  isElectron?: boolean;
  windowName?: string;
  loadingDone?: () => void;
  authSuccess?: (email: string) => Promise<void>;
  signOut?: () => void;
};

const bridge = (window as unknown as { delkol?: DelkolBridge }).delkol;
const windowName =
  bridge?.windowName ??
  new URLSearchParams(window.location.search).get("window") ??
  "main";

document.documentElement.dataset.window = windowName;

/**
 * Session check must never block the first paint: if Supabase is unreachable
 * (offline, DNS issues, blocked CDN) we fall back to guest/auth mode instead
 * of hanging on a blank screen.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (cause) => { window.clearTimeout(timer); reject(cause); },
    );
  });
}

/** Last-resort screen for boot errors — the window is never silently blank. */
function BootErrorScreen({ error }: { error: unknown }) {
  return (
    <div role="alert" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#101012", color: "#E8E8EE", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ textAlign: "center", padding: 32, maxWidth: 420 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Не удалось запустить приложение</h1>
        <p style={{ color: "#9A9AB2", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
          Попробуйте перезапустить Delkol. Если ошибка повторяется, переустановите приложение.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: "#8B7AC6", color: "white", border: 0, borderRadius: 10, padding: "10px 22px", fontSize: 14, cursor: "pointer" }}
        >
          Перезапустить
        </button>
        <pre style={{ marginTop: 20, fontSize: 11, color: "#78788D", whiteSpace: "pre-wrap", textAlign: "left" }}>{String(error instanceof Error ? error.stack ?? error.message : error)}</pre>
      </div>
    </div>
  );
}

// Surface unexpected async failures in the console instead of failing silently.
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
});
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error ?? event.message);
});

/**
 * In Electron there are three real windows, all serving this bundle:
 *   ?window=loading -> LoadingScreen (bunny design)
 *   ?window=auth    -> AuthScreen (login / registration)
 *   ?window=main    -> the workspace app
 * In the plain web build (no ?window= and no bridge) we run the whole flow
 * in one page: loading -> auth -> app, like before.
 */
function WebFlow() {
  const [phase, setPhase] = useState<"loading" | "auth" | "app">("loading");
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [guest, setGuest] = useState(false);

  const finishLoading = useCallback(() => {
    void withTimeout(getSessionAccount(), 4_000)
      .then((existing) => {
        if (existing) { setAccount(existing); setPhase("app"); return; }
        setPhase("auth");
      })
      .catch(() => setPhase("auth"));
  }, []);

  const onSignOut = useCallback(() => {
    void signOut().finally(() => {
      setAccount(null);
      setGuest(false);
      setPhase("auth");
    });
  }, []);

  return (
    <>
      {phase === "loading" && <LoadingScreen onDone={finishLoading} />}
      {phase === "auth" && (
        <AuthScreen
          onAuthenticated={(next) => { setAccount(next); setGuest(false); setPhase("app"); }}
          onGuest={() => { setGuest(true); setAccount(null); setPhase("app"); }}
        />
      )}
      {phase === "app" && (
        <App key={account?.id ?? "guest"} account={account} isGuest={guest} onSignOut={onSignOut} />
      )}
    </>
  );
}

/** Main Electron window: session check, then the workspace. */
function ElectronMain() {
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [guest, setGuest] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void withTimeout(getSessionAccount(), 4_000)
      .then((existing) => { if (existing) setAccount(existing); else setGuest(true); })
      .catch(() => setGuest(true))
      .finally(() => setReady(true));
  }, []);

  const onSignOut = useCallback(() => {
    void signOut().finally(() => bridge?.signOut?.());
  }, []);

  if (!ready) return <div className="boot-splash" aria-hidden="true" />;
  return <App key={account?.id ?? "guest"} account={account} isGuest={guest} onSignOut={onSignOut} />;
}

const root = createRoot(document.getElementById("root")!);

function renderApp(node: React.ReactNode) {
  try {
    root.render(<StrictMode>{node}</StrictMode>);
  } catch (error) {
    root.render(<BootErrorScreen error={error} />);
  }
}

if (windowName === "loading") {
  renderApp(<LoadingScreen onDone={() => bridge?.loadingDone?.()} />);
  mountGlassFrame();
} else if (windowName === "hud") {
  // Внешняя HUD-пилюля: отдельный прозрачный рендер без приложения.
  renderApp(<HudScreen />);
} else if (windowName === "notify") {
  // OS notification popups render electron/notify.html directly —
  // they never load this bundle.
} else if (windowName === "auth") {
  renderApp(
    <AuthScreen
      onAuthenticated={(account) => { void bridge?.authSuccess?.(account.email); }}
      onGuest={() => { void bridge?.authSuccess?.(""); }}
    />,
  );
  mountGlassFrame();
} else if (bridge?.isElectron) {
  renderApp(<ElectronMain />);
  mountDesktop();
  mountGlassFrame();
} else {
  renderApp(<WebFlow />);
}
