/**
 * useWatermark — Core hook for watermark processing state management.
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

export function useWatermark(): UseWatermarkReturn {
  const [settings, setSettings] = useState<WatermarkSettings>(DEFAULT_SETTINGS);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

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
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setProcessedImages([]);
    setProgress(0);
  }, [images]);

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
    setProcessedImages([]);
    abortRef.current = false;

    try {
      if (images.length === 1) {
        // Single image processing
        const img = images[0];
        const response = await processSingle(img.base64, settings, img.name);
        if (abortRef.current) return;

        setProcessedImages([
          {
            id: img.id,
            name: img.name,
            originalPreview: img.preview,
            resultBase64: response.result,
            resultPreview: `data:image/png;base64,${response.result}`,
            zoneUsed: response.zone_used,
            zoneScore: response.zone_score,
          },
        ]);
        setProgress(100);
      } else {
        // Batch: process in chunks of 5 for progress feedback
        const chunkSize = 5;
        const results: ProcessedImage[] = [];

        for (let i = 0; i < images.length; i += chunkSize) {
          if (abortRef.current) break;

          const chunk = images.slice(i, i + chunkSize);
          const batchPayload = chunk.map((img) => ({
            name: img.name,
            data: img.base64,
          }));

          const response = await processBatch(batchPayload, settings);

          for (let j = 0; j < response.results.length; j++) {
            const res = response.results[j];
            const original = chunk[j];
            results.push({
              id: original.id,
              name: res.name,
              originalPreview: original.preview,
              resultBase64: res.data,
              resultPreview: `data:image/png;base64,${res.data}`,
              zoneUsed: res.zone_used,
              zoneScore: res.zone_score,
            });
          }

          setProcessedImages([...results]);
          setProgress(
            Math.min(100, Math.round(((i + chunk.length) / images.length) * 100))
          );
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
    clearResults,
    error,
    clearError,
  };
}
