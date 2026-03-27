import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type {
  ModelInfo,
  ModelReasoningLevel,
  ModelReasoningLevelByModelId,
} from "../types";
import { isMacPlatform } from "../lib/platformUtils";
import { darkTheme } from "./materialUITheme";

interface ModelChooserDialogProps {
  isOpen: boolean;
  models: ModelInfo[];
  selectedModelId: string;
  modelReasoningLevels: ModelReasoningLevelByModelId;
  onSelect: (
    modelId: string,
    reasoningLevels: ModelReasoningLevelByModelId,
  ) => void;
  onClose: () => void;
}

const REASONING_LEVEL_OPTIONS: Array<{
  value: ModelReasoningLevel;
  label: string;
}> = [
  { value: "default", label: "Default" },
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const isModelReasoningLevel = (
  value: unknown,
): value is ModelReasoningLevel => {
  return REASONING_LEVEL_OPTIONS.some((option) => option.value === value);
};

export const ModelChooserDialog: React.FC<ModelChooserDialogProps> = ({
  isOpen,
  models,
  selectedModelId,
  modelReasoningLevels,
  onSelect,
  onClose,
}) => {
  const [pendingModelId, setPendingModelId] = useState(selectedModelId);
  const [pendingModelReasoningLevels, setPendingModelReasoningLevels] =
    useState<ModelReasoningLevelByModelId>({ ...modelReasoningLevels });

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
      setPendingModelReasoningLevels({ ...modelReasoningLevels });
    }
  }, [isOpen, selectedModelId, modelReasoningLevels]);

  const handleConfirm = () => {
    if (!pendingModelId) return;
    onSelect(pendingModelId, pendingModelReasoningLevels);
    onClose();
  };

  const getReasoningLevelForModel = (modelId: string): ModelReasoningLevel => {
    const configuredLevel = pendingModelReasoningLevels[modelId];
    if (configuredLevel) {
      return configuredLevel;
    }

    const model = models.find((item) => item.id === modelId);
    const initialLevel = model?.initialReasoningLevel;
    return isModelReasoningLevel(initialLevel) ? initialLevel : "default";
  };

  const handleReasoningChange = (
    modelId: string,
    value: ModelReasoningLevel,
  ) => {
    setPendingModelReasoningLevels((prev) => ({
      ...prev,
      [modelId]: value,
    }));
  };

  const actionButtons = (() => {
    const confirmButton = (
      <Button
        key="ok"
        onClick={handleConfirm}
        disabled={!pendingModelId}
        variant="contained"
        color="primary"
      >
        OK
      </Button>
    );

    const cancelButton = (
      <Button key="cancel" onClick={onClose} variant="outlined" color="inherit">
        Cancel
      </Button>
    );

    return isMacPlatform()
      ? [cancelButton, confirmButton]
      : [confirmButton, cancelButton];
  })();

  if (!isOpen) return null;

  return (
    <ThemeProvider theme={darkTheme}>
      <Dialog
        open={isOpen}
        onClose={onClose}
        fullWidth
        maxWidth="lg"
        aria-labelledby="model-chooser-title"
        PaperProps={{
          sx: {
            borderRadius: 4,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        }}
      >
        <DialogTitle id="model-chooser-title">Choose an AI Engine</DialogTitle>
        <DialogContent
          dividers
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              height: "100%",
              overflowY: "auto",
              pr: 1,
            }}
          >
            <Grid container spacing={2}>
              {models.map((model) => {
                const isSelected = model.id === pendingModelId;
                return (
                  <Grid size={{ xs: 12, sm: 6 }} key={model.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        borderColor: isSelected ? "primary.main" : "divider",
                        boxShadow: isSelected ? 6 : "none",
                        transition: (themeInstance) =>
                          themeInstance.transitions.create(
                            ["border-color", "box-shadow"],
                            {
                              duration:
                                themeInstance.transitions.duration.short,
                            },
                          ),
                      }}
                    >
                      <CardActionArea
                        onClick={() => setPendingModelId(model.id)}
                        sx={{ flex: "0 0 auto" }}
                      >
                        <CardContent>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            mb={2}
                          >
                            {isSelected && (
                              <Chip
                                color="primary"
                                size="small"
                                label="Selected"
                              />
                            )}
                            {(model.badge || "").trim().length > 0 && (
                              <Typography
                                variant="caption"
                                sx={{
                                  letterSpacing: "0.3em",
                                  textTransform: "uppercase",
                                  color: "text.secondary",
                                }}
                              >
                                {model.badge}
                              </Typography>
                            )}
                          </Stack>
                          <Typography variant="h6" component="h3" gutterBottom>
                            {model.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 3 }}
                          >
                            {model.description}
                          </Typography>
                          <Box
                            sx={{
                              border: 1,
                              borderColor: "divider",
                              borderRadius: 2,
                              p: 2,
                              bgcolor: "background.default",
                            }}
                          >
                            <Typography variant="body2">
                              {model.pricing}
                            </Typography>
                          </Box>
                        </CardContent>
                      </CardActionArea>
                      <Box sx={{ px: 2, pb: 2 }}>
                        <FormControl
                          fullWidth
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <InputLabel id={`reasoning-label-${model.id}`}>
                            Reasoning
                          </InputLabel>
                          <Select
                            labelId={`reasoning-label-${model.id}`}
                            value={getReasoningLevelForModel(model.id)}
                            label="Reasoning"
                            data-testid={`model-reasoning-${model.id}`}
                            onChange={(event) =>
                              handleReasoningChange(
                                model.id,
                                event.target.value as ModelReasoningLevel,
                              )
                            }
                          >
                            {REASONING_LEVEL_OPTIONS.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1.5, flexWrap: "wrap" }}>
          {actionButtons}
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
};
