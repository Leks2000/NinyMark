/**
 * NinyraWatermark — Electron Preload Script
 *
 * Exposes safe IPC methods to the renderer process via contextBridge.
 * Renderer can call window.electronAPI.* methods.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    /** Get the port the backend is running on */
    getBackendPort: () => ipcRenderer.invoke("get-backend-port"),

    /** Get app version */
    getAppVersion: () => ipcRenderer.invoke("get-app-version"),

    /** Open the electron log file in default editor */
    openLogFile: () => ipcRenderer.invoke("open-log-file"),

    /** Check if running inside Electron (vs browser) */
    isElectron: true,
});
