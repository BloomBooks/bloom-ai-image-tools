import React from "react";
import {
  Button,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popper,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { ImageRecord } from "../types";
import { Icon, Icons } from "./Icons";
import { ImageInfoPanel } from "./ImageInfoPanel";
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
import { getMimeTypeFromUrl } from "../lib/imageUtils";
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

type SlotActionButton = {
  key: string;
  icon: string;
  title: string;
  onClick: () => void;
  ariaPressed?: boolean;
  isActive?: boolean;
  testId?: string;
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const slotRef = React.useRef<HTMLDivElement>(null);
  const thumbMoreButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const thumbCloseTimeoutRef = React.useRef<number | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragDepthRef = React.useRef(0);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isThumbOverflowOpen, setIsThumbOverflowOpen] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [thumbnailStatus, setThumbnailStatus] = React.useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [isMagnifierPinned, setIsMagnifierPinned] = React.useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = React.useState(false);

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

  const applyInternalDragData = (event: React.DragEvent) => {
    if (!draggableImageId || !event.dataTransfer) return;
    setInternalImageDragData(event.dataTransfer, draggableImageId);
    event.dataTransfer.effectAllowed = dragEffectAllowed ?? "copyMove";
  };

  const handleImageDragStart = (event: React.DragEvent<HTMLImageElement>) => {
    applyInternalDragData(event);
    onImageDragStart?.(event);
  };

  const handleContainerDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (variant !== "thumb") return;
    applyInternalDragData(event);
    onImageDragStart?.(event);
  };

  const handleMouseEnter = () => {
    if (!disabled) setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  React.useEffect(() => {
    if (!isHovered) setIsThumbOverflowOpen(false);
  }, [isHovered]);

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

  const defaultActionLabels: Record<keyof ImageSlotControls, string> = {
    upload: "Upload",
    paste: "Paste from Clipboard",
    copy: "Copy to Clipboard",
    download: "Download",
    remove: "Remove image",
  };

  const actionButtons: SlotActionButton[] = [
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

  const infoAction: SlotActionButton | null =
    image && !disabled
      ? {
          key: "info",
          icon: Icons.Info,
          title: "Image info",
          onClick: handleOpenInfo,
          testId: "image-info-button",
        }
      : null;

  const actionButtonsWithInfo =
    variant !== "panel" && infoAction
      ? [...actionButtons, infoAction]
      : actionButtons;

  const orderedActionButtons =
    variant === "panel"
      ? actionButtons
      : (() => {
          const removeIndex = actionButtonsWithInfo.findIndex(
            (action) => action.key === "remove"
          );
          if (removeIndex > 0) {
            const reordered = [...actionButtonsWithInfo];
            const [removeAction] = reordered.splice(removeIndex, 1);
            reordered.unshift(removeAction);
            return reordered;
          }
          return actionButtonsWithInfo;
        })();

  const shouldShowActions = isHovered && orderedActionButtons.length > 0;

  const renderActionButton = (
    action: SlotActionButton,
    styleOverride?: React.CSSProperties
  ) => {
    const isActive = action.isActive ?? false;
    const usesTooltip = action.key === "info" && !!image;

    const buttonNode = (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          action.onClick();
        }}
        data-testid={action.testId}
        style={{
          padding: 8,
          borderRadius: "50%",
          border: "none",
          backgroundColor: isActive
            ? theme.colors.accent
            : theme.colors.overlay,
          color: isActive
            ? theme.colors.appBackground
            : theme.colors.textPrimary,
          boxShadow: theme.colors.panelShadow,
          backdropFilter: "blur(6px)",
          transition:
            "background-color 120ms ease, color 120ms ease",
          ...styleOverride,
        }}
        title={usesTooltip ? undefined : action.title}
        aria-label={action.title}
        aria-pressed={
          typeof action.ariaPressed === "boolean"
            ? action.ariaPressed
            : undefined
        }
      >
        <Icon path={action.icon} width={16} height={16} />
      </button>
    );

    if (usesTooltip) {
      return (
        <Tooltip
          key={action.key}
          placement="top"
          enterDelay={150}
          title={
            <div data-testid="image-info-tooltip">
              <ImageInfoPanel item={image} />
            </div>
          }
          slotProps={{
            tooltip: {
              sx: {
                maxWidth: "min(360px, calc(100vw - 32px))",
              },
            },
          }}
        >
          {buttonNode}
        </Tooltip>
      );
    }

    return <React.Fragment key={action.key}>{buttonNode}</React.Fragment>;
  };

  const shouldShowMagnifierToggle = variant === "panel" && !!image && !disabled;

  const panelActionButtons = shouldShowMagnifierToggle
    ? [
        ...orderedActionButtons,
        {
          key: "magnifier",
          icon: Icons.Magnifier,
          title: isMagnifierPinned ? "Disable magnifier" : "Enable magnifier",
          onClick: handleMagnifierToggle,
          ariaPressed: isMagnifierPinned,
          isActive: isMagnifierPinned,
          testId: "image-slot-magnifier-toggle",
        } satisfies SlotActionButton,
      ]
    : orderedActionButtons;

  const combinedHeaderActions =
    variant === "panel" && isHovered
      ? [
          ...(infoAction ? [renderActionButton(infoAction)] : []),
          ...panelActionButtons.map((action) => renderActionButton(action)),
        ]
      : [];

  const floatingActionsNode =
    variant !== "panel" && variant !== "thumb" && shouldShowActions ? (
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
        {orderedActionButtons.map((action) => renderActionButton(action))}
      </div>
    ) : null;

  const thumbOverlayActionsNode =
    variant === "thumb" &&
    !!image &&
    !disabled &&
    orderedActionButtons.length > 0
      ? (() => {
          const removeAction = orderedActionButtons.find(
            (action) => action.key === "remove"
          );
          const overflowActions = orderedActionButtons.filter(
            (action) => action.key !== "remove"
          );

          const showRemove = isHovered;
          const showMoreTrigger =
            overflowActions.length > 0 && (isHovered || isThumbOverflowOpen);

          const clearCloseTimeout = () => {
            if (thumbCloseTimeoutRef.current != null) {
              window.clearTimeout(thumbCloseTimeoutRef.current);
              thumbCloseTimeoutRef.current = null;
            }
          };

          const scheduleClose = () => {
            clearCloseTimeout();
            thumbCloseTimeoutRef.current = window.setTimeout(() => {
              setIsThumbOverflowOpen(false);
            }, 120);
          };

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
              {removeAction
                ? renderActionButton(removeAction, {
                    opacity: showRemove ? 1 : 0,
                    pointerEvents: showRemove ? "auto" : "none",
                    transition: "opacity 120ms ease",
                  })
                : null}

              {overflowActions.length > 0 ? (
                <ClickAwayListener
                  onClickAway={() => {
                    setIsThumbOverflowOpen(false);
                  }}
                >
                  <div
                    onMouseEnter={() => {
                      clearCloseTimeout();
                      setIsThumbOverflowOpen(true);
                    }}
                    onMouseLeave={() => {
                      scheduleClose();
                    }}
                    onFocusCapture={() => {
                      clearCloseTimeout();
                      setIsThumbOverflowOpen(true);
                    }}
                    onBlurCapture={(event) => {
                      const next = event.relatedTarget as Node | null;
                      if (!next || !event.currentTarget.contains(next)) {
                        scheduleClose();
                      }
                    }}
                    style={{ position: "relative" }}
                  >
                    <button
                      ref={(node) => {
                        thumbMoreButtonRef.current = node;
                      }}
                      type="button"
                      aria-label="More actions"
                      title="More actions"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearCloseTimeout();
                        setIsThumbOverflowOpen((open) => !open);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setIsThumbOverflowOpen(false);
                        }
                      }}
                      style={{
                        padding: 8,
                        borderRadius: "50%",
                        border: "none",
                        backgroundColor: theme.colors.overlay,
                        color: theme.colors.textPrimary,
                        boxShadow: theme.colors.panelShadow,
                        backdropFilter: "blur(6px)",
                        transition: "opacity 120ms ease",
                        opacity: showMoreTrigger ? 1 : 0,
                        pointerEvents: showMoreTrigger ? "auto" : "none",
                      }}
                    >
                      <Icon path={Icons.More} width={16} height={16} />
                    </button>

                    <Popper
                      open={isThumbOverflowOpen}
                      anchorEl={thumbMoreButtonRef.current}
                      placement="left-start"
                      style={{ zIndex: 60 }}
                      modifiers={[
                        {
                          name: "offset",
                          options: { offset: [0, 0] },
                        },
                      ]}
                    >
                      <div
                        onMouseEnter={() => {
                          clearCloseTimeout();
                        }}
                        onMouseLeave={() => {
                          scheduleClose();
                        }}
                        onFocusCapture={() => {
                          clearCloseTimeout();
                        }}
                        onBlurCapture={(event) => {
                          const next = event.relatedTarget as Node | null;
                          if (!next || !event.currentTarget.contains(next)) {
                            scheduleClose();
                          }
                        }}
                        style={{
                          border: `1px solid ${theme.colors.panelBorder}`,
                          borderRadius: 999,
                          backgroundColor: theme.colors.overlay,
                          boxShadow: theme.colors.panelShadow,
                          backdropFilter: "blur(6px)",
                          display: "flex",
                          flexDirection: "row",
                          gap: 4,
                          alignItems: "center",
                          justifyContent: "flex-end",
                          padding: 4,
                          paddingRight: 8,
                          transition:
                            "opacity 140ms ease, transform 140ms ease",
                          opacity: isThumbOverflowOpen ? 1 : 0,
                          transform: isThumbOverflowOpen
                            ? "translateX(0)"
                            : "translateX(10px)",
                          pointerEvents: isThumbOverflowOpen ? "auto" : "none",
                        }}
                      >
                        {overflowActions.map((action) =>
                          renderActionButton(action)
                        )}
                      </div>
                    </Popper>
                  </div>
                </ClickAwayListener>
              ) : null}
            </div>
          );
        })()
      : null;

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
    combinedHeaderActions.length > 0 ? combinedHeaderActions : undefined;

  const shouldRenderHeader =
    variant === "panel" && (label || headerActions || starState);

  const shouldShowOverlayStar =
    variant !== "panel" && !!starState && !!image && !disabled;

  const overlayStarNode = shouldShowOverlayStar ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        starState?.onToggle();
      }}
      aria-pressed={starState?.isStarred}
      title={starState?.isStarred ? "Unstar image" : "Star image"}
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        padding: starState?.isStarred ? 4 : 8,
        borderRadius: starState?.isStarred ? 0 : 999,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: starState?.isStarred
          ? "transparent"
          : theme.colors.overlay,
        color: starState?.isStarred
          ? theme.colors.accent
          : theme.colors.textPrimary,
        opacity: starState?.isStarred ? 1 : isHovered ? 1 : 0,
        transition:
          "opacity 120ms ease, color 120ms ease, box-shadow 120ms ease",
        boxShadow: starState?.isStarred ? "none" : "none",
        backdropFilter: starState?.isStarred ? "none" : "blur(6px)",
        zIndex: 25,
        pointerEvents:
          disabled || (!starState?.isStarred && !isHovered) ? "none" : "auto",
      }}
    >
      {starState?.isStarred ? (
        <StarIcon
          sx={{
            fontSize: 18,
            filter: `drop-shadow(${theme.colors.panelShadow})`,
          }}
        />
      ) : (
        <StarBorderIcon sx={{ fontSize: 16 }} />
      )}
    </button>
  ) : null;

  return (
    <>
      <div
        ref={slotRef}
        data-testid={dataTestId}
        role={onClick ? "button" : undefined}
        tabIndex={onClick && !disabled ? 0 : undefined}
        onClick={disabled ? undefined : onClick}
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

            {floatingActionsNode}

            {thumbOverlayActionsNode}

            {overlayStarNode}

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
                <CircularProgress
                  size={40}
                  sx={{ color: theme.colors.accent }}
                />
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

      {image && (
        <Dialog
          open={isInfoDialogOpen}
          onClose={handleCloseInfo}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            "data-testid": "image-info-dialog",
            sx: {
              borderRadius: 3,
            },
          }}
        >
          <DialogTitle sx={{ pr: 6 }}>
            {label ? `${label} info` : "Image info"}
            <IconButton
              aria-label="Close"
              onClick={handleCloseInfo}
              data-testid="image-info-dialog-close"
              sx={{
                position: "absolute",
                right: 8,
                top: 8,
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <ImageInfoPanel item={image} />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseInfo} variant="contained">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};
