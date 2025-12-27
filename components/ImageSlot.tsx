import React from "react";
import { ImageRecord } from "../types";
import { MagnifiableImage } from "./MagnifiableImage";
import { kBloomBlue, theme } from "../themes";
import { ImageSlotHeader } from "./ImageSlotHeader";
import { ImageSlotActions, ImageSlotActionsHandle } from "./ImageSlotActions";
import { ImageSlotOverlayStar } from "./ImageSlotOverlayStar";
import { ImageSlotRolePill } from "./ImageSlotRolePill";
import { ImageSlotDropOverlay } from "./ImageSlotDropOverlay";
import { ImageSlotLoadingOverlay } from "./ImageSlotLoadingOverlay";
import { ImageSlotArtStyleContextMenu } from "./ImageSlotArtStyleContextMenu";
import {
  ImageSlotThumbnailStatusBadge,
  ThumbnailStatus,
} from "./ImageSlotThumbnailStatusBadge";
import { ImageSlotInfoDialog } from "./ImageSlotInfoDialog";
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
import { getMimeTypeFromUrl } from "../lib/imageUtils";
import {
  hasImageFilePayload,
  getImageFileFromDataTransfer,
} from "../lib/dragUtils";
import { TOOLS } from "./tools/tools-registry";
import { getModelNameById } from "../lib/modelsCatalog";

