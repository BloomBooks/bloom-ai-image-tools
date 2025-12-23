import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import type { ArtStyle } from "../../types";
import { theme } from "../../themes";
import { CLEAR_ART_STYLE_ID } from "../../lib/artStyles";

interface ArtStyleChooserDialogProps {
  isOpen: boolean;
  styles: ArtStyle[];
  selectedId?: string;
  onSelect: (styleId: string) => void;
  onClose: () => void;
}

export const ArtStyleChooserDialog: React.FC<ArtStyleChooserDialogProps> = ({
  isOpen,
  styles,
  selectedId,
  onSelect,
  onClose,
}) => {
  const displayStyles = useMemo(() => {
    if (!styles.length) return styles;
    const noneStyle = styles.find((style) => style.id === CLEAR_ART_STYLE_ID);
    if (!noneStyle) return styles;
    const rest = styles.filter((style) => style.id !== CLEAR_ART_STYLE_ID);
    return [noneStyle, ...rest];
  }, [styles]);

  const hasNoneOption = displayStyles.some(
    (style) => style.id === CLEAR_ART_STYLE_ID
  );
  const normalizedSelectedId = selectedId?.length
    ? selectedId
    : hasNoneOption
    ? CLEAR_ART_STYLE_ID
    : undefined;

  if (!isOpen) return null;

  const handleSelect = (styleId: string) => {
    onSelect(styleId);
    onClose();
  };

  const dialogContent = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: theme.colors.overlayStrong }}
        onClick={onClose}
      ></div>
      <div
        className="relative mx-4"
        style={{
          width: "min(1000px, 92vw)",
          height: "min(820px, 92vh)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="art-style-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex flex-col h-full rounded-3xl border shadow-2xl overflow-hidden"
          style={{
            borderColor: theme.colors.border,
            background: "linear-gradient(135deg, #0e1729, #111c31)",
            boxShadow: theme.colors.panelShadow,
          }}
        >
          <header
            className="p-6 border-b"
            style={{ borderColor: theme.colors.border }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p
                  className="text-sm uppercase tracking-[0.3em]"
                  style={{ color: theme.colors.textMuted }}
                >
                  Style
                </p>
                <h2
                  id="art-style-dialog-title"
                  className="text-2xl font-semibold mt-2"
                >
                  Choose an Art Style
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm font-semibold"
                style={{
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.textSecondary,
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                Close
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {displayStyles.map((style) => {
                const isSelected = normalizedSelectedId
                  ? style.id === normalizedSelectedId
                  : false;
                return (
                  <button
                    key={style.id}
                    onClick={() => handleSelect(style.id)}
                    className="flex flex-col rounded-2xl border text-left overflow-hidden transition focus:outline-none"
                    style={{
                      borderColor: isSelected
                        ? theme.colors.accent
                        : theme.colors.border,
                      backgroundColor: isSelected
                        ? "rgba(29, 148, 164, 0.16)"
                        : theme.colors.surfaceAlt,
                      boxShadow: isSelected
                        ? theme.colors.accentShadow
                        : "none",
                    }}
                  >
                    <div
                      className="relative w-full"
                      style={{ paddingBottom: "65%" }}
                    >
                      {style.previewUrl ? (
                        <img
                          src={style.previewUrl}
                          alt={`${style.name} preview`}
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="absolute inset-0 flex items-center justify-center text-xs"
                          style={{ color: theme.colors.textSecondary }}
                        >
                          No preview
                        </div>
                      )}
                      <div
                        className="absolute inset-0"
                        style={{
                          boxShadow: isSelected
                            ? `inset 0 0 0 2px ${theme.colors.accent}`
                            : "none",
                        }}
                      ></div>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold flex-1">
                          {style.name}
                        </h3>
                        {isSelected && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: theme.colors.accent,
                              color: theme.colors.textPrimary,
                            }}
                          >
                            Selected
                          </span>
                        )}
                      </div>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: theme.colors.textSecondary }}
                      >
                        {style.description || style.promptDetail}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialogContent;
  }

  return createPortal(dialogContent, document.body);
};
