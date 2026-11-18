import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./ErrorBoundary";
import { OnlineStatusProvider } from "./OnlineStatusContext";
import "./styles.css";

// Register service worker for offline shell support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service worker registered:", registration.scope);
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ArcTester root element is missing.");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <OnlineStatusProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </OnlineStatusProvider>
  </React.StrictMode>,
);

// Keep the static loader visible for at least five seconds, and until React has painted.
// The app-level session splash continues if authentication restoration takes longer.
window.setTimeout(() => {
  requestAnimationFrame(() => document.getElementById("boot-screen")?.remove());
}, 5000);
