/**
 * API client for NinyraWatermark backend.
 * Handles:
 * - Electron mode: app loaded from http://127.0.0.1:{port} — same origin, no prefix
 * - Dev mode: routes proxied directly via vite.config.ts
 * - Sandbox proxy environments
 */

import type {
  WatermarkSettings,
  SingleResponse,
  BatchResponse,
  PresetsMap,
} from "@/types";

// Electron preload exposes window.electronAPI (see electron/preload.js)
declare global {
  interface Window {
    electronAPI?: {
      getBackendPort: () => Promise<number>;
      getAppVersion: () => Promise<string>;
      openLogFile: () => Promise<void>;
      isElectron: boolean;
    };
  }
}

// Backend ports range (R15 — fallback ports 8765..8769)
const BACKEND_PORTS = [8765, 8766, 8767, 8768, 8769];

function detectApiBase(): string {
  const { hostname, port, protocol } = window.location;

  // Electron / Python backend serving: identical port → use same origin (no prefix)
  if (BACKEND_PORTS.includes(Number(port))) {
    return "";
  }

  // Sandbox/cloud dev environment proxy detection
  if (hostname.includes("-") && hostname.includes("sandbox")) {
    const backendHost = hostname.replace(/^\d+-/, "8765-");
    return `${protocol}//${backendHost}`;
  }

  // Local Vite dev — routes proxied via vite.config.ts
  return "";
}

const API_BASE = detectApiBase();

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = "Unknown error";
    try {
      const errBody = await response.json();
      detail = errBody.detail || JSON.stringify(errBody);
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(detail, response.status);
  }

  return response.json() as Promise<T>;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await apiRequest<{ status: string }>("/health");
    return result.status === "ok";
  } catch {
    return false;
  }
}

export async function processSingle(
  imageBase64: string,
  settings: WatermarkSettings,
  name: string
): Promise<SingleResponse> {
  return apiRequest<SingleResponse>("/process/single", {
    method: "POST",
    body: JSON.stringify({
      image: imageBase64,
      settings,
      name,
    }),
  });
}

export async function processBatch(
  images: { name: string; data: string }[],
  settings: WatermarkSettings
): Promise<BatchResponse> {
  return apiRequest<BatchResponse>("/process/batch", {
    method: "POST",
    body: JSON.stringify({ images, settings }),
  });
}

export async function getPresets(): Promise<PresetsMap> {
  const result = await apiRequest<{ presets: PresetsMap }>("/presets");
  return result.presets;
}

export async function savePreset(
  name: string,
  settings: WatermarkSettings
): Promise<void> {
  await apiRequest("/presets", {
    method: "POST",
    body: JSON.stringify({ name, settings }),
  });
}

export async function deletePreset(name: string): Promise<void> {
  await apiRequest(`/presets/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}
