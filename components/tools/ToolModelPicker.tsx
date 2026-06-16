import React, { useState } from "react";
import {
  Box,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import type { MeasuredStats, ModelReasoningLevel, ToolDefinition } from "../../types";
import {
  getMeasuredStats,
  getModelInfoById,
  getRecommendedModelIds,
  getToolModelOptions,
  MODEL_REASONING_LEVELS,
  resolveToolModelId,
  resolveToolReasoningLevel,
} from "../../lib/modelsCatalog";

interface ToolModelPickerProps {
  tool: ToolDefinition;
  modelByTool: Record<string, string>;
  reasoningByTool: Record<string, ModelReasoningLevel>;
  measuredStatsByKey: Record<string, MeasuredStats>;
  /** The output size token this tool would request now (drives the cost lookup). */
  sizeToken: string;
  onModelChange: (modelId: string) => void;
  onReasoningChange: (level: ModelReasoningLevel) => void;
  disabled?: boolean;
}

const REASONING_LABELS: Record<ModelReasoningLevel, string> = {
  default: "Default",
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const formatCost = (cost: number): string => {
  if (cost >= 0.01) {
    return `$${cost.toFixed(2)}`;
  }
  // Sub-cent measurements (e.g. GPT-5 Image) keep a couple of significant digits.
  return `$${cost.toPrecision(2)}`;
};

const formatDuration = (durationMs: number): string => {
  const seconds = durationMs / 1000;
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
};

// "$0.24, ~12s" — whichever of the two we actually have.
const formatStats = (stats: MeasuredStats): string => {
  const parts: string[] = [];
  if (stats.cost > 0) parts.push(formatCost(stats.cost));
  if (stats.durationMs > 0) parts.push(`~${formatDuration(stats.durationMs)}`);
  return parts.join(", ");
};

export const ToolModelPicker: React.FC<ToolModelPickerProps> = ({
  tool,
  modelByTool,
  reasoningByTool,
  measuredStatsByKey,
  sizeToken,
  onModelChange,
  onReasoningChange,
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const options = getToolModelOptions(tool);
  const recommendedIds = getRecommendedModelIds(tool);
  const recommendedSet = new Set(recommendedIds);
  const hasRecommendation = recommendedIds.length > 0;

  const selectedId = resolveToolModelId(tool, modelByTool);
  const selectedModel = getModelInfoById(selectedId);
  const selectedName = selectedModel?.name || selectedId || "No model";
  const showNotRecommended = hasRecommendation && !recommendedSet.has(selectedId);

  const reasoningLevel = resolveToolReasoningLevel(tool, selectedModel, reasoningByTool);
  const measuredStats = getMeasuredStats(
    tool.id,
    selectedId,
    reasoningLevel,
    sizeToken,
    measuredStatsByKey,
  );

  const tooltipTitle = (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>
        Model: {selectedName}
      </Typography>
      {showNotRecommended && (
        <Typography variant="caption" component="div">
          (not recommended)
        </Typography>
      )}
      {measuredStats != null && (
        <Typography variant="caption" component="div">
          When last measured, this cost {formatStats(measuredStats)}
        </Typography>
      )}
    </Box>
  );

  return (
    <>
      <Tooltip title={tooltipTitle} arrow>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            aria-label={`Model: ${selectedName}`}
            aria-haspopup="true"
            data-testid={`tool-model-picker-${tool.id}`}
            onClick={(event) => setAnchorEl(event.currentTarget)}
            sx={{
              color: showNotRecommended ? "warning.main" : "rgba(255, 247, 236, 0.82)",
              "&:hover": { color: "#fff7ec" },
              // MUI's default disabled color is near-black and vanishes on the
              // dark tool card — keep a visible faded cream instead.
              "&.Mui-disabled": { color: "rgba(255, 247, 236, 0.4)" },
            }}
          >
            <TuneOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        MenuListProps={{ dense: true, sx: { minWidth: 280 } }}
      >
        {options.map((model) => {
          const modelRecommended = recommendedSet.has(model.id);
          const stats = getMeasuredStats(
            tool.id,
            model.id,
            reasoningLevel,
            sizeToken,
            measuredStatsByKey,
          );
          return (
            <MenuItem
              key={model.id}
              selected={model.id === selectedId}
              onClick={() => {
                onModelChange(model.id);
                setAnchorEl(null);
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <span>{model.name}</span>
                    {modelRecommended && (
                      <Chip
                        label="recommended for this tool"
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontSize: "9pt", height: "auto", py: 0.25 }}
                      />
                    )}
                  </Stack>
                }
                secondary={stats != null ? `Last measured: ${formatStats(stats)}` : model.pricing}
              />
            </MenuItem>
          );
        })}

        <Divider />
        <Box sx={{ px: 2, py: 1 }} onClick={(event) => event.stopPropagation()}>
          <FormControl fullWidth size="small">
            <InputLabel id={`reasoning-label-${tool.id}`}>Reasoning</InputLabel>
            <Select
              labelId={`reasoning-label-${tool.id}`}
              label="Reasoning"
              value={reasoningLevel}
              data-testid={`tool-reasoning-${tool.id}`}
              onChange={(event) => onReasoningChange(event.target.value as ModelReasoningLevel)}
            >
              {MODEL_REASONING_LEVELS.map((level) => (
                <MenuItem key={level} value={level}>
                  {REASONING_LABELS[level]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Menu>
    </>
  );
};
