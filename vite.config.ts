import path from "path";
import * as fs from "fs";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";

const json5RawPlugin = () => ({
  name: "json5-raw-loader",
  transform(code: string, id: string) {
    if (id.endsWith(".json5")) {
      return {
        code: `export default ${JSON.stringify(code)};`,
        map: null,
      };
    }
    return null;
  },
});

const e2eApiKey = process.env.E2E_OPENROUTER_API_KEY || "";
const configuredBasePath = process.env.VITE_BASE_PATH || "/";
const basePath = configuredBasePath.endsWith("/") ? configuredBasePath : `${configuredBasePath}/`;

const artStyleThumbnailPlugin = () => ({
  name: "art-style-thumbnail-api",
  configureServer(server: {
    middlewares: {
      use: (
        handler: (
          req: AsyncIterable<Buffer> & { method?: string; url?: string },
          res: {
            end: (body?: string) => void;
            setHeader: (name: string, value: string) => void;
            statusCode: number;
          },
          next: () => void,
        ) => void | Promise<void>,
      ) => void;
    };
  }) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== "/__api/save-art-style-thumbnail" || req.method !== "POST") {
        return next();
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
          artStyleId?: unknown;
          imageData?: unknown;
        };

        const { artStyleId, imageData } = body;

        if (!artStyleId || typeof artStyleId !== "string") {
          res.statusCode = 400;
          res.end("Missing or invalid artStyleId");
          return;
        }

        if (!imageData || typeof imageData !== "string") {
          res.statusCode = 400;
          res.end("Missing or invalid imageData");
          return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(artStyleId)) {
          res.statusCode = 400;
          res.end("Invalid artStyleId format");
          return;
        }

        const base64Match = imageData.match(/^data:image\/png;base64,(.+)$/);
        if (!base64Match) {
          res.statusCode = 400;
          res.end("Invalid image data format (expected data:image/png;base64,...)");
          return;
        }

        const imageBuffer = Buffer.from(base64Match[1], "base64");
        const targetDir = path.resolve(process.cwd(), "assets", "art-styles");
        const targetPath = path.join(targetDir, `${artStyleId}.png`);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.writeFileSync(targetPath, imageBuffer);
        console.log(`[art-style-thumbnail] Saved thumbnail: ${targetPath}`);

        const json5Path = path.resolve(process.cwd(), "components", "artStyle", "art-styles.json5");
        const newSampleImageUrl = `art-styles/${artStyleId}.png`;

        if (fs.existsSync(json5Path)) {
          let json5Content = fs.readFileSync(json5Path, "utf-8");

          const blockPattern = new RegExp(`\\{[^{}]*id:\\s*["']${artStyleId}["'][^{}]*\\}`, "s");

          const blockMatch = json5Content.match(blockPattern);
          if (blockMatch) {
            const block = blockMatch[0];
            const blockLines = block.split(/\r?\n/);
            const filteredLines = blockLines.filter(
              (line) => !line.trim().startsWith("sampleImageUrl:"),
            );

            const closingIndex = filteredLines.findIndex((line) => line.trim().startsWith("}"));

            if (closingIndex === -1) {
              console.warn(
                `[art-style-thumbnail] Could not locate closing brace for ${artStyleId}`,
              );
            } else {
              const closingLine = filteredLines[closingIndex];
              const closingIndent = closingLine.match(/^\s*/)?.[0] ?? "";
              const propertyIndent = `${closingIndent}  `;
              const newLine = `${propertyIndent}sampleImageUrl: "${newSampleImageUrl}",`;

              filteredLines.splice(closingIndex, 0, newLine);

              const updatedBlock = filteredLines.join("\n");
              json5Content = json5Content.replace(block, updatedBlock);

              fs.writeFileSync(json5Path, json5Content, "utf-8");
              console.log(`[art-style-thumbnail] Updated art-styles.json5 for ${artStyleId}`);
            }
          } else {
            console.warn(`[art-style-thumbnail] Could not find art style ${artStyleId} in json5`);
          }
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true, path: targetPath }));
      } catch (error) {
        console.error("[art-style-thumbnail] Error:", error);
        res.statusCode = 500;
        res.end(
          `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });
  },
});

export default defineConfig({
  // Pre-commit runs formatting only: fast and essentially never fails, so
  // there's no incentive to `git commit --no-verify` (which would also skip
  // the formatter). Run `vp check` manually for lint/type-checking.
  staged: {
    "*": "vp fmt",
  },
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    include: ["lib/__tests__/**/*.test.ts", "services/**/__tests__/**/*.test.ts"],
  },
  base: basePath,
  server: {
    port: 3000,
    host: "0.0.0.0",
    open: true,
  },
  plugins: [json5RawPlugin(), react(), artStyleThumbnailPlugin()],
  define: {
    "process.env.E2E_OPENROUTER_API_KEY": JSON.stringify(e2eApiKey),
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "."),
    },
  },
  optimizeDeps: {
    // Scan only the app's real entry. Without this, the dep scanner globs
    // **/*.html and follows the `BloomEditor` symlink into the Bloom repo,
    // failing on that repo's component-tester harness (component-harness.tsx,
    // @playwright/test) which has nothing to do with this app.
    entries: ["index.html"],
    exclude: ["rembg-webgpu"],
  },
  build: {
    outDir: "demo-dist",
  },
});
