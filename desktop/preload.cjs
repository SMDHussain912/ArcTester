const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arctesterDesktop", {
  platform: process.platform,
  version: process.versions.electron,
  sendViolation: (event) => ipcRenderer.send("integrity-violation", event)
});