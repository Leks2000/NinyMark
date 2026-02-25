/**
 * Preview -- Before/After image preview with comparison toggle.
 * Rule R11: Before/after preview mandatory. Clickable for full-size.
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ZoomIn, X, MapPin, Download, Crosshair, Move } from "lucide-react";
import type { ProcessedImage } from "@/types";

interface PreviewProps {
  processedImages: ProcessedImage[];
  isProcessing: boolean;
  progress: number;
  /** Called when user clicks to set manual watermark position (0..1) */
  onManualPlace?: (x: number, y: number) => void;
  /** Whether manual placement mode is active */
  isManualMode?: boolean;
}

/**
 * Build a safe download filename from the original name.
 */
function buildDownloadName(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".");
  if (lastDot === -1) {
    return `watermarked_${originalName}.png`;
  }
  const baseName = originalName.substring(0, lastDot);
  const ext = originalName.substring(lastDot);
  return `watermarked_${baseName}${ext}`;
}

export function Preview({
  processedImages,
  isProcessing,
  progress,
  onManualPlace,
  isManualMode = false,
}: PreviewProps) {
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Convert mouse event to normalized (0..1) coords relative to the image element
  // MUST be defined before the early return to avoid React Hook Error #310
  const getRelativePos = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
      const img = imgRef.current;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      return { x, y };
    },
    []
  );

  if (processedImages.length === 0 && !isProcessing) {
    return null;
  }

  const handleDownload = (image: ProcessedImage) => {
    const link = document.createElement("a");
    link.href = image.resultPreview;
    link.download = buildDownloadName(image.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    processedImages.forEach((img, idx) => {
      setTimeout(() => handleDownload(img), idx * 200);
    });
  };

  const isSingle = processedImages.length === 1;
  const current = selectedImage || processedImages[0];

  return (
    <div className="space-y-4">
      {/* Progress bar during processing */}
      {isProcessing && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Processing...</span>
            <span className="text-sm text-text-muted">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-bg-hover rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {processedImages.length > 0 && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Results ({processedImages.length})
            </h2>
            <button onClick={handleDownloadAll} className="btn-primary text-sm flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download All
            </button>
          </div>

          {/* Single image view */}
          {isSingle && current && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent" />
                  <span className="text-sm text-text-secondary">
                    Zone: <strong className="text-text-primary">{current.zoneUsed}</strong>
                    {" "}(score: {current.zoneScore.toFixed(1)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showOriginal ? "Show Result" : "Show Original"}
                  </button>
                  <button
                    onClick={() => handleDownload(current)}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save
                  </button>
                </div>
              </div>

              {/* Manual placement hint */}
              {isManualMode && onManualPlace && (
                <div className="flex items-center gap-2 text-xs text-accent bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
                  <Crosshair className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Click anywhere on the image to set watermark position</span>
                </div>
              )}

              <div
                className={`relative rounded-lg overflow-hidden bg-bg-hover ${
                  isManualMode ? "cursor-crosshair" : "cursor-zoom-in"
                }`}
                onClick={(e) => {
                  if (isManualMode && onManualPlace) {
                    const pos = getRelativePos(e);
                    if (pos) onManualPlace(pos.x, pos.y);
                  } else {
                    setLightboxImage(showOriginal ? current.originalPreview : current.resultPreview);
                  }
                }}
                onMouseMove={(e) => {
                  if (isManualMode) {
                    setHoverPos(getRelativePos(e));
                  }
                }}
                onMouseLeave={() => setHoverPos(null)}
              >
                {/* Crosshair overlay in manual mode */}
                {isManualMode && hoverPos && (
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{ left: `${hoverPos.x * 100}%`, top: `${hoverPos.y * 100}%`, transform: "translate(-50%, -50%)" }}
                  >
                    <div className="w-6 h-6 border-2 border-accent rounded-full flex items-center justify-center">
                      <div className="w-0.5 h-8 bg-accent absolute" />
                      <div className="w-8 h-0.5 bg-accent absolute" />
                    </div>
                  </div>
                )}

                {/* Plain img to avoid Hook issues with AnimatePresence key transitions */}
                <img
                  ref={imgRef}
                  key={showOriginal ? "original" : "result"}
                  src={showOriginal ? current.originalPreview : current.resultPreview}
                  alt={showOriginal ? "Original" : "Watermarked"}
                  className="w-full max-h-[600px] object-contain select-none"
                  draggable={false}
                />
                
                <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs">
                  {showOriginal ? "Original" : "Watermarked"}
                </div>
                <div className="absolute bottom-2 right-2 bg-black/60 p-1.5 rounded-full">
                  {isManualMode ? <Move className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                </div>
              </div>
            </div>
          )}

          {/* Batch: Grid thumbnails */}
          {!isSingle && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {processedImages.map((img) => (
                <motion.div
                  key={img.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`card p-2 cursor-pointer transition-all ${current?.id === img.id ? "ring-2 ring-accent" : ""}`}
                  onClick={() => {
                    setSelectedImage(img);
                    setShowOriginal(false);
                  }}
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-bg-hover mb-2">
                    <img src={img.resultPreview} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs truncate flex-1 text-text-secondary">{img.name}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(img); }}
                      className="ml-1 p-1 hover:bg-bg-hover rounded transition-colors"
                      title="Download"
                    >
                      <Download className="w-3 h-3 text-text-muted" />
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">{img.zoneUsed} ({img.zoneScore.toFixed(1)})</p>
                </motion.div>
              ))}
            </div>
          )}

          {/* Batch selected detail */}
          {!isSingle && current && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{current.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    Zone: {current.zoneUsed} ({current.zoneScore.toFixed(1)})
                  </span>
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showOriginal ? "Result" : "Original"}
                  </button>
                  <button onClick={() => handleDownload(current)} className="btn-primary text-xs">Save</button>
                </div>
              </div>
              <div
                className="rounded-lg overflow-hidden bg-bg-hover cursor-zoom-in"
                onClick={() => setLightboxImage(showOriginal ? current.originalPreview : current.resultPreview)}
              >
                <img src={showOriginal ? current.originalPreview : current.resultPreview} alt={current.name} className="w-full max-h-[500px] object-contain" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <button className="absolute top-4 right-4 bg-white/10 p-2 rounded-full hover:bg-white/20" onClick={() => setLightboxImage(null)}>
              <X className="w-6 h-6" />
            </button>
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} src={lightboxImage} alt="Full size preview" className="max-w-full max-h-full object-contain rounded-lg" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
