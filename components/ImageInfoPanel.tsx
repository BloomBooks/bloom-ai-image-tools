import React from "react";
import { Button, IconButton, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ImageRecord } from "../types";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";
import { getArtStyleById, isClearArtStyleId } from "../lib/artStyles";
import { copyTextToClipboard } from "../lib/textClipboard";
import { formatMimeLabel } from "../lib/imageUtils";
import { formatCost } from "../lib/formatters";
import { L10nFunc, useL10n } from "../lib/localization";
import { toolTitle } from "./tools/toolStrings";

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

const formatReasoningLevel = (
  l10n: L10nFunc,
  value: ImageRecord["reasoningLevel"],
): string | null => {
  switch (value) {
    case "default":
      return l10n("Common.Default", "Default");
    case "none":
      return l10n("AiImageEditor.Reasoning.None", "None");
    case "low":
      return l10n("AiImageEditor.Reasoning.Low", "Low");
    case "medium":
      return l10n("AiImageEditor.Reasoning.Medium", "Medium");
    case "high":
      return l10n("AiImageEditor.Reasoning.High", "High");
    default:
      return null;
  }
};

const resolveStyleSummary = (item: ImageRecord): string | null => {
  const paramStyleId = item.parameters?.styleId;
  const candidates = [item.sourceStyleId, paramStyleId];
  const styleId = candidates.find(
    (value): value is string => Boolean(value) && !isClearArtStyleId(value),
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

// Prompts longer than this are collapsed by default so the info panel doesn't
// grow taller than the viewport and run off the screen.
const PROMPT_COLLAPSE_THRESHOLD = 280;

export const ImageInfoPanel: React.FC<ImageInfoPanelProps> = ({ item }) => {
  const l10n = useL10n();
  const tool = TOOLS.find((t) => t.id === item.toolId);
  const promptContent =
    item.promptUsed && item.promptUsed.length
      ? item.promptUsed
      : l10n("AiImageEditor.Info.PromptUnavailable", "Prompt unavailable.");
  const isPromptLong = promptContent.length > PROMPT_COLLAPSE_THRESHOLD;

  const [promptCopied, setPromptCopied] = React.useState(false);
  const [promptExpanded, setPromptExpanded] = React.useState(false);
  const copyResetTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyPrompt = async () => {
    const ok = await copyTextToClipboard(promptContent);
    if (!ok) {
      console.warn("Failed to copy prompt");
      return;
    }

    setPromptCopied(true);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setPromptCopied(false);
      copyResetTimeoutRef.current = null;
    }, 1500);
  };
  // Only show parameters that are recognized by the current tool definition.
  // This filters out legacy/stale parameters from older versions.
  const toolParamNames = new Set(
    tool?.parameters.map((p) => p.name) ?? Object.keys(item.parameters),
  );
  const redundantParameterKeys = new Set(["prompt"]);
  const displayedParameters = Object.entries(item.parameters).filter(([key, value]) => {
    if (!toolParamNames.has(key)) {
      return false; // Filter out unknown/legacy parameters
    }
    if (redundantParameterKeys.has(key)) {
      return false;
    }
    return typeof value === "string" && value.trim().length > 0;
  });

  const rows: Array<{
    label: string;
    value: React.ReactNode | null;
    style?: React.CSSProperties;
    testId?: string;
  }> = [
    {
      label: l10n("AiImageEditor.Info.Model", "Model"),
      value: item.model || null,
      testId: "history-model",
    },
    {
      label: l10n("AiImageEditor.Info.Reasoning", "Reasoning"),
      value: formatReasoningLevel(l10n, item.reasoningLevel),
      testId: "history-reasoning",
    },
    {
      label: l10n("AiImageEditor.Info.ArtStyle", "Art Style"),
      value: resolveStyleSummary(item),
      testId: "history-art-style",
    },
    {
      label: l10n("AiImageEditor.Info.Duration", "Duration"),
      value: item.durationMs > 0 ? (item.durationMs / 1000).toFixed(2) + "s" : null,
    },
    {
      label: l10n("AiImageEditor.Info.Cost", "Cost"),
      value: tool ? formatCost(item.cost) : null,
      style: {
        color: tool ? theme.colors.success : theme.colors.textSecondary,
        fontFamily: '"Roboto Mono", "SFMono-Regular", monospace',
      },
      testId: "history-cost",
    },
    {
      label: l10n("AiImageEditor.Info.Resolution", "Resolution"),
      value: item.resolution ? `${item.resolution.width} x ${item.resolution.height}` : null,
      testId: "history-resolution",
    },
    {
      label: l10n("AiImageEditor.Info.Format", "Format"),
      value: formatMimeLabel(item.sourceMime),
      testId: "history-format",
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
      {item.caption && item.caption.trim().length > 0 && (
        <div
          style={{
            marginBottom: 8,
            paddingBottom: 8,
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <span
            style={{
              display: "block",
              marginBottom: 4,
              color: theme.colors.textMuted,
            }}
          >
            {l10n("AiImageEditor.Info.AssociatedText", "Associated text:")}
          </span>
          <div
            data-testid="image-caption"
            style={{
              color: theme.colors.textPrimary,
              fontSize: "12px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.4,
            }}
          >
            {item.caption}
          </div>
        </div>
      )}

      <div style={rowStyle}>
        <span style={{ color: theme.colors.textMuted }}>
          {l10n("AiImageEditor.Info.Tool", "Tool:")}
        </span>
        <span
          style={{
            ...valueStyle,
            fontWeight: 600,
          }}
        >
          {tool ? toolTitle(l10n, tool) : l10n("AiImageEditor.Info.Import", "Import")}
        </span>
      </div>
      {rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map((row) => (
          <div style={rowStyle} key={row.label}>
            <span style={{ color: theme.colors.textMuted }}>{row.label}:</span>
            <span style={{ ...valueStyle, ...row.style }} data-testid={row.testId}>
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
            {l10n("AiImageEditor.Info.Sources", "Sources:")}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 4,
            color: theme.colors.textMuted,
          }}
        >
          <span style={{ display: "block" }}>
            {l10n("AiImageEditor.Info.FullPrompt", "Full Prompt:")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {isPromptLong && (
              <Button
                variant="text"
                onClick={() => setPromptExpanded((prev) => !prev)}
                data-testid="toggle-full-prompt"
                aria-expanded={promptExpanded}
                sx={{
                  minWidth: 0,
                  padding: 0,
                  color: theme.colors.textSecondary,
                  fontSize: "11px",
                  fontWeight: 400,
                  textDecoration: "underline",
                }}
              >
                {promptExpanded
                  ? l10n("AiImageEditor.Info.ShowLess", "Show less")
                  : l10n("AiImageEditor.Info.ShowMore", "Show more")}
              </Button>
            )}
            <Tooltip
              title={
                promptCopied
                  ? l10n("AiImageEditor.InfoDialog.Copied", "Copied")
                  : l10n("AiImageEditor.InfoDialog.CopyPrompt", "Copy prompt")
              }
            >
              <IconButton
                aria-label={l10n("AiImageEditor.InfoDialog.CopyFullPrompt", "Copy full prompt")}
                onClick={handleCopyPrompt}
                size="small"
                data-testid="copy-full-prompt"
                sx={{ color: theme.colors.textMuted }}
              >
                <ContentCopyIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </div>
        </div>
        <div
          style={{
            color: theme.colors.textPrimary,
            fontSize: "11px",
            whiteSpace: "pre-wrap",
            lineHeight: 1.4,
            ...(isPromptLong && !promptExpanded
              ? {
                  maxHeight: "7.5em",
                  overflow: "hidden",
                  maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                }
              : {}),
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
            {l10n("AiImageEditor.Info.Parameters", "Parameters:")}
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
