import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Desktop Vite config — builds React app into dist/
// Electron serves this from the Python backend static files
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    // Base is / because Python serves the built files
    base: "/",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        // Optimize for desktop app usage
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["react", "react-dom"],
                    motion: ["framer-motion"],
                },
            },
        },
    },
    server: {
        port: 3000,
        strictPort: true,
    },
});
