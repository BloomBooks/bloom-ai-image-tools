import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  CircularProgress,
  FormControlLabel,
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
  MeasuredStats,
  ModelReasoningLevel,
  ToolDefinition,
  ToolParameter,
  ToolParamsById,
} from "../../types";
import { TOOLS } from "./tools-registry";
import { Icon, Icons } from "../Icons";
import { ART_STYLES, getArtStylesByCategories } from "../../lib/artStyles";
import { ArtStylePicker } from "../artStyle/ArtStylePicker";
import { AspectRatioPicker } from "./AspectRatioPicker";
import {
  AUTO_ASPECT_RATIO,
  DEFAULT_CREATE_ASPECT_RATIO,
  getDefaultAspectRatioValue,
  resolveAspectRatioValue,
} from "../../lib/aspectRatios";
import { canUseLocalDummyModelWithoutApiKey } from "../../lib/localModels";
import { getReferenceConstraints, toolRequiresEditImage } from "../../lib/toolHelpers";
import { getModelInfoById, resolveToolModelId } from "../../lib/modelsCatalog";
import { DEFAULT_SIZE_TOKEN, pickSizeTokenForLongEdge } from "../../lib/imageSizes";
import { ToolModelPicker } from "./ToolModelPicker";
import { theme } from "../../themes";

// Must match the catalog id in data/models-registry.json5, which is the
// "-preview" key while OpenRouter only exposes the preview. Keep in sync if the
// non-preview key is ever published and the registry id is updated.
const GEMINI_3_1_FLASH_MODEL_ID = "google/gemini-3.1-flash-image-preview";

const LOCALIZE_TOOL_ORDER = [
  "extract_cast_of_characters",
  "ethnicity",
  "apply_localized_characters",
] as const;
const ADVANCED_TOOL_IDS = new Set([
  "generate_image",
  "change_style",
  "custom",
  "improve_drawing",
  "generate_pallet",
  "game_theme_generator",
]);

const isGamesTool = (toolId: string | null) =>
  TOOLS.some((tool) => tool.id === toolId && tool.group === "games");

const isEnhanceTool = (toolId: string | null) =>
  TOOLS.some((tool) => tool.id === toolId && tool.group === "enhance");

const isAdvancedTool = (toolId: string | null) =>
  TOOLS.some((tool) => tool.id === toolId && tool.group === "more");

const isLocalizedTool = (toolId: string | null) =>
  TOOLS.some((tool) => tool.id === toolId && tool.group === "localize");

const isTextTool = (toolId: string | null) =>
  TOOLS.some((tool) => tool.id === toolId && tool.group === "text");

