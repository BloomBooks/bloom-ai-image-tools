import React from "react";
import { HistoryItem } from "../types";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";

export type ImageHolderControls = {
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

export interface ImageHolderProps {
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
  controls?: ImageHolderControls;
  variant?: "panel" | "tile";
  className?: string;
  rolePill?: { label: string; kind?: RoleKind; testId?: string };
  renderEmptyState?: (args: RenderEmptyStateArgs) => React.ReactNode;
  dropLabel?: string;
  dataTestId?: string;
  actionLabels?: Partial<Record<keyof ImageHolderControls, string>>;
}

const VARIANT_CLASSES = {
  panel: {
    container:
      "flex flex-col h-full relative group transition-colors duration-200 rounded-3xl border p-4 gap-4",
    toolbar:
      "flex justify-between items-center rounded-2xl shadow-lg px-4 py-2 backdrop-blur-md",
    contentWrapper: "flex-1 flex items-center justify-center min-h-0",
    innerWrapper:
      "relative rounded-2xl overflow-hidden w-full h-full flex items-center justify-center",
  },
  tile: {
    container:
      "relative flex flex-col rounded-2xl border transition-colors duration-200 overflow-hidden",
    toolbar: "hidden", // toolbar is not rendered for tile variant
    contentWrapper: "flex-1 flex items-center justify-center min-h-[140px]",
    innerWrapper:
      "relative w-full h-full flex items-center justify-center rounded-2xl overflow-hidden",
  },
} as const;

export const ImageHolder: React.FC<ImageHolderProps> = ({
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

  const mergedControls: Required<ImageHolderControls> = {
    upload: controls?.upload ?? true,
    paste: controls?.paste ?? true,
    copy: controls?.copy ?? true,
    download: controls?.download ?? true,
    remove: controls?.remove ?? true,
  };

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
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;

        const blob = await item.getType(imageType);
        const extension = imageType.split("/")[1] || "png";
        const file = new File([blob], `pasted.${extension}`, {
          type: imageType,
        });
        handleUpload(file);
        return;
      }
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  };

  const handleCopy = () => {
    if (!image || !mergedControls.copy) return;

    navigator.clipboard
      .write([
        new ClipboardItem({
          "image/png": fetch(image.imageData).then((response) =>
            response.blob()
          ),
        }),
      ])
      .catch((err) => console.error("Failed to copy image:", err));
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

    const imageId = event.dataTransfer.getData("text/plain");
    if (imageId && onDrop) {
      onDrop(imageId);
    }
  };

  const handleImageDragStart = (event: React.DragEvent<HTMLImageElement>) => {
    if (!draggableImageId) return;
    event.dataTransfer.setData("text/plain", draggableImageId);
    event.dataTransfer.effectAllowed = "copyMove";
  };

  const variantClasses = VARIANT_CLASSES[variant];
  const containerClasses = [variantClasses.container, className]
    .filter(Boolean)
    .join(" ");

  const defaultActionLabels: Record<keyof ImageHolderControls, string> = {
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

  const renderActions = () => {
    if (variant === "panel") {
      return (
        <div className="flex gap-2">
          {actionButtons.map((action) => (
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

    if (!actionButtons.length) return null;

    return (
      <div
        className="absolute top-2 right-2 flex flex-col gap-1 z-20"
        style={{ pointerEvents: disabled ? "none" : "auto" }}
      >
        {actionButtons.map((action) => (
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
      <span className="text-xs font-medium opacity-70">Drop or upload</span>
    </button>
  );

  const emptyStateContent = renderEmptyState
    ? renderEmptyState({ openFilePicker, isDropZone, disabled })
    : defaultEmptyState;

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
        minHeight: variant === "tile" ? 180 : undefined,
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {variant === "panel" && (label || actionButtons.length) && (
        <div
          className={VARIANT_CLASSES.panel.toolbar}
          style={{ backgroundColor: "transparent" }}
        >
          <div
            className="px-3 py-1.5 text-xs font-bold uppercase rounded-full"
            style={{
              color: theme.colors.textPrimary,
              backgroundColor: "transparent",
            }}
          >
            {label}
          </div>
          {renderActions()}
        </div>
      )}

      <div className={variantClasses.contentWrapper}>
        <div className={variantClasses.innerWrapper}>
          {image ? (
            <img
              src={image.imageData}
              alt={label || "Reference"}
              className="max-h-full max-w-full object-contain"
              draggable={!!draggableImageId}
              onDragStart={handleImageDragStart}
            />
          ) : (
            emptyStateContent
          )}

          {variant === "tile" && renderActions()}

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

          {isDragOver && (
            <div
              className="absolute inset-0 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-2xl"
              style={{
                backgroundColor: theme.colors.dropZone,
                border: `2px dashed ${theme.colors.dropZoneBorder}`,
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
    </div>
  );
};
