import React from "react";
import { ImageRecord } from "../types";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";
import { getArtStyleById, isClearArtStyleId } from "../lib/artStyles";

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "max-content auto",
  columnGap: "0.5rem",
  alignItems: "center",
};

const valueStyle: React.CSSProperties = {
  color: theme.colors.textSecondary,
  textAlign: "right",
  justifySelf: "end",
  display: "block",
  minWidth: "4.5rem",
};

interface ImageInfoPanelProps {
  item: ImageRecord;
}

const resolveStyleSummary = (item: ImageRecord): string | null => {
  const paramStyleId = item.parameters?.styleId;
  const candidates = [item.sourceStyleId, paramStyleId];
  const styleId = candidates.find(
    (value): value is string => Boolean(value) && !isClearArtStyleId(value)
  );
  if (!styleId) {
    return null;
  }
  const style = getArtStyleById(styleId);
  if (!style) {
    return styleId;
  }
  return `${style.name} (${styleId})`;
};

export const ImageInfoPanel: React.FC<ImageInfoPanelProps> = ({ item }) => {
  const tool = TOOLS.find((t) => t.id === item.toolId);
  const promptContent =
    item.promptUsed && item.promptUsed.length
      ? item.promptUsed
      : "Prompt unavailable.";
  // Only show parameters that are recognized by the current tool definition.
  // This filters out legacy/stale parameters from older versions.
  const toolParamNames = new Set(
    tool?.parameters.map((p) => p.name) ?? Object.keys(item.parameters)
  );
  const redundantParameterKeys = new Set(["prompt"]);
  const displayedParameters = Object.entries(item.parameters).filter(
    ([key, value]) => {
      if (!toolParamNames.has(key)) {
        return false; // Filter out unknown/legacy parameters
      }
      if (redundantParameterKeys.has(key)) {
        return false;
      }
      return typeof value === "string" && value.trim().length > 0;
    }
  );

  const rows: Array<{
    label: string;
    value: React.ReactNode | null;
    style?: React.CSSProperties;
    testId?: string;
  }> = [
    {
      label: "Model",
      value: item.model || null,
      testId: "history-model",
    },
    {
      label: "Art Style",
      value: resolveStyleSummary(item),
      testId: "history-art-style",
    },
    {
      label: "Duration",
      value:
        item.durationMs > 0 ? (item.durationMs / 1000).toFixed(2) + "s" : null,
    },
    {
      label: "Cost",
      value: tool ? `$${item.cost.toFixed(4)}` : null,
      style: {
        color: tool ? theme.colors.success : theme.colors.textSecondary,
        fontFamily: '"Roboto Mono", "SFMono-Regular", monospace',
      },
      testId: "history-cost",
    },
    {
      label: "Resolution",
      value: item.resolution
        ? `${item.resolution.width} x ${item.resolution.height}`
        : null,
    },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div style={rowStyle}>
        <span style={{ color: theme.colors.textMuted }}>Tool:</span>
        <span
          style={{
            ...valueStyle,
            fontWeight: 600,
          }}
        >
          {tool?.title || "Import"}
        </span>
      </div>
      {rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map((row) => (
          <div style={rowStyle} key={row.label}>
            <span style={{ color: theme.colors.textMuted }}>{row.label}:</span>
            <span
              style={{ ...valueStyle, ...row.style }}
              data-testid={row.testId}
            >
              {row.value}
            </span>
          </div>
        ))}

      {item.sourceSummary && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <span
            style={{
              display: "block",
              marginBottom: 4,
              color: theme.colors.textMuted,
            }}
          >
            Sources:
          </span>
          <div style={{ color: theme.colors.textSecondary, fontSize: "11px" }}>
            {item.sourceSummary}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${theme.colors.border}`,
        }}
      >
        <span
          style={{
            display: "block",
            marginBottom: 4,
            color: theme.colors.textMuted,
          }}
        >
          Full Prompt:
        </span>
        <div
          style={{
            color: theme.colors.textPrimary,
            fontSize: "11px",
            whiteSpace: "pre-wrap",
            lineHeight: 1.4,
          }}
        >
          {promptContent}
        </div>
      </div>

      {displayedParameters.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <span
            style={{
              display: "block",
              marginBottom: 4,
              color: theme.colors.textMuted,
            }}
          >
            Parameters:
          </span>
          <div style={{ color: theme.colors.textSecondary }}>
            {displayedParameters.map(([k, v]) => (
              <div key={k}>
                {k}: {v}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
