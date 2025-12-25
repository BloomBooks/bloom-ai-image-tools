import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  FormHelperText,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type {
  ModelInfo,
  ToolDefinition,
  ToolParameter,
  ToolParamsById,
} from "../../types";
import { TOOLS } from "./tools-registry";
import { Icon, Icons } from "../Icons";
import { CapabilityPanel } from "../CapabilityPanel";
import { ART_STYLES, getArtStylesByCategories } from "../../lib/artStyles";
import { ArtStylePicker } from "../artStyle/ArtStylePicker";
import { ShapePicker } from "./ShapePicker";
import {
  getReferenceConstraints,
  toolRequiresEditImage,
} from "../../lib/toolHelpers";

interface ImageToolProps {
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  isProcessing: boolean;
  onCancelProcessing: () => void;
  onToolSelect: (toolId: string | null) => void;
  referenceImageCount: number;
  hasTargetImage: boolean;
  isAuthenticated: boolean;
  selectedModel: ModelInfo | null;
  activeToolId: string | null;
  paramsByTool: ToolParamsById;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
  selectedArtStyleId: string | null;
  onArtStyleChange: (styleId: string) => void;
}
type IdleFriendlyWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type LazyArtStylePickerProps = React.ComponentProps<typeof ArtStylePicker>;

const LazyArtStylePicker: React.FC<LazyArtStylePickerProps> = (props) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const markReady = () => {
      if (!cancelled) {
        setIsReady(true);
      }
    };

    if (typeof window !== "undefined") {
      const win = window as IdleFriendlyWindow;
      if (typeof win.requestIdleCallback === "function") {
        idleHandle = win.requestIdleCallback(markReady, { timeout: 120 });
      } else {
        timeoutHandle = window.setTimeout(markReady, 30);
      }
    } else {
      markReady();
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof window !== "undefined") {
        const win = window as IdleFriendlyWindow;
        win.cancelIdleCallback?.(idleHandle);
      }
      if (timeoutHandle !== null && typeof window !== "undefined") {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, []);

  if (!isReady) {
    return (
      <Skeleton
        variant="rounded"
        height={88}
        animation="wave"
        sx={{ borderRadius: 2, bgcolor: "rgba(255,255,255,0.08)" }}
      />
    );
  }

  return <ArtStylePicker {...props} />;
};

