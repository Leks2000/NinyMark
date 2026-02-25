/**
 * NinyraWatermark — TypeScript type definitions.
 * Rule R2: No `any` types. All interfaces in dedicated types file.
 */

export type WatermarkStyleType = "text" | "icon_text" | "branded_block";
export type WatermarkSizeType = "S" | "M" | "L";
export type WatermarkColorType = "light" | "dark";

export interface WatermarkSettings {
  style: WatermarkStyleType;
  opacity: number;
  size: WatermarkSizeType;
  padding: number;
  color: WatermarkColorType;
  custom_text: string;
  /** Override S/M/L — fraction of image width (0.03–0.40). null = use size enum. */
  custom_size_pct: number | null;
  /** Manual placement X as fraction of image width (0.0–1.0). null = auto zone. */
  manual_x: number | null;
  /** Manual placement Y as fraction of image height (0.0–1.0). null = auto zone. */
  manual_y: number | null;
}

export interface ImageFile {
  id: string;
  file: File;
  name: string;
  preview: string;
  base64: string;
}

export interface ProcessedImage {
  id: string;
  name: string;
  originalPreview: string;
  resultBase64: string;
  resultPreview: string;
  zoneUsed: string;
  zoneScore: number;
}

export interface SingleResponse {
  result: string;
  zone_used: string;
  zone_score: number;
}

export interface BatchResultItem {
  name: string;
  data: string;
  zone_used: string;
  zone_score: number;
}

export interface BatchResponse {
  results: BatchResultItem[];
}

export interface Preset {
  style: WatermarkStyleType;
  opacity: number;
  size: WatermarkSizeType;
  padding: number;
  color: WatermarkColorType;
  custom_text: string;
  custom_size_pct?: number | null;
  manual_x?: number | null;
  manual_y?: number | null;
}

export interface PresetsMap {
  [name: string]: Preset;
}

export const DEFAULT_SETTINGS: WatermarkSettings = {
  style: "branded_block",
  opacity: 0.75,
  size: "M",
  padding: 20,
  color: "light",
  custom_text: "patreon.com/Ninyra",
  custom_size_pct: null,
  manual_x: null,
  manual_y: null,
};

export const STYLE_LABELS: Record<WatermarkStyleType, string> = {
  text: "Text Only",
  icon_text: "Icon + Text",
  branded_block: "Branded Block",
};

export const STYLE_DESCRIPTIONS: Record<WatermarkStyleType, string> = {
  text: "Clean text with drop shadow",
  icon_text: "Patreon icon alongside text",
  branded_block: "Frosted glass card with icon & text",
};

export const SIZE_LABELS: Record<WatermarkSizeType, string> = {
  S: "Small (8%)",
  M: "Medium (12%)",
  L: "Large (18%)",
};

export const ACCEPTED_FORMATS: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};
