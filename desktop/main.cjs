const { app, BrowserWindow, screen, powerMonitor, shell } = require("electron");
const path = require("path");

let examMode = false;
let examWindow = null;

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

  examWindow = window;
  return window;
}

function enterExamMode(window) {
  examMode = true;
  try {
    window.setKiosk(true);
    window.setAlwaysOnTop(true, "screen-saver");
    window.setContentProtection(true);
  } catch (e) {
    console.warn("Secure mode features not fully supported:", e.message);
  }
}

function exitExamMode(window) {
  examMode = false;
  try {
    window.setKiosk(false);
    window.setAlwaysOnTop(false);
    window.setContentProtection(false);
  } catch (e) {
    console.warn("Secure mode exit failed:", e.message);
  }
}

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
  // If app is already running, just bring existing window to front
  if (examWindow) {
    examWindow.focus();
  }
});

// Window close prevention during exam mode
app.on("before-quit", (event) => {
  if (examMode) {
    event.preventDefault();
  }
});

// Monitor window focus loss during exam mode
app.on("browser-window-blur", (event, window) => {
  if (examMode && examWindow === window) {
    // Report focus loss via IPC to the web app
    window.webContents.send("integrity-violation", {
      type: "WINDOW_BLUR",
      at: new Date().toISOString(),
      detail: "Window lost focus"
    });
  }
});

// Detect external display
screen.on("display-added", () => {
  if (examMode && examWindow) {
    examWindow.webContents.send("integrity-violation", {
      type: "DISPLAY_EXTENDED",
      at: new Date().toISOString(),
      detail: "External display detected"
    });
  }
});

// Detect lock screen
powerMonitor.on("lock-screen", () => {
  if (examMode && examWindow) {
    examWindow.webContents.send("integrity-violation", {
      type: "WINDOW_FOCUS_LOST",
      at: new Date().toISOString(),
      detail: "Screen locked"
    });
  }
});

// Block keyboard shortcuts during exam mode
app.on("before-input-event", (event, input) => {
  if (examMode && examWindow) {
    const key = input.key;
    if (
      key === "F12" ||
      (input.control && i.shift && i.key.toUpperCase() === "I") ||
      key === "F5" ||
      key === "F11"
    ) {
      event.preventDefault();
    }
  }
});