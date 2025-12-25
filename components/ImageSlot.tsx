import React from "react";
import { CircularProgress } from "@mui/material";
import { HistoryItem } from "../types";
import { Icon, Icons } from "./Icons";
import { MagnifiableImage } from "./MagnifiableImage";
import { kBloomBlue, theme } from "../themes";
import { ImageSlotHeader } from "./ImageSlotHeader";
import {
  processImageForThumbnail,
  saveArtStyleThumbnail,
} from "../lib/imageProcessing";
import { isClearArtStyleId } from "../lib/artStyles";
import {
  getInternalImageDragData,
  hasInternalImageDragData,
  setInternalImageDragData,
} from "./dragConstants";
import {
  getTypeFromFileName,
  getTypeFromMime,
  handleCopy as copyImageToClipboard,
  handlePaste as pasteImageFromClipboard,
} from "../lib/clipboardUtils";
import { getImageDimensions, getMimeTypeFromUrl } from "../lib/imageUtils";
import {
  hasImageFilePayload,
  getImageFileFromDataTransfer,
} from "../lib/dragUtils";

export type ImageSlotControls = {
  upload?: boolean;
  paste?: boolean;
  copy?: boolean;
  download?: boolean;
  remove?: boolean;
};

type RoleKind = "target" | "reference";

type RenderEmptyStateArgs = {
  openFilePicker: () => void;
  isDropZone: boolean;
  disabled: boolean;
};

export interface ImageSlotProps {
  label?: string;
  image: HistoryItem | null;
  disabled?: boolean;
  isDropZone?: boolean;
  onDrop?: (imageId: string) => void;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
  draggableImageId?: string;
  isLoading?: boolean;
  uploadInputTestId?: string;
  controls?: ImageSlotControls;
  variant?: "panel" | "tile";
  rolePill?: { label: string; kind?: RoleKind; testId?: string };
  renderEmptyState?: (args: RenderEmptyStateArgs) => React.ReactNode;
  dropLabel?: string;
  dataTestId?: string;
  actionLabels?: Partial<Record<keyof ImageSlotControls, string>>;
}

const VARIANT_LAYOUT_STYLES: Record<
  NonNullable<ImageSlotProps["variant"]>,
  {
    container: React.CSSProperties;
    contentWrapper: React.CSSProperties;
    innerWrapper: React.CSSProperties;
  }
> = {
  panel: {
    container: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative",
      borderRadius: "24px",
      borderWidth: 1,
      borderStyle: "solid",
      padding: 16,
      gap: 16,
      transition: "color 150ms ease",
    },
    contentWrapper: {
      display: "flex",
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 0,
    },
    innerWrapper: {
      position: "relative",
      borderRadius: "18px",
      overflow: "hidden",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 0,
    },
  },
  tile: {
    container: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      borderRadius: "18px",
      borderWidth: 1,
      borderStyle: "solid",
      minHeight: 0,
      overflow: "hidden",
      transition: "color 150ms ease",
      width: "100%",
      height: "100%",
    },
    contentWrapper: {
      display: "flex",
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 0,
    },
    innerWrapper: {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "18px",
      overflow: "hidden",
      minHeight: 0,
    },
  },
};

