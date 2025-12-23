import React, { useRef } from "react";
import { HistoryItem } from "../types";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";

interface ImagePanelProps {
  image: HistoryItem | null;
  label: string;
  onUpload: (file: File) => void;
  isDropZone?: boolean;
  onDrop?: (imageId: string) => void;
  disabled?: boolean;
  onClear?: () => void;
  showUploadControls?: boolean;
  draggableImageId?: string;
  isLoading?: boolean;
}

export const ImagePanel: React.FC<ImagePanelProps> = ({
  image,
  label,
  onUpload,
  isDropZone,
  onDrop,
  disabled,
  onClear,
  showUploadControls = true,
  draggableImageId,
  isLoading = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragDepthRef = React.useRef(0); // Track nested drag events to prevent flicker

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) {
          continue;
        }

        // Some clipboards advertise text/html before the binary image, so
        // explicitly request the image MIME type to avoid broken placeholders.
        const blob = await item.getType(imageType);
        const extension = imageType.split("/")[1] || "png";
        const file = new File([blob], `pasted.${extension}`, { type: imageType });
        onUpload(file);
        return;
      }
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  };

  const handleDownload = () => {
    if (!image) return;
    const link = document.createElement("a");
    link.href = image.imageData;
    link.download = `bloom-ai-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDropZone || disabled) {
      return;
    }

    dragDepthRef.current += 1;
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropZone && !disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDropZone || disabled) {
      return;
    }

    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    if (!isDropZone || !onDrop || disabled) return;

    const imageId = e.dataTransfer.getData("text/plain");
    if (imageId) {
      onDrop(imageId);
    }
  };

  const handleImageDragStart = (e: React.DragEvent<HTMLImageElement>) => {
    if (!draggableImageId) return;
    e.dataTransfer.setData("text/plain", draggableImageId);
    e.dataTransfer.effectAllowed = "copyMove";
  };

  return (
    <div
      className="flex flex-col h-full relative group transition-colors duration-200 rounded-3xl border p-4 gap-4"
      style={{
        backgroundColor: isDragOver ? theme.colors.dropZone : theme.colors.surfaceAlt,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
        filter: disabled ? "grayscale(1)" : "none",
        borderColor: theme.colors.panelBorder,
        boxShadow: theme.colors.panelShadow,
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div
        className="flex justify-between items-center rounded-2xl shadow-lg px-4 py-2 backdrop-blur-md"
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

        <div className="flex gap-2">
          {showUploadControls && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
                style={{
                  backgroundColor: theme.colors.overlay,
                  color: theme.colors.textPrimary,
                }}
                title="Upload"
              >
                <Icon path={Icons.Upload} className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) =>
                  e.target.files?.[0] && onUpload(e.target.files[0])
                }
              />

              <button
                onClick={handlePaste}
                className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
                style={{
                  backgroundColor: theme.colors.overlay,
                  color: theme.colors.textPrimary,
                }}
                title="Paste from Clipboard"
              >
                <Icon path={Icons.Paste} className="w-4 h-4" />
              </button>
            </>
          )}

          {image && (
            <>
              {showUploadControls && (
                <button
                  onClick={() => {
                    navigator.clipboard.write([
                      new ClipboardItem({
                        "image/png": fetch(image.imageData).then((r) => r.blob()),
                      }),
                    ]);
                  }}
                  className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
                  style={{
                    backgroundColor: theme.colors.overlay,
                    color: theme.colors.textPrimary,
                  }}
                  title="Copy to Clipboard"
                >
                  <Icon path={Icons.Copy} className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={handleDownload}
                className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
                style={{
                  backgroundColor: theme.colors.overlay,
                  color: theme.colors.textPrimary,
                }}
                title="Download"
              >
                <Icon path={Icons.Download} className="w-4 h-4" />
              </button>

              {onClear && (
                <button
                  onClick={onClear}
                  className="backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
                  style={{
                    backgroundColor: theme.colors.overlay,
                    color: theme.colors.textPrimary,
                  }}
                  title="Clear Image"
                >
                  <Icon path={Icons.X} className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Image Area */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          className="relative rounded-2xl overflow-hidden w-full h-full flex items-center justify-center"
          style={{
            backgroundColor: isDragOver ? theme.colors.dropZone : "transparent",
            boxShadow: theme.colors.panelShadow,
          }}
        >
          {image ? (
            <img
              src={image.imageData}
              alt={label}
              className="max-h-full max-w-full object-contain"
              draggable={!!draggableImageId}
              onDragStart={handleImageDragStart}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center"
              style={{ color: theme.colors.textMuted }}
            >
              {isDropZone && !disabled ? (
                <img
                  src="/assets/image_placeholder.svg"
                  alt="Placeholder"
                  className="w-50 mb-3 mx-auto"
                  style={{ opacity: 0.3 }}
                />
              ) : disabled ? (
                <div className="text-center p-6">
                  <img
                    src="/assets/image_placeholder.svg"
                    alt="Placeholder"
                    className="w-12 h-12 mb-3 mx-auto"
                    style={{ opacity: 0.3 }}
                  />
                  <p className="text-sm font-medium">Panel Disabled</p>
                  <p className="text-xs opacity-50 mt-1">
                    Creating new image from scratch
                  </p>
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-sm font-medium opacity-50">Empty</p>
                </div>
              )}
            </div>
          )}

          {/* Drag Over Overlay */}
          {isDragOver && (
            <div
              className="absolute inset-0 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-2xl"
              style={{
                backgroundColor: theme.colors.dropZone,
                border: `2px dashed ${theme.colors.dropZoneBorder}`,
              }}
            >
              <span
                className="font-bold text-lg drop-shadow-md"
                style={{ color: theme.colors.textPrimary }}
              >
                Drop to set as Source
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
    </div>
  );
};
