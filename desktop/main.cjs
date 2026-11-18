const { app, BrowserWindow, screen, powerMonitor, shell, ipcMain } = require("electron");
const path = require("path");

let examMode = false;
let examWindow = null;

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
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#f4f6fa",
    title: "ArcTester",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devUrl = process.env.ARCTESTER_WEB_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    const entry = app.isPackaged
      ? path.join(process.resourcesPath, "web-dist", "index.html")
      : path.join(__dirname, "../web/dist/index.html");
    window.loadFile(entry);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Electron emits before-input-event on webContents, not on app.
  window.webContents.on("before-input-event", (event, input) => {
    if (!examMode) return;
    const key = String(input.key || "").toUpperCase();
    const devToolsShortcut = (input.control || input.meta) && input.shift && key === "I";
    const refreshShortcut = key === "F5" || ((input.control || input.meta) && key === "R");
    const fullscreenShortcut = key === "F11";
    const closeShortcut = input.alt && key === "F4";
    if (key === "F12" || devToolsShortcut || refreshShortcut || fullscreenShortcut || closeShortcut) {
      event.preventDefault();
    }
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

// Only the active application window may toggle its own exam-mode state.
ipcMain.handle("exam-mode:set", (event, enabled) => {
  if (!examWindow || event.sender !== examWindow.webContents || typeof enabled !== "boolean") {
    return { ok: false };
  }
  const ok = enabled ? enterExamMode(examWindow) : exitExamMode(examWindow);
  return { ok, enabled: examMode };
});

app.whenReady().then(() => {
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

// Do not allow the application to quit while a formal exam is active.
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
