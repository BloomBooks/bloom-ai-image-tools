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
} from "@mui/material";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import type { MeasuredStats, ModelReasoningLevel, ToolDefinition } from "../../types";
import {
  getMeasuredStats,
  getModelInfoById,
  getReasoningLevelsForModel,
  getRecommendedModelIds,
  getToolModelOptions,
  resolveToolModelId,
  resolveToolReasoningLevel,
} from "../../lib/modelsCatalog";
import { formatCost } from "../../lib/formatters";
import { theme } from "../../themes";

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
  const reasoningLevels = getReasoningLevelsForModel(selectedId);
  // The button says what the menu is for. What each engine is like belongs on
  // the menu items themselves, where the choice is actually made.
  const tooltipTitle = "Choose which AI image engine to use";

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
              color: showNotRecommended ? "warning.main" : theme.colors.textSecondary,
              "&:hover": { color: theme.colors.textPrimary },
              // MUI's default disabled color is near-black and vanishes on the
              // dark tool card — keep a visible faded text color instead.
              "&.Mui-disabled": { color: theme.colors.textMuted },
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
        MenuListProps={{
          dense: true,
          sx: {
            minWidth: 280,
            // MUI's default selected state is an 8%-opacity primary wash, which
            // disappears against this dark surface. Mark the current model with
            // a solid accent bar down its left edge plus a stronger background,
            // and keep both through hover so moving the pointer over a
            // neighbour doesn't make the selection ambiguous.
            "& .MuiMenuItem-root": {
              borderLeft: "3px solid transparent",
            },
            "& .MuiMenuItem-root.Mui-selected": {
              borderLeftColor: theme.colors.accent,
              backgroundColor: theme.colors.accentSubtle,
              "& .MuiListItemText-primary": {
                color: theme.colors.textPrimary,
                fontWeight: 600,
              },
              "&:hover": {
                backgroundColor: theme.colors.accentSubtle,
              },
            },
          },
        }}
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
              {/* The tooltip wraps the text rather than the MenuItem so the
                  MenuItem stays a direct child of the Menu, which needs to
                  reach its items to manage selection and focus. An empty title
                  disables the tooltip, so a model with no description simply
                  has none. */}
              <Tooltip title={model.description || ""} placement="right" arrow>
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      useFlexGap
                      flexWrap="wrap"
                    >
                      <span>{model.name}</span>
                      {model.badge && (
                        <Chip
                          label={model.badge}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: "9pt", height: "auto", py: 0.25 }}
                        />
                      )}
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
              </Tooltip>
            </MenuItem>
          );
        })}

        {/* The model says which levels it takes; a model that takes none gets
            no control at all. */}
        {reasoningLevels.length > 0 && (
          <Box>
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
                  {reasoningLevels.map((level) => (
                    <MenuItem key={level} value={level}>
                      {REASONING_LABELS[level]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
        )}
      </Menu>
    </>
  );
};
