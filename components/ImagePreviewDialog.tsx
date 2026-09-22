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
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { ImageRecord } from "../types";
import { getHighContrastScrollbarStyles, theme } from "../themes";
import { TRANSPARENCY_BACKGROUND_STYLE } from "./transparencyBackground";
import { formatMegabytes, getDataUrlByteSize } from "../lib/imageUtils";
import { getModelNameById } from "../lib/modelsCatalog";
import { formatCost } from "../lib/formatters";
import { useL10n } from "../lib/localization";
import { describeImageSource } from "../lib/imageSourceSummary";

export interface ImagePreviewDialogItem {
  id: string;
  images: ImageRecord[];
  /**
   * Set when the item is one page of a book: `images[0]` is the picture in the
   * book now and `images[1]`, when it is there, is the result chosen to replace
   * it. Such an item gets a column of its own, headed by the page label, ahead
   * of the images that belong to no page.
   */
  isBookPage?: boolean;
}

export interface ImagePreviewDialogProps {
  open: boolean;
  items: ImagePreviewDialogItem[];
  /**
   * The image this one was made from, when the caller can find it. Its bytes
   * are the "in" half of the size line; without a resolver that half is simply
   * absent rather than guessed.
   */
  resolveSourceImage?: (image: ImageRecord) => ImageRecord | null;
  onClose: () => void;
}

// Gap left between the gallery and the edge of the tool, in pixels, so the
// host's own window chrome stays clear of the gallery's close button.
const GALLERY_INSET_PX = 20;

// The widest a gallery item is ever drawn. Ctrl+wheel scales it, and the row
// wraps, so zooming out fits more images per row and then more rows.
const BASE_ITEM_WIDTH = 560;
// A column narrower than this is too small to judge a picture by, so the
// height fit stops here and the column scrolls instead.
const MIN_ITEM_WIDTH = 220;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.12;

// Everything in a replacing book-page column that is not one of the two
// pictures: the padding above and below the row of columns, the column's own
// padding, its page label, the two captions, the arrow between the pictures,
// the gaps between all of those, and the padding each picture box puts around
// its image. Used to work back from the height the gallery has to the width
// its columns can be, so both pictures are on screen without anyone reaching
// for the zoom.
const PAGE_COLUMN_CHROME_HEIGHT_PX = 216;
// The same for width: the column's padding plus one picture box's padding, all
// of which sits between the column's width and the image's own.
const PAGE_COLUMN_CHROME_WIDTH_PX = 48;
// The shape assumed for an image whose record does not say. Matches the "4 / 3"
// placeholder PreviewPicture draws before the bytes arrive.
const ASSUMED_IMAGE_RATIO = 3 / 4;

/** How tall an image is drawn per pixel of width. */
const heightPerWidth = (image: ImageRecord): number =>
  image.resolution && image.resolution.width > 0 && image.resolution.height > 0
    ? image.resolution.height / image.resolution.width
    : ASSUMED_IMAGE_RATIO;

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

/**
 * One picture, with its resolution pill and nothing else. The gallery's flat
 * presentation wraps this in a frame and a metadata block; a book page's column
 * shows two of them bare, under their own captions.
 */
const PreviewPicture: React.FC<{
  image: ImageRecord;
  index: number;
  opacity?: number;
}> = ({ image, index, opacity }) => {
  const l10n = useL10n();
  // A record can hold a URL whose bytes are no longer there (an object URL from
  // a past session, a history file since removed). That only shows up as a load
  // error, so the placeholder has to be reachable from there too.
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  React.useEffect(() => {
    setLoadFailed(false);
    setHasLoaded(false);
  }, [image.imageData]);

  const resolution = image.resolution
    ? `${image.resolution.width} x ${image.resolution.height}`
    : null;

  // The record's own shape, so a slot keeps its place in the grid before the
  // image decodes instead of collapsing to nothing and shoving the rest around.
  // Once the bytes are in, the image's own proportions take over: the record's
  // resolution is often absent or stale, and the checkerboard is painted on the
  // <img> box, so a box wider than the image leaves checks beside it.
  const aspectRatio =
    image.resolution && image.resolution.width > 0 && image.resolution.height > 0
      ? `${image.resolution.width} / ${image.resolution.height}`
      : "4 / 3";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 1.5, sm: 2 },
        minWidth: 0,
        minHeight: 0,
        position: "relative",
        width: "100%",
        opacity: opacity ?? 1,
      }}
    >
      {image.imageData && !loadFailed ? (
        <img
          src={image.imageData}
          alt={image.imageFileName || `Preview image ${index + 1}`}
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setHasLoaded(true)}
          onError={() => setLoadFailed(true)}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            ...(hasLoaded ? {} : { aspectRatio }),
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
              ? l10n("AiImageEditor.Preview.Loading", "Loading…")
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
  );
};

/**
 * The flat presentation: one picture in a frame, with the model, cost, time and
 * size line and the prompt under it. This is what an image that belongs to no
 * book page still gets.
 */
