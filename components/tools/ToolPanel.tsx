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
import {
  getReferenceConstraints,
  toolRequiresEditImage,
} from "../../lib/toolHelpers";

interface ToolPanelProps {
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

export const ToolPanel: React.FC<ToolPanelProps> = ({
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
        }}
        className="custom-scrollbar"
      >
        {TOOLS.map((tool) => {
          const isActive = resolvedActiveToolId === tool.id;
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

          const effectiveCapabilities = isActive
            ? tool.referenceImages === "1+" && referenceImageCount > 1
              ? {
                  ...(tool.capabilities ?? {}),
                  "edit-with-reference-image": true,
                }
              : tool.capabilities
            : tool.capabilities;

          const cardBackground = isDisabled
            ? alpha(muiTheme.palette.background.paper, 0.4)
            : isActive
            ? alpha(muiTheme.palette.primary.main, 0.05)
            : muiTheme.palette.background.paper;
          const cardBorder = isActive
            ? muiTheme.palette.primary.main
            : muiTheme.palette.divider;

          return (
            <Paper
              key={tool.id}
              variant="outlined"
              sx={{
                borderRadius: 3,
                borderColor: cardBorder,
                bgcolor: cardBackground,
                opacity: isDisabled ? 0.6 : 1,
                boxShadow: isActive ? muiTheme.shadows[8] : "none",
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
                  display: "flex",
                  gap: 2,
                  alignItems: "flex-start",
                  borderRadius: 3,
                }}
              >
                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    bgcolor: alpha(muiTheme.palette.background.default, 0.7),
                    color: muiTheme.palette.text.secondary,
                  }}
                >
                  <Icon path={tool.icon} style={{ width: 20, height: 20 }} />
                </Box>
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 600,
                      color: isActive
                        ? muiTheme.palette.text.primary
                        : muiTheme.palette.text.secondary,
                    }}
                  >
                    {tool.title}
                  </Typography>
                  {isActive && tool.description && (
                    <Typography
                      variant="body2"
                      sx={{ mt: 0.5, color: muiTheme.palette.text.secondary }}
                    >
                      {tool.description}
                    </Typography>
                  )}
                </Box>
              </ButtonBase>

              {isActive && (
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
                    {tool.parameters.map((param) =>
                      renderParameterField(tool, param)
                    )}

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
