/**
 * NinyraWatermark — Electron Main Process
 *
 * Responsibilities:
 * 1. Launch the bundled Python backend (backend.exe or uvicorn)
 * 2. Poll /health until backend is ready
 * 3. Create BrowserWindow and load the app
 * 4. Kill backend process on app quit
 *
 * Rules from RULES.md:
 * R3  — Error handling, logging to file
 * R15 — Python backend auto-start, health check, fallback ports
 */

const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");

// ─── Logging Setup (R3) ──────────────────────────────────────────────────────
const LOG_DIR = path.join(os.homedir(), ".ninyrawatermark", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "electron.log");

function log(level, ...args) {
    const msg = `${new Date().toISOString()} [${level}] ${args.join(" ")}`;
    fs.appendFileSync(LOG_FILE, msg + "\n");
    console.log(msg);
}

// ─── Backend Process Management ──────────────────────────────────────────────
let backendProcess = null;
let mainWindow = null;
let backendPort = 8765;

/**
 * Determine paths to backend resources.
 * In development: use ../backend/ relative to desktop/
 * In production (packaged): use resources/backend/ inside app
 */
function getBackendPaths() {
    const isPackaged = app.isPackaged;

    if (isPackaged) {
        // Production: resources are in process.resourcesPath
        const resourcesPath = process.resourcesPath;
        const backendExe = path.join(resourcesPath, "backend", "backend.exe");
        const backendScript = path.join(resourcesPath, "backend", "main.py");
        return { resourcesPath, backendExe, backendScript, isPackaged };
    } else {
        // Development: backend is in ../backend relative to desktop/
        const devBackendDir = path.join(__dirname, "..", "..", "backend");
        const backendScript = path.join(devBackendDir, "main.py");
        return { resourcesPath: devBackendDir, backendExe: null, backendScript, isPackaged };
    }
}

/**
 * Find a free port starting from the preferred one (R15).
 */
function findFreePort(startPort) {
    return new Promise((resolve) => {
        const net = require("net");
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on("error", () => resolve(findFreePort(startPort + 1)));
    });
}

/**
 * Start the Python backend process.
 * In production uses PyInstaller-bundled backend.exe.
 * In development uses uvicorn directly.
 */
async function startBackend() {
    backendPort = await findFreePort(8765);
    const { backendExe, backendScript, resourcesPath, isPackaged } = getBackendPaths();

    log("INFO", `Starting backend on port ${backendPort}`);
    log("INFO", `Packaged: ${isPackaged}`);

    let command, args, options;

    if (isPackaged && fs.existsSync(backendExe)) {
        // Production: run the bundled backend.exe
        log("INFO", `Using bundled backend: ${backendExe}`);
        command = backendExe;
        args = ["--port", String(backendPort), "--host", "127.0.0.1"];
        options = {
            cwd: path.dirname(backendExe),
            windowsHide: true, // No console window
            env: {
                ...process.env,
                NINYRA_PORT: String(backendPort),
            },
        };
    } else {
        // Development or fallback with Python
        log("INFO", `Using Python/uvicorn: ${backendScript}`);

        // Try to find Python (R15 auto-start)
        const backendDir = path.dirname(backendScript);

        // Check for uvicorn in PATH or local venv
        const pythonCandidates = [
            path.join(backendDir, "..", "venv", "Scripts", "python.exe"),
            path.join(backendDir, "..", ".venv", "Scripts", "python.exe"),
            "python",
            "python3",
        ];

        command = "python";
        for (const candidate of pythonCandidates) {
            if (candidate !== "python" && candidate !== "python3" && fs.existsSync(candidate)) {
                command = candidate;
                break;
            }
        }

        args = [
            "-m", "uvicorn",
            "main:app",
            "--host", "127.0.0.1",
            "--port", String(backendPort),
        ];
        options = {
            cwd: backendDir,
            windowsHide: true,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
            },
        };
    }

    try {
        backendProcess = spawn(command, args, options);

        backendProcess.stdout?.on("data", (data) => {
            log("BACKEND", data.toString().trim());
        });

        backendProcess.stderr?.on("data", (data) => {
            log("BACKEND-ERR", data.toString().trim());
        });

        backendProcess.on("error", (err) => {
            log("ERROR", `Backend process error: ${err.message}`);
        });

        backendProcess.on("exit", (code, signal) => {
            log("INFO", `Backend exited: code=${code}, signal=${signal}`);
            backendProcess = null;
        });

        log("INFO", `Backend process spawned (pid=${backendProcess.pid})`);
    } catch (err) {
        log("ERROR", `Failed to start backend: ${err.message}`);
    }
}

