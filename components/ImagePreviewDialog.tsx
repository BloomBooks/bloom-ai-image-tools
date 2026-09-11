import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { ImageRecord } from "../types";
import { getHighContrastScrollbarStyles } from "../themes";
import { TRANSPARENCY_BACKGROUND_STYLE } from "./transparencyBackground";
import { formatMegabytes, getDataUrlByteSize } from "../lib/imageUtils";
import { getModelNameById } from "../lib/modelsCatalog";
import { formatCost } from "../lib/formatters";

export interface ImagePreviewDialogItem {
  id: string;
  images: ImageRecord[];
}

export interface ImagePreviewDialogProps {
  open: boolean;
  items: ImagePreviewDialogItem[];
  layout?: "row" | "book-pairs";
  /**
   * The image this one was made from, when the caller can find it. Its bytes
   * are the "in" half of the size line; without a resolver that half is simply
   * absent rather than guessed.
   */
  resolveSourceImage?: (image: ImageRecord) => ImageRecord | null;
  onClose: () => void;
}

// Width of one gallery item at zoom 1, in pixels. Ctrl+wheel scales this, and
// the row wraps, so zooming out fits more images per row and then more rows.
const BASE_ITEM_WIDTH = 560;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.12;

const previewFrameStyles = {
  borderRadius: 3,
  backgroundColor: "rgba(15, 23, 42, 0.68)",
  overflow: "hidden",
  position: "relative",
} as const;

