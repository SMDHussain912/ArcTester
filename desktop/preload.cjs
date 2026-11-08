const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("arcTesterDesktop", {
  platform: process.platform,
  version: process.versions.electron
});
