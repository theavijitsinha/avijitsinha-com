import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  base: "/account/",
  build: {
    outDir: "../client-dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
