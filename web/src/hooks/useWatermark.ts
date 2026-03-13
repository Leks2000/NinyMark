/**
 * useWatermark -- Core hook for watermark processing state management.
 * Manages settings, image list, processing, and results.
 */

import { useState, useCallback, useRef } from "react";
import type {
  WatermarkSettings,
  ImageFile,
  ProcessedImage,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { processSingle, processBatch } from "@/lib/api";

interface UseWatermarkReturn {
  settings: WatermarkSettings;
  updateSettings: (partial: Partial<WatermarkSettings>) => void;
  images: ImageFile[];
  addImages: (files: File[]) => Promise<void>;
  removeImage: (id: string) => void;
  clearImages: () => void;
  processedImages: ProcessedImage[];
  isProcessing: boolean;
  progress: number;
  processAll: () => Promise<void>;
  reprocessSingle: (id: string, settings: WatermarkSettings) => Promise<void>;
  clearResults: () => void;
  error: string | null;
  clearError: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Determine the correct MIME type for a base64 preview URL based on filename.
 */
function getMimeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export function useWatermark(): UseWatermarkReturn {
  const [settings, setSettings] = useState<WatermarkSettings>(DEFAULT_SETTINGS);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Use a ref to track images for cleanup, avoiding stale closure in clearImages
  const imagesRef = useRef<ImageFile[]>([]);
  imagesRef.current = images;

  const updateSettings = useCallback(
    (partial: Partial<WatermarkSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const addImages = useCallback(async (files: File[]) => {
    setError(null);
    const validExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    const newImages: ImageFile[] = [];

    for (const file of files) {
      const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      if (!validExtensions.includes(ext)) {
        setError(`Unsupported format: ${file.name}. Use PNG, JPG, or WEBP.`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        const preview = URL.createObjectURL(file);
        newImages.push({
          id: generateId(),
          file,
          name: file.name,
          preview,
          base64,
        });
      } catch {
        setError(`Failed to read file: ${file.name}`);
      }
    }

    setImages((prev) => {
      const total = prev.length + newImages.length;
      if (total > 100) {
        setError("Maximum 100 files allowed per batch.");
        // Revoke preview URLs for images we won't add
        newImages.forEach((img) => URL.revokeObjectURL(img.preview));
        return prev;
      }
      return [...prev, ...newImages];
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
    setProcessedImages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    // Use ref to avoid stale closure -- always gets latest images
    imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setProcessedImages([]);
    setProgress(0);
  }, []);

  const clearResults = useCallback(() => {
    setProcessedImages([]);
    setProgress(0);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const processAll = useCallback(async () => {
    if (images.length === 0) {
      setError("No images to process.");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    // Don't clear results here — the UI will manage persistence/updates
    // setProcessedImages([]); 
    abortRef.current = false;

    try {
      if (images.length === 1) {
        // Single image processing
        const img = images[0];
        const response = await processSingle(img.base64, settings, img.name, true);
        if (abortRef.current) return;

        const mime = getMimeForFilename(img.name);
        const result = {
          id: img.id,
          name: img.name,
          originalPreview: img.preview,
          resultBase64: response.result,
          resultPreview: `data:${mime};base64,${response.result}`,
          zoneUsed: response.zone_used,
          zoneScore: response.zone_score,
        };

        setProcessedImages(prev => {
          const index = prev.findIndex(p => p.id === img.id);
          if (index === -1) return [result];
          const next = [...prev];
          next[index] = result;
          return next;
        });
        setProgress(100);
      } else {
        // Batch: process in parallel chunks of 4 (matching backend capacity)
        const chunkSize = 4;
        let processedCount = 0;

        for (let i = 0; i < images.length; i += chunkSize) {
          if (abortRef.current) break;

          const chunk = images.slice(i, i + chunkSize);

          // Process current chunk in parallel
          const chunkPromises = chunk.map((img) =>
            processSingle(img.base64, settings, img.name, true)
              .then(response => ({
                id: img.id,
                name: img.name,
                originalPreview: img.preview,
                resultBase64: response.result,
                resultPreview: `data:${getMimeForFilename(img.name)};base64,${response.result}`,
                zoneUsed: response.zone_used,
                zoneScore: response.zone_score,
              }))
          );

          const chunkResults = await Promise.all(chunkPromises);
          if (abortRef.current) break;

          processedCount += chunk.length;
          setProcessedImages(prev => {
            const next = [...prev];
            chunkResults.forEach(res => {
              const idx = next.findIndex(p => p.id === res.id);
              if (idx === -1) next.push(res);
              else next[idx] = res;
            });
            return next;
          });
          setProgress(Math.min(100, Math.round((processedCount / images.length) * 100)));
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Processing failed. Check backend.";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [images, settings]);

  /**
   * Re-process a single image in-place (used for instant feedback when settings change).
   */
  const reprocessSingle = useCallback(async (imageId: string, currentSettings: WatermarkSettings) => {
    const img = images.find(i => i.id === imageId);
    if (!img) return;

    try {
      const response = await processSingle(img.base64, currentSettings, img.name, true);
      const mime = getMimeForFilename(img.name);
      const result = {
        id: img.id,
        name: img.name,
        originalPreview: img.preview,
        resultBase64: response.result,
        resultPreview: `data:${mime};base64,${response.result}`,
        zoneUsed: response.zone_used,
        zoneScore: response.zone_score,
      };

      setProcessedImages(prev => {
        const index = prev.findIndex(p => p.id === imageId);
        if (index === -1) return [...prev, result];
        const next = [...prev];
        next[index] = result;
        return next;
      });
    } catch (err) {
      console.error("Failed to re-process individual image:", err);
    }
  }, [images]);

  return {
    settings,
    updateSettings,
    images,
    addImages,
    removeImage,
    clearImages,
    processedImages,
    isProcessing,
    progress,
    processAll,
    reprocessSingle,
    clearResults,
    error,
    clearError,
  };
}
