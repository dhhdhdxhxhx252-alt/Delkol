import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The React app now lives inside this repo (D:/gii).
const WEB_ROOT = __dirname;

// Runtime deps resolved from this project's node_modules.
const webDeps = ["react", "react-dom", "react/jsx-runtime", "lucide-react", "motion", "clsx", "tailwind-merge", "@supabase/supabase-js"];

export default defineConfig({
  root: path.resolve(WEB_ROOT),
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(WEB_ROOT, "src") },
      ...webDeps.map((dep) => ({ find: dep, replacement: path.join(NODE_MODULES(), dep) })),
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist-web"),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
  },
  server: {
    port: 5183,
    strictPort: true,
    fs: { allow: [path.resolve(WEB_ROOT)], strict: false },
    watch: { ignored: ["**/dist-web/**", "**/release/**", "**/node_modules/**"] },
  },
});

function NODE_MODULES() {
  return path.resolve(__dirname, "node_modules");
}
