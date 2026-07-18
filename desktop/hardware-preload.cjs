const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erinHardware", Object.freeze({
  state: () => ipcRenderer.invoke("hardware:state"),
  printers: () => ipcRenderer.invoke("hardware:printers"),
  openCustomerDisplay: () => ipcRenderer.invoke("hardware:open-customer-display"),
}));

contextBridge.exposeInMainWorld("erinDesktop", Object.freeze({
  retry: () => ipcRenderer.invoke("desktop:retry"),
  openSettings: () => ipcRenderer.invoke("desktop:open-settings"),
}));