const getOrderedSizeOptions = (
  options: string[] | undefined,
  selectedModelId: string | undefined,
) => {
  const resolvedOptions = [...(options ?? [])];
  if (selectedModelId !== GEMINI_3_1_FLASH_MODEL_ID) {
    return resolvedOptions;
  }

  const sizePriority = new Map([
    ["512k", 0],
    ["1k", 1],
    ["2k", 2],
    ["4k", 3],
  ]);

  return resolvedOptions.sort((left, right) => {
    const leftPriority = sizePriority.get(left.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = sizePriority.get(right.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority;
  });
};

interface ToolPanelProps {
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  isProcessing: boolean;
  onCancelProcessing: () => void;
  onToolSelect: (toolId: string | null) => void;
  referenceImageCount: number;
  hasTargetImage: boolean;
  targetImageResolution?: { width: number; height: number } | null;
  isAuthenticated: boolean;
  modelByTool: Record<string, string>;
  reasoningByTool: Record<string, ModelReasoningLevel>;
  measuredStatsByKey: Record<string, MeasuredStats>;
  onToolModelChange: (toolId: string, modelId: string) => void;
  onToolReasoningChange: (toolId: string, level: ModelReasoningLevel) => void;
  activeToolId: string | null;
  paramsByTool: ToolParamsById;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
  selectedArtStyleId: string | null;
  onArtStyleChange: (styleId: string) => void;
}
type IdleFriendlyWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
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

// Commit text changes immediately so validation and button state update while typing.

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
  const isFocusedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  // Sync external value changes to draft (e.g., when loading persisted state).
  // While the field is focused the local draft is authoritative: commits run
  // through startTransition, so the parent echoes `value` back asynchronously
  // and lagging behind fast typing. Accepting those stale echoes here would
  // revert characters and snap the caret to the end. Only re-sync when the
  // user is not actively editing.
  useEffect(() => {
    if (isFocusedRef.current) return;
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
      startTransition(() => {
        commitRef.current(nextValue);
      });
    },
    [],
  );

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      isFocusedRef.current = false;
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
      const clamped = Math.max(minimumHeight, Math.min(Math.round(stored), maxReasonable));
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
      onFocus={handleFocus}
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
  targetImageResolution,
  isAuthenticated,
  modelByTool,
  reasoningByTool,
  measuredStatsByKey,
  onToolModelChange,
  onToolReasoningChange,
  activeToolId,
  paramsByTool,
  onParamChange,
  selectedArtStyleId,
  onArtStyleChange,
}) => {
  const muiTheme = useTheme();
  const selectionTimingRef = useRef<string | null>(null);
  const resolvedActiveToolId = activeToolId;
  const [isLocalizeOpen, setIsLocalizeOpen] = useState(() => isLocalizedTool(activeToolId));
  const [isTextOpen, setIsTextOpen] = useState(() => isTextTool(activeToolId));
  const [isGamesOpen, setIsGamesOpen] = useState(() => isGamesTool(activeToolId));
  const [isEnhanceOpen, setIsEnhanceOpen] = useState(() => isEnhanceTool(activeToolId));
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(() => isAdvancedTool(activeToolId));

  useEffect(() => {
    if (isLocalizedTool(activeToolId)) {
      setIsLocalizeOpen(true);
    }
    if (isTextTool(activeToolId)) {
      setIsTextOpen(true);
    }
    if (isGamesTool(activeToolId)) {
      setIsGamesOpen(true);
    }
    if (isEnhanceTool(activeToolId)) {
      setIsEnhanceOpen(true);
    }
    if (isAdvancedTool(activeToolId)) {
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
            excludeIds: param.excludeArtStyleIds,
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
      const toolPanel = document.querySelector(`[data-tool-id="${resolvedActiveToolId}"]`);
      if (toolPanel) {
        const firstInput = toolPanel.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]), textarea',
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
    [onParamChange],
  );

  const defaultTools = useMemo(
    () => TOOLS.filter((tool) => (tool.group ?? "default") === "default"),
    [],
  );

  const localizedTools = useMemo(
    () =>
      TOOLS.filter((tool) => tool.group === "localize").sort(
        (left, right) =>
          LOCALIZE_TOOL_ORDER.indexOf(left.id as (typeof LOCALIZE_TOOL_ORDER)[number]) -
          LOCALIZE_TOOL_ORDER.indexOf(right.id as (typeof LOCALIZE_TOOL_ORDER)[number]),
      ),
    [],
  );

  const textTools = useMemo(() => TOOLS.filter((tool) => tool.group === "text"), []);

  const gamesTools = useMemo(() => TOOLS.filter((tool) => tool.group === "games"), []);

  const enhanceTools = useMemo(() => TOOLS.filter((tool) => tool.group === "enhance"), []);

  const advancedTools = useMemo(() => TOOLS.filter((tool) => tool.group === "more"), []);

  const hasUnfilledRequiredParams = (tool: ToolDefinition) => {
    const toolParams = paramsByTool[tool.id] || {};
    return tool.parameters.some((param) => {
      if (param.optional) {
        return false;
      }
      if (param.type === "checkbox") {
        return false;
      }
      if (param.type === "art-style") {
        const stylesForPicker = getArtStylesByCategories(param.artStyleCategories, {
          excludeNone: param.excludeNoneStyle,
          excludeIds: param.excludeArtStyleIds,
        });
        const candidate = toolParams[param.name] ?? param.defaultValue ?? selectedArtStyleId ?? "";
        if (!candidate.trim()) {
          return true;
        }
        const hasMatch = stylesForPicker.some((style) => style.id === candidate);
        return !hasMatch;
      }
      return !toolParams[param.name]?.trim();
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>, tool: ToolDefinition) => {
    event.preventDefault();
    if (isProcessing) return;
    const payload: Record<string, string> = {
      ...paramsByTool[tool.id],
    };

    const formData = new FormData(event.currentTarget);
    formData.forEach((formValue, key) => {
      if (typeof formValue === "string") {
        payload[key] = formValue;
      }
    });

    tool.parameters.forEach((param) => {
      if (param.type === "art-style") {
        const styleValue = payload[param.name] ?? param.defaultValue ?? selectedArtStyleId ?? "";
        payload[param.name] = styleValue;
      }
    });

    onApplyTool(tool.id, payload);
  };

  const renderParameterField = useCallback(
    (tool: ToolDefinition, param: ToolParameter, value: string) => {
      const inputTestId = `input-${param.name}`;
      // Aspect-ratio / size widgets depend on the model this specific tool runs on.
      const toolModel = getModelInfoById(resolveToolModelId(tool, modelByTool));

      if (param.type === "art-style") {
        const storedValue = value;
        const cacheKey = `${tool.id}:${param.name}`;
        const stylesForPicker =
          artStyleOptionsByParam.get(cacheKey) ??
          getArtStylesByCategories(param.artStyleCategories, {
            excludeNone: param.excludeNoneStyle,
            excludeIds: param.excludeArtStyleIds,
          });
        const pickerValue = storedValue || param.defaultValue || selectedArtStyleId || "";

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
              disabled={isProcessing || stylesForPicker.length === 0 || ART_STYLES.length === 0}
              data-testid={inputTestId}
            />
          </Stack>
        );
      }

      if (param.type === "textarea") {
        const persistHeightKey = `bloom-ai-image-tools:textarea-height:${tool.id}:${param.name}`;
        // "Further Instructions" is an optional refinement field — render it
        // de-emphasized (about 50% more transparent) so it sits behind the
        // primary controls.
        const isFurtherInstructions = param.name === "furtherInstructions";
        const field = (
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
            onCommit={(nextValue) => handleParamChange(tool.id, param.name, nextValue)}
          />
        );
        if (isFurtherInstructions) {
          return (
            <Box key={param.name} sx={{ opacity: 0.5 }}>
              {field}
            </Box>
          );
        }
        return field;
      }

      if (param.type === "checkbox") {
        const checked = value === "true";
        return (
          <FormControlLabel
            key={param.name}
            className="bloom-checkbox-label"
            control={
              <Checkbox
                checked={checked}
                name={param.name}
                value="true"
                onChange={(event) =>
                  handleParamChange(tool.id, param.name, String(event.target.checked))
                }
                disabled={isProcessing}
                inputProps={
                  {
                    "data-testid": inputTestId,
                  } as React.InputHTMLAttributes<HTMLInputElement>
                }
              />
            }
            label={param.label}
            sx={{ color: muiTheme.palette.text.primary, ml: 0 }}
          />
        );
      }

      if (param.type === "aspect-ratio") {
        const isEditTool = tool.editImage !== false;
        const supportedAspectRatios = toolModel?.supportedAspectRatios;
        const fallbackValue = isEditTool
          ? AUTO_ASPECT_RATIO
          : getDefaultAspectRatioValue(supportedAspectRatios) || DEFAULT_CREATE_ASPECT_RATIO;
        const rawAspectRatioValue = value || param.defaultValue || fallbackValue;
        const aspectRatioValue =
          isEditTool && rawAspectRatioValue === AUTO_ASPECT_RATIO
            ? AUTO_ASPECT_RATIO
            : resolveAspectRatioValue(rawAspectRatioValue, undefined, supportedAspectRatios);
        return (
          <AspectRatioPicker
            key={param.name}
            value={aspectRatioValue}
            onChange={(newValue) => handleParamChange(tool.id, param.name, newValue)}
            disabled={isProcessing}
            label={param.label}
            allowAuto={isEditTool}
            autoResolvedValue={resolveAspectRatioValue(
              AUTO_ASPECT_RATIO,
              targetImageResolution,
              supportedAspectRatios,
            )}
            options={supportedAspectRatios}
          />
        );
      }

      if (param.type === "size") {
        const sizeOptions = getOrderedSizeOptions(param.options, toolModel?.id);
        const shouldPreferModelDefault =
          toolModel?.id === GEMINI_3_1_FLASH_MODEL_ID && (!value || value === param.defaultValue);
        const sizeValue = shouldPreferModelDefault
          ? sizeOptions[0] || param.defaultValue || ""
          : value || sizeOptions[0] || param.defaultValue || "";
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
              onChange={(event) => handleParamChange(tool.id, param.name, event.target.value)}
              name={param.name}
              size="small"
              disabled={isProcessing}
              inputProps={{ "data-testid": inputTestId }}
              SelectProps={{
                MenuProps: { disablePortal: false },
                displayEmpty: false,
              }}
            >
              {sizeOptions.map((option) => (
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
            onChange={(event) => handleParamChange(tool.id, param.name, event.target.value)}
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
          onCommit={(nextValue) => handleParamChange(tool.id, param.name, nextValue)}
        />
      );
    },
    [
      artStyleOptionsByParam,
      isProcessing,
      muiTheme.palette.text.secondary,
      onArtStyleChange,
      selectedArtStyleId,
      modelByTool,
      handleParamChange,
      targetImageResolution,
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

  // The output-size token this tool would request right now, so the model
  // picker can look up the remembered cost/time for that exact size. Mirrors
  // the resolution in ImageToolsWorkspace.handleApplyTool.
  const resolveToolSizeToken = (tool: ToolDefinition): string => {
    const sizeParam = tool.parameters.find((param) => param.type === "size");
    if (sizeParam) {
      return (
        paramsByTool[tool.id]?.[sizeParam.name] || sizeParam.defaultValue || DEFAULT_SIZE_TOKEN
      );
    }
    if (tool.autoSizeFromInput && targetImageResolution?.width && targetImageResolution?.height) {
      return pickSizeTokenForLongEdge(
        Math.max(targetImageResolution.width, targetImageResolution.height),
      );
    }
    return DEFAULT_SIZE_TOKEN;
  };

  const renderToolCard = (tool: ToolDefinition) => {
    const isSelected = resolvedActiveToolId === tool.id;
    const requiresOpenRouter =
      tool.id !== "remove_background" &&
      !tool.localOnly &&
      !canUseLocalDummyModelWithoutApiKey(resolveToolModelId(tool, modelByTool));
    const referenceConstraints = getReferenceConstraints(tool.referenceImages);
    const needsReference = referenceConstraints.min > referenceImageCount;
    const needsTarget = toolRequiresEditImage(tool) && !hasTargetImage;
    const missingRequired = hasUnfilledRequiredParams(tool);
    const requiresDescriptionOrReference =
      tool.id === "game_theme_generator" &&
      !(paramsByTool[tool.id]?.description?.trim() || referenceImageCount > 0);
    const submitDisabledReason = needsTarget
      ? "Add an image to edit -->"
      : needsReference
        ? "Add reference image"
        : requiresDescriptionOrReference
          ? "Add a description or reference image"
          : missingRequired
            ? "Fill in required fields"
            : undefined;
    const isSubmitDisabled =
      isProcessing ||
      (requiresOpenRouter && !isAuthenticated) ||
      needsTarget ||
      needsReference ||
      requiresDescriptionOrReference ||
      missingRequired;

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
          position: "relative",
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
        {isSelected && !tool.localOnly && (
          <Box sx={{ position: "absolute", top: 14, right: 10, zIndex: 2 }}>
            <ToolModelPicker
              tool={tool}
              modelByTool={modelByTool}
              reasoningByTool={reasoningByTool}
              measuredStatsByKey={measuredStatsByKey}
              sizeToken={resolveToolSizeToken(tool)}
              onModelChange={(modelId) => onToolModelChange(tool.id, modelId)}
              onReasoningChange={(level) => onToolReasoningChange(tool.id, level)}
              disabled={isProcessing}
            />
          </Box>
        )}
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
            alignItems: "start",
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
              <Typography variant="body2" sx={{ mt: 0.5, color: "rgba(255, 247, 236, 0.82)" }}>
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
                  if (param.name === "aspectRatio" && nextParam?.name === "size") {
                    const nextParamValue = toolParams[nextParam.name] ?? "";
                    elements.push(
                      <Box
                        key="aspect-ratio-size-row"
                        sx={{
                          display: "flex",
                          gap: 2,
                          alignItems: "flex-start",
                        }}
                      >
                        <Box sx={{ flex: 1 }}>{renderParameterField(tool, param, paramValue)}</Box>
                        <Box sx={{ width: 80, flexShrink: 0 }}>
                          {renderParameterField(tool, nextParam, nextParamValue)}
                        </Box>
                      </Box>,
                    );
                    i += 2;
                  } else {
                    elements.push(renderParameterField(tool, param, paramValue));
                    i += 1;
                  }
                }
                return elements;
              })()}

              <Stack spacing={1.5}>
                <Button
                  // Always a plain button — never a native submit. If this were
                  // type="submit", clicking it to cancel would flip isProcessing
                  // to false, re-render this same element back to a submit
                  // button mid-click, and the click's default action would then
                  // submit the form — immediately starting a brand-new
                  // generation. Instead we submit the form ourselves below.
                  type="button"
                  variant={isProcessing ? "outlined" : "contained"}
                  color={isProcessing ? "inherit" : "primary"}
                  fullWidth
                  disabled={isProcessing ? false : isSubmitDisabled}
                  title={isProcessing ? undefined : submitDisabledReason}
                  onClick={(event) => {
                    if (isProcessing) {
                      onCancelProcessing();
                      return;
                    }
                    event.currentTarget.closest("form")?.requestSubmit();
                  }}
                  sx={{
                    minHeight: 44,
                    fontWeight: 400,
                    gap: 1,
                    "&.Mui-disabled": {
                      backgroundColor: theme.colors.surfaceRaised,
                      color: theme.colors.textSecondary,
                    },
                  }}
                >
                  {isProcessing ? (
                    <>
                      <CircularProgress size={18} color="inherit" />
                      Click to Cancel
                    </>
                  ) : (
                    <>
                      <span>
                        {tool.actionButtonLabel ||
                          (tool.id === "generate_image" ? "Generate Image" : "Apply Changes")}
                      </span>
                      <Icon path={Icons.ArrowRight} style={{ width: 18, height: 18 }} />
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
        width: { xs: 184, sm: 240, md: 280, lg: 320 },
        flexShrink: 0,
        maxWidth: "100%",
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

        {enhanceTools.length > 0 && (
          <Stack spacing={1.25}>
            <ButtonBase
              onClick={() => setIsEnhanceOpen((current) => !current)}
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
              {renderSectionHeader("Enhance")}
              <ExpandMoreIcon
                sx={{
                  transition: "transform 0.2s ease",
                  transform: isEnhanceOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}
              />
            </ButtonBase>
            {isEnhanceOpen && enhanceTools.map(renderToolCard)}
          </Stack>
        )}

        {localizedTools.length > 0 && (
          <Stack spacing={1.25}>
            <ButtonBase
              onClick={() => setIsLocalizeOpen((current) => !current)}
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
              {renderSectionHeader("Localize")}
              <ExpandMoreIcon
                sx={{
                  transition: "transform 0.2s ease",
                  transform: isLocalizeOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}
              />
            </ButtonBase>
            {isLocalizeOpen && localizedTools.map(renderToolCard)}
          </Stack>
        )}

        {textTools.length > 0 && (
          <Stack spacing={1.25}>
            <ButtonBase
              onClick={() => setIsTextOpen((current) => !current)}
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
              {renderSectionHeader("Text")}
              <ExpandMoreIcon
                sx={{
                  transition: "transform 0.2s ease",
                  transform: isTextOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}
              />
            </ButtonBase>
            {isTextOpen && textTools.map(renderToolCard)}
          </Stack>
        )}

        {gamesTools.length > 0 && (
          <Stack spacing={1.25}>
            <ButtonBase
              onClick={() => setIsGamesOpen((current) => !current)}
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
              {renderSectionHeader("Games")}
              <ExpandMoreIcon
                sx={{
                  transition: "transform 0.2s ease",
                  transform: isGamesOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}
              />
            </ButtonBase>
            {isGamesOpen && gamesTools.map(renderToolCard)}
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
              {renderSectionHeader("More")}
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
