const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erinDesktop", {
  state: () => ipcRenderer.invoke("desktop:state"),
  chooseCa: () => ipcRenderer.invoke("desktop:choose-ca"),
  save: (input) => ipcRenderer.invoke("desktop:save", input),
  open: () => ipcRenderer.invoke("desktop:open"),
  reset: () => ipcRenderer.invoke("desktop:reset"),
  onError: (callback) => ipcRenderer.on("desktop:error", (_event, message) => callback(message)),
});