const TRANSPARENCY_TILE_SIZE = 16;
const TRANSPARENCY_BLOOM_BLUE = "#8ecad2"; // 50% blend of Bloom blue + white
const TRANSPARENCY_PATTERN_SIZE = TRANSPARENCY_TILE_SIZE * 2;
const TRANSPARENCY_CHECKERBOARD_IMAGE = (() => {
  const tile = TRANSPARENCY_TILE_SIZE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${
    tile * 2
  }" height="${
    tile * 2
  }" shape-rendering="crispEdges"><rect width="${tile}" height="${tile}" fill="${TRANSPARENCY_BLOOM_BLUE}"/><rect x="${tile}" y="${tile}" width="${tile}" height="${tile}" fill="${TRANSPARENCY_BLOOM_BLUE}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

const TRANSPARENCY_BACKGROUND_STYLE: React.CSSProperties = {
  // Classic checkerboard of Bloom blue and white for transparent regions
  backgroundColor: "#ffffff",
  backgroundImage: TRANSPARENCY_CHECKERBOARD_IMAGE,
  backgroundSize: `${TRANSPARENCY_PATTERN_SIZE}px ${TRANSPARENCY_PATTERN_SIZE}px`,
};

const getArtStyleIdForImage = (item?: HistoryItem | null): string | null => {
  if (!item) return null;

  const normalizedFromSource = item.sourceStyleId;
  if (normalizedFromSource && !isClearArtStyleId(normalizedFromSource)) {
    return normalizedFromSource;
  }

  const legacyStyleId = (item.parameters as Record<string, string | undefined>)
    .styleId;
  if (legacyStyleId && !isClearArtStyleId(legacyStyleId)) {
    return legacyStyleId;
  }

  return null;
};

export const ImageSlot: React.FC<ImageSlotProps> = ({
  label,
  image,
  disabled = false,
  isDropZone = false,
  onDrop,
  onUpload,
  onRemove,
  draggableImageId,
  isLoading = false,
  uploadInputTestId,
  controls,
  variant = "panel",
  rolePill,
  renderEmptyState,
  dropLabel = "Drop image",
  dataTestId,
  actionLabels,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragDepthRef = React.useRef(0);
  const [isHovered, setIsHovered] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [thumbnailStatus, setThumbnailStatus] = React.useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [imageMetadata, setImageMetadata] = React.useState<{
    imageId: string;
    width: number | null;
    height: number | null;
    mime: string | null;
  } | null>(null);

  const mergedControls: Required<ImageSlotControls> = {
    upload: controls?.upload ?? true,
    paste: controls?.paste ?? true,
    copy: controls?.copy ?? true,
    download: controls?.download ?? true,
    remove: controls?.remove ?? true,
  };

  React.useEffect(() => {
    if (!image) {
      setImageMetadata(null);
      return;
    }

    const normalizedMime =
      getTypeFromMime(getMimeTypeFromUrl(image.imageData)) ||
      getTypeFromMime(getTypeFromFileName(image.imageFileName)) ||
      null;

    const updateMetadata = (width: number | null, height: number | null) => {
      setImageMetadata({
        imageId: image.id,
        mime: normalizedMime,
        width: typeof width === "number" && width > 0 ? width : null,
        height: typeof height === "number" && height > 0 ? height : null,
      });
    };

    if (image.resolution) {
      updateMetadata(image.resolution.width, image.resolution.height);
      return;
    }

    let isCancelled = false;
    (async () => {
      try {
        const { width, height } = await getImageDimensions(image.imageData);
        if (!isCancelled) {
          updateMetadata(width, height);
        }
      } catch {
        if (!isCancelled) {
          updateMetadata(null, null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [image]);

  const openFilePicker = () => {
    if (!onUpload || disabled) return;
    fileInputRef.current?.click();
  };

  const handleUpload = (file: File) => {
    if (!onUpload || disabled) return;
    onUpload(file);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
      event.currentTarget.value = "";
    }
  };

  const handlePaste = async () => {
    if (!mergedControls.paste || !onUpload || disabled) return;

    try {
      await pasteImageFromClipboard(handleUpload);
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  };

  const handleCopy = async () => {
    if (!image || !mergedControls.copy) return;

    try {
      await copyImageToClipboard(image.imageData);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  };

  const handleDownload = () => {
    if (!image || !mergedControls.download) return;

    const link = document.createElement("a");
    link.href = image.imageData;
    link.download = `bloom-ai-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemove = () => {
    if (!image || !mergedControls.remove || !onRemove) return;
    onRemove();
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (!isDropZone || disabled) return;

    dragDepthRef.current += 1;
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!isDropZone || disabled) return;
    if (event.dataTransfer) {
      const canHandleInternal =
        onDrop && hasInternalImageDragData(event.dataTransfer);
      if (canHandleInternal) {
        event.dataTransfer.dropEffect = "move";
      } else {
        const hasFiles = hasImageFilePayload(event.dataTransfer);
        if (hasFiles && onUpload) {
          event.dataTransfer.dropEffect = "copy";
        } else if (onDrop) {
          event.dataTransfer.dropEffect = "move";
        } else {
          event.dataTransfer.dropEffect = "none";
        }
      }
    }
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    if (!isDropZone || disabled) return;

    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (!isDropZone || disabled) return;

    dragDepthRef.current = 0;
    setIsDragOver(false);

    const internalImageId = onDrop
      ? getInternalImageDragData(event.dataTransfer)
      : null;
    if (internalImageId && onDrop) {
      onDrop(internalImageId);
      return;
    }

    const droppedFile = onUpload
      ? getImageFileFromDataTransfer(event.dataTransfer)
      : null;
    if (droppedFile) {
      handleUpload(droppedFile);
    }
  };

  const handleImageDragStart = (event: React.DragEvent<HTMLImageElement>) => {
    if (!draggableImageId || !event.dataTransfer) return;
    setInternalImageDragData(event.dataTransfer, draggableImageId);
    event.dataTransfer.effectAllowed = "copyMove";
  };

  const handleMouseEnter = () => {
    if (!disabled) setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Get the art style ID from the image's metadata (parameters)
  const imageArtStyleId = getArtStyleIdForImage(image);
  const hasValidArtStyle = !!imageArtStyleId;

  const handleContextMenu = (event: React.MouseEvent) => {
    // Only show context menu if we have an image with an art style in its metadata
    if (!image || !hasValidArtStyle) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleSetThumbnail = async () => {
    if (!image || !hasValidArtStyle || !imageArtStyleId) return;
    setContextMenu(null);
    setThumbnailStatus("saving");

    try {
      const processedImage = await processImageForThumbnail(image.imageData);
      await saveArtStyleThumbnail(imageArtStyleId, processedImage);
      setThumbnailStatus("success");
      // Reset status after a brief delay
      setTimeout(() => setThumbnailStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to set thumbnail:", error);
      setThumbnailStatus("error");
      setTimeout(() => setThumbnailStatus("idle"), 3000);
    }
  };

  // Close context menu when clicking outside
  React.useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const variantStyles = VARIANT_LAYOUT_STYLES[variant];

  // Panel slots stay transparent until hovered or dragged for a lighter touch.
  const baseBackgroundColor =
    variant === "panel" ? "transparent" : theme.colors.surface;
  const hoverBackgroundColor =
    variant === "panel" ? theme.colors.surfaceAlt : baseBackgroundColor;

  const defaultActionLabels: Record<keyof ImageSlotControls, string> = {
    upload: "Upload",
    paste: "Paste from Clipboard",
    copy: "Copy to Clipboard",
    download: "Download",
    remove: "Remove image",
  };

  const actionButtons = [
    {
      key: "upload",
      icon: Icons.Upload,
      title: actionLabels?.upload ?? defaultActionLabels.upload,
      onClick: openFilePicker,
      isVisible: mergedControls.upload && !!onUpload,
    },
    {
      key: "paste",
      icon: Icons.Paste,
      title: actionLabels?.paste ?? defaultActionLabels.paste,
      onClick: handlePaste,
      isVisible: mergedControls.paste && !!onUpload,
    },
    {
      key: "copy",
      icon: Icons.Copy,
      title: actionLabels?.copy ?? defaultActionLabels.copy,
      onClick: handleCopy,
      isVisible: mergedControls.copy && !!image,
    },
    {
      key: "download",
      icon: Icons.Download,
      title: actionLabels?.download ?? defaultActionLabels.download,
      onClick: handleDownload,
      isVisible: mergedControls.download && !!image,
    },
    {
      key: "remove",
      icon: Icons.X,
      title: actionLabels?.remove ?? defaultActionLabels.remove,
      onClick: handleRemove,
      isVisible: mergedControls.remove && !!image && !!onRemove,
    },
  ].filter((action) => action.isVisible && !disabled);

  const orderedActionButtons =
    variant === "panel"
      ? actionButtons
      : (() => {
          const removeIndex = actionButtons.findIndex(
            (action) => action.key === "remove"
          );
          if (removeIndex > 0) {
            const reordered = [...actionButtons];
            const [removeAction] = reordered.splice(removeIndex, 1);
            reordered.unshift(removeAction);
            return reordered;
          }
          return actionButtons;
        })();

  const shouldShowActions = isHovered && orderedActionButtons.length > 0;

  const renderActions = () => {
    if (!shouldShowActions) return null;

    if (variant === "panel") {
      return (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          {orderedActionButtons.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              style={{
                padding: 8,
                borderRadius: "50%",
                border: `1px solid ${theme.colors.panelBorder}`,
                backgroundColor: theme.colors.overlay,
                color: theme.colors.textPrimary,
                boxShadow: theme.colors.panelShadow,
                backdropFilter: "blur(6px)",
                transition: "background-color 120ms ease",
              }}
              title={action.title}
              aria-label={action.title}
            >
              <Icon path={action.icon} width={16} height={16} />
            </button>
          ))}
        </div>
      );
    }

    return (
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 20,
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        {orderedActionButtons.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            style={{
              padding: 8,
              borderRadius: "50%",
              border: `1px solid ${theme.colors.panelBorder}`,
              backgroundColor: theme.colors.overlay,
              color: theme.colors.textPrimary,
              boxShadow: theme.colors.panelShadow,
              backdropFilter: "blur(6px)",
              transition: "background-color 120ms ease",
            }}
            title={action.title}
            aria-label={action.title}
          >
            <Icon path={action.icon} width={16} height={16} />
          </button>
        ))}
      </div>
    );
  };

  const defaultEmptyState = (
    <button
      type="button"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: theme.colors.textMuted,
        background: "none",
        border: "none",
        cursor:
          mergedControls.upload && onUpload && !disabled
            ? "pointer"
            : "default",
      }}
      onClick={
        mergedControls.upload && onUpload && !disabled
          ? openFilePicker
          : undefined
      }
    >
      <img
        src="/assets/image_placeholder.svg"
        alt="Placeholder"
        style={{ width: 48, height: 48, opacity: 0.3 }}
      />
      {/* Drop/upload helper text intentionally omitted for cleaner UI */}
    </button>
  );

  const emptyStateContent = renderEmptyState
    ? renderEmptyState({ openFilePicker, isDropZone, disabled })
    : defaultEmptyState;

  const actionsNode = renderActions();
  const activeMetadata =
    image && imageMetadata?.imageId === image.id ? imageMetadata : null;
  const metadataLabels = activeMetadata
    ? {
        dimension:
          activeMetadata.width && activeMetadata.height
            ? `${activeMetadata.width} x ${activeMetadata.height}`
            : activeMetadata.width || activeMetadata.height
            ? `${activeMetadata.width ?? "?"} x ${activeMetadata.height ?? "?"}`
            : "Unknown size",
        mime: activeMetadata.mime || "Unknown type",
      }
    : null;

  return (
    <div
      data-testid={dataTestId}
      style={{
        ...variantStyles.container,
        backgroundColor: isDragOver
          ? theme.colors.dropZone
          : isHovered
          ? hoverBackgroundColor
          : baseBackgroundColor,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
        filter: disabled ? "grayscale(1)" : "none",
        borderColor: isDragOver
          ? theme.colors.dropZoneBorder
          : theme.colors.panelBorder,
        boxShadow: theme.colors.panelShadow,
        minHeight: variant === "tile" ? 0 : undefined,
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {variant === "panel" && (label || actionsNode) && (
        <ImageSlotHeader label={label || ""} actions={actionsNode} />
      )}

      <div style={variantStyles.contentWrapper}>
        <div style={variantStyles.innerWrapper}>
          {image ? (
            <div
              style={{
                display: "flex",
                maxWidth: "100%",
                maxHeight: "100%",
                ...TRANSPARENCY_BACKGROUND_STYLE,
              }}
            >
              <MagnifiableImage
                src={image.imageData}
                alt={label || "Reference"}
                style={{
                  maxHeight: "100%",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
                draggable={!!draggableImageId}
                onDragStart={handleImageDragStart}
              />
            </div>
          ) : (
            emptyStateContent
          )}

          {variant === "tile" && actionsNode}

          {rolePill && (
            <div
              data-testid={rolePill.testId}
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                padding: "4px 8px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                userSelect: "none",
                zIndex: 10,
                backgroundColor:
                  rolePill.kind === "target"
                    ? theme.colors.accent
                    : theme.colors.overlay,
                color: theme.colors.textPrimary,
                border: `1px solid ${theme.colors.panelBorder}`,
                boxShadow: theme.colors.insetShadow,
              }}
            >
              {rolePill.label}
            </div>
          )}

          {image && metadataLabels && isHovered && (
            <div
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontSize: "10px",
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: "999px",
                zIndex: 15,
                backgroundColor: theme.colors.overlay,
                color: theme.colors.textPrimary,
                boxShadow: theme.colors.panelShadow,
                pointerEvents: "none",
              }}
            >
              <span>{metadataLabels.dimension}</span>
              <span style={{ opacity: 0.85 }}>{metadataLabels.mime}</span>
            </div>
          )}

          {isDragOver && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 20,
                borderRadius: "18px",
                backgroundColor: theme.colors.dropZone,
                border: `2px dashed ${theme.colors.dropZoneBorder}`,
                pointerEvents: "none",
                backdropFilter: "blur(1px)",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  color: theme.colors.textPrimary,
                  textShadow: theme.colors.panelShadow,
                }}
              >
                {dropLabel}
              </span>
            </div>
          )}

          {isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                zIndex: 30,
                borderRadius: "18px",
                backgroundColor: theme.colors.overlayStrong,
                backdropFilter: "blur(4px)",
              }}
            >
              <CircularProgress size={40} sx={{ color: theme.colors.accent }} />
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: theme.colors.textPrimary,
                }}
              >
                Generating...
              </span>
            </div>
          )}
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        data-testid={uploadInputTestId}
        onChange={handleInputChange}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          data-testid="image-slot-context-menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 50,
            borderRadius: 12,
            padding: 4,
            minWidth: 160,
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            boxShadow: theme.colors.panelShadow,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="context-menu-set-thumbnail"
            style={{
              width: "100%",
              padding: "8px 16px",
              textAlign: "left",
              fontSize: "0.85rem",
              color: theme.colors.textPrimary,
              backgroundColor: "transparent",
              border: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.surfaceAlt;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            onClick={handleSetThumbnail}
          >
            Set thumbnail
          </button>
        </div>
      )}

      {/* Thumbnail Status Indicator */}
      {thumbnailStatus !== "idle" && (
        <div
          data-testid="thumbnail-status"
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            padding: "4px 12px",
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: 500,
            zIndex: 40,
            backgroundColor:
              thumbnailStatus === "saving"
                ? theme.colors.accent
                : thumbnailStatus === "success"
                ? "#22c55e"
                : "#ef4444",
            color: "white",
          }}
        >
          {thumbnailStatus === "saving" && "Saving..."}
          {thumbnailStatus === "success" && "Thumbnail saved!"}
          {thumbnailStatus === "error" && "Failed to save"}
        </div>
      )}
    </div>
  );
};
