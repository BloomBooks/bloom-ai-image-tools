import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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

const ADVANCED_TOOL_IDS = new Set([
  "generate_image",
  "change_style",
  "custom",
  "remove_object",
  "remove_background",
]);

const TEXT_TOOL_IDS = new Set(["change_text", "stylized_title"]);

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
    options?: { timeout?: number },
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

// No debounce - only commit on blur to avoid re-render cascade during typing

interface ParamTextInputProps {
  name: string;
  label: string;
  placeholder?: string;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  rows?: number;
  persistHeightKey?: string;
  inputTestId: string;
  onCommit: (value: string) => void;
}

const ParamTextInput = React.memo(function ParamTextInputComponent({
  name,
  label,
  placeholder,
  value,
  disabled,
  multiline,
  rows,
  persistHeightKey,
  inputTestId,
  onCommit,
}: ParamTextInputProps) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const commitRef = useRef(onCommit);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  // Sync external value changes to draft (e.g., when loading persisted state)
  useEffect(() => {
    if (value !== draftRef.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  // Commit on unmount if there are uncommitted changes
  useEffect(() => {
    return () => {
      if (draftRef.current !== value) {
        commitRef.current(draftRef.current);
      }
    };
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      draftRef.current = nextValue;
      setDraft(nextValue);
      // Don't commit on change - only on blur to avoid re-render cascade
    },
    [],
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      draftRef.current = nextValue;
      commitRef.current(nextValue);
    },
    [],
  );

  useEffect(() => {
    if (!multiline) return;
    if (typeof window === "undefined") return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const getMinimumHeight = () => {
      const styles = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(styles.lineHeight);
      const fontSize = Number.parseFloat(styles.fontSize);
      const resolvedLineHeight = Number.isFinite(lineHeight)
        ? lineHeight
        : Number.isFinite(fontSize)
        ? fontSize * 1.5
        : 20;
      const paddingTop = Number.parseFloat(styles.paddingTop);
      const paddingBottom = Number.parseFloat(styles.paddingBottom);
      const borderTopWidth = Number.parseFloat(styles.borderTopWidth);
      const borderBottomWidth = Number.parseFloat(styles.borderBottomWidth);

      return Math.ceil(
        resolvedLineHeight * 2 +
          (Number.isFinite(paddingTop) ? paddingTop : 0) +
          (Number.isFinite(paddingBottom) ? paddingBottom : 0) +
          (Number.isFinite(borderTopWidth) ? borderTopWidth : 0) +
          (Number.isFinite(borderBottomWidth) ? borderBottomWidth : 0),
      );
    };

    const minimumHeight = getMinimumHeight();
    textarea.style.minHeight = `${minimumHeight}px`;

    if (!persistHeightKey) return;

    const applyPersistedHeight = () => {
      let storedRaw: string | null = null;
      try {
        storedRaw = window.localStorage?.getItem(persistHeightKey) ?? null;
      } catch {
        storedRaw = null;
      }

      const stored = storedRaw ? Number(storedRaw) : NaN;
      if (!Number.isFinite(stored) || stored <= 0) return;

      const maxReasonable = Math.max(160, Math.floor(window.innerHeight * 0.9));
      const clamped = Math.max(
        minimumHeight,
        Math.min(Math.round(stored), maxReasonable),
      );
      textarea.style.height = `${clamped}px`;
    };

    const saveHeight = () => {
      const height = Math.round(textarea.getBoundingClientRect().height);
      if (!Number.isFinite(height) || height <= 0) return;
      try {
        window.localStorage?.setItem(persistHeightKey, String(height));
      } catch {
        // ignore
      }
    };

    // Apply immediately and again on next frame to avoid losing to layout/autosize.
    applyPersistedHeight();
    const rafId = window.requestAnimationFrame(applyPersistedHeight);

    textarea.addEventListener("pointerup", saveHeight);
    textarea.addEventListener("mouseup", saveHeight);
    textarea.addEventListener("touchend", saveHeight);
    window.addEventListener("beforeunload", saveHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof (window as any).ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        saveHeight();
      });
      resizeObserver.observe(textarea);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      textarea.removeEventListener("pointerup", saveHeight);
      textarea.removeEventListener("mouseup", saveHeight);
      textarea.removeEventListener("touchend", saveHeight);
      window.removeEventListener("beforeunload", saveHeight);
      resizeObserver?.disconnect();
    };
  }, [multiline, persistHeightKey]);

  return (
    <TextField
      name={name}
      label={label}
      placeholder={placeholder}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      multiline={multiline}
      rows={rows}
      fullWidth
      size="small"
      disabled={disabled}
      inputRef={(node) => {
        // When multiline, MUI renders a <textarea>.
        textareaRef.current = node as unknown as HTMLTextAreaElement | null;
      }}
      sx={
        multiline
          ? {
              "& .MuiInputLabel-root": {
                fontWeight: 400,
              },
              "& .MuiInputBase-inputMultiline": {
                fontWeight: 400,
              },
              "& textarea": {
                resize: "vertical",
                overflow: "auto",
                maxHeight: "60vh",
                fontWeight: 400,
              },
            }
          : undefined
      }
      inputProps={{ "data-testid": inputTestId }}
    />
  );
});

