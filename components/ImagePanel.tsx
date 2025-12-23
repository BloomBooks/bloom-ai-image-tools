import React from "react";
import { HistoryItem } from "../types";
import { theme } from "../themes";
import { ImageHolder } from "./ImageHolder";

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
  uploadInputTestId?: string;
}

export const ImagePanel: React.FC<ImagePanelProps> = ({
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
}) => {
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
          className="flex flex-col items-center justify-center"
          style={{ color: theme.colors.textMuted }}
          onClick={showUploadControls ? openFilePicker : undefined}
        >
          <img
            src="/assets/image_placeholder.svg"
            alt="Placeholder"
            className="w-50 mb-3 mx-auto"
            style={{ opacity: 0.3 }}
          />
          {showUploadControls && (
            <span className="text-xs font-medium opacity-70">
              Drop, paste, or upload
            </span>
          )}
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
          <p className="text-xs opacity-50 mt-1">Creating new image from scratch</p>
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
    <ImageHolder
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
        copy: showUploadControls,
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
