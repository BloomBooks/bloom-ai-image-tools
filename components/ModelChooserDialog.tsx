import React, { useEffect, useState } from "react";
import { theme } from "../themes";
import type { ModelInfo } from "../types";

interface ModelChooserDialogProps {
  isOpen: boolean;
  models: ModelInfo[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

export const ModelChooserDialog: React.FC<ModelChooserDialogProps> = ({
  isOpen,
  models,
  selectedModelId,
  onSelect,
  onClose,
}) => {
  const [pendingModelId, setPendingModelId] = useState(selectedModelId);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setPendingModelId(selectedModelId);
    }
  }, [isOpen, selectedModelId]);

  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.userAgent || navigator.platform || "");

  const handleConfirm = () => {
    if (!pendingModelId) return;
    onSelect(pendingModelId);
    onClose();
  };

  const actionButtons = (() => {
    const confirmButton = (
      <button
        key="ok"
        onClick={handleConfirm}
        disabled={!pendingModelId}
        className="px-5 py-2 rounded-full text-sm font-semibold transition border"
        style={{
          backgroundColor: theme.colors.accent,
          color: theme.colors.textPrimary,
          borderColor: theme.colors.accent,
          opacity: pendingModelId ? 1 : 0.5,
        }}
      >
        OK
      </button>
    );

    const cancelButton = (
      <button
        key="cancel"
        onClick={onClose}
        className="px-5 py-2 rounded-full text-sm font-semibold transition border"
        style={{
          backgroundColor: theme.colors.surfaceAlt,
          color: theme.colors.textSecondary,
          borderColor: theme.colors.border,
        }}
      >
        Cancel
      </button>
    );

    return isMacPlatform
      ? [cancelButton, confirmButton]
      : [confirmButton, cancelButton];
  })();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: theme.colors.overlayStrong }}
        onClick={onClose}
      ></div>

      <div
        className="relative mx-4"
        style={{
          color: theme.colors.textPrimary,
          width: "min(1100px, 90vw)",
          height: "min(820px, 90vh)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-chooser-title"
      >
        <div
          className="rounded-3xl border overflow-hidden shadow-2xl flex flex-col h-full"
          style={{
            borderColor: theme.colors.border,
            boxShadow: theme.colors.panelShadow,
            background: "linear-gradient(135deg, #0f172a, #111b2f, #132337)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="p-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="model-chooser-title" className="text-2xl font-semibold">
                Choose the AI Engine
              </h2>
            </div>
          </header>

          <div className="px-6 pb-6 flex flex-col gap-4 flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid gap-4 sm:grid-cols-2">
                {models.map((model) => {
                  const isSelected = model.id === pendingModelId;
                  return (
                    <button
                      key={model.id}
                      onClick={() => setPendingModelId(model.id)}
                      className="text-left rounded-2xl p-5 border transition relative"
                      style={{
                        borderColor: isSelected
                          ? theme.colors.accent
                          : theme.colors.border,
                        backgroundColor: isSelected
                          ? "rgba(29, 148, 164, 0.1)"
                          : theme.colors.surface,
                        boxShadow: isSelected
                          ? theme.colors.accentShadow
                          : "none",
                      }}
                    >
                      <div className="flex items-center mb-3 gap-2">
                        {isSelected && (
                          <span
                            className="px-3 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: theme.colors.accent,
                              color: theme.colors.textPrimary,
                            }}
                          >
                            Selected
                          </span>
                        )}
                        {(model.badge || "").trim().length > 0 && (
                          <span
                            className="text-xs font-semibold tracking-[0.3em] uppercase ml-auto"
                            style={{ color: theme.colors.textMuted }}
                          >
                            {model.badge}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-semibold mb-2">
                        {model.name}
                      </h3>
                      <p
                        className="text-sm leading-relaxed mb-4"
                        style={{ color: theme.colors.textSecondary }}
                      >
                        {model.description}
                      </p>
                      <p
                        className="text-sm rounded-xl p-3 border"
                        style={{
                          borderColor: theme.colors.borderMuted,
                          backgroundColor: theme.colors.surfaceAlt,
                          color: theme.colors.textPrimary,
                        }}
                      >
                        {model.pricing}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 flex-wrap flex-shrink-0 pt-2">
              {actionButtons}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
