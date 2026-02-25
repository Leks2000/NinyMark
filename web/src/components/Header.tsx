/**
 * Header — App title bar with branding and status.
 */

import { motion } from "framer-motion";

interface HeaderProps {
  backendOnline: boolean;
}

export function Header({ backendOnline }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-bg-hover">
      <div className="flex items-center gap-3">
        {/* Logo / Brand icon */}
        <motion.div
          className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center"
          whileHover={{ rotate: 10, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="14" cy="7.5" r="5" fill="white" />
            <rect x="2" y="2" width="4" height="20" rx="1.5" fill="white" />
          </svg>
        </motion.div>

        <div>
          <h1 className="text-lg font-bold tracking-tight">
            Ninyra<span className="text-accent">Watermark</span>
          </h1>
          <p className="text-xs text-text-muted -mt-0.5">
            Smart watermark placement tool
          </p>
        </div>
      </div>

      {/* Backend status */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            backendOnline
              ? "bg-green-500 shadow-sm shadow-green-500/50"
              : "bg-red-500 shadow-sm shadow-red-500/50 animate-pulse"
          }`}
        />
        <span className="text-xs text-text-muted">
          {backendOnline ? "Backend Online" : "Backend Offline"}
        </span>
      </div>
    </header>
  );
}