const ImageToolComponent: React.FC<ToolPanelProps> = ({
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
  const resolvedActiveToolId = activeToolId;
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(() =>
    activeToolId ? ADVANCED_TOOL_IDS.has(activeToolId) : false,
  );

  useEffect(() => {
    if (activeToolId && ADVANCED_TOOL_IDS.has(activeToolId)) {
      setIsAdvancedOpen(true);
    }
  }, [activeToolId]);

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
          }),
        );
      });
    });
    return map;
  }, []);

  const handleToolSelect = (toolId: string) => {
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
        `[data-tool-id="${resolvedActiveToolId}"]`,
      );
      if (toolPanel) {
        const firstInput = toolPanel.querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >('input:not([type="hidden"]), textarea');
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
    [onParamChange],
  );

  const defaultTools = useMemo(
    () =>
      TOOLS.filter(
        (tool) =>
          !ADVANCED_TOOL_IDS.has(tool.id) && !TEXT_TOOL_IDS.has(tool.id),
      ),
    [],
  );

  const advancedTools = useMemo(
    () => TOOLS.filter((tool) => ADVANCED_TOOL_IDS.has(tool.id)),
    [],
  );

  const textTools = useMemo(
    () => TOOLS.filter((tool) => TEXT_TOOL_IDS.has(tool.id)),
    [],
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
          { excludeNone: param.excludeNoneStyle },
        );
        const candidate =
          toolParams[param.name] ??
          param.defaultValue ??
          selectedArtStyleId ??
          "";
        if (!candidate.trim()) {
          return true;
        }
        const hasMatch = stylesForPicker.some(
          (style) => style.id === candidate,
        );
        return !hasMatch;
      }
      return !toolParams[param.name]?.trim();
    });
  };

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    tool: ToolDefinition,
  ) => {
    event.preventDefault();
    if (isProcessing) return;
    const payload: Record<string, string> = {
      ...(paramsByTool[tool.id] || {}),
    };

    const formData = new FormData(event.currentTarget);
    formData.forEach((formValue, key) => {
      payload[key] = String(formValue);
    });

    tool.parameters.forEach((param) => {
      if (param.type === "art-style") {
        const styleValue =
          payload[param.name] ?? param.defaultValue ?? selectedArtStyleId ?? "";
        payload[param.name] = styleValue;
      }
    });

    onApplyTool(tool.id, payload);
  };

  const renderParameterField = useCallback(
    (tool: ToolDefinition, param: ToolParameter, value: string) => {
      const inputTestId = `input-${param.name}`;

      if (param.type === "art-style") {
        const storedValue = value;
        const cacheKey = `${tool.id}:${param.name}`;
        const stylesForPicker = artStyleOptionsByParam.get(cacheKey) ?? [];
        const pickerValue =
          storedValue || param.defaultValue || selectedArtStyleId || "";

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
        const persistHeightKey = `bloom-ai-image-tools:textarea-height:${tool.id}:${param.name}`;
        return (
          <ParamTextInput
            key={param.name}
            name={param.name}
            label={param.label}
            placeholder={param.placeholder}
            value={value}
            disabled={isProcessing}
            multiline
            rows={3}
            persistHeightKey={persistHeightKey}
            inputTestId={inputTestId}
            onCommit={(nextValue) =>
              handleParamChange(tool.id, param.name, nextValue)
            }
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
              name={param.name}
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
            name={param.name}
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
        <ParamTextInput
          key={param.name}
          name={param.name}
          label={param.label}
          placeholder={param.placeholder}
          value={value}
          disabled={isProcessing}
          inputTestId={inputTestId}
          onCommit={(nextValue) =>
            handleParamChange(tool.id, param.name, nextValue)
          }
        />
      );
    },
    [
      artStyleOptionsByParam,
      isProcessing,
      muiTheme.palette.text.secondary,
      onArtStyleChange,
      selectedArtStyleId,
      handleParamChange,
    ],
  );

  const renderSectionHeader = (label: string) => (
    <Typography
      variant="caption"
      sx={{
        px: 0.5,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: alpha(muiTheme.palette.text.secondary, 0.9),
      }}
    >
      {label}
    </Typography>
  );

  const renderToolCard = (tool: ToolDefinition) => {
    const isSelected = resolvedActiveToolId === tool.id;
    const referenceConstraints = getReferenceConstraints(tool.referenceImages);
    const needsReference = referenceConstraints.min > referenceImageCount;
    const needsTarget = toolRequiresEditImage(tool) && !hasTargetImage;
    const missingRequired = hasUnfilledRequiredParams(tool);
    const submitDisabledReason = !isAuthenticated
      ? "Connect to OpenRouter"
      : needsTarget
      ? "Add an image to edit -->"
      : needsReference
      ? "Add reference images"
      : missingRequired
      ? "Fill in required fields"
      : undefined;
    const isSubmitDisabled =
      isProcessing ||
      !isAuthenticated ||
      needsTarget ||
      needsReference ||
      missingRequired;

    const effectiveCapabilities = isSelected
      ? tool.referenceImages === "1+" && referenceImageCount > 1
        ? {
            ...(tool.capabilities ?? {}),
            "edit-with-reference-image": true,
          }
        : tool.capabilities
      : tool.capabilities;

    const cardBackground = "linear-gradient(180deg, #212741 0%, #191f34 100%)";
    const cardBorderColor = isSelected ? "#f0d59a" : "transparent";
    const cardBorderWidth = isSelected ? 2 : 0;
    const labelColor = "#fff7ec";
    const ToolIcon = tool.icon;

    return (
      <Paper
        key={tool.id}
        data-tool-id={tool.id}
        variant="outlined"
        sx={{
          borderRadius: 3,
          borderStyle: "solid",
          borderWidth: `${cardBorderWidth}px`,
          borderColor: cardBorderColor,
          background: cardBackground,
          boxShadow: isSelected
            ? "0 0 0 2px rgba(240, 213, 154, 0.42), 0 0 24px rgba(166, 128, 74, 0.18), 0 10px 24px rgba(8,10,20,0.2), inset 0 1px 0 rgba(255,255,255,0.07)"
            : "0 8px 18px rgba(8,10,20,0.16), inset 0 1px 0 rgba(255,255,255,0.04)",
          transition: "all 0.2s ease",
        }}
      >
        <ButtonBase
          onClick={() => handleToolSelect(tool.id)}
          disableRipple
          sx={{
            width: "100%",
            textAlign: "left",
            p: 2,
            display: "grid",
            gridTemplateColumns: "32px 1fr",
            columnGap: 2,
            alignItems: "center",
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: labelColor,
            }}
          >
            <ToolIcon sx={{ fontSize: 26 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 400,
                color: labelColor,
              }}
            >
              {tool.title}
            </Typography>
            {isSelected && tool.description && (
              <Typography
                variant="body2"
                sx={{ mt: 0.5, color: "rgba(255, 247, 236, 0.82)" }}
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
            }}
          >
            <Stack spacing={2} mt={2}>
              {(() => {
                const params = tool.parameters;
                const toolParams = paramsByTool[tool.id] || {};
                const elements: React.ReactNode[] = [];
                let i = 0;
                while (i < params.length) {
                  const param = params[i];
                  const nextParam = params[i + 1];
                  const paramValue = toolParams[param.name] ?? "";
                  if (param.name === "shape" && nextParam?.name === "size") {
                    const nextParamValue = toolParams[nextParam.name] ?? "";
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
                          {renderParameterField(tool, param, paramValue)}
                        </Box>
                        <Box sx={{ width: 80, flexShrink: 0 }}>
                          {renderParameterField(
                            tool,
                            nextParam,
                            nextParamValue,
                          )}
                        </Box>
                      </Box>,
                    );
                    i += 2;
                  } else {
                    elements.push(
                      renderParameterField(tool, param, paramValue),
                    );
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
                    fontWeight: 400,
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
                  <FormHelperText
                    sx={{
                      textAlign: "center",
                      fontSize: "1rem",
                      color: muiTheme.palette.error.main,
                    }}
                  >
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
  };

  return (
    <Box
      component="aside"
      sx={{
        width: 320,
        display: "flex",
        flexDirection: "column",
        height: "100%",
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
        {defaultTools.map(renderToolCard)}

        {textTools.length > 0 && (
          <Stack spacing={1.25}>
            {renderSectionHeader("Text")}
            {textTools.map(renderToolCard)}
          </Stack>
        )}

        {advancedTools.length > 0 && (
          <Stack spacing={1.25}>
            <ButtonBase
              onClick={() => setIsAdvancedOpen((current) => !current)}
              sx={{
                width: "100%",
                px: 0.5,
                py: 0.75,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: alpha(muiTheme.palette.text.secondary, 0.9),
              }}
            >
              {renderSectionHeader("Advanced")}
              <ExpandMoreIcon
                sx={{
                  transition: "transform 0.2s ease",
                  transform: isAdvancedOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}
              />
            </ButtonBase>
            {isAdvancedOpen && advancedTools.map(renderToolCard)}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export const ImageTool = React.memo(ImageToolComponent);