export const ImageTool: React.FC<ToolPanelProps> = ({
  onApplyTool,
  isProcessing,
  onCancelProcessing,
  onToolSelect,
  referenceImageCount,
  hasTargetImage,
  isAuthenticated,
  selectedModel,
  activeToolId,
  paramsByTool,
  onParamChange,
  selectedArtStyleId,
  onArtStyleChange,
}) => {
  const muiTheme = useTheme();
  const selectionTimingRef = useRef<string | null>(null);
  const resolvedActiveToolId = activeToolId ?? TOOLS[0]?.id ?? null;

  const artStyleOptionsByParam = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getArtStylesByCategories>>();
    TOOLS.forEach((tool) => {
      tool.parameters.forEach((param) => {
        if (param.type !== "art-style") return;
        const cacheKey = `${tool.id}:${param.name}`;
        map.set(
          cacheKey,
          getArtStylesByCategories(param.artStyleCategories, {
            excludeNone: param.excludeNoneStyle,
          })
        );
      });
    });
    return map;
  }, []);

  const handleToolSelect = (toolId: string, isDisabled: boolean) => {
    if (isDisabled) return;
    const timingLabel = `tool-panel-open:${toolId}`;
    selectionTimingRef.current = timingLabel;
    if (typeof console !== "undefined" && console.time) {
      console.time(timingLabel);
    }
    startTransition(() => {
      onToolSelect(toolId);
    });
  };

  useEffect(() => {
    if (!resolvedActiveToolId) return;
    const timingLabel = `tool-panel-open:${resolvedActiveToolId}`;
    if (selectionTimingRef.current === timingLabel) {
      if (typeof console !== "undefined" && console.timeEnd) {
        console.timeEnd(timingLabel);
      }
      selectionTimingRef.current = null;
    }
  }, [resolvedActiveToolId]);

  // Focus first text field when a tool is selected
  useEffect(() => {
    if (!resolvedActiveToolId) return;
    // Use a small delay to ensure the form is rendered
    const timeoutId = setTimeout(() => {
      const toolPanel = document.querySelector(
        `[data-tool-id="${resolvedActiveToolId}"]`
      );
      if (toolPanel) {
        const firstInput = toolPanel.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]), textarea'
        );
        if (firstInput) {
          firstInput.focus();
        }
      }
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [resolvedActiveToolId]);

  const handleParamChange = useCallback(
    (toolId: string, name: string, value: string) => {
      onParamChange(toolId, name, value);
    },
    [onParamChange]
  );

  const hasUnfilledRequiredParams = (tool: ToolDefinition) => {
    const toolParams = paramsByTool[tool.id] || {};
    return tool.parameters.some((param) => {
      if (param.optional) {
        return false;
      }
      if (param.type === "art-style") {
        const stylesForPicker = getArtStylesByCategories(
          param.artStyleCategories,
          { excludeNone: param.excludeNoneStyle }
        );
        const candidate =
          selectedArtStyleId ??
          toolParams[param.name] ??
          param.defaultValue ??
          "";
        if (!candidate.trim()) {
          return true;
        }
        const hasMatch = stylesForPicker.some(
          (style) => style.id === candidate
        );
        return !hasMatch;
      }
      return !toolParams[param.name]?.trim();
    });
  };

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    tool: ToolDefinition
  ) => {
    event.preventDefault();
    if (isProcessing) return;
    const payload: Record<string, string> = {
      ...(paramsByTool[tool.id] || {}),
    };

    tool.parameters.forEach((param) => {
      if (param.type === "art-style") {
        const styleValue =
          selectedArtStyleId ?? payload[param.name] ?? param.defaultValue ?? "";
        payload[param.name] = styleValue;
      }
    });

    onApplyTool(tool.id, payload);
  };

  const renderParameterField = useCallback(
    (tool: ToolDefinition, param: ToolParameter) => {
      const value = paramsByTool[tool.id]?.[param.name] ?? "";
      const inputTestId = `input-${param.name}`;

      if (param.type === "art-style") {
        const storedValue = paramsByTool[tool.id]?.[param.name] ?? "";
        const cacheKey = `${tool.id}:${param.name}`;
        const stylesForPicker = artStyleOptionsByParam.get(cacheKey) ?? [];
        const pickerValue =
          selectedArtStyleId ?? (storedValue || param.defaultValue || "");

        return (
          <Stack key={param.name} spacing={1} sx={{ width: "100%" }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: muiTheme.palette.text.secondary,
              }}
            >
              {param.label}
            </Typography>
            <LazyArtStylePicker
              styles={stylesForPicker}
              value={pickerValue}
              onChange={onArtStyleChange}
              disabled={
                isProcessing ||
                stylesForPicker.length === 0 ||
                ART_STYLES.length === 0
              }
              data-testid={inputTestId}
            />
          </Stack>
        );
      }

      if (param.type === "textarea") {
        return (
          <TextField
            key={param.name}
            label={param.label}
            placeholder={param.placeholder}
            value={value}
            onChange={(event) =>
              handleParamChange(tool.id, param.name, event.target.value)
            }
            multiline
            rows={3}
            fullWidth
            size="small"
            disabled={isProcessing}
            inputProps={{ "data-testid": inputTestId }}
          />
        );
      }

      if (param.type === "shape") {
        const shapeValue = value || param.defaultValue || "";
        return (
          <ShapePicker
            key={param.name}
            options={param.options || []}
            value={shapeValue}
            onChange={(newValue) =>
              handleParamChange(tool.id, param.name, newValue)
            }
            disabled={isProcessing}
            label={param.label}
          />
        );
      }

      if (param.type === "size") {
        const sizeValue = value || param.defaultValue || "";
        return (
          <Stack key={param.name} spacing={1}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: muiTheme.palette.text.secondary,
              }}
            >
              {param.label}
            </Typography>
            <TextField
              select
              value={sizeValue}
              onChange={(event) =>
                handleParamChange(tool.id, param.name, event.target.value)
              }
              size="small"
              disabled={isProcessing}
              inputProps={{ "data-testid": inputTestId }}
              SelectProps={{
                MenuProps: { disablePortal: false },
                displayEmpty: false,
              }}
            >
              {param.options?.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        );
      }

      if (param.type === "select") {
        return (
          <TextField
            key={param.name}
            select
            label={param.label}
            value={value}
            onChange={(event) =>
              handleParamChange(tool.id, param.name, event.target.value)
            }
            fullWidth
            size="small"
            disabled={isProcessing}
            inputProps={{ "data-testid": inputTestId }}
            SelectProps={{
              MenuProps: { disablePortal: false },
              displayEmpty: false,
            }}
          >
            {param.options?.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        );
      }

      return (
        <TextField
          key={param.name}
          label={param.label}
          placeholder={param.placeholder}
          value={value}
          onChange={(event) =>
            handleParamChange(tool.id, param.name, event.target.value)
          }
          fullWidth
          size="small"
          disabled={isProcessing}
          inputProps={{ "data-testid": inputTestId }}
        />
      );
    },
    [
      artStyleOptionsByParam,
      isProcessing,
      muiTheme.palette.text.secondary,
      onArtStyleChange,
      paramsByTool,
      selectedArtStyleId,
      handleParamChange,
    ]
  );

  return (
    <Box
      component="aside"
      sx={{
        width: 320,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRight: `1px solid ${muiTheme.palette.divider}`,
        boxShadow: muiTheme.shadows[8],
        zIndex: 20,
        bgcolor: muiTheme.palette.background.default,
      }}
    >
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          "&::-webkit-scrollbar": { width: 8 },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: alpha(muiTheme.palette.text.primary, 0.2),
            borderRadius: 999,
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: alpha(muiTheme.palette.background.paper, 0.4),
          },
        }}
      >
        {TOOLS.map((tool) => {
          const isSelected = resolvedActiveToolId === tool.id;
          const referenceConstraints = getReferenceConstraints(
            tool.referenceImages
          );
          const needsReference = referenceConstraints.min > referenceImageCount;
          const needsTarget = toolRequiresEditImage(tool) && !hasTargetImage;
          // Tools can always be selected, but authentication is still required
          const isDisabled = !isAuthenticated;
          const disabledReason = !isAuthenticated
            ? "Connect to OpenRouter"
            : undefined;
          const missingRequired = hasUnfilledRequiredParams(tool);
          // Submit button is disabled if missing requirements
          const submitDisabledReason = needsTarget
            ? "Add an image to edit first"
            : needsReference
            ? "Add reference images"
            : missingRequired
            ? "Fill in required fields"
            : undefined;
          const isSubmitDisabled =
            isProcessing || needsTarget || needsReference || missingRequired;

          const effectiveCapabilities = isSelected
            ? tool.referenceImages === "1+" && referenceImageCount > 1
              ? {
                  ...(tool.capabilities ?? {}),
                  "edit-with-reference-image": true,
                }
              : tool.capabilities
            : tool.capabilities;

          const cardBackground = isDisabled
            ? alpha(muiTheme.palette.background.paper, 0.4)
            : isSelected
            ? "transparent"
            : muiTheme.palette.background.paper;
          const cardBorderColor = isSelected
            ? muiTheme.palette.primary.main
            : muiTheme.palette.divider;
          const cardBorderWidth = isSelected ? 2 : 1;
          const ToolIcon = tool.icon;

          return (
            <Paper
              key={tool.id}
              data-tool-id={tool.id}
              variant="outlined"
              sx={{
                borderRadius: 3,
                border: `${cardBorderWidth}px solid ${cardBorderColor}`,
                bgcolor: cardBackground,
                opacity: isDisabled ? 0.6 : 1,
                boxShadow: "none",
                transition: "all 0.2s ease",
              }}
            >
              <ButtonBase
                onClick={() => handleToolSelect(tool.id, isDisabled)}
                disabled={isDisabled}
                title={disabledReason}
                disableRipple
                sx={{
                  width: "100%",
                  textAlign: "left",
                  p: 2,
                  display: "grid",
                  gridTemplateColumns: "48px 1fr",
                  columnGap: 2,
                  alignItems: "center",
                  borderRadius: 3,
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: alpha(muiTheme.palette.background.default, 0.7),
                    color: muiTheme.palette.text.secondary,
                  }}
                >
                  <ToolIcon sx={{ fontSize: 26 }} />
                </Box>
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 600,
                      color: alpha(muiTheme.palette.text.primary, 0.75),
                    }}
                  >
                    {tool.title}
                  </Typography>
                  {isSelected && tool.description && (
                    <Typography
                      variant="body2"
                      sx={{ mt: 0.5, color: muiTheme.palette.text.secondary }}
                    >
                      {tool.description}
                    </Typography>
                  )}
                </Box>
              </ButtonBase>

              {isSelected && (
                <Box
                  component="form"
                  onSubmit={(event) => handleSubmit(event, tool)}
                  sx={{
                    px: 2,
                    pb: 2.5,
                    pt: 0,
                    borderTop: `1px solid ${muiTheme.palette.divider}`,
                  }}
                >
                  <Stack spacing={2} mt={2}>
                    {(() => {
                      const params = tool.parameters;
                      const elements: React.ReactNode[] = [];
                      let i = 0;
                      while (i < params.length) {
                        const param = params[i];
                        const nextParam = params[i + 1];
                        // Group shape and size parameters in the same row
                        if (
                          param.name === "shape" &&
                          nextParam?.name === "size"
                        ) {
                          elements.push(
                            <Box
                              key="shape-size-row"
                              sx={{
                                display: "flex",
                                gap: 2,
                                alignItems: "flex-start",
                              }}
                            >
                              <Box sx={{ flex: 1 }}>
                                {renderParameterField(tool, param)}
                              </Box>
                              <Box sx={{ width: 80, flexShrink: 0 }}>
                                {renderParameterField(tool, nextParam)}
                              </Box>
                            </Box>
                          );
                          i += 2;
                        } else {
                          elements.push(renderParameterField(tool, param));
                          i += 1;
                        }
                      }
                      return elements;
                    })()}

                    <CapabilityPanel
                      capabilities={effectiveCapabilities}
                      selectedModel={selectedModel}
                    />

                    <Stack spacing={1.5}>
                      <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        fullWidth
                        disabled={isSubmitDisabled}
                        title={submitDisabledReason}
                        sx={{
                          minHeight: 44,
                          fontWeight: 600,
                          gap: 1,
                        }}
                      >
                        {isProcessing ? (
                          <>
                            <CircularProgress size={18} color="inherit" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <span>
                              {tool.id === "generate_image"
                                ? "Generate Image"
                                : "Apply Changes"}
                            </span>
                            <Icon
                              path={Icons.ArrowRight}
                              style={{ width: 18, height: 18 }}
                            />
                          </>
                        )}
                      </Button>
                      {submitDisabledReason && !isProcessing && (
                        <FormHelperText sx={{ textAlign: "center" }}>
                          {submitDisabledReason}
                        </FormHelperText>
                      )}
                      {isProcessing && (
                        <Button
                          type="button"
                          variant="outlined"
                          color="inherit"
                          fullWidth
                          onClick={onCancelProcessing}
                        >
                          Cancel Generation
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              )}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
};