const PreviewImage: React.FC<{
  image: ImageRecord;
  index: number;
  sourceImage: ImageRecord | null;
}> = ({ image, index, sourceImage }) => {
  const l10n = useL10n();

  const facts = [
    getModelNameById(image.model) || image.model || null,
    image.cost > 0 ? formatCost(image.cost) : null,
    formatDurationSeconds(image.durationMs),
    formatSizes(image, sourceImage),
  ].filter((value): value is string => Boolean(value));

  // A book image is named by its slot ("Page 3 - Image 2"), which is how the
  // user knows which one it is; only a generated image is named by its prompt.
  // An image that was imported rather than generated has no prompt, so it falls
  // back to where it came from ("From storybook.pdf").
  const caption = (
    image.pageLabel ||
    image.promptUsed ||
    describeImageSource(l10n, image.sourceSummary)[0] ||
    ""
  ).trim();

  return (
    <Box sx={{ ...previewFrameStyles, flex: "0 0 auto", width: "100%" }}>
      <PreviewPicture image={image} index={index} />

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
        {caption && (
          // The full caption is allowed to cover whatever is behind it: it is
          // what the user pointed at, and a gallery is wall-to-wall images.
          <Tooltip
            title={<Box sx={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>{caption}</Box>}
            placement="top"
            arrow
            slotProps={{
              tooltip: { sx: { maxWidth: 620, maxHeight: "70vh", overflowY: "auto" } },
            }}
          >
            <Box sx={{ ...metadataTextStyles, color: "#94a3b8", cursor: "help" }}>{caption}</Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

const columnCaptionStyles = {
  display: "block",
  color: theme.colors.textSecondary,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  px: 0.5,
} as const;

/**
 * One book page: the page label, the picture that is in the book now, and, when
 * a result has been chosen for that page, the replacement under it. The two
 * pictures are the whole story here, so none of the run's numbers or its prompt
 * appear — the user is looking at what the book will hold.
 */
const BookPageColumn: React.FC<{
  pageImage: ImageRecord;
  replacement: ImageRecord | null;
  width: number;
}> = ({ pageImage, replacement, width }) => {
  const l10n = useL10n();
  const isReplacing = Boolean(replacement);
  const pageLabel = (pageImage.pageLabel || "").trim();

  return (
    <Box
      data-testid={`image-preview-dialog-column-${pageImage.id}`}
      data-replacing={isReplacing ? "true" : "false"}
      sx={{
        flex: "0 0 auto",
        width,
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        p: 1,
        borderRadius: 3,
        backgroundColor: theme.colors.surface,
        // An outline rather than a border: it is drawn outside the box, so a
        // column keeps the same inner width whether or not it is replacing and
        // the row of columns stays aligned.
        outline: isReplacing ? `2px solid ${theme.colors.accent}` : "none",
      }}
    >
      {/* Standalone book images carry no page label, so they get no heading. */}
      {pageLabel && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 0.5,
            minWidth: 0,
          }}
        >
          <Typography
            variant="subtitle2"
            data-testid="image-preview-dialog-page-label"
            sx={{
              fontWeight: 600,
              color: "#f8fafc",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pageLabel}
          </Typography>
        </Box>
      )}

      {replacement ? (
        <>
          <Typography
            variant="caption"
            data-testid="image-preview-dialog-in-book-caption"
            sx={columnCaptionStyles}
          >
            {l10n("AiImageEditor.Preview.InTheBookNow", "In the book now")}
          </Typography>
          <PreviewPicture image={pageImage} index={0} opacity={0.55} />
          <Box
            aria-hidden
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 0.5,
              color: theme.colors.accent,
            }}
          >
            <Box sx={{ flex: 1, height: "1px", backgroundColor: theme.colors.accent }} />
            <ArrowDownwardIcon fontSize="small" />
            <Box sx={{ flex: 1, height: "1px", backgroundColor: theme.colors.accent }} />
          </Box>
          <Typography
            variant="caption"
            data-testid="image-preview-dialog-replacement-caption"
            sx={columnCaptionStyles}
          >
            {/* The same word the book-images strip labels its lower row with. */}
            {l10n("AiImageEditor.BookImages.Replacement", "Replacement")}
          </Typography>
          <PreviewPicture image={replacement} index={1} />
        </>
      ) : (
        <PreviewPicture image={pageImage} index={0} />
      )}
    </Box>
  );
};

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  open,
  items,
  resolveSourceImage,
  onClose,
}) => {
  const l10n = useL10n();
  const visibleItems = React.useMemo(() => items.filter((item) => item.images.length > 0), [items]);
  // A book page gets a column of its own, in book order. Everything else keeps
  // the flat presentation, after the columns, so a result from a run with no
  // slot to go back to is still in the gallery.
  const pageItems = React.useMemo(
    () => visibleItems.filter((item) => item.isBookPage),
    [visibleItems],
  );
  const looseItems = React.useMemo(
    () => visibleItems.filter((item) => !item.isBookPage),
    [visibleItems],
  );
  const [zoom, setZoom] = React.useState(1);
  // The scroll container is held in state, set through a callback ref, rather
  // than in a useRef read from an effect keyed on `open`. MUI's Dialog renders
  // through a Portal that mounts its children one render after `open` flips,
  // so in the commit where `open` changes the element does not exist yet; an
  // effect reading a ref there would find null and never attach the listener.
  const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);

  // Ctrl+wheel resizes the images instead of the whole window, so the listener
  // has to be non-passive: React's onWheel cannot call preventDefault, and
  // without that the browser zooms the page.
  React.useEffect(() => {
    if (!scrollElement) return undefined;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => {
        const next = event.deltaY < 0 ? current * ZOOM_STEP : current / ZOOM_STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    };

    scrollElement.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollElement.removeEventListener("wheel", onWheel);
  }, [scrollElement]);

  // The gallery's own height, watched because the starting width is worked out
  // from it and the host window can be resized while the gallery is open.
  const [availableHeight, setAvailableHeight] = React.useState(0);
  React.useEffect(() => {
    if (!scrollElement) return undefined;
    const observer = new ResizeObserver(() => setAvailableHeight(scrollElement.clientHeight));
    observer.observe(scrollElement);
    setAvailableHeight(scrollElement.clientHeight);
    return () => observer.disconnect();
  }, [scrollElement]);

  // The width a column is drawn at before the user zooms. A book page stacks
  // the picture in the book now above the one replacing it, so a width chosen
  // on its own cuts the second one off the bottom of the screen: the height
  // decides, and the tallest pair in the gallery decides for all of them.
  const startingWidth = React.useMemo(() => {
    const tallest = pageItems.reduce(
      (worst, item) =>
        Math.max(
          worst,
          item.images.reduce((sum, i) => sum + heightPerWidth(i), 0),
        ),
      0,
    );
    if (!availableHeight || !tallest) {
      return BASE_ITEM_WIDTH;
    }
    const fitted =
      (availableHeight - PAGE_COLUMN_CHROME_HEIGHT_PX) / tallest + PAGE_COLUMN_CHROME_WIDTH_PX;
    return Math.max(MIN_ITEM_WIDTH, Math.min(BASE_ITEM_WIDTH, fitted));
  }, [availableHeight, pageItems]);

  const itemWidth = Math.round(startingWidth * zoom);

  return (
    <Dialog
      open={open && visibleItems.length > 0}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        "data-testid": "image-preview-dialog",
        sx: {
          // Inset rather than full-screen: flush against the edge, the
          // gallery's own close button sits next to the host's close button
          // (Bloom's dialog chrome), and it is too easy to shut the whole tool
          // when you meant to leave the gallery.
          m: `${GALLERY_INSET_PX}px`,
          width: `calc(100% - ${GALLERY_INSET_PX * 2}px)`,
          maxWidth: "none",
          height: `calc(100% - ${GALLERY_INSET_PX * 2}px)`,
          maxHeight: "none",
          borderRadius: 2,
          backgroundColor: "#06080d",
          color: "#f8fafc",
        },
      }}
    >
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 2, pr: 8, position: "relative" }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 600 }}>
          {l10n("AiImageEditor.Preview.Gallery", "Gallery")}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{ ml: 1.5, color: "#94a3b8" }}
          data-testid="image-preview-dialog-zoom-hint"
        >
          {l10n("AiImageEditor.Preview.ZoomHint", "Ctrl + mouse wheel to zoom")}
        </Typography>
        <Tooltip title={l10n("AiImageEditor.Preview.ResetZoom", "Reset zoom")}>
          {/* Deliberately quiet: it sits beside the hint rather than in the
              button row, and is only worth reaching for once you have zoomed. */}
          <IconButton
            aria-label="Reset the gallery zoom"
            onClick={() => setZoom(1)}
            data-testid="image-preview-dialog-reset-zoom"
            size="small"
            sx={{
              ml: 0.5,
              color: "#94a3b8",
              "&:hover": { color: "#f8fafc", backgroundColor: "rgba(248, 250, 252, 0.08)" },
            }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton
          aria-label="Close image preview"
          onClick={onClose}
          data-testid="image-preview-dialog-close"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            backgroundColor: theme.colors.accent,
            color: "#fff",
            "&:hover": { backgroundColor: theme.colors.accent, opacity: 0.9 },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        ref={setScrollElement}
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
            // Room for a replacing column's outline, which is drawn outside its
            // box and would otherwise be clipped by the scrolling content above.
            pt: 1,
            pb: 2,
          }}
        >
          {pageItems.map((item) => (
            <BookPageColumn
              key={item.id}
              pageImage={item.images[0]}
              replacement={item.images[1] ?? null}
              width={itemWidth}
            />
          ))}
          {looseItems.map((item, index) => {
            return (
              <Box
                key={item.id}
                data-testid={`image-preview-dialog-item-${index}`}
                sx={{
                  flex: "0 0 auto",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
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

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2.5, justifyContent: "flex-end" }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            backgroundColor: theme.colors.accent,
            color: "#fff",
            "&:hover": { backgroundColor: theme.colors.accent, opacity: 0.9 },
          }}
        >
          {l10n("Common.Close", "Close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
