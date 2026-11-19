const { app, BrowserWindow, screen, powerMonitor, shell, ipcMain, protocol } = require("electron");
const fs = require("fs/promises");
const path = require("path");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "arctester",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let examMode = false;
let examWindow = null;

function getWebRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "web-dist")
    : path.join(__dirname, "../web/dist");
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf"
  })[extension] || "application/octet-stream";
}

async function serveApp(request) {
  const url = new URL(request.url);
  if (url.host !== "app") return new Response("Not found", { status: 404 });

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const root = getWebRoot();
  let filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const body = await fs.readFile(filePath);
    return new Response(body, {
      headers: {
        "Content-Type": contentType(filePath),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
      }
    });
  } catch {
    // Client-side routes resolve to the SPA entry; missing asset files stay 404.
    if (path.extname(pathname)) return new Response("Not found", { status: 404 });
    try {
      const entry = path.join(root, "index.html");
      return new Response(await fs.readFile(entry), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
      });
    } catch {
      return new Response("ArcTester web build is missing. Run npm run build:web.", { status: 503 });
    }
  }
}

function sendIntegrityViolation(type, detail) {
  if (!examMode || !examWindow || examWindow.isDestroyed()) return;
  examWindow.webContents.send("integrity-violation", {
    type,
    at: new Date().toISOString(),
    detail
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 360,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f6fa",
    title: "ArcTester",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Wait until Chromium has a first frame ready to avoid flashing a blank window.
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });

  const devUrl = process.env.ARCTESTER_WEB_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    window.loadURL("arctester://app/");
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  // Keep the privileged renderer on the packaged app origin. External links
  // must use target=_blank so they pass through the explicit HTTPS handler.
  const trustedUrl = new URL(devUrl || "arctester://app/");
  const trustedOrigin = `${trustedUrl.protocol}//${trustedUrl.host}`;
  window.webContents.on("will-navigate", (event, targetUrl) => {
    let targetOrigin = "";
    try {
      const parsedTarget = new URL(targetUrl);
      targetOrigin = `${parsedTarget.protocol}//${parsedTarget.host}`;
    } catch {
      event.preventDefault();
      return;
    }
    if (targetOrigin !== trustedOrigin) event.preventDefault();
  });

  window.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toUpperCase();
    const modifier = input.control || input.meta;
    if (examMode) {
      const devToolsShortcut = modifier && input.shift && key === "I";
      const refreshShortcut = key === "F5" || (modifier && key === "R");
      const fullscreenShortcut = key === "F11";
      const closeShortcut = input.alt && key === "F4";
      if (key === "F12" || devToolsShortcut || refreshShortcut || fullscreenShortcut || closeShortcut) {
        event.preventDefault();
      }
      return;
    }

    // Desktop accessibility: let users resize the UI without changing
    // operating-system display scaling.
    if (modifier && (key === "0" || key === "=" || key === "+" || key === "-")) {
      event.preventDefault();
      const current = window.webContents.getZoomFactor();
      const nextZoom = key === "0"
        ? 1
        : Math.min(1.6, Math.max(0.75, current + (key === "-" ? -0.1 : 0.1)));
      window.webContents.setZoomFactor(Number(nextZoom.toFixed(2)));
      return;
    }
    if (key === "F11") {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });

  window.on("close", (event) => {
    if (!examMode) return;
    event.preventDefault();
    sendIntegrityViolation("CLOSE_ATTEMPT", "The desktop exam window close action was blocked");
    window.show();
    window.focus();
  });

  window.on("closed", () => {
    if (examWindow === window) examWindow = null;
  });

  examWindow = window;
  return window;
}

function enterExamMode(window) {
  if (!window || window.isDestroyed()) return false;
  examMode = true;
  try {
    window.setKiosk(true);
    window.setAlwaysOnTop(true, "screen-saver");
    window.setContentProtection(true);
    return true;
  } catch (error) {
    examMode = false;
    console.warn("Secure mode features not fully supported:", error.message);
    return false;
  }
}

function exitExamMode(window) {
  examMode = false;
  if (!window || window.isDestroyed()) return false;
  try {
    window.setKiosk(false);
    window.setAlwaysOnTop(false);
    window.setContentProtection(false);
    return true;
  } catch (error) {
    console.warn("Secure mode exit failed:", error.message);
    return false;
  }
}

ipcMain.handle("exam-mode:set", (event, enabled) => {
  if (!examWindow || event.sender !== examWindow.webContents || typeof enabled !== "boolean") {
    return { ok: false };
  }
  const ok = enabled ? enterExamMode(examWindow) : exitExamMode(examWindow);
  return { ok, enabled: examMode };
});

app.whenReady().then(() => {
  protocol.handle("arctester", serveApp);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (examWindow && !examWindow.isDestroyed()) examWindow.focus();
});

app.on("before-quit", (event) => {
  if (examMode) event.preventDefault();
});

app.on("browser-window-blur", (_event, window) => {
  if (examMode && examWindow === window) {
    sendIntegrityViolation("WINDOW_BLUR", "Window lost focus");
  }
});

screen.on("display-added", () => {
  sendIntegrityViolation("DISPLAY_EXTENDED", "An external display was connected");
});

powerMonitor.on("lock-screen", () => {
  sendIntegrityViolation("WINDOW_FOCUS_LOST", "The operating system locked the screen");
});

powerMonitor.on("suspend", () => {
  sendIntegrityViolation("APP_BACKGROUND", "The operating system suspended the device");
});
