import React from "react";
import { HistoryItem } from "../types";
import { theme } from "../themes";
import { ImageSlot, ImageSlotControls, ImageSlotProps } from "./ImageSlot";
import { PanelToolbar } from "./PanelToolbar";

export type ImagePanelSlot = {
  slotIndex: number;
  image: HistoryItem | null;
  canRemove: boolean;
  rolePill?: ImageSlotProps["rolePill"];
  dataTestId?: string;
  uploadInputTestId?: string;
  dropLabel?: string;
  actionLabels?: Partial<Record<keyof ImageSlotControls, string>>;
  controls?: ImageSlotControls;
};

type SingleImagePanelProps = {
  label: string;
  layout?: "single";
  panelTestId?: string;
  image: HistoryItem | null;
  onUpload: (file: File) => void;
  isDropZone?: boolean;
  onDrop?: (imageId: string) => void;
  disabled?: boolean;
  onClear?: () => void;
  showUploadControls?: boolean;
  draggableImageId?: string;
  isLoading?: boolean;
  uploadInputTestId?: string;
};

type GridImagePanelProps = {
  label: string;
  layout: "grid";
  panelTestId?: string;
  slots: ImagePanelSlot[];
  disabled?: boolean;
  onSlotUpload: (file: File, slotIndex: number) => void;
  onSlotDrop: (imageId: string, slotIndex: number) => void;
  onSlotRemove: (slotIndex: number) => void;
};

export type ImagePanelProps = SingleImagePanelProps | GridImagePanelProps;

const isGridPanel = (props: ImagePanelProps): props is GridImagePanelProps => {
  return props.layout === "grid";
};

export const ImagePanel: React.FC<ImagePanelProps> = (props) => {
  if (isGridPanel(props)) {
    const {
      label,
      slots,
      disabled = false,
      onSlotDrop,
      onSlotUpload,
      onSlotRemove,
      panelTestId,
    } = props;

    const containerStyle: React.CSSProperties = {
      backgroundColor: theme.colors.surfaceAlt,
      opacity: disabled ? 0.25 : 1,
      pointerEvents: disabled ? "none" : "auto",
      filter: disabled ? "grayscale(1)" : "none",
      borderColor: theme.colors.panelBorder,
      boxShadow: theme.colors.panelShadow,
    };

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
        data-testid={panelTestId}
        className="flex flex-col h-full relative group transition-colors duration-200 rounded-3xl border p-4 gap-3"
        style={containerStyle}
      >
        <PanelToolbar label={label} />
        <div className="flex-1 min-h-0 overflow-auto">
          <div
            className="flex flex-wrap gap-3 items-start"
            style={{ alignContent: "flex-start" }}
          >
            {slots.map((slot) => {
              const slotControls: ImageSlotControls = slot.controls ?? {
                upload: true,
                paste: true,
                copy: true,
                download: true,
                remove: slot.canRemove,
              };

              return (
                <div
                  key={slot.slotIndex}
                  className="flex"
                  style={{
                    flex: `0 1 ${slotSize}`,
                    maxWidth: slotSize,
                    minWidth: minSlotWidth,
                    aspectRatio: slotAspectRatio,
                  }}
                >
                  <ImageSlot
                    image={slot.image}
                    disabled={disabled}
                    isDropZone={!disabled}
                    onDrop={(imageId) => onSlotDrop(imageId, slot.slotIndex)}
                    onUpload={
                      disabled
                        ? undefined
                        : (file) => onSlotUpload(file, slot.slotIndex)
                    }
                    onRemove={
                      slot.canRemove && !disabled
                        ? () => onSlotRemove(slot.slotIndex)
                        : undefined
                    }
                    controls={slotControls}
                    variant="tile"
                    rolePill={slot.rolePill}
                    className="w-full h-full"
                    dropLabel={slot.dropLabel ?? "Drop to add"}
                    dataTestId={slot.dataTestId}
                    uploadInputTestId={slot.uploadInputTestId}
                    actionLabels={
                      slot.actionLabels ?? {
                        remove: "Remove reference",
                      }
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const {
    image,
    label,
    onUpload,
    isDropZone = false,
    onDrop,
    disabled = false,
    onClear,
    showUploadControls = true,
    draggableImageId,
    isLoading = false,
    uploadInputTestId,
    panelTestId,
  } = props;

  const renderEmptyState = ({
    openFilePicker,
    isDropZone: dropZone,
    disabled: holderDisabled,
  }: {
    openFilePicker: () => void;
    isDropZone: boolean;
    disabled: boolean;
  }) => {
    if (dropZone && !holderDisabled) {
      return (
        <button
          type="button"
          className="flex flex-col items-center justify-center h-full w-full min-h-0"
          style={{ color: theme.colors.textMuted }}
          onClick={showUploadControls ? openFilePicker : undefined}
        >
          <img
            src="/assets/image_placeholder.svg"
            alt="Placeholder"
            className="max-h-[60%] max-w-[220px] w-full h-auto mb-3 mx-auto object-contain"
            style={{ opacity: 0.3 }}
          />
          {/* {showUploadControls && (
            <span className="text-xs font-medium opacity-70">
              Drop, paste, or upload
            </span>
          )} */}
        </button>
      );
    }

    if (holderDisabled) {
      return (
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
      );
    }

    return (
      <div className="text-center p-6">
        <p className="text-sm font-medium opacity-50">Empty</p>
      </div>
    );
  };

  return (
    <ImageSlot
      dataTestId={panelTestId}
      label={label}
      image={image}
      disabled={disabled}
      isDropZone={isDropZone}
      onDrop={onDrop}
      onUpload={showUploadControls ? onUpload : undefined}
      onRemove={onClear}
      draggableImageId={draggableImageId}
      isLoading={isLoading}
      uploadInputTestId={uploadInputTestId}
      dropLabel={isDropZone ? "Drop to set as Source" : ""}
      controls={{
        upload: showUploadControls,
        paste: showUploadControls,
        copy: true,
        download: true,
        remove: !!onClear,
      }}
      renderEmptyState={renderEmptyState}
      actionLabels={
        onClear
          ? {
              remove: "Clear Image",
            }
          : undefined
      }
    />
  );
};
