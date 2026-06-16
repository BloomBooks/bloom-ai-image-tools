import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2020",
  sourcemap: true,
  dts: true,
  clean: true,
  minify: false,
  splitting: false,
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
  },
  external: [
    "react",
    "react-dom",
    "@mui/material",
    "@emotion/react",
    "@emotion/styled",
    // Keep pdfjs-dist (and its Vite-specific `?url` worker import) out of the
    // library bundle. The PDF-to-images module is loaded lazily and pdfjs is a
    // runtime dependency, so consumers' bundlers resolve the worker asset.
    /^pdfjs-dist/,
  ],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      ".json5": "text",
    };
  },
});