const metadataTextStyles = {
  color: "#cbd5f5",
  fontSize: "11px",
  lineHeight: 1.5,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const formatDurationSeconds = (durationMs: number): string | null =>
  durationMs > 0 ? `${(durationMs / 1000).toFixed(1)}s` : null;

/**
 * The "3.1 MB in / 1.4 MB out" line. "In" is the image this one was made from,
 * so a generated image with no source shows only the "out" half.
 */
const formatSizes = (image: ImageRecord, sourceImage: ImageRecord | null): string | null => {
  const outText = formatMegabytes(getDataUrlByteSize(image.imageData));
  const inText = formatMegabytes(getDataUrlByteSize(sourceImage?.imageData));
  if (inText && outText) return `${inText} in / ${outText} out`;
  if (outText) return `${outText} out`;
  if (inText) return `${inText} in`;
  return null;
};

const PreviewImage: React.FC<{
  image: ImageRecord;
  index: number;
  sourceImage: ImageRecord | null;
}> = ({ image, index, sourceImage }) => {
  // A record can hold a URL whose bytes are no longer there (an object URL from
  // a past session, a history file since removed). That only shows up as a load
  // error, so the placeholder has to be reachable from there too.
  const [loadFailed, setLoadFailed] = React.useState(false);
  React.useEffect(() => setLoadFailed(false), [image.imageData]);

  const resolution = image.resolution
    ? `${image.resolution.width} x ${image.resolution.height}`
    : null;

  const facts = [
    getModelNameById(image.model) || image.model || null,
    image.cost > 0 ? formatCost(image.cost) : null,
    formatDurationSeconds(image.durationMs),
    formatSizes(image, sourceImage),
  ].filter((value): value is string => Boolean(value));

  const prompt = (image.promptUsed || "").trim();

  // The record's own shape, so a slot keeps its place in the grid before the
  // image decodes instead of collapsing to nothing and shoving the rest around.
  const aspectRatio =
    image.resolution && image.resolution.width > 0 && image.resolution.height > 0
      ? `${image.resolution.width} / ${image.resolution.height}`
      : "4 / 3";

  return (
    <Box sx={{ ...previewFrameStyles, flex: "0 0 auto", width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 1.5, sm: 2 },
          minWidth: 0,
          minHeight: 0,
          position: "relative",
        }}
      >
        {image.imageData && !loadFailed ? (
          <img
            src={image.imageData}
            alt={image.imageFileName || `Preview image ${index + 1}`}
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setLoadFailed(true)}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              aspectRatio,
              objectFit: "contain",
              ...TRANSPARENCY_BACKGROUND_STYLE,
            }}
          />
        ) : (
          // A history record keeps its metadata even when its bytes are not in
          // hand. Say so, rather than pointing an <img> at an empty src (which
          // loads the page itself and draws a broken-image box). A record that
          // names a file still has its bytes on disk and is only waiting for
          // the hydrator to reach it, so it says so instead of claiming the
          // image is gone.
          <Box
            data-testid="image-preview-dialog-missing-image"
            sx={{
              width: "100%",
              aspectRatio,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 2,
              border: "1px dashed rgba(148, 163, 184, 0.35)",
              color: "#94a3b8",
              fontSize: "12px",
              textAlign: "center",
              px: 2,
            }}
          >
            {loadFailed
              ? "Image could not be loaded"
              : image.imageFileName
                ? "Loading…"
                : "Image not in storage"}
          </Box>
        )}
        {resolution && (
          <Typography
            variant="caption"
            sx={{
              position: "absolute",
              left: 12,
              bottom: 12,
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: "rgba(6, 8, 13, 0.76)",
              color: "#e2e8f0",
            }}
          >
            {resolution}
          </Typography>
        )}
      </Box>

      <Box
        data-testid="image-preview-dialog-metadata"
        sx={{
          px: 1.5,
          pb: 1.25,
          pt: 0.25,
          minWidth: 0,
          borderTop: "1px solid rgba(148, 163, 184, 0.18)",
        }}
      >
        <Box sx={metadataTextStyles} data-testid="image-preview-dialog-facts">
          {facts.join(" · ")}
        </Box>
        {prompt && (
          // The full prompt is allowed to cover whatever is behind it: it is
          // what the user pointed at, and a gallery is wall-to-wall images.
          <Tooltip
            title={<Box sx={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>{prompt}</Box>}
            placement="top"
            arrow
            slotProps={{
              tooltip: { sx: { maxWidth: 620, maxHeight: "70vh", overflowY: "auto" } },
            }}
          >
            <Box sx={{ ...metadataTextStyles, color: "#94a3b8", cursor: "help" }}>{prompt}</Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  open,
  items,
  layout = "row",
  resolveSourceImage,
  onClose,
}) => {
  const visibleItems = React.useMemo(() => items.filter((item) => item.images.length > 0), [items]);
  const [zoom, setZoom] = React.useState(1);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Ctrl+wheel resizes the images instead of the whole window, so the listener
  // has to be non-passive: React's onWheel cannot call preventDefault, and
  // without that the browser zooms the page.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => {
        const next = event.deltaY < 0 ? current * ZOOM_STEP : current / ZOOM_STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [open]);

  const itemWidth = Math.round(BASE_ITEM_WIDTH * zoom);

  return (
    <Dialog
      open={open && visibleItems.length > 0}
      onClose={onClose}
      fullScreen
      PaperProps={{
        "data-testid": "image-preview-dialog",
        sx: {
          backgroundColor: "#06080d",
          color: "#f8fafc",
        },
      }}
    >
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 2, pr: 8, position: "relative" }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 600 }}>
          Gallery
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{ ml: 1.5, color: "#94a3b8" }}
          data-testid="image-preview-dialog-zoom-hint"
        >
          Ctrl + mouse wheel to resize the images
        </Typography>
        <IconButton
          aria-label="Close image preview"
          onClick={onClose}
          data-testid="image-preview-dialog-close"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            color: "inherit",
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        ref={scrollRef}
        sx={{
          px: { xs: 2, sm: 3 },
          py: 0,
          display: "flex",
          minHeight: 0,
          overflowX: "hidden",
          overflowY: "auto",
          ...getHighContrastScrollbarStyles(),
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignContent: "flex-start",
            gap: { xs: 1.5, sm: 2.5 },
            width: "100%",
            minHeight: 0,
            alignItems: "flex-start",
            pb: 2,
          }}
        >
          {visibleItems.map((item, index) => {
            return (
              <Box
                key={item.id}
                data-testid={`image-preview-dialog-item-${index}`}
                sx={{
                  flex: "0 0 auto",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: layout === "book-pairs" ? 2 : 0,
                  width: itemWidth,
                  maxWidth: "100%",
                }}
              >
                {item.images.map((image, imageIndex) => (
                  <PreviewImage
                    key={image.id}
                    image={image}
                    index={imageIndex}
                    sourceImage={resolveSourceImage?.(image) ?? null}
                  />
                ))}
              </Box>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2.5, justifyContent: "center" }}>
        <Button onClick={onClose} variant="contained" color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
