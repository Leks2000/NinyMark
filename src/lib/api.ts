/**
 * API client for NinyraWatermark backend.
 * Uses /api proxy in dev, or detects the backend URL from the current hostname
 * when accessed through a sandbox/proxy environment.
 */

import type {
  WatermarkSettings,
  SingleResponse,
  BatchResponse,
  PresetsMap,
} from "@/types";

function detectApiBase(): string {
  const { hostname, protocol, port } = window.location;

  // If served from the backend itself (same origin), no prefix needed
  if (port === "8765" || hostname.includes("8765")) {
    return "";
  }

  // If we're in a sandbox/proxy environment, replace the port prefix
  // Pattern: "<port>-<sandbox-id>.<domain>" -> "8765-<sandbox-id>.<domain>"
  if (
    hostname.match(/^\d+-/) &&
    (hostname.includes("sandbox") || hostname.includes(".dev"))
  ) {
    const backendHost = hostname.replace(/^\d+-/, "8765-");
    return `${protocol}//${backendHost}`;
  }

  // Local development or deployed with reverse proxy: use the Vite proxy
  return "/api";
}

let _apiBase: string | null = null;

function getApiBase(): string {
  if (_apiBase === null) {
    _apiBase = detectApiBase();
  }
  return _apiBase;
}

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
  const base = getApiBase();
  const url = `${base}${endpoint}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = "Unknown error";
    try {
      const errBody: Record<string, unknown> = await response.json();
      detail =
        typeof errBody.detail === "string"
          ? errBody.detail
          : JSON.stringify(errBody);
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
