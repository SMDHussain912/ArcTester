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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OnlineStatusProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </OnlineStatusProvider>
  </React.StrictMode>,
);