/**
 * Poll /health endpoint until backend responds (R15).
 * Retries every 500ms for up to 30 seconds.
 */
function waitForBackend(port, maxAttempts = 60) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const check = () => {
            attempts++;
            const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
                if (res.statusCode === 200) {
                    log("INFO", `Backend ready on port ${port} after ${attempts} attempts`);
                    resolve(port);
                } else {
                    retry();
                }
            });

            req.on("error", () => {
                if (attempts >= maxAttempts) {
                    reject(new Error(`Backend failed to start after ${maxAttempts} attempts`));
                } else {
                    retry();
                }
            });

            req.setTimeout(1000, () => {
                req.destroy();
                retry();
            });
        };

        const retry = () => setTimeout(check, 500);
        check();
    });
}

/**
 * Create the main application window.
 */
function createWindow(port) {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 900,
        minHeight: 600,
        title: "NinyraWatermark",
        backgroundColor: "#0F0F0F",
        titleBarStyle: "default",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
        },
        icon: path.join(__dirname, "..", "public", "icon.png"),
        show: false, // Don't show until ready
    });

    // Load the React app served by Python backend
    const appUrl = `http://127.0.0.1:${port}`;
    log("INFO", `Loading app from ${appUrl}`);
    mainWindow.loadURL(appUrl);

    // Show window when content is loaded
    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Open DevTools in development
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    // Handle external links — open in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            shell.openExternal(url);
        }
        return { action: "deny" };
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

/**
 * Show a loading screen while backend starts.
 */
function createLoadingWindow() {
    const win = new BrowserWindow({
        width: 420,
        height: 260,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        backgroundColor: "#00000000",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #1A1A1A;
          border-radius: 16px;
          border: 1px solid #333;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #fff;
          overflow: hidden;
        }
        .logo {
          font-size: 32px;
          font-weight: 700;
          background: linear-gradient(135deg, #FF424D, #6366F1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
        }
        .sub {
          font-size: 13px;
          color: #A1A1AA;
          margin-bottom: 32px;
        }
        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #333;
          border-top-color: #FF424D;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status {
          font-size: 12px;
          color: #71717A;
        }
      </style>
    </head>
    <body>
      <div class="logo">NinyraWatermark</div>
      <div class="sub">Smart Watermark Placement</div>
      <div class="spinner"></div>
      <div class="status">Запуск движка...</div>
    </body>
    </html>
  `;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return win;
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    log("INFO", "App ready, starting NinyraWatermark...");

    // Show loading screen
    const loadingWin = createLoadingWindow();

    try {
        // Start backend
        await startBackend();

        // Wait for backend health check
        await waitForBackend(backendPort);

        // Create main window
        createWindow(backendPort);

        // Close loading screen
        loadingWin.close();

    } catch (err) {
        log("ERROR", `Startup failed: ${err.message}`);
        loadingWin.close();

        // Show error dialog
        dialog.showErrorBox(
            "NinyraWatermark — Ошибка запуска",
            `Не удалось запустить движок обработки изображений.\n\n` +
            `Ошибка: ${err.message}\n\n` +
            `Лог: ${LOG_FILE}`
        );
        app.quit();
    }
});

// Kill backend on app quit
app.on("before-quit", () => {
    if (backendProcess && !backendProcess.killed) {
        log("INFO", "Stopping backend process...");
        backendProcess.kill("SIGTERM");

        // Force kill after 3 seconds
        setTimeout(() => {
            if (backendProcess && !backendProcess.killed) {
                backendProcess.kill("SIGKILL");
            }
        }, 3000);
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(backendPort);
    }
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle("get-backend-port", () => backendPort);
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("open-log-file", () => {
    shell.openPath(LOG_FILE);
});
