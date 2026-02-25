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
  // If we're in a sandbox proxy, replace the port prefix in the hostname
  if (hostname.includes("-") && hostname.includes("sandbox")) {
    const backendHost = hostname.replace(/^\d+-/, "8765-");
    return `${protocol}//${backendHost}`;
  }
  // Local development: use the Vite proxy
  return "/api";
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
