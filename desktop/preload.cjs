const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arctesterDesktop", {
  platform: process.platform,
  version: process.versions.electron,
  setExamMode: (enabled) => ipcRenderer.invoke("exam-mode:set", Boolean(enabled)),
  onIntegrityViolation: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("integrity-violation", listener);
    return () => ipcRenderer.removeListener("integrity-violation", listener);
  }
});
