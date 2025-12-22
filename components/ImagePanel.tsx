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
}

export const ImagePanel: React.FC<ImagePanelProps> = ({
  image,
  label,
  onUpload,
  isDropZone,
  onDrop,
  disabled,
  onClear,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (
          item.types.includes("image/png") ||
          item.types.includes("image/jpeg")
        ) {
          const blob = await item.getType(item.types[0]);
          const file = new File([blob], "pasted.png", { type: blob.type });
          onUpload(file);
          break;
        }
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
    if (isDropZone && !disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropZone && !disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!isDropZone || !onDrop || disabled) return;

    const imageId = e.dataTransfer.getData("text/plain");
    if (imageId) {
      onDrop(imageId);
    }
  };

  return (
    <div
      className="flex flex-col h-full relative group transition-colors duration-200"
      style={{
        backgroundColor: isDragOver ? theme.colors.dropZone : "transparent",
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
        filter: disabled ? "grayscale(1)" : "none",
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10 pointer-events-none">
        <div
          className="backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide pointer-events-auto border shadow-lg"
          style={{
            backgroundColor: theme.colors.overlay,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.border,
          }}
        >
          {label}
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="backdrop-blur-md p-2 rounded-full transition-colors border shadow-lg"
            style={{
              backgroundColor: theme.colors.overlay,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
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
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />

          <button
            onClick={handlePaste}
            className="backdrop-blur-md p-2 rounded-full transition-colors border shadow-lg"
            style={{
              backgroundColor: theme.colors.overlay,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
            }}
            title="Paste from Clipboard"
          >
            <Icon path={Icons.Paste} className="w-4 h-4" />
          </button>

          {image && (
            <>
              <button
                onClick={() => {
                  navigator.clipboard.write([
                    new ClipboardItem({
                      "image/png": fetch(image.imageData).then((r) => r.blob()),
                    }),
                  ]);
                }}
                className="backdrop-blur-md p-2 rounded-full transition-colors border shadow-lg"
                style={{
                  backgroundColor: theme.colors.overlay,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.border,
                }}
                title="Copy to Clipboard"
              >
                <Icon path={Icons.Copy} className="w-4 h-4" />
              </button>

              <button
                onClick={handleDownload}
                className="backdrop-blur-md p-2 rounded-full transition-colors border shadow-lg"
                style={{
                  backgroundColor: theme.colors.overlay,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.border,
                }}
                title="Download"
              >
                <Icon path={Icons.Download} className="w-4 h-4" />
              </button>

              {onClear && (
                <button
                  onClick={onClear}
                  className="backdrop-blur-md p-2 rounded-full transition-colors border shadow-lg ml-2"
                  style={{
                    backgroundColor: theme.colors.danger,
                    color: theme.colors.textPrimary,
                    borderColor: theme.colors.border,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      theme.colors.dangerHover)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      theme.colors.danger)
                  }
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
      <div className="flex-1 p-4 flex items-center justify-center min-h-0">
        <div
          className="relative rounded-lg overflow-hidden shadow-2xl w-full h-full flex items-center justify-center"
          style={{
            border: isDragOver
              ? `2px dashed ${theme.colors.dropZoneBorder}`
              : `1px solid ${theme.colors.border}`,
            backgroundColor: isDragOver
              ? theme.colors.dropZone
              : theme.colors.surfaceAlt,
            boxShadow: theme.colors.panelShadow,
          }}
        >
          {image ? (
            <img
              src={image.imageData}
              alt={label}
              className="max-h-full max-w-full object-contain"
              style={{ backgroundColor: theme.colors.surface }}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center"
              style={{ color: theme.colors.textMuted }}
            >
              {isDropZone && !disabled ? (
                <>
                  <Icon
                    path={Icons.Layout}
                    className="w-12 h-12 mb-3 opacity-30"
                  />
                  <p className="text-sm font-medium">
                    Drag history here to edit
                  </p>
                  <p className="text-xs opacity-50 mt-1">or paste/upload</p>
                </>
              ) : disabled ? (
                <div className="text-center p-6">
                  <Icon
                    path={Icons.History}
                    className="w-12 h-12 mb-3 opacity-30 mx-auto"
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
              className="absolute inset-0 backdrop-blur-[1px] flex items-center justify-center z-20"
              style={{ backgroundColor: theme.colors.dropZone }}
            >
              <span
                className="font-bold text-lg drop-shadow-md"
                style={{ color: theme.colors.textPrimary }}
              >
                Drop to set as Source
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
