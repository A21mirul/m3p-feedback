import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the build work on any GitHub Pages path (user.github.io/repo/)
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  build: { chunkSizeWarningLimit: 6000 },
});
