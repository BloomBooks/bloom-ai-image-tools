import React from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import imagePlaceholder from "../assets/image_placeholder.svg";
import { GenerationProgressState, ImageRecord } from "../types";
import { theme } from "../themes";
import { ImageSlot, ImageSlotControls, ImageSlotProps } from "./ImageSlot";
import { ImageSlotHeader } from "./ImageSlotHeader";

const editImagePulse = keyframes`
  0%, 100% { background-color: transparent; }
  50% { background-color: color-mix(in srgb, ${theme.colors.focus} 10%, transparent); }
`;

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
  dndDropId?: string;
  dndDragId?: string;
};

type SingleImagePanelProps = {
  label: string;
  layout?: "single";
  panelTestId?: string;
  image: ImageRecord | null;
  isAnyDndDragging?: boolean;
  onUpload: (file: File) => void;
  isDropZone?: boolean;
  onDrop?: (imageId: string) => void;
  disabled?: boolean;
  onClear?: () => void;
  showUploadControls?: boolean;
  showCopyButton?: boolean;
  showDownloadButton?: boolean;
  draggableImageId?: string;
  isLoading?: boolean;
  loadingProgress?: GenerationProgressState | null;
  uploadInputTestId?: string;
  onToggleStar?: () => void;
  dndDropId?: string;
  dndDragId?: string;
  needsImage?: boolean;
};

type GridImagePanelProps = {
  label: string;
  layout: "grid";
  panelTestId?: string;
  slots: ImagePanelSlot[];
  isAnyDndDragging?: boolean;
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
      isAnyDndDragging = false,
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
              const isSlotDropZone = !disabled && Boolean(slot.dndDropId || slotControls.upload);

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
                  <DndImageSlotWrapper
                    droppableId={slot.dndDropId}
                    draggableId={slot.image ? slot.dndDragId : undefined}
                    draggableImageId={slot.image?.id}
                    disabled={disabled}
                  >
                    <ImageSlot
                      image={slot.image}
                      isAnyDndDragging={isAnyDndDragging}
                      disabled={disabled}
                      isDropZone={isSlotDropZone}
                      onDrop={(imageId) => onSlotDrop(imageId, slot.slotIndex)}
                      onUpload={
                        disabled || !slotControls.upload
                          ? undefined
                          : (file) => onSlotUpload(file, slot.slotIndex)
                      }
                      onRemove={
                        slot.canRemove && !disabled ? () => onSlotRemove(slot.slotIndex) : undefined
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
                      // dnd-kit handles internal drags; keep native drag only when explicit.
                      draggableImageId={undefined}
                    />
                  </DndImageSlotWrapper>
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
    showCopyButton = true,
    showDownloadButton = true,
    draggableImageId,
    isLoading = false,
    loadingProgress = null,
    uploadInputTestId,
    panelTestId,
    onToggleStar,
    dndDropId,
    dndDragId,
    isAnyDndDragging = false,
    needsImage = false,
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
            borderRadius: "24px",
            ...(needsImage && {
              animation: `${editImagePulse} 2.8s ease-in-out infinite`,
            }),
          }}
        >
          <Box
            component="img"
            src={imagePlaceholder}
            alt="Placeholder"
            sx={{
              maxHeight: "60%",
              maxWidth: "220px",
              width: "100%",
              height: "auto",
              mb: needsImage ? 1.5 : 3,
              mx: "auto",
              objectFit: "contain",
              opacity: 0.3,
            }}
          />
          {needsImage && (
            <Box
              component="p"
              sx={{
                m: 0,
                fontSize: "0.8rem",
                opacity: 0.8,
                fontWeight: 500,
                textAlign: "center",
                px: 2,
                color: theme.colors.textMuted,
                pointerEvents: "none",
              }}
            >
              Drop or paste an image to edit
            </Box>
          )}
        </Box>
      );
    }

    if (holderDisabled) {
      return (
        <Box sx={{ textAlign: "center", p: 3 }}>
          <Box
            component="img"
            src={imagePlaceholder}
            alt="Placeholder"
            sx={{ width: 48, height: 48, mb: 1.5, mx: "auto", opacity: 0.3 }}
          />
          <Box component="p" sx={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Panel Disabled
          </Box>
          <Box component="p" sx={{ fontSize: "0.75rem", opacity: 0.7, mt: 0.5 }}>
            Creating new image from scratch
          </Box>
        </Box>
      );
    }

    return (
      <Box sx={{ textAlign: "center", p: 3 }}>
        <Box component="p" sx={{ fontSize: "0.85rem", opacity: 0.6, fontWeight: 600 }}>
          Empty
        </Box>
      </Box>
    );
  };

  return (
    <DndImageSlotWrapper
      droppableId={dndDropId}
      draggableId={image ? dndDragId : undefined}
      draggableImageId={draggableImageId}
      disabled={disabled}
    >
      <ImageSlot
        dataTestId={panelTestId}
        label={label}
        image={image}
        isAnyDndDragging={isAnyDndDragging}
        disabled={disabled}
        isDropZone={isDropZone}
        onDrop={onDrop}
        onUpload={showUploadControls ? onUpload : undefined}
        onRemove={onClear}
        isLoading={isLoading}
        loadingProgress={loadingProgress}
        uploadInputTestId={uploadInputTestId}
        dropLabel={isDropZone ? "Drop to set as Source" : ""}
        controls={{
          upload: showUploadControls,
          paste: showUploadControls,
          copy: showCopyButton,
          download: showDownloadButton,
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
        // Keep pane-to-pane dragging on the dnd-kit wrapper only.
        // Native image dragging here competes with pointer-based activation.
        draggableImageId={undefined}
      />
    </DndImageSlotWrapper>
  );
};

const DndImageSlotWrapper: React.FC<{
  droppableId?: string;
  draggableId?: string;
  draggableImageId?: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ droppableId, draggableId, draggableImageId, disabled, children }) => {
  const droppable = useDroppable({
    id: droppableId || "__drop_disabled__",
    disabled: !droppableId || !!disabled,
  });
  const draggable = useDraggable({
    id: draggableId || "__drag_disabled__",
    disabled: !draggableId || !!disabled,
    data: draggableImageId
      ? {
          kind: "image",
          imageId: draggableImageId,
        }
      : undefined,
  });

  const setRef = (node: HTMLElement | null) => {
    droppable.setNodeRef(node);
    draggable.setNodeRef(node);
  };

  return (
    <div
      ref={setRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) {
          event.stopPropagation();
        }
      }}
      style={{
        height: "100%",
        width: "100%",
        // Subtle feedback only; avoid borders over images.
        boxShadow: droppable.isOver ? theme.colors.accentShadow : undefined,
      }}
    >
      {children}
    </div>
  );
};
