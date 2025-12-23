import React, { useMemo, useState } from "react";
import type { ArtStyle } from "../types";
import { theme } from "../themes";
import { ArtStyleChooserDialog } from "./ArtStyleChooserDialog";

interface ArtStylePickerProps {
  styles: ArtStyle[];
  value?: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
  allowClear?: boolean;
  "data-testid"?: string;
}

export const ArtStylePicker: React.FC<ArtStylePickerProps> = ({
  styles,
  value,
  onChange,
  disabled = false,
  allowClear = true,
  "data-testid": dataTestId,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const selected = useMemo(
    () => styles.find((style) => style.id === value) || null,
    [styles, value]
  );

  const handleOpen = () => {
    if (disabled) return;
    setIsDialogOpen(true);
  };

  const handleClose = () => setIsDialogOpen(false);

  const handleSelect = (styleId: string) => {
    onChange(styleId);
  };

  const handleClear = () => {
    if (!allowClear || disabled) return;
    onChange("");
  };

  const preview = selected?.previewUrl;
  const supportingText = selected?.description || selected?.promptDetail;

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex-1 rounded-2xl border p-3 flex items-center gap-3 text-left"
          onClick={handleOpen}
          disabled={disabled}
          data-testid={dataTestId}
          style={{
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <div
            className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border"
            style={{ borderColor: theme.colors.borderMuted }}
          >
            {preview ? (
              <img
                src={preview}
                alt={selected ? `${selected.name} preview` : "Art style preview"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-[11px] px-1 text-center"
                style={{ color: theme.colors.textSecondary }}
              >
                No preview
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: theme.colors.textMuted }}>
              Art Direction
            </p>
            <p className="font-semibold" style={{ color: theme.colors.textPrimary }}>
              {selected ? selected.name : "Choose an art style"}
            </p>
            <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
              {supportingText || "Set the vibe for this image."}
            </p>
          </div>
          <span className="text-xs font-semibold" style={{ color: theme.colors.accent }}>
            Browse
          </span>
        </button>
        {allowClear && value && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="px-3 py-2 rounded-xl text-xs font-semibold border"
            style={{
              borderColor: theme.colors.border,
              color: theme.colors.textSecondary,
              opacity: disabled ? 0.4 : 1,
            }}
          >
            Clear
          </button>
        )}
      </div>
      <ArtStyleChooserDialog
        isOpen={isDialogOpen}
        styles={styles}
        selectedId={value}
        onSelect={handleSelect}
        onClose={handleClose}
      />
    </>
  );
};
