import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "site",
  envDir: "..",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: {
        map: "site/index.html",
        playground: "site/playground.html",
        globe: "site/globe.html",
      },
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
