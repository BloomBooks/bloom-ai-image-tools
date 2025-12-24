import type { Plugin } from "vite";
import * as fs from "fs";
import * as path from "path";

/**
 * Vite plugin that provides a dev server API endpoint for saving art style thumbnails.
 */
export function artStyleThumbnailPlugin(): Plugin {
  return {
    name: "art-style-thumbnail-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (
          req.url !== "/__api/save-art-style-thumbnail" ||
          req.method !== "POST"
        ) {
          return next();
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

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

          // Validate artStyleId to prevent path traversal
          if (!/^[a-zA-Z0-9_-]+$/.test(artStyleId)) {
            res.statusCode = 400;
            res.end("Invalid artStyleId format");
            return;
          }

          // Extract base64 data from data URL
          const base64Match = imageData.match(/^data:image\/png;base64,(.+)$/);
          if (!base64Match) {
            res.statusCode = 400;
            res.end(
              "Invalid image data format (expected data:image/png;base64,...)"
            );
            return;
          }

          const base64Data = base64Match[1];
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Save to assets/art-styles/{artStyleId}.png
          const targetDir = path.resolve(process.cwd(), "assets", "art-styles");
          const targetPath = path.join(targetDir, `${artStyleId}.png`);

          // Ensure directory exists
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          fs.writeFileSync(targetPath, imageBuffer);
          console.log(`[art-style-thumbnail] Saved thumbnail: ${targetPath}`);

          // Update the art-styles.json5 file to point to the new thumbnail
          const json5Path = path.resolve(
            process.cwd(),
            "components",
            "artStyle",
            "art-styles.json5"
          );
          const newSampleImageUrl = `art-styles/${artStyleId}.png`;

          if (fs.existsSync(json5Path)) {
            let json5Content = fs.readFileSync(json5Path, "utf-8");

            const blockPattern = new RegExp(
              `\\{[^{}]*id:\\s*["']${artStyleId}["'][^{}]*\\}`,
              "s"
            );

            const blockMatch = json5Content.match(blockPattern);
            if (blockMatch) {
              const block = blockMatch[0];
              const blockLines = block.split(/\r?\n/);
              const filteredLines = blockLines.filter(
                (line) => !line.trim().startsWith("sampleImageUrl:")
              );

              const closingIndex = filteredLines.findIndex((line) =>
                line.trim().startsWith("}")
              );

              if (closingIndex === -1) {
                console.warn(
                  `[art-style-thumbnail] Could not locate closing brace for ${artStyleId}`
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
                console.log(
                  `[art-style-thumbnail] Updated art-styles.json5 for ${artStyleId}`
                );
              }
            } else {
              console.warn(
                `[art-style-thumbnail] Could not find art style ${artStyleId} in json5`
              );
            }
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, path: targetPath }));
        } catch (error) {
          console.error("[art-style-thumbnail] Error:", error);
          res.statusCode = 500;
          res.end(
            `Internal server error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      });
    },
  };
}
