import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ZoomIn, X, MapPin, Download, Crosshair, Move, Loader2 } from "lucide-react";
import JSZip from "jszip";
import type { ProcessedImage, ImageFile } from "@/types";

interface PreviewProps {
  processedImages: ProcessedImage[];
  isProcessing: boolean;
  progress: number;
  /** Called when user clicks to set manual watermark position (0..1) */
  onManualPlace?: (x: number, y: number) => void;
  /** Whether manual placement mode is active */
  isManualMode?: boolean;
  showOriginal: boolean;
  setShowOriginal: (val: boolean) => void;
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
  settings: import("@/types").WatermarkSettings;
  allImages: ImageFile[];
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
  showOriginal,
  setShowOriginal,
  selectedIdx,
  onSelectIdx,
  settings,
  allImages,
}: PreviewProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
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

  if (allImages.length === 0 && !isProcessing) {
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

  const handleDownloadAll = async () => {
    if (processedImages.length === 0) return;
    setIsDownloadingAll(true);
    try {
      const zip = new JSZip();
      processedImages.forEach((img) => {
        // base64 is resultBase64
        zip.file(buildDownloadName(img.name), img.resultBase64, { base64: true });
      });
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `watermarked_images_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Failed to create ZIP:", err);
      // Fallback to individual downloads
      processedImages.forEach((img, idx) => {
        setTimeout(() => handleDownload(img), idx * 200);
      });
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const isSingle = allImages.length === 1;
  const currentProcessed = processedImages[selectedIdx];
  const currentRaw = allImages[selectedIdx];

  // What to show in the main view
  const displayUrl = showOriginal || !currentProcessed
    ? currentRaw?.preview
    : currentProcessed?.resultPreview;

  const displayName = currentProcessed?.name || currentRaw?.name || "Image";

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
              Results ({allImages.length})
            </h2>
            <button
              onClick={handleDownloadAll}
              disabled={isDownloadingAll || processedImages.length === 0}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {isDownloadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isDownloadingAll ? "Exporting..." : "Download All (.zip)"}
            </button>
          </div>

          {/* Single image view */}
          {isSingle && (currentProcessed || currentRaw) && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent" />
                  <span className="text-sm text-text-secondary">
                    Zone: <strong className="text-text-primary">{currentProcessed?.zoneUsed || "Manual"}</strong>
                    {currentProcessed && ` (score: ${currentProcessed.zoneScore.toFixed(1)})`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!currentProcessed}
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-30"
                  >
                    {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showOriginal ? "Show Result" : "Show Original"}
                  </button>
                  <button
                    disabled={!currentProcessed}
                    onClick={() => currentProcessed && handleDownload(currentProcessed)}
                    className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-30"
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
                className={`relative rounded-lg overflow-hidden bg-bg-hover ${isManualMode ? "cursor-crosshair" : "cursor-zoom-in"
                  }`}
                onClick={(e) => {
                  if (isManualMode && onManualPlace) {
                    const pos = getRelativePos(e);
                    if (pos) onManualPlace(pos.x, pos.y);
                  } else {
                    setLightboxImage(showOriginal ? currentRaw?.preview : currentProcessed?.resultPreview);
                  }
                }}
                onMouseMove={(e) => {
                  if (isManualMode) {
                    setHoverPos(getRelativePos(e));
                  }
                }}
                onMouseLeave={() => setHoverPos(null)}
              >
                {/* Ghost Watermark / Placement Cursor */}
                {(isManualMode || settings.manual_x !== null) && (
                  <motion.div
                    className="absolute pointer-events-none z-10"
                    initial={false}
                    animate={{
                      left: `${((hoverPos?.x ?? settings.manual_x ?? 0.5) * 100).toFixed(2)}%`,
                      top: `${((hoverPos?.y ?? settings.manual_y ?? 0.5) * 100).toFixed(2)}%`,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                    style={{ transform: "translate(-50%, -50%)" }}
                  >
                    {/* Ghost Content */}
                    <div
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-all duration-200
                        ${settings.color === "light" ? "bg-black/40 border-white/20 text-white" : "bg-white/40 border-black/20 text-black"}
                        ${isManualMode ? "opacity-100 scale-110 shadow-lg shadow-accent/20 border-accent" : "opacity-40 scale-100"}
                      `}
                      style={{ opacity: isProcessing ? 0.3 : (isManualMode ? 1 : settings.opacity) }}
                    >
                      {/* Simple visual proxy for different styles */}
                      {settings.style !== "text" && (
                        <div className={`w-4 h-4 rounded-full ${settings.color === "light" ? "bg-white/80" : "bg-black/80"}`} />
                      )}
                      <span className="text-xs font-bold whitespace-nowrap">
                        {settings.custom_text || "patreon.com/Ninyra"}
                      </span>
                    </div>

                    {/* Accurate Crosshair for placement mode */}
                    {isManualMode && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 border-2 border-accent rounded-full flex items-center justify-center pointer-events-none">
                        <div className="w-0.5 h-10 bg-accent absolute" />
                        <div className="w-10 h-0.5 bg-accent absolute" />
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Plain img to avoid Hook issues with AnimatePresence key transitions */}
                <img
                  ref={imgRef}
                  src={displayUrl}
                  alt={displayName}
                  className="w-full max-h-[600px] object-contain select-none"
                  draggable={false}
                />

                <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs">
                  {showOriginal || !currentProcessed ? "Original" : "Watermarked"}
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
              {allImages.map((img, idx) => {
                const proc = processedImages.find(p => p.id === img.id);
                return (
                  <motion.div
                    key={img.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`card p-2 cursor-pointer transition-all ${selectedIdx === idx ? "ring-2 ring-accent" : ""}`}
                    onClick={() => {
                      onSelectIdx(idx);
                      setShowOriginal(false);
                    }}
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-bg-hover mb-2 relative">
                      <img
                        src={proc ? proc.resultPreview : img.preview}
                        alt={img.name}
                        className={`w-full h-full object-cover ${!proc ? "blur-sm opacity-50" : ""}`}
                        loading="lazy"
                      />
                      {!proc && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 animate-spin text-accent" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs truncate flex-1 text-text-secondary">{img.name}</p>
                      {proc && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(proc); }}
                          className="ml-1 p-1 hover:bg-bg-hover rounded transition-colors"
                          title="Download"
                        >
                          <Download className="w-3 h-3 text-text-muted" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {proc ? `${proc.zoneUsed} (${proc.zoneScore.toFixed(1)})` : "Waiting..."}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Batch selected detail */}
          {!isSingle && (currentProcessed || currentRaw) && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{displayName}</span>
                <div className="flex items-center gap-2">
                  {currentProcessed && (
                    <span className="text-xs text-text-muted">
                      Zone: {currentProcessed.zoneUsed} ({currentProcessed.zoneScore.toFixed(1)})
                    </span>
                  )}
                  <button
                    disabled={!currentProcessed}
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-30"
                  >
                    {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showOriginal ? "Result" : "Original"}
                  </button>
                  <button
                    disabled={!currentProcessed}
                    onClick={() => currentProcessed && handleDownload(currentProcessed)}
                    className="btn-primary text-xs disabled:opacity-30"
                  >
                    Save
                  </button>
                </div>
              </div>
              <div
                className={`relative rounded-lg overflow-hidden bg-bg-hover ${isManualMode ? "cursor-crosshair" : "cursor-zoom-in"}`}
                onClick={(e) => {
                  if (isManualMode && onManualPlace) {
                    const pos = getRelativePos(e);
                    if (pos) onManualPlace(pos.x, pos.y);
                  } else {
                    setLightboxImage(showOriginal ? currentRaw?.preview : currentProcessed?.resultPreview);
                  }
                }}
                onMouseMove={(e) => {
                  if (isManualMode) setHoverPos(getRelativePos(e));
                }}
                onMouseLeave={() => setHoverPos(null)}
              >
                {/* Ghost Watermark / Placement Cursor (Batch Mode) */}
                {(isManualMode || settings.manual_x !== null) && (
                  <motion.div
                    className="absolute pointer-events-none z-10"
                    initial={false}
                    animate={{
                      left: `${((hoverPos?.x ?? settings.manual_x ?? 0.5) * 100).toFixed(2)}%`,
                      top: `${((hoverPos?.y ?? settings.manual_y ?? 0.5) * 100).toFixed(2)}%`,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                    style={{ transform: "translate(-50%, -50%)" }}
                  >
                    <div
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-all duration-200
                        ${settings.color === "light" ? "bg-black/40 border-white/20 text-white" : "bg-white/40 border-black/20 text-black"}
                        ${isManualMode ? "opacity-100 scale-110 shadow-lg shadow-accent/20 border-accent" : "opacity-40 scale-100"}
                      `}
                      style={{ opacity: isProcessing ? 0.3 : (isManualMode ? 1 : settings.opacity) }}
                    >
                      {settings.style !== "text" && (
                        <div className={`w-3 h-3 rounded-full ${settings.color === "light" ? "bg-white/80" : "bg-black/80"}`} />
                      )}
                      <span className="text-[10px] font-bold whitespace-nowrap">
                        {settings.custom_text || "patreon.com/Ninyra"}
                      </span>
                    </div>
                  </motion.div>
                )}

                <img
                  ref={imgRef}
                  src={displayUrl}
                  alt={displayName}
                  className="w-full max-h-[500px] object-contain select-none"
                  draggable={false}
                />
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
