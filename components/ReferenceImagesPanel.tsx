import React, { useMemo, useRef } from "react";
import { HistoryItem } from "../types";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";

type ReferenceImageSlot = {
  image: HistoryItem | null;
  slotIndex: number;
  canRemove: boolean;
};

interface ReferenceImagesPanelProps {
  label: string;
  slots: ReferenceImageSlot[];
  disabled?: boolean;
  onUpload: (file: File, slotIndex: number) => void;
  onDrop: (imageId: string, slotIndex: number) => void;
  onRemove: (slotIndex: number) => void;
}

export const ReferenceImagesPanel: React.FC<ReferenceImagesPanelProps> = ({
  label,
  slots,
  disabled = false,
  onUpload,
  onDrop,
  onRemove,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firstEmptySlotIndex = useMemo(() => {
    const empty = slots.find((s) => !s.image);
    return empty?.slotIndex ?? 0;
  }, [slots]);

  const handlePaste = async () => {
    if (disabled) return;

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
        onUpload(file, firstEmptySlotIndex);
        return;
      }
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  };

  return (
    <div
      data-testid="reference-panel"
      className="flex flex-col h-full relative group transition-colors duration-200 rounded-3xl border p-4 gap-4"
      style={{
        backgroundColor: theme.colors.surfaceAlt,
        opacity: disabled ? 0.25 : 1,
        pointerEvents: disabled ? "none" : "auto",
        filter: disabled ? "grayscale(1)" : "none",
        borderColor: theme.colors.panelBorder,
        boxShadow: theme.colors.panelShadow,
      }}
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
          <button
            type="button"
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
            data-testid="reference-upload-input"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(file, firstEmptySlotIndex);
                e.currentTarget.value = "";
              }
            }}
          />

          <button
            type="button"
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
        </div>
      </div>

      {/* Slots */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              slots.length <= 1
                ? "1fr"
                : "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {slots.map((slot) => (
            <ReferenceSlot
              key={slot.slotIndex}
              slotIndex={slot.slotIndex}
              image={slot.image}
              disabled={disabled}
              canRemove={slot.canRemove}
              onUpload={(file) => onUpload(file, slot.slotIndex)}
              onDrop={(imageId) => onDrop(imageId, slot.slotIndex)}
              onRemove={() => onRemove(slot.slotIndex)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const ReferenceSlot: React.FC<{
  slotIndex: number;
  image: HistoryItem | null;
  disabled: boolean;
  canRemove: boolean;
  onUpload: (file: File) => void;
  onDrop: (imageId: string) => void;
  onRemove: () => void;
}> = ({
  slotIndex,
  image,
  disabled,
  canRemove,
  onUpload,
  onDrop,
  onRemove,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragDepthRef = React.useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;

    dragDepthRef.current += 1;
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;

    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;

    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;

    dragDepthRef.current = 0;
    setIsDragOver(false);

    const imageId = e.dataTransfer.getData("text/plain");
    if (imageId) onDrop(imageId);
  };

  return (
    <div
      data-testid={`reference-slot-${slotIndex}`}
      className="relative rounded-2xl overflow-hidden border transition-colors"
      style={{
        borderColor: isDragOver
          ? theme.colors.dropZoneBorder
          : theme.colors.panelBorder,
        backgroundColor: isDragOver
          ? theme.colors.dropZone
          : theme.colors.surface,
        boxShadow: theme.colors.panelShadow,
        minHeight: 180,
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {image ? (
        <img
          src={image.imageData}
          alt="Reference"
          className="w-full h-full object-contain"
        />
      ) : (
        <button
          type="button"
          className="w-full h-full flex flex-col items-center justify-center gap-2"
          style={{ color: theme.colors.textMuted }}
          onClick={() => fileInputRef.current?.click()}
        >
          <img
            src="/assets/image_placeholder.svg"
            alt="Placeholder"
            className="w-12 h-12"
            style={{ opacity: 0.3 }}
          />
          <span className="text-xs font-medium opacity-70">Drop or upload</span>
        </button>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUpload(file);
            e.currentTarget.value = "";
          }
        }}
      />

      {image && canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 backdrop-blur-md p-2 rounded-full transition-colors shadow-lg"
          style={{
            backgroundColor: theme.colors.overlay,
            color: theme.colors.textPrimary,
          }}
          aria-label="Remove reference"
          title="Remove reference"
        >
          <Icon path={Icons.X} className="w-4 h-4" />
        </button>
      )}

      {isDragOver && (
        <div
          className="absolute inset-0 backdrop-blur-[1px] flex items-center justify-center z-20"
          style={{
            backgroundColor: theme.colors.dropZone,
            border: `2px dashed ${theme.colors.dropZoneBorder}`,
          }}
        >
          <span
            className="font-bold text-sm drop-shadow-md"
            style={{ color: theme.colors.textPrimary }}
          >
            Drop to add
          </span>
        </div>
      )}
    </div>
  );
};
