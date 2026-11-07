import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "node:path";

// Only the MuPDF worker needs top-level-await compatibility. On macOS,
// keep the React lazy-import graph free of unnecessary async wrappers.
const macBuild = process.platform === "darwin";
const host = process.env.TAURI_DEV_HOST;
const watch = process.env.CODEX_PRISM_WATCH !== "0";
const mupdfWasmFile = path.resolve(
  __dirname,
  "..",
  "..",
  "node_modules",
  "mupdf",
  "dist",
  "mupdf-wasm.wasm",
);

export default defineConfig({
  plugins: [{name:"prism-ipad-entry",transformIndexHtml:{order:"pre",handler(html:string){return process.env.MPS_PRISM_IPAD==="1"?html.replace("/src/main.tsx","/src/main-ipad.tsx"):html;}}},react(), ...(macBuild ? [] : [topLevelAwait()])],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "src"),
      ...(process.env.MPS_PRISM_IPAD==="1"?{
        "@tauri-apps/plugin-fs":path.resolve(__dirname,"src/lib/backend/ipad-files.ts"),
        "@tauri-apps/api/path":path.resolve(__dirname,"src/lib/backend/ipad-path.ts"),
        "@tauri-apps/plugin-dialog":path.resolve(__dirname,"src/lib/backend/ipad-dialog.ts"),
        "@tauri-apps/plugin-shell":path.resolve(__dirname,"src/lib/backend/ipad-shell.ts"),
      }:{}),
    },
  },
  define: {
    __MUPDF_WASM_FS_PATH__: JSON.stringify(mupdfWasmFile.replace(/\\/g, "/")),
  },
  worker: {
    format: "es",
    plugins: () => macBuild ? [topLevelAwait()] : [],
  },
  optimizeDeps: {
    exclude: ["mupdf"],
  },
  esbuild: macBuild ? { supported: { "top-level-await": true } } : undefined,
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: !watch
      ? false
      : host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
    watch: watch
      ? {
          ignored: ["**/src-tauri/**", "**/crates/prism-core/target/**"],
        }
      : null,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
