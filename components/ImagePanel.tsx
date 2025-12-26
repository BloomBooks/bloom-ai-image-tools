import React from "react";
import { Box } from "@mui/material";
import { ImageRecord } from "../types";
import { theme } from "../themes";
import { ImageSlot, ImageSlotControls, ImageSlotProps } from "./ImageSlot";
import { ImageSlotHeader } from "./ImageSlotHeader";

export type ImagePanelSlot = {
  slotIndex: number;
  image: ImageRecord | null;
  canRemove: boolean;
  rolePill?: ImageSlotProps["rolePill"];
  dataTestId?: string;
  uploadInputTestId?: string;
  dropLabel?: string;
  actionLabels?: Partial<Record<keyof ImageSlotControls, string>>;
  controls?: ImageSlotControls;
  draggableImageId?: string;
};

type SingleImagePanelProps = {
  label: string;
  layout?: "single";
  panelTestId?: string;
  image: ImageRecord | null;
  onUpload: (file: File) => void;
  isDropZone?: boolean;
  onDrop?: (imageId: string) => void;
  disabled?: boolean;
  onClear?: () => void;
  showUploadControls?: boolean;
  draggableImageId?: string;
  isLoading?: boolean;
  uploadInputTestId?: string;
  onToggleStar?: () => void;
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
      backgroundColor: "transparent",
      opacity: disabled ? 0.25 : 1,
      pointerEvents: disabled ? "none" : "auto",
      filter: disabled ? "grayscale(1)" : "none",
      borderColor: theme.colors.panelBorder,
      boxShadow: theme.colors.panelShadow,
    };

    const gapPx = 16;
    const slotCount = Math.max(1, slots.length);
    const columns = Math.max(1, Math.ceil(Math.sqrt(slotCount)));
    const minSlotWidth = 140;
    const maxSlotWidth = 180;
    const preferredWidthPercent = columns
      ? `calc((100% - ${(columns - 1) * gapPx}px) / ${columns})`
      : "100%";
    const slotWidth = `clamp(${minSlotWidth}px, ${preferredWidthPercent}, ${maxSlotWidth}px)`;
    const slotAspectRatio = "1 / 1";

    return (
      <Box
        data-testid={panelTestId}
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          position: "relative",
          borderRadius: "24px",
          border: `1px solid ${theme.colors.panelBorder}`,
          p: 4,
          gap: "10px",
          transition: "color 150ms ease",
          padding: "20px",
          paddingTop: "5px",
          ...containerStyle,
        }}
      >
        <ImageSlotHeader label={label} />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: `${gapPx}px`,
              alignContent: "flex-start",
            }}
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
                <Box
                  key={slot.slotIndex}
                  sx={{
                    display: "flex",
                    flex: "0 1 auto",
                    flexBasis: slotWidth,
                    width: slotWidth,
                    maxWidth: slotWidth,
                    minWidth: `${minSlotWidth}px`,
                    aspectRatio: slotAspectRatio,
                    flexDirection: "column",
                    minHeight: 0,
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
                    dropLabel={slot.dropLabel ?? "Drop to add"}
                    dataTestId={slot.dataTestId}
                    uploadInputTestId={slot.uploadInputTestId}
                    actionLabels={
                      slot.actionLabels ?? {
                        remove: "Remove reference",
                      }
                    }
                    draggableImageId={slot.draggableImageId}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
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
    onToggleStar,
  } = props;

  const starState =
    image && onToggleStar
      ? { isStarred: Boolean(image.isStarred), onToggle: onToggleStar }
      : undefined;

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
        <Box
          component="button"
          type="button"
          onClick={showUploadControls ? openFilePicker : undefined}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
            minHeight: 0,
            color: theme.colors.textMuted,
            background: "none",
            border: "none",
            cursor: showUploadControls ? "pointer" : "default",
          }}
        >
          <Box
            component="img"
            src="/assets/image_placeholder.svg"
            alt="Placeholder"
            sx={{
              maxHeight: "60%",
              maxWidth: "220px",
              width: "100%",
              height: "auto",
              mb: 3,
              mx: "auto",
              objectFit: "contain",
              opacity: 0.3,
            }}
          />
        </Box>
      );
    }

    if (holderDisabled) {
      return (
        <Box sx={{ textAlign: "center", p: 3 }}>
          <Box
            component="img"
            src="/assets/image_placeholder.svg"
            alt="Placeholder"
            sx={{ width: 48, height: 48, mb: 1.5, mx: "auto", opacity: 0.3 }}
          />
          <Box component="p" sx={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Panel Disabled
          </Box>
          <Box
            component="p"
            sx={{ fontSize: "0.75rem", opacity: 0.7, mt: 0.5 }}
          >
            Creating new image from scratch
          </Box>
        </Box>
      );
    }

    return (
      <Box sx={{ textAlign: "center", p: 3 }}>
        <Box
          component="p"
          sx={{ fontSize: "0.85rem", opacity: 0.6, fontWeight: 600 }}
        >
          Empty
        </Box>
      </Box>
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
      starState={starState}
    />
  );
};