let transparentDragImage: HTMLImageElement | null = null;
const getTransparentDragImage = (): HTMLImageElement | null => {
  try {
    if (typeof document === "undefined") return null;
    if (transparentDragImage) return transparentDragImage;
    const img = document.createElement("img");
    // 1x1 transparent GIF
    img.src =
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    transparentDragImage = img;
    return img;
  } catch {
    return null;
  }
};

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
  image: ImageRecord | null;
  disabled?: boolean;
  isDropZone?: boolean;
  onClick?: () => void;
  isSelected?: boolean;
  onDrop?: (imageId: string) => void;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
  draggableImageId?: string;
  dragEffectAllowed?: DataTransfer["effectAllowed"];
  onImageDragStart?: (event: React.DragEvent) => void;
  isLoading?: boolean;
  uploadInputTestId?: string;
  controls?: ImageSlotControls;
  variant?: "panel" | "tile" | "thumb";
  rolePill?: { label: string; kind?: RoleKind; testId?: string };
  renderEmptyState?: (args: RenderEmptyStateArgs) => React.ReactNode;
  dropLabel?: string;
  dataTestId?: string;
  actionLabels?: Partial<Record<keyof ImageSlotControls, string>>;
  starState?: { isStarred: boolean; onToggle: () => void };
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
  thumb: {
    container: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      borderRadius: 12,
      borderWidth: 2,
      borderStyle: "solid",
      overflow: "hidden",
      transition:
        "opacity 150ms ease, border-color 150ms ease, box-shadow 150ms ease",
      width: "100%",
      aspectRatio: "1 / 1",
      backgroundColor: "transparent",
    },
    contentWrapper: {
      display: "flex",
      flex: 1,
      alignItems: "stretch",
      justifyContent: "stretch",
      minHeight: 0,
    },
    innerWrapper: {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "stretch",
      justifyContent: "stretch",
      minHeight: 0,
      borderRadius: "inherit",
      overflow: "hidden",
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

const getArtStyleIdForImage = (item?: ImageRecord | null): string | null => {
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
  onClick,
  isSelected = false,
  onDrop,
  onUpload,
  onRemove,
  draggableImageId,
  dragEffectAllowed,
  onImageDragStart,
  isLoading = false,
  uploadInputTestId,
  controls,
  variant = "panel",
  rolePill,
  renderEmptyState,
  dropLabel = "Drop image",
  dataTestId,
  actionLabels,
  starState,
}) => {
  const ACTION_ICON_SIZE = 16;
  const ACTION_BUTTON_PADDING = 6;
  const OVERLAY_CORNER_OFFSET = 4;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const slotRef = React.useRef<HTMLDivElement>(null);
  const thumbActionsRef = React.useRef<ImageSlotActionsHandle | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragDepthRef = React.useRef(0);
  const [isHovered, setIsHovered] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [thumbnailStatus, setThumbnailStatus] =
    React.useState<ThumbnailStatus>("idle");
  const [isMagnifierPinned, setIsMagnifierPinned] = React.useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = React.useState(false);

  const debugLog = React.useCallback((...args: any[]) => {
    try {
      if (typeof window !== "undefined" && (window as any).__E2E_VERBOSE) {
        // eslint-disable-next-line no-console
        console.log("[image-slot]", ...args);
      }
    } catch {
      // ignore
    }
  }, []);

  const lastDragPointerDownRef = React.useRef<
    | {
        t: number;
        x: number;
        y: number;
        pointerType: string;
      }
    | null
  >(null);

  const mergedControls: Required<ImageSlotControls> = {
    upload: controls?.upload ?? true,
    paste: controls?.paste ?? true,
    copy: controls?.copy ?? true,
    download: controls?.download ?? true,
    remove: controls?.remove ?? true,
  };

  React.useEffect(() => {
    if (!image) {
      setIsMagnifierPinned(false);
    }
  }, [image]);

  // Leaving magnifier mode as soon as the slot loses focus-like attention keeps the interaction predictable.
  React.useEffect(() => {
    if (!isMagnifierPinned) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!slotRef.current) return;
      if (slotRef.current.contains(event.target as Node)) return;
      setIsMagnifierPinned(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMagnifierPinned(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMagnifierPinned]);

  React.useEffect(() => {
    if (!image || disabled) {
      setIsMagnifierPinned(false);
    }
  }, [image, disabled]);

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
      setThumbnailStatus("copying");

      const tool = TOOLS.find((t) => t.id === image.toolId) || null;
      const isNewImageTool = tool?.editImage === false;
      const modelId = (image.model || "").trim();
      const modelName = getModelNameById(modelId) || modelId;
      const pngMetadata = modelId
        ? isNewImageTool
          ? {
              IllustratorModel: modelName,
              IllustratorModelId: modelId,
            }
          : {
              EditorModel: modelName,
              EditorModelId: modelId,
            }
        : undefined;

      await copyImageToClipboard(image.imageData, pngMetadata);
      setThumbnailStatus("copied");
      setTimeout(() => setThumbnailStatus("idle"), 1500);
    } catch (err) {
      console.error("Failed to copy image:", err);
      setThumbnailStatus("copyError");
      setTimeout(() => setThumbnailStatus("idle"), 3000);
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

  const applyInternalDragData = (event: React.DragEvent) => {
    if (!draggableImageId || !event.dataTransfer) return;
    setInternalImageDragData(event.dataTransfer, draggableImageId);
    event.dataTransfer.effectAllowed = dragEffectAllowed ?? "copyMove";

    // Avoid expensive default drag preview generation (especially with large data-URL images).
    // This can reduce perceived delay between pointer gesture and drag actually starting.
    try {
      const dragImg = getTransparentDragImage();
      if (dragImg) {
        event.dataTransfer.setDragImage(dragImg, 0, 0);
      }
    } catch {
      // ignore
    }
  };

  const handleImageDragStart = (event: React.DragEvent<HTMLImageElement>) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (lastDragPointerDownRef.current) {
      debugLog(
        `dragstart(img) dt=${Math.round(now - lastDragPointerDownRef.current.t)}ms pointer=${lastDragPointerDownRef.current.pointerType}`
      );
    } else {
      debugLog("dragstart(img) (no prior pointerdown recorded)");
    }
    applyInternalDragData(event);
    onImageDragStart?.(event);
  };

  const handleContainerDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (variant !== "thumb") return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (lastDragPointerDownRef.current) {
      debugLog(
        `dragstart(container) dt=${Math.round(now - lastDragPointerDownRef.current.t)}ms pointer=${lastDragPointerDownRef.current.pointerType}`
      );
    } else {
      debugLog("dragstart(container) (no prior pointerdown recorded)");
    }
    applyInternalDragData(event);
    onImageDragStart?.(event);
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleMagnifierToggle = () => {
    if (!image || disabled) return;
    setIsMagnifierPinned((previous) => !previous);
  };

  const handleOpenInfo = () => {
    if (!image || disabled) return;
    setIsInfoDialogOpen(true);
  };

  const handleCloseInfo = () => {
    setIsInfoDialogOpen(false);
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

  const headerActions =
    variant === "panel" && isHovered ? (
      <ImageSlotActions
        placement="header"
        variant={variant}
        image={image}
        disabled={disabled}
        isHovered={isHovered}
        controls={mergedControls}
        supportsUpload={!!onUpload}
        supportsRemove={!!onRemove}
        actionLabels={actionLabels}
        iconSize={ACTION_ICON_SIZE}
        buttonPadding={ACTION_BUTTON_PADDING}
        cornerOffset={OVERLAY_CORNER_OFFSET}
        isMagnifierPinned={isMagnifierPinned}
        onUploadClick={openFilePicker}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onRemove={handleRemove}
        onOpenInfo={handleOpenInfo}
        onToggleMagnifier={handleMagnifierToggle}
      />
    ) : undefined;

  const shouldRenderHeader =
    variant === "panel" && (label || headerActions || starState);

  const shouldShowOverlayStar =
    variant !== "panel" && !!starState && !!image && !disabled;

  return (
    <>
      <div
        ref={slotRef}
        data-testid={dataTestId}
        role={onClick ? "button" : undefined}
        tabIndex={onClick && !disabled ? 0 : undefined}
        onClick={disabled ? undefined : onClick}
        onPointerDownCapture={(event) => {
          // Record timing only for potentially-draggable slots/images.
          const isPotentiallyDraggable =
            (!disabled && !!draggableImageId) ||
            (variant === "thumb" && !!draggableImageId && !disabled);
          if (!isPotentiallyDraggable) return;
          lastDragPointerDownRef.current = {
            t: typeof performance !== "undefined" ? performance.now() : Date.now(),
            x: event.clientX,
            y: event.clientY,
            pointerType: (event as any).pointerType || "unknown",
          };
          debugLog(
            `pointerDown(${lastDragPointerDownRef.current.pointerType}) @(${Math.round(
              event.clientX
            )},${Math.round(event.clientY)}) variant=${variant}`
          );
        }}
        draggable={variant === "thumb" && !!draggableImageId && !disabled}
        onDragStart={handleContainerDragStart}
        style={{
          ...variantStyles.container,
          backgroundColor:
            variant === "thumb"
              ? "transparent"
              : isDragOver
              ? theme.colors.dropZone
              : isHovered
              ? hoverBackgroundColor
              : baseBackgroundColor,
          opacity: disabled
            ? 0.4
            : variant === "thumb"
            ? isSelected
              ? 1
              : isHovered
              ? 1
              : 0.8
            : 1,
          cursor:
            !disabled && (onClick || variant === "thumb")
              ? "pointer"
              : "default",
          pointerEvents: disabled ? "none" : "auto",
          filter: disabled ? "grayscale(1)" : "none",
          borderColor: isDragOver
            ? theme.colors.dropZoneBorder
            : variant === "thumb"
            ? isSelected
              ? theme.colors.accent
              : theme.colors.border
            : theme.colors.panelBorder,
          boxShadow:
            variant === "thumb"
              ? isSelected
                ? theme.colors.accentShadow
                : "none"
              : theme.colors.panelShadow,
          minHeight: variant === "tile" ? 0 : undefined,
          outline: "none",
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={() => {
          if (variant !== "thumb") return;
          if (!isHovered) return;
          if (disabled) return;

          // Hover-intent: only reveal the "..." trigger after the pointer has
          // settled for 500ms. Any movement resets the timer.
          thumbActionsRef.current?.notifyPointerMove();
        }}
        onContextMenu={handleContextMenu}
        onKeyDown={(event) => {
          if (!onClick || disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
      >
        {shouldRenderHeader && (
          <ImageSlotHeader
            label={label || ""}
            actions={headerActions}
            isStarred={starState?.isStarred}
            onToggleStar={image ? starState?.onToggle : undefined}
          />
        )}

        <div style={variantStyles.contentWrapper}>
          <div style={variantStyles.innerWrapper}>
            {image ? (
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  maxWidth: "100%",
                  maxHeight: "100%",
                }}
              >
                <MagnifiableImage
                  src={image.imageData}
                  alt={label || "Reference"}
                  enableLens={isMagnifierPinned}
                  style={{
                    maxHeight: "100%",
                    maxWidth: "100%",
                    objectFit: variant === "thumb" ? "cover" : "contain",
                    display: "block",
                    ...(variant === "thumb"
                      ? undefined
                      : TRANSPARENCY_BACKGROUND_STYLE),
                  }}
                  draggable={!!draggableImageId}
                  onDragStart={handleImageDragStart}
                />
              </div>
            ) : (
              emptyStateContent
            )}

            <ImageSlotActions
              ref={thumbActionsRef}
              placement="overlay"
              variant={variant}
              image={image}
              disabled={disabled}
              isHovered={isHovered}
              controls={mergedControls}
              supportsUpload={!!onUpload}
              supportsRemove={!!onRemove}
              actionLabels={actionLabels}
              iconSize={ACTION_ICON_SIZE}
              buttonPadding={ACTION_BUTTON_PADDING}
              cornerOffset={OVERLAY_CORNER_OFFSET}
              isMagnifierPinned={isMagnifierPinned}
              onUploadClick={openFilePicker}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onDownload={handleDownload}
              onRemove={handleRemove}
              onOpenInfo={handleOpenInfo}
              onToggleMagnifier={handleMagnifierToggle}
            />

            <ImageSlotOverlayStar
              isVisible={shouldShowOverlayStar}
              isStarred={Boolean(starState?.isStarred)}
              onToggle={() => starState?.onToggle()}
              isHovered={isHovered}
              disabled={disabled}
              cornerOffset={OVERLAY_CORNER_OFFSET}
              buttonPadding={ACTION_BUTTON_PADDING}
            />

            {rolePill ? <ImageSlotRolePill pill={rolePill} /> : null}

            <ImageSlotDropOverlay
              isVisible={isDragOver}
              label={dropLabel}
              borderRadius={18}
            />

            <ImageSlotLoadingOverlay isVisible={isLoading} borderRadius={18} />
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

        <ImageSlotArtStyleContextMenu
          contextMenu={contextMenu}
          onSetThumbnail={handleSetThumbnail}
        />

        <ImageSlotThumbnailStatusBadge status={thumbnailStatus} />
      </div>

      <ImageSlotInfoDialog
        open={isInfoDialogOpen}
        image={image}
        label={label}
        onClose={handleCloseInfo}
      />
    </>
  );
};
