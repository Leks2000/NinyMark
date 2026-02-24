/**
 * App — Main application component.
 * NinyraWatermark: Smart watermark placement tool.
 *
 * Layout: Header → DropZone (center) ← Settings (sidebar)
 * Rule R9: Dark theme. R3: Error handling.
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, Keyboard } from "lucide-react";

import { Header } from "@/components/Header";
import { DropZone } from "@/components/DropZone";
import { Settings } from "@/components/Settings";
import { Preview } from "@/components/Preview";
import { ErrorToast } from "@/components/ErrorToast";
import { useWatermark } from "@/hooks/useWatermark";
import { healthCheck } from "@/lib/api";

export function App() {
  const [backendOnline, setBackendOnline] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const {
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
  } = useWatermark();

  // Health check polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const check = async () => {
      const online = await healthCheck();
      setBackendOnline(online);
    };

    check();
    interval = setInterval(check, 5000);

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+O — open file picker (simulated)
      if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".png,.jpg,.jpeg,.webp";
        input.multiple = true;
        input.onchange = () => {
          if (input.files) {
            addImages(Array.from(input.files));
          }
        };
        input.click();
      }

      // Ctrl+Shift+B — batch process
      if (e.ctrlKey && e.shiftKey && e.key === "B") {
        e.preventDefault();
        if (images.length > 0 && !isProcessing) {
          processAll();
        }
      }

      // Escape — close lightbox / shortcuts
      if (e.key === "Escape") {
        setShowShortcuts(false);
      }

      // ? — toggle shortcuts help
      if (e.key === "?" && !e.ctrlKey) {
        setShowShortcuts((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addImages, images.length, isProcessing, processAll]);

  const canProcess = images.length > 0 && !isProcessing && backendOnline;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header backendOnline={backendOnline} />

      <main className="flex-1 flex flex-col lg:flex-row gap-0">
        {/* Main content area */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Drop zone */}
          <DropZone
            images={images}
            onAddImages={addImages}
            onRemoveImage={removeImage}
            onClearImages={clearImages}
            disabled={isProcessing}
          />

          {/* Process button */}
          {images.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-4"
            >
              <button
                onClick={processAll}
                disabled={!canProcess}
                className="btn-primary text-base px-8 py-3 flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                {isProcessing
                  ? `Processing... ${progress}%`
                  : images.length === 1
                  ? "Apply Watermark"
                  : `Process ${images.length} Images`}
              </button>
              {processedImages.length > 0 && !isProcessing && (
                <button
                  onClick={clearResults}
                  className="btn-secondary text-sm"
                >
                  Clear Results
                </button>
              )}
            </motion.div>
          )}

          {/* Backend offline warning */}
          {!backendOnline && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center"
            >
              <p className="text-yellow-400 font-medium">
                Backend is offline
              </p>
              <p className="text-yellow-400/70 text-sm mt-1">
                Start the Python backend:{" "}
                <code className="bg-bg-card px-2 py-0.5 rounded text-xs">
                  uvicorn backend.main:app --port 8765
                </code>
              </p>
            </motion.div>
          )}

          {/* Preview / Results */}
          <Preview
            processedImages={processedImages}
            isProcessing={isProcessing}
            progress={progress}
          />
        </div>

        {/* Settings sidebar */}
        <div className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-bg-hover p-6 overflow-y-auto">
          <Settings
            settings={settings}
            onUpdate={updateSettings}
            disabled={isProcessing}
          />

          {/* Keyboard shortcuts hint */}
          <div className="mt-4 card bg-bg/50">
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary w-full"
            >
              <Keyboard className="w-3.5 h-3.5" />
              Keyboard Shortcuts
            </button>
            {showShortcuts && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 space-y-1 text-xs text-text-muted"
              >
                <div className="flex justify-between">
                  <span>Open files</span>
                  <kbd className="bg-bg-hover px-1.5 py-0.5 rounded text-[10px]">
                    Ctrl+O
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span>Batch process</span>
                  <kbd className="bg-bg-hover px-1.5 py-0.5 rounded text-[10px]">
                    Ctrl+Shift+B
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span>Toggle shortcuts</span>
                  <kbd className="bg-bg-hover px-1.5 py-0.5 rounded text-[10px]">
                    ?
                  </kbd>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* Error toast */}
      <ErrorToast message={error} onDismiss={clearError} />
    </div>
  );
}
