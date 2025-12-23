import React from "react";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";
import type { CapabilityName, ModelInfo, ToolCapabilities } from "../types";

interface CapabilityPanelProps {
  capabilities?: ToolCapabilities;
  selectedModel: ModelInfo | null;
}

export const CapabilityPanel: React.FC<CapabilityPanelProps> = ({
  capabilities,
  selectedModel,
}) => {
  if (!capabilities || !Object.values(capabilities).some(Boolean)) return null;

  const formatCapabilityLabel = (name: CapabilityName) =>
    name
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const getModelCapabilityScore = (capability: CapabilityName) => {
    const raw = selectedModel?.capabilities?.[capability];
    if (typeof raw !== "number" || Number.isNaN(raw)) return 0;
    const rounded = Math.round(raw);
    return Math.max(0, Math.min(5, rounded));
  };

  const shownCapabilities = Object.entries(capabilities).filter(
    ([, uses]) => !!uses
  );

  const anyWarning = shownCapabilities.some(
    ([capability]) => getModelCapabilityScore(capability as CapabilityName) < 3
  );

  return (
    <div
      className="mb-3 rounded-lg border p-3"
      style={{
        backgroundColor: theme.colors.surfaceAlt,
        borderColor: anyWarning
          ? theme.colors.danger
          : theme.colors.borderMuted,
      }}
    >
      <div
        className="text-xs font-semibold mb-2 tracking-wider"
        style={{ color: theme.colors.textSecondary }}
      >
        {selectedModel?.name?.trim() ? selectedModel.name : "No model selected"}
      </div>

      <div className="flex flex-wrap gap-2">
        {shownCapabilities.map(([capability]) => {
          const score = getModelCapabilityScore(capability as CapabilityName);
          const showWarning = score < 3;

          return (
            <div
              key={capability}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: showWarning
                  ? theme.colors.danger
                  : theme.colors.borderMuted,
                color: theme.colors.textPrimary,
              }}
              title={
                showWarning ? "This model may struggle with this tool" : ""
              }
            >
              {showWarning && (
                <Icon
                  path={Icons.AlertTriangle}
                  className="w-3.5 h-3.5"
                  style={{ color: theme.colors.danger }}
                />
              )}

              <span style={{ color: theme.colors.textMuted }}>
                {formatCapabilityLabel(capability as CapabilityName)}
              </span>
              <span className="font-semibold">{score}/5</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
