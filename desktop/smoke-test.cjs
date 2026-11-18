"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexHtml = path.join(root, "web", "dist", "index.html");
const mainFile = path.join(__dirname, "main.cjs");
const preloadFile = path.join(__dirname, "preload.cjs");

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(fs.existsSync(indexHtml), "web/dist/index.html must exist (build the web app first)");
check(fs.existsSync(mainFile), "desktop/main.cjs must exist");
check(fs.existsSync(preloadFile), "desktop/preload.cjs must exist");

if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, "utf8");

  // Electron loads this bundle via file://; absolute /assets URLs resolve at
  // the filesystem root and produce a blank window.
  check(!/src="\/assets\//.test(html), "index.html must not reference absolute /assets/ scripts");
  check(!/href="\/assets\//.test(html), "index.html must not reference absolute /assets/ stylesheets");
  check(/src="\.\/assets\//.test(html), "index.html must reference relative ./assets/ scripts");
  check(/href="\.\/assets\//.test(html), "index.html must reference relative ./assets/ stylesheets");

  const assetsDir = path.join(root, "web", "dist", "assets");
  check(fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0, "web/dist/assets must contain built assets");
}

if (fs.existsSync(mainFile)) {
  const main = fs.readFileSync(mainFile, "utf8");
  check(main.includes('webContents.on("before-input-event"'), "exam shortcut handling must subscribe to webContents");
  check(main.includes('ipcMain.handle("exam-mode:set"'), "main process must expose the guarded exam-mode IPC handler");
  check(main.includes('protocol.registerSchemesAsPrivileged('), "desktop must register its secure custom origin before app readiness");
  check(main.includes('protocol.handle("arctester", serveApp)'), "desktop must serve the packaged SPA from the arctester://app origin");
  check(main.includes('window.loadURL("arctester://app/")'), "desktop must load the secure packaged-app origin");
  check(main.includes('window.webContents.on("will-navigate"'), "desktop must prevent top-level navigation away from its trusted renderer origin");
  check(main.includes('url.host !== "app"'), "custom protocol handler must restrict requests to the app host");
  check(!/\bi\.shift\b|\bi\.key\b/.test(main), "exam shortcut handler must not reference the undefined i variable");
}

if (fs.existsSync(preloadFile)) {
  const preload = fs.readFileSync(preloadFile, "utf8");
  check(preload.includes("setExamMode"), "preload must expose the safe exam-mode bridge");
  check(preload.includes("onIntegrityViolation"), "preload must expose the integrity event subscription");
  check(!preload.includes("require("), "preload must not expose Node.js require to the renderer");
}

if (failures.length > 0) {
  console.error("Desktop smoke test failed:");
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}
console.log("Desktop smoke test passed: packaged assets and Electron exam bridge are configured.");
