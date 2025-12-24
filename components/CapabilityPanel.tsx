import React from "react";
import { Paper, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Icon, Icons } from "./Icons";
import type { CapabilityName, ModelInfo, ToolCapabilities } from "../types";
import { formatCapabilityLabel } from "../lib/formatters";

interface CapabilityPanelProps {
  capabilities?: ToolCapabilities;
  selectedModel: ModelInfo | null;
}

export const CapabilityPanel: React.FC<CapabilityPanelProps> = ({
  capabilities,
  selectedModel,
}) => {
  if (!capabilities || !Object.values(capabilities).some(Boolean)) return null;
  const muiTheme = useTheme();

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
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        p: 2,
        borderRadius: 2,
        borderColor: anyWarning
          ? muiTheme.palette.error.main
          : muiTheme.palette.divider,
        backgroundColor: muiTheme.palette.background.default,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: muiTheme.palette.text.secondary,
          mb: 1,
          textTransform: "uppercase",
        }}
      >
        {selectedModel?.name?.trim() ? selectedModel.name : "No model selected"}
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {shownCapabilities.map(([capability]) => {
          const score = getModelCapabilityScore(capability as CapabilityName);
          const showWarning = score < 3;
          return (
            <Stack
              key={capability}
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 999,
                border: "1px solid",
                borderColor: showWarning
                  ? muiTheme.palette.error.main
                  : muiTheme.palette.divider,
                bgcolor: muiTheme.palette.background.paper,
                fontSize: 12,
              }}
              title={
                showWarning ? "This model may struggle with this tool" : undefined
              }
            >
              {showWarning && (
                <Icon
                  path={Icons.AlertTriangle}
                  style={{
                    color: muiTheme.palette.error.main,
                    width: 14,
                    height: 14,
                  }}
                />
              )}
              <Typography
                variant="body2"
                sx={{
                  fontSize: 12,
                  color: muiTheme.palette.text.secondary,
                }}
              >
                {formatCapabilityLabel(capability as CapabilityName)}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                {score}/5
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
};
