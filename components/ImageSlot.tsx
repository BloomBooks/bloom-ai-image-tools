import React from "react";
import { HistoryItem } from "../types";
import { Icon, Icons } from "./Icons";
import { MagnifiableImage } from "./MagnifiableImage";
import { theme } from "../themes";
import { PanelToolbar } from "./PanelToolbar";
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
  className?: string;
  rolePill?: { label: string; kind?: RoleKind; testId?: string };
  renderEmptyState?: (args: RenderEmptyStateArgs) => React.ReactNode;
  dropLabel?: string;
  dataTestId?: string;
  actionLabels?: Partial<Record<keyof ImageSlotControls, string>>;
}

const VARIANT_CLASSES = {
  panel: {
    container:
      "flex flex-col h-full relative group transition-colors duration-200 rounded-3xl border p-4 gap-4",
    contentWrapper: "flex-1 flex items-center justify-center min-h-0",
    innerWrapper:
      "relative rounded-2xl overflow-hidden w-full h-full flex items-center justify-center",
  },
  tile: {
    container:
      "relative flex flex-col rounded-2xl border transition-colors duration-200 overflow-hidden min-h-0",
    contentWrapper: "flex-1 flex items-center justify-center min-h-0",
    innerWrapper:
      "relative w-full h-full flex items-center justify-center rounded-2xl overflow-hidden min-h-0",
  },
} as const;

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
  className,
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

  const variantClasses = VARIANT_CLASSES[variant];
  const containerClasses = [variantClasses.container, className]
    .filter(Boolean)
    .join(" ");

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
        <div className="flex gap-2">
          {orderedActionButtons.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
              style={{
                backgroundColor: theme.colors.overlay,
                color: theme.colors.textPrimary,
              }}
              title={action.title}
              aria-label={action.title}
            >
              <Icon path={action.icon} className="w-4 h-4" />
            </button>
          ))}
        </div>
      );
    }

    return (
      <div
        className="absolute top-2 right-2 flex flex-col gap-1 z-20"
        style={{ pointerEvents: disabled ? "none" : "auto" }}
      >
        {orderedActionButtons.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
            style={{
              backgroundColor: theme.colors.overlay,
              color: theme.colors.textPrimary,
            }}
            title={action.title}
            aria-label={action.title}
          >
            <Icon path={action.icon} className="w-4 h-4" />
          </button>
        ))}
      </div>
    );
  };

  const defaultEmptyState = (
    <button
      type="button"
      className="w-full h-full flex flex-col items-center justify-center gap-2"
      style={{
        color: theme.colors.textMuted,
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
        className="w-12 h-12"
        style={{ opacity: 0.3 }}
      />
      {/* <span className="text-xs font-medium opacity-70">Drop or upload</span> */}
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
      className={containerClasses}
      style={{
        backgroundColor: isDragOver
          ? theme.colors.dropZone
          : variant === "panel"
          ? theme.colors.surfaceAlt
          : theme.colors.surface,
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
        <PanelToolbar label={label || ""} actions={actionsNode} />
      )}

      <div className={variantClasses.contentWrapper}>
        <div className={variantClasses.innerWrapper}>
          {image ? (
            <MagnifiableImage
              src={image.imageData}
              alt={label || "Reference"}
              className="max-h-full max-w-full object-contain"
              draggable={!!draggableImageId}
              onDragStart={handleImageDragStart}
            />
          ) : (
            emptyStateContent
          )}

          {variant === "tile" && actionsNode}

          {rolePill && (
            <div
              data-testid={rolePill.testId}
              className="absolute top-2 left-2 px-2 py-1 rounded-full text-[10px] font-semibold tracking-wide select-none"
              style={{
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
              className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 text-[10px] font-semibold px-3 py-1 rounded-full"
              style={{
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
              className="absolute inset-0 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-2xl"
              style={{
                backgroundColor: theme.colors.dropZone,
                border: `2px dashed ${theme.colors.dropZoneBorder}`,
                pointerEvents: "none",
              }}
            >
              <span
                className="font-bold text-sm drop-shadow-md"
                style={{ color: theme.colors.textPrimary }}
              >
                {dropLabel}
              </span>
            </div>
          )}

          {isLoading && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center z-30 gap-4 rounded-2xl"
              style={{
                backgroundColor: theme.colors.overlayStrong,
                backdropFilter: "blur(4px)",
              }}
            >
              <div
                className="w-12 h-12 rounded-full border-4 border-solid animate-spin"
                style={{
                  borderColor: theme.colors.overlay,
                  borderTopColor: theme.colors.accent,
                }}
              ></div>
              <span
                className="text-sm font-semibold tracking-wide"
                style={{ color: theme.colors.textPrimary }}
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
        className="hidden"
        accept="image/*"
        data-testid={uploadInputTestId}
        onChange={handleInputChange}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          data-testid="image-slot-context-menu"
          className="fixed z-50 rounded-lg shadow-xl border py-1 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            boxShadow: theme.colors.panelShadow,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="context-menu-set-thumbnail"
            className="w-full px-4 py-2 text-left text-sm transition-colors"
            style={{
              color: theme.colors.textPrimary,
              backgroundColor: "transparent",
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
          className="absolute bottom-2 left-2 px-3 py-1 rounded-full text-xs font-medium z-40"
          style={{
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
