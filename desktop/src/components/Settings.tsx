/**
 * Settings — Watermark configuration panel.
 * Rule R9: Dark theme colors. No `any` types.
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Save, ChevronDown, RotateCcw } from "lucide-react";
import type {
  WatermarkSettings,
  WatermarkStyleType,
  WatermarkSizeType,
  WatermarkColorType,
  PresetsMap,
} from "@/types";
import {
  DEFAULT_SETTINGS,
  STYLE_LABELS,
  STYLE_DESCRIPTIONS,
  SIZE_LABELS,
} from "@/types";
import { getPresets, savePreset } from "@/lib/api";

interface SettingsProps {
  settings: WatermarkSettings;
  onUpdate: (partial: Partial<WatermarkSettings>) => void;
  disabled: boolean;
}

const STYLES: WatermarkStyleType[] = ["text", "icon_text", "branded_block"];
const SIZES: WatermarkSizeType[] = ["S", "M", "L"];

export function Settings({ settings, onUpdate, disabled }: SettingsProps) {
  const [presets, setPresets] = useState<PresetsMap>({});
  const [presetName, setPresetName] = useState("");
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  useEffect(() => {
    getPresets()
      .then(setPresets)
      .catch(() => {
        /* presets not critical */
      });
  }, []);

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) return;
    try {
      await savePreset(presetName.trim(), settings);
      const updated = await getPresets();
      setPresets(updated);
      setPresetName("");
      setShowPresetSave(false);
    } catch {
      /* silent — non-critical */
    }
  }, [presetName, settings]);

  const handleLoadPreset = useCallback(
    (name: string) => {
      const preset = presets[name];
      if (preset) {
        onUpdate({
          style: preset.style as WatermarkStyleType,
          opacity: preset.opacity as number,
          size: preset.size as WatermarkSizeType,
          padding: preset.padding as number,
          color: preset.color as WatermarkColorType,
          custom_text: preset.custom_text as string,
        });
      }
      setPresetsOpen(false);
    },
    [presets, onUpdate]
  );

  const resetDefaults = useCallback(() => {
    onUpdate(DEFAULT_SETTINGS);
  }, [onUpdate]);

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Settings</h2>
        <button
          onClick={resetDefaults}
          className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
          disabled={disabled}
          title="Reset to defaults"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Watermark Style */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">
          Watermark Style
        </label>
        <div className="grid grid-cols-1 gap-2">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ style: s })}
              disabled={disabled}
              className={`
                text-left p-3 rounded-lg border transition-all duration-200
                ${settings.style === s
                  ? "border-accent bg-accent/10"
                  : "border-bg-hover hover:border-text-muted bg-bg"
                }
              `}
            >
              <div className="font-medium text-sm">{STYLE_LABELS[s]}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {STYLE_DESCRIPTIONS[s]}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-sm font-medium text-text-secondary">
            Opacity
          </label>
          <span className="text-sm text-text-muted">
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={30}
          max={100}
          value={Math.round(settings.opacity * 100)}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
          disabled={disabled}
          className="w-full h-2 bg-bg-hover rounded-full appearance-none cursor-pointer
                     accent-accent"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>30%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Size */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">Size</label>
        <div className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ size: s })}
              disabled={disabled}
              className={`
                py-2 rounded-lg border text-sm font-medium transition-all duration-200
                ${settings.size === s
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-bg-hover hover:border-text-muted"
                }
              `}
            >
              {SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Padding */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-sm font-medium text-text-secondary">
            Edge Padding
          </label>
          <span className="text-sm text-text-muted">{settings.padding}px</span>
        </div>
        <input
          type="range"
          min={10}
          max={50}
          value={settings.padding}
          onChange={(e) => onUpdate({ padding: Number(e.target.value) })}
          disabled={disabled}
          className="w-full h-2 bg-bg-hover rounded-full appearance-none cursor-pointer
                     accent-accent"
        />
      </div>

      {/* Color Theme */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">
          Color Theme
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onUpdate({ color: "light" })}
            disabled={disabled}
            className={`
              py-2 rounded-lg border text-sm font-medium transition-all
              ${settings.color === "light"
                ? "border-accent bg-accent/10 text-accent"
                : "border-bg-hover hover:border-text-muted"
              }
            `}
          >
            Light
          </button>
          <button
            onClick={() => onUpdate({ color: "dark" })}
            disabled={disabled}
            className={`
              py-2 rounded-lg border text-sm font-medium transition-all
              ${settings.color === "dark"
                ? "border-accent bg-accent/10 text-accent"
                : "border-bg-hover hover:border-text-muted"
              }
            `}
          >
            Dark
          </button>
        </div>
      </div>

      {/* Custom Text */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">
          Watermark Text
        </label>
        <input
          type="text"
          value={settings.custom_text}
          onChange={(e) => onUpdate({ custom_text: e.target.value })}
          disabled={disabled}
          className="input-field text-sm"
          placeholder="patreon.com/Ninyra"
        />
      </div>

      {/* Presets */}
      <div className="space-y-2 pt-2 border-t border-bg-hover">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">
            Presets
          </label>
          <button
            onClick={() => setShowPresetSave(!showPresetSave)}
            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
            disabled={disabled}
          >
            <Save className="w-3 h-3" />
            Save current
          </button>
        </div>

        {/* Preset save input */}
        {showPresetSave && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="input-field text-sm flex-1"
              placeholder="Preset name..."
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
            />
            <button
              onClick={handleSavePreset}
              className="btn-primary text-xs px-3"
              disabled={!presetName.trim()}
            >
              Save
            </button>
          </motion.div>
        )}

        {/* Preset selector */}
        <div className="relative">
          <button
            onClick={() => setPresetsOpen(!presetsOpen)}
            className="w-full flex items-center justify-between input-field text-sm"
            disabled={disabled}
          >
            <span className="text-text-muted">Load preset...</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                presetsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {presetsOpen && Object.keys(presets).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute z-10 mt-1 w-full bg-bg-card border border-bg-hover
                         rounded-lg shadow-lg overflow-hidden"
            >
              {Object.keys(presets).map((name) => (
                <button
                  key={name}
                  onClick={() => handleLoadPreset(name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover
                             transition-colors border-b border-bg-hover/50 last:border-b-0"
                >
                  {name}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
