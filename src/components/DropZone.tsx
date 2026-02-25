/**
 * DropZone -- Drag & drop + file picker component.
 * Rule R10: Visual highlight on drag, accept only PNG/JPG/JPEG/WEBP.
 */

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ImagePlus, X, Trash2 } from "lucide-react";
import type { ImageFile } from "@/types";
import { ACCEPTED_FORMATS } from "@/types";

interface DropZoneProps {
  images: ImageFile[];
  onAddImages: (files: File[]) => Promise<void>;
  onRemoveImage: (id: string) => void;
  onClearImages: () => void;
  disabled: boolean;
}

export function DropZone({
  images,
  onAddImages,
  onRemoveImage,
  onClearImages,
  disabled,
}: DropZoneProps) {
  const [dragError, setDragError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[], rejected: { file: File }[]) => {
      setDragError(null);
      if (rejected.length > 0) {
        setDragError(
          `${rejected.length} file(s) rejected. Only PNG, JPG, JPEG, WEBP allowed.`
        );
      }
      if (accepted.length > 0) {
        await onAddImages(accepted);
      }
    },
    [onAddImages]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    disabled,
    multiple: true,
    maxFiles: 100,
  });

  const hasImages = images.length > 0;

  return (
    <div className="space-y-4">
      {/* Drop area — use a plain div for dropzone to avoid Framer Motion type conflict */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-300 min-h-[200px] flex flex-col items-center justify-center
          ${isDragActive
            ? "border-accent bg-accent/10 scale-[1.02]"
            : "border-bg-hover hover:border-text-muted hover:bg-bg-card/50"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />
        <AnimatePresence mode="wait">
          {isDragActive ? (
            <motion.div
              key="dragging"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <ImagePlus className="w-12 h-12 text-accent" />
              <p className="text-lg font-semibold text-accent">
                Drop images here
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <Upload className="w-10 h-10 text-text-muted" />
              <div>
                <p className="text-lg font-medium">
                  Drag & drop images here
                </p>
                <p className="text-sm text-text-muted mt-1">
                  or click to browse -- PNG, JPG, WEBP (up to 100 files)
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {dragError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm"
          >
            {dragError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image thumbnails */}
      {hasImages && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              {images.length} image{images.length > 1 ? "s" : ""} loaded
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearImages();
              }}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-red-400 transition-colors"
              disabled={disabled}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            <AnimatePresence>
              {images.map((img) => (
                <motion.div
                  key={img.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group aspect-square rounded-lg overflow-hidden bg-bg-hover"
                >
                  <img
                    src={img.preview}
                    alt={img.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {!disabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(img.id);
                      }}
                      className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5
                                 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5
                                  opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">
                      {img.name}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
