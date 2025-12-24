import React from "react";
import { HistoryItem } from "../types";
import { theme } from "../themes";
import { ImageSlot } from "./ImageSlot";

type ReferenceImageSlot = {
  image: HistoryItem | null;
  slotIndex: number;
  canRemove: boolean;
  roleLabel?: string;
  roleKind?: "target" | "reference";
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
  const slotCount = Math.max(1, slots.length);
  const columns = Math.max(1, Math.ceil(Math.sqrt(slotCount)));
  const minSlotWidth = 100;
  const maxSlotWidth = 320;
  const gapPx = 12;
  const preferredWidthPercent = columns
    ? `calc((100% - ${(columns - 1) * gapPx}px) / ${columns})`
    : "100%";
  const slotSize = `clamp(${minSlotWidth}px, ${preferredWidthPercent}, ${maxSlotWidth}px)`;
  const slotAspectRatio = "3 / 4";

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
      </div>

      {/* Slots */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="flex flex-wrap gap-3 h-full"
          style={{ alignContent: "flex-start" }}
        >
          {slots.map((slot) => (
            <div
              key={slot.slotIndex}
              className="flex"
              style={{
                flex: `0 1 ${slotSize}`,
                maxWidth: slotSize,
                minWidth: `${minSlotWidth}px`,
                aspectRatio: slotAspectRatio,
              }}
            >
              <ImageSlot
                image={slot.image}
                disabled={disabled}
                isDropZone={!disabled}
                onDrop={(imageId) => onDrop(imageId, slot.slotIndex)}
                onUpload={(file) => onUpload(file, slot.slotIndex)}
                onRemove={
                  slot.canRemove ? () => onRemove(slot.slotIndex) : undefined
                }
                controls={{
                  upload: true,
                  paste: true,
                  copy: true,
                  download: true,
                  remove: slot.canRemove,
                }}
                variant="tile"
                rolePill={
                  slot.roleLabel
                    ? {
                        label: slot.roleLabel,
                        kind: slot.roleKind,
                        testId: `reference-role-pill-${slot.slotIndex}`,
                      }
                    : undefined
                }
                dropLabel="Drop to add"
                dataTestId={`reference-slot-${slot.slotIndex}`}
                uploadInputTestId={`reference-upload-input-${slot.slotIndex}`}
                actionLabels={{ remove: "Remove reference" }}
                className="w-full h-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
