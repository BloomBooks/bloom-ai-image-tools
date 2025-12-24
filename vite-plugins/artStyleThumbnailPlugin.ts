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

            // Find the art style entry and update/add sampleImageUrl
            // We need to find the block for this artStyleId and update/add sampleImageUrl
            const idPattern = new RegExp(
              `(\\{[^{}]*id:\\s*["']${artStyleId}["'][^{}]*)(sampleImageUrl:\\s*["'][^"']*["'],?\\s*)?([^{}]*\\})`,
              "s"
            );

            const match = json5Content.match(idPattern);
            if (match) {
              // Check if sampleImageUrl already exists in this block
              const blockStart = match[1];
              const existingSampleImageUrl = match[2];
              const blockEnd = match[3];

              if (existingSampleImageUrl) {
                // Replace existing sampleImageUrl
                const updatedBlock = `${blockStart}sampleImageUrl: "${newSampleImageUrl}",\n    ${blockEnd}`;
                json5Content = json5Content.replace(idPattern, updatedBlock);
              } else {
                // Add sampleImageUrl before the closing brace
                // Find where to insert - after the last property
                const insertPoint = blockStart + blockEnd;
                const updatedBlock = `${blockStart}sampleImageUrl: "${newSampleImageUrl}",\n    ${blockEnd}`;
                json5Content = json5Content.replace(idPattern, updatedBlock);
              }

              fs.writeFileSync(json5Path, json5Content, "utf-8");
              console.log(
                `[art-style-thumbnail] Updated art-styles.json5 for ${artStyleId}`
              );
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
