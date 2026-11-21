import React, { useLayoutEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./ErrorBoundary";
import { OnlineStatusProvider } from "./OnlineStatusContext";
import "./styles.css";
import "./design-system.css";

/**
 * Remove the static HTML loader only after React has committed its first
 * render. A timer here can reveal a blank page when JS or auth is delayed.
 */
function BootScreenBridge() {
  useLayoutEffect(() => {
    document.getElementById("boot-screen")?.remove();
  }, []);
  return null;
}

// A service worker must never control the Vite development server. Older
// cache-first workers can otherwise serve stale HTML and stale hashed bundles.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => void registration.unregister());
    });
    void caches.keys().then((keys) => {
      keys.filter((key) => key.startsWith("arctester-shell-")).forEach((key) => void caches.delete(key));
    });
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ArcTester root element is missing.");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <OnlineStatusProvider>
      <BootScreenBridge />
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </OnlineStatusProvider>
  </React.StrictMode>,
);
