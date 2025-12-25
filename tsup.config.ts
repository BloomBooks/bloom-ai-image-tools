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
  ],
  esbuildOptions(options) {
    options.loader = {
      ...(options.loader || {}),
      ".json5": "text",
    };
  },
});
