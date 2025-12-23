import React from "react";
import { HistoryItem } from "../types";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";

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
  item: HistoryItem;
}

export const ImageInfoPanel: React.FC<ImageInfoPanelProps> = ({ item }) => {
  const tool = TOOLS.find((t) => t.id === item.toolId);

  const rows: Array<{
    label: string;
    value: React.ReactNode | null;
    className?: string;
    style?: React.CSSProperties;
    testId?: string;
  }> = [
    {
      label: "Model",
      value: item.model || null,
      testId: "history-model",
    },
    {
      label: "Duration",
      value:
        item.durationMs > 0
          ? (item.durationMs / 1000).toFixed(2) + "s"
          : null,
    },
    {
      label: "Cost",
      value: tool ? `$${item.cost.toFixed(4)}` : null,
      className: "font-mono",
      style: {
        color: tool ? theme.colors.success : theme.colors.textSecondary,
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
    <div className="inline-flex flex-col space-y-1.5">
      <div style={rowStyle}>
        <span style={{ color: theme.colors.textMuted }}>Tool:</span>
        <span style={{ ...valueStyle }} className="font-medium">
          {tool?.title || "Import"}
        </span>
      </div>
      {rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map((row) => (
          <div style={rowStyle} key={row.label}>
            <span style={{ color: theme.colors.textMuted }}>{row.label}:</span>
            <span
              className={row.className}
              style={{ ...valueStyle, ...row.style }}
              data-testid={row.testId}
            >
              {row.value}
            </span>
          </div>
        ))}

      {Object.keys(item.parameters).length > 0 && (
        <div
          className="mt-2 pt-2 border-t"
          style={{ borderColor: theme.colors.border }}
        >
          <span
            className="block mb-1"
            style={{ color: theme.colors.textMuted }}
          >
            Parameters:
          </span>
          <div
            className="italic text-[10px] break-words"
            style={{ color: theme.colors.textSecondary }}
          >
            {Object.entries(item.parameters).map(([k, v]) => (
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
