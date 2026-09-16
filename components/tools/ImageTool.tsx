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
  LinearProgress,
  ListItemText,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type {
  BatchRunState,
  MeasuredStats,
  ModelImageQuality,
  ModelInfo,
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
import {
  getReferenceConstraints,
  getRequestedAspectRatioValue,
  toolRequiresEditImage,
  toolRunCallsOpenRouter,
} from "../../lib/toolHelpers";
import {
  getModelInfoById,
  getSizeOptionsForModel,
  getSizeTokenOptionsForModel,
  resolveToolModelId,
  type SizeOption,
  snapPixelsForModel,
} from "../../lib/modelsCatalog";
import { formatPixelSize, type PixelSize } from "../../lib/imageSizes";
import { planImageRequest } from "../../lib/imageRequestPlan";
import {
  estimateToolRunCostUsd,
  type RunCostTarget,
  type ToolRunCostEstimate,
} from "../../lib/toolRunCostEstimate";
import {
  AUTO_SIZE_TOKEN,
  findSizeParam,
  isAutoSizeValue,
  resolveSlotTarget,
  toolCanFollowSlot,
} from "../../lib/slotTarget";
import {
  buildUpscaleOptions,
  describeAutoShapeChange,
  findTargetResolutionParam,
  type UpscaleHostTarget,
} from "../../lib/upscale";
import { ToolModelPicker } from "./ToolModelPicker";
import { formatCost } from "../../lib/formatters";
import { getHighContrastScrollbarStyles, theme } from "../../themes";
import { kWarningColor } from "../materialUITheme";

// Must match the catalog id in data/models-registry.json5 (the stable,
// non-preview key now that OpenRouter has retired the "-preview" key). Keep in
// sync if the registry id changes.
const GEMINI_3_1_FLASH_MODEL_ID = "google/gemini-3.1-flash-image";

const LOCALIZE_TOOL_ORDER = [
  "extract_cast_of_characters",
  "ethnicity",
  "apply_localized_characters",
] as const;
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

// The sizes to offer for the selected model, in the order to offer them.
// Sizes above the model's ceiling are dropped: OpenRouter answers an over-large
// image_size with a 400, so offering one only buys the user an error.
const getOrderedSizeOptions = (
  options: string[] | undefined,
  selectedModelId: string | undefined,
) => {
  const resolvedOptions = getSizeTokenOptionsForModel(options, selectedModelId);
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
  /** Batch runner entry point (PLAN-batch-processing.md WP4): fired instead of
   *  onApplyTool while one or more book images are ticked. */
  onApplyBatchTool: (toolId: string, params: Record<string, string>) => void;
  isProcessing: boolean;
  onCancelProcessing: () => void;
  onToolSelect: (toolId: string | null) => void;
  /**
   * One entry per reference image attached, its pixels when known. The count
   * gates the tools that need a reference; the sizes price the run.
   */
  referenceImageResolutions: (PixelSize | null)[];
  hasTargetImage: boolean;
  targetImageResolution?: { width: number; height: number } | null;
  /** Identity of the image in the "Image to Edit" panel. The JPEG default for
   *  "Remove fuzziness" is re-derived once per image, keyed on this. */
  targetImageId?: string | null;
  /** MIME type the target image arrived as, when known. */
  targetImageMime?: string | null;
  /** The resolution the host says the target image's book slot wants, which is
   *  the Upscale selector's "Auto" option. */
  targetImageSuggestedTarget?: UpscaleHostTarget | null;
  isAuthenticated: boolean;
  /** Look-around mode: the tools are all on show, but none of them can be run. */
  playgroundMode?: boolean;
  modelByTool: Record<string, string>;
  reasoningByTool: Record<string, ModelReasoningLevel>;
  qualityByTool: Record<string, ModelImageQuality>;
  measuredStatsByKey: Record<string, MeasuredStats>;
  onToolModelChange: (toolId: string, modelId: string) => void;
  onToolReasoningChange: (toolId: string, level: ModelReasoningLevel) => void;
  onToolQualityChange: (toolId: string, quality: ModelImageQuality) => void;
  activeToolId: string | null;
  paramsByTool: ToolParamsById;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
  selectedArtStyleId: string | null;
  onArtStyleChange: (styleId: string) => void;
  /** Count of book images currently ticked for a batch run (see
   *  PLAN-batch-processing.md WP3). >0 morphs the action button's label and
   *  cost estimate for any tool card that supports batch. */
  batchTickedCount?: number;
  /**
   * The ticked images' own sizes and slot targets, one per tick, so the batch
   * estimate can price each image's edit at its own size. Defaults to unknown
   * sizes for every tick when absent.
   */
  batchTargets?: RunCostTarget[];
  /** Live batch progress (PLAN-batch-processing.md WP5). While set and
   *  `isProcessing` is true, the active tool card's action-button area shows
   *  a determinate progress bar + Cancel instead of the generic
   *  "Click to Cancel" button. */
  batchRun?: BatchRunState | null;
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
  onApplyBatchTool,
  isProcessing,
  onCancelProcessing,
  onToolSelect,
  referenceImageResolutions,
  hasTargetImage,
  targetImageResolution,
  targetImageId,
  targetImageMime,
  targetImageSuggestedTarget,
  isAuthenticated,
  playgroundMode = false,
  modelByTool,
  reasoningByTool,
  qualityByTool,
  measuredStatsByKey,
  onToolModelChange,
  onToolReasoningChange,
  onToolQualityChange,
  activeToolId,
  paramsByTool,
  onParamChange,
  selectedArtStyleId,
  onArtStyleChange,
  batchTickedCount = 0,
  batchTargets,
  batchRun = null,
}) => {
  const muiTheme = useTheme();
  const referenceImageCount = referenceImageResolutions.length;
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
    if (selectionTimingRef.current && selectionTimingRef.current !== timingLabel) {
      if (typeof console !== "undefined" && console.timeEnd) {
        console.timeEnd(selectionTimingRef.current);
      }
      selectionTimingRef.current = null;
    }

    if (selectionTimingRef.current === timingLabel) {
      if (typeof console !== "undefined" && console.timeEnd) {
        console.timeEnd(timingLabel);
      }
      selectionTimingRef.current = null;
    }

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

  // "Remove fuzziness" defaults on for a JPEG source (JPEG is where the
  // artifacts come from) and off for anything else. Derived once per target
  // image, so a user's own toggle stands until they switch images. An undefined
  // mime means "not determined yet" (a book image's bytes are still being
  // fetched), which must not be read as "not a JPEG".
  const fuzzinessDefaultAppliedForImageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetImageId || targetImageMime === undefined) return;
    if (fuzzinessDefaultAppliedForImageIdRef.current === targetImageId) return;
    fuzzinessDefaultAppliedForImageIdRef.current = targetImageId;

    const nextValue = String(targetImageMime === "image/jpeg");
    TOOLS.forEach((tool) => {
      if (!findTargetResolutionParam(tool.parameters)) return;
      if (!tool.parameters.some((param) => param.name === "removeFuzziness")) return;
      onParamChange(tool.id, "removeFuzziness", nextValue);
    });
  }, [targetImageId, targetImageMime, onParamChange]);

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
      // Both always resolve to a value: a checkbox is either ticked or not, and
      // the resolution selector falls back to HD for any token it doesn't know.
      if (param.type === "checkbox" || param.type === "target-resolution") {
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

  // What a run of this tool would ask for if it followed the book slot Bloom
  // described for the target image, or null when it would not (no slot, a tool
  // that makes something other than the slot's picture, or a hand-picked size).
  // The size and shape controls and the cost lookup all read the same answer.
  const resolveSlotForTool = useCallback(
    (tool: ToolDefinition, toolModel: ModelInfo | null) =>
      resolveSlotTarget({
        tool,
        params: paramsByTool[tool.id],
        hostTarget: targetImageSuggestedTarget,
        requestedAspectRatio: getRequestedAspectRatioValue(tool, paramsByTool[tool.id]),
        supportedAspectRatios: toolModel?.supportedAspectRatios,
      }),
    [paramsByTool, targetImageSuggestedTarget],
  );

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
        // While a tool with a size picker is on Auto inside Bloom, the whole
        // request follows the book slot, shape included, so the shape control
        // shows the slot's shape and takes no input (see lib/slotTarget.ts).
        const slot = findSizeParam(tool.parameters) ? resolveSlotForTool(tool, toolModel) : null;
        return (
          <Stack key={param.name} spacing={0.5}>
            <AspectRatioPicker
              value={slot ? slot.aspectRatio : aspectRatioValue}
              onChange={(newValue) => handleParamChange(tool.id, param.name, newValue)}
              disabled={isProcessing || !!slot}
              label={param.label}
              allowAuto={isEditTool}
              autoResolvedValue={resolveAspectRatioValue(
                AUTO_ASPECT_RATIO,
                targetImageResolution,
                supportedAspectRatios,
              )}
              options={supportedAspectRatios}
            />
            {slot && (
              <FormHelperText data-testid="aspect-ratio-follows-slot" sx={{ m: 0 }}>
                Follows the book slot while Size is Auto.
              </FormHelperText>
            )}
          </Stack>
        );
      }

      if (param.type === "size") {
        // Every option is the tier's name, so the picker reads the same on
        // every model. A pixel-size model (GPT Image 2.5) also shows the pixels
        // each tier will be sent in the shape this tool would request, since
        // its "4k" is 2880x2880 for a square; tiers that land on the same
        // pixels are offered once. Inside Bloom, an Auto entry at the top is
        // the book slot's size and the default (see lib/slotTarget.ts).
        const slot = resolveSlotForTool(tool, toolModel);
        const slotAvailable = !!targetImageSuggestedTarget && toolCanFollowSlot(tool);
        const shapeForPixels =
          slot?.aspectRatio ??
          resolveAspectRatioValue(
            getRequestedAspectRatioValue(tool, paramsByTool[tool.id]),
            targetImageResolution,
            toolModel?.supportedAspectRatios,
          );
        const optionByToken = new Map<string, SizeOption>(
          getSizeOptionsForModel(param.options, toolModel?.id, shapeForPixels).map((option) => [
            option.token,
            option,
          ]),
        );
        const tierTokens = getOrderedSizeOptions(param.options, toolModel?.id).filter((token) =>
          optionByToken.has(token),
        );
        const slotPixels = slotAvailable
          ? snapPixelsForModel(toolModel?.id, targetImageSuggestedTarget ?? null)
          : null;
        const sizeOptions: SizeOption[] = [
          ...(slotAvailable
            ? [
                {
                  token: AUTO_SIZE_TOKEN,
                  label: "Auto",
                  pixels: slotPixels ? formatPixelSize(slotPixels) : undefined,
                },
              ]
            : []),
          ...tierTokens.map((token) => optionByToken.get(token)!),
        ];
        // Auto with no slot to follow shows the smallest tier, which is what it
        // sends. A remembered tier can be above the current model's ceiling
        // (the user picked 4k under one model, then switched); fall back to
        // Auto or the first offered tier rather than a value the model rejects.
        const firstTier = tierTokens[0] ?? "";
        const sizeValue = isAutoSizeValue(value)
          ? slotAvailable
            ? AUTO_SIZE_TOKEN
            : firstTier
          : tierTokens.includes(value)
            ? value
            : slotAvailable
              ? AUTO_SIZE_TOKEN
              : firstTier;
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
                // The closed picker shows only the tier's name; the pixels are
                // detail for the open list, where there is room for them.
                renderValue: (selected) =>
                  sizeOptions.find((option) => option.token === selected)?.label ??
                  String(selected),
              }}
            >
              {sizeOptions.map((option) => (
                <MenuItem key={option.token} value={option.token}>
                  <ListItemText
                    primary={option.label}
                    secondary={option.pixels}
                    sx={{ my: 0, "& .MuiListItemText-secondary": { fontSize: "0.75rem" } }}
                  />
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        );
      }

      if (param.type === "target-resolution") {
        // Labeled with what the selected model will be sent: a pixel-size
        // model has an edge cap and a pixel budget, so its "4K" reads the
        // size inside them, not 4096.
        const options = buildUpscaleOptions(
          targetImageResolution,
          targetImageSuggestedTarget,
          (dimensions) => snapPixelsForModel(toolModel?.id, dimensions),
        );
        // The stored token can name an option this image doesn't offer (a slot
        // with no host target, after one that had it), so fall back to the
        // first option rather than showing an empty select.
        const selectedToken = options.some((option) => option.token === value)
          ? value
          : options[0]?.token || "hd";
        const memo = targetImageSuggestedTarget?.memo?.trim();
        // The memo is the host's own words about the slot, so it quotes the
        // slot's size. Auto asks for the same detail in the image's shape,
        // which is a different pair of numbers whenever the two shapes differ.
        const shapeNote = describeAutoShapeChange(
          options.find((option) => option.token === "auto")?.dimensions,
          targetImageSuggestedTarget,
        );
        return (
          <Stack key={param.name} spacing={0.75}>
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
              value={selectedToken}
              onChange={(event) => handleParamChange(tool.id, param.name, event.target.value)}
              name={param.name}
              fullWidth
              size="small"
              // With nothing to upscale the labels carry no dimensions, so
              // there is nothing to choose between yet. Batch ticks stand in
              // for a target image, same as the run button's own gate.
              disabled={isProcessing || (!hasTargetImage && batchTickedCount === 0)}
              inputProps={{ "data-testid": inputTestId }}
              SelectProps={{
                MenuProps: { disablePortal: false },
                displayEmpty: false,
              }}
            >
              {options.map((option) => (
                <MenuItem key={option.token} value={option.token}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            {memo && (
              <FormHelperText data-testid="upscale-target-memo" sx={{ m: 0 }}>
                {memo}
              </FormHelperText>
            )}
            {shapeNote && (
              <FormHelperText data-testid="upscale-shape-note" sx={{ m: 0 }}>
                {shapeNote}
              </FormHelperText>
            )}
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
      // The size picker's pixel line and the shape control's slot state read
      // the tool's other params (its shape, its size), so they must re-render
      // when any param changes.
      paramsByTool,
      resolveSlotForTool,
      targetImageResolution,
      targetImageSuggestedTarget,
      hasTargetImage,
      batchTickedCount,
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
  // picker can look up the remembered time for that exact size. The same
  // planner builds the real request in lib/runToolOnImage.ts.
  const resolveToolSizeToken = (tool: ToolDefinition): string => {
    const toolModel = getModelInfoById(resolveToolModelId(tool, modelByTool));
    return planImageRequest({
      tool,
      params: paramsByTool[tool.id],
      toolModel,
      requiresEditImage: toolRequiresEditImage(tool),
      targetImageResolution,
      hostTarget: targetImageSuggestedTarget,
      autoSizeResolution: tool.autoSizeFromInput ? targetImageResolution : null,
    }).sizeToken;
  };

  // What one run of this tool on this model would cost for the given image to
  // edit (null for none), with the references currently attached. Null when
  // the run costs nothing we can price (see estimateToolRunCostUsd).
  const estimateForTool = (
    tool: ToolDefinition,
    modelId: string,
    target: RunCostTarget | null,
  ): ToolRunCostEstimate | null =>
    estimateToolRunCostUsd({
      tool,
      toolModel: getModelInfoById(modelId),
      params: paramsByTool[tool.id],
      target,
      referenceResolutions: referenceImageResolutions.slice(
        0,
        getReferenceConstraints(tool.referenceImages).max,
      ),
    });

  const renderToolCard = (tool: ToolDefinition) => {
    const isSelected = resolvedActiveToolId === tool.id;
    // Any tick means batch semantics for this tool, even N=1 (see Agreed UX in
    // PLAN-batch-processing.md): the ticked images stand in for a single target
    // image, so the usual "needs a target image" gate doesn't apply.
    const isBatchModeForTool = batchTickedCount > 0 && !!tool.allowBatch;
    // Look-around mode blocks every run; needing an OpenRouter account blocks only the
    // tools whose run would reach it.
    const blockedByPlaygroundMode = !!playgroundMode;
    const requiresOpenRouter = toolRunCallsOpenRouter(tool, resolveToolModelId(tool, modelByTool));
    const referenceConstraints = getReferenceConstraints(tool.referenceImages);
    const needsReference = referenceConstraints.min > referenceImageCount;
    const needsTarget = toolRequiresEditImage(tool) && !hasTargetImage && !isBatchModeForTool;
    const missingRequired = hasUnfilledRequiredParams(tool);
    const requiresDescriptionOrReference =
      tool.id === "game_theme_generator" &&
      !(paramsByTool[tool.id]?.description?.trim() || referenceImageCount > 0);
    const submitDisabledReason = blockedByPlaygroundMode
      ? "Not available in look-around mode"
      : needsTarget
        ? "Add an image to edit"
        : needsReference
          ? "Add reference image"
          : requiresDescriptionOrReference
            ? "Add a description or reference image"
            : missingRequired
              ? "Fill in required fields"
              : undefined;
    const isSubmitDisabled =
      isProcessing ||
      blockedByPlaygroundMode ||
      (requiresOpenRouter && !isAuthenticated) ||
      needsTarget ||
      needsReference ||
      requiresDescriptionOrReference ||
      missingRequired;

    // "Make Coloring Page for 7 Images" when the tool has its own verb, else
    // the generic "Apply Changes to N Images" (see Agreed UX / WP3 notes).
    const batchButtonLabel = tool.actionButtonLabel
      ? `${tool.actionButtonLabel} for ${batchTickedCount} Image${batchTickedCount === 1 ? "" : "s"}`
      : `Apply Changes to ${batchTickedCount} Image${batchTickedCount === 1 ? "" : "s"}`;
    // Batch: each ticked image priced at its own size, then summed. A tick with
    // no target details yet (the array is shorter than the count) is priced as
    // an image of unknown size. Single run: the one image to edit, if any.
    const toolModelId = resolveToolModelId(tool, modelByTool);
    let estimatedBatchCost: number | null = null;
    if (isBatchModeForTool) {
      const targets: (RunCostTarget | null)[] = Array.from(
        { length: batchTickedCount },
        (_, index) => batchTargets?.[index] ?? null,
      );
      let sum = 0;
      for (const target of targets) {
        const estimate = estimateForTool(tool, toolModelId, target);
        if (!estimate) {
          sum = NaN;
          break;
        }
        sum += estimate.usd;
      }
      estimatedBatchCost = Number.isFinite(sum) ? sum : null;
    }
    const singleRunEstimate =
      !isBatchModeForTool && requiresOpenRouter
        ? estimateForTool(
            tool,
            toolModelId,
            hasTargetImage
              ? {
                  resolution: targetImageResolution ?? null,
                  suggestedTarget: targetImageSuggestedTarget ?? null,
                }
              : null,
          )
        : null;
    // Only a token-priced estimate earns a line under the button: a fixed
    // per-image price already reads on the model's own menu row and would
    // just repeat itself here.
    const singleRunCostUsd = singleRunEstimate?.kind === "token" ? singleRunEstimate.usd : null;

    const cardBackground = "linear-gradient(180deg, #212741 0%, #191f34 100%)";
    const cardBorderColor = isSelected ? theme.colors.focus : "transparent";
    const cardBorderWidth = isSelected ? 2 : 0;
    const labelColor = theme.colors.textPrimary;
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
            ? `0 0 0 2px color-mix(in srgb, ${theme.colors.focus} 42%, transparent), 0 0 24px color-mix(in srgb, ${theme.colors.accentHover} 32%, transparent), 0 10px 24px rgba(8,10,20,0.2), inset 0 1px 0 rgba(255,255,255,0.07)`
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
              qualityByTool={qualityByTool}
              measuredStatsByKey={measuredStatsByKey}
              sizeToken={resolveToolSizeToken(tool)}
              hostTarget={targetImageSuggestedTarget ?? null}
              estimateRunCostUsd={(modelId) => {
                // The menu prices every row for the run the button would make:
                // each ticked image in batch mode, else the one image to edit.
                const targets: (RunCostTarget | null)[] = isBatchModeForTool
                  ? Array.from(
                      { length: batchTickedCount },
                      (_, index) => batchTargets?.[index] ?? null,
                    )
                  : [
                      hasTargetImage
                        ? {
                            resolution: targetImageResolution ?? null,
                            suggestedTarget: targetImageSuggestedTarget ?? null,
                          }
                        : null,
                    ];
                let sum = 0;
                for (const target of targets) {
                  const estimate = estimateForTool(tool, modelId, target);
                  if (estimate?.kind !== "token") return null;
                  sum += estimate.usd;
                }
                return sum;
              }}
              onModelChange={(modelId) => onToolModelChange(tool.id, modelId)}
              onReasoningChange={(level) => onToolReasoningChange(tool.id, level)}
              onQualityChange={(quality) => onToolQualityChange(tool.id, quality)}
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
              <Typography variant="body2" sx={{ mt: 0.5, color: theme.colors.textSecondary }}>
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
                {needsTarget && !isProcessing ? (
                  // When there's no image to edit yet, replace the action
                  // button entirely with the prompt (and a real arrow pointing
                  // at the image panel) rather than showing a disabled button.
                  <FormHelperText
                    component="div"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.75,
                      m: 0,
                      minHeight: 44,
                      textAlign: "center",
                      fontSize: "1rem",
                      color: muiTheme.palette.error.main,
                    }}
                  >
                    <span>{submitDisabledReason}</span>
                    <Icon path={Icons.ArrowRight} style={{ width: 18, height: 18 }} />
                  </FormHelperText>
                ) : isProcessing && batchRun ? (
                  // A batch run in progress morphs the action-button area into
                  // a determinate progress bar + Cancel (PLAN-batch-processing.md
                  // WP5), replacing the generic "Click to Cancel" button.
                  <Stack spacing={1}>
                    <Typography
                      variant="body2"
                      data-testid="batch-progress-label"
                      sx={{ textAlign: "center", color: kWarningColor }}
                    >
                      Processed {batchRun.completed} of {batchRun.total}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={batchRun.total > 0 ? (batchRun.completed / batchRun.total) * 100 : 0}
                      data-testid="batch-progress-bar"
                      sx={{
                        borderRadius: 999,
                        height: 6,
                        backgroundColor: "rgba(214, 86, 73, 0.25)",
                        "& .MuiLinearProgress-bar": {
                          backgroundColor: kWarningColor,
                        },
                      }}
                    />
                    <Button
                      type="button"
                      variant="outlined"
                      fullWidth
                      data-testid="batch-progress-cancel-button"
                      onClick={onCancelProcessing}
                      sx={{
                        minHeight: 40,
                        fontWeight: 400,
                        color: kWarningColor,
                        borderColor: kWarningColor,
                        "&:hover": {
                          borderColor: kWarningColor,
                          backgroundColor: "rgba(214, 86, 73, 0.12)",
                        },
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                ) : (
                  <>
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
                        if (isBatchModeForTool) {
                          // Ticking images runs a separate, sequential
                          // per-image code path (WP4) rather than the
                          // single-image apply flow below — there's no target
                          // image and no submit event to read a FormData from,
                          // so build the payload straight off paramsByTool
                          // (every field type but text/textarea already
                          // commits synchronously; those commit on
                          // change/blur, same source handleSubmit uses to
                          // seed its own payload before FormData overrides).
                          const batchPayload: Record<string, string> = {
                            ...paramsByTool[tool.id],
                          };
                          tool.parameters.forEach((param) => {
                            if (param.type === "art-style") {
                              batchPayload[param.name] =
                                batchPayload[param.name] ??
                                param.defaultValue ??
                                selectedArtStyleId ??
                                "";
                            }
                          });
                          onApplyBatchTool(tool.id, batchPayload);
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
                      ) : isBatchModeForTool ? (
                        <span>{batchButtonLabel}</span>
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
                    {isBatchModeForTool && estimatedBatchCost != null && (
                      <FormHelperText
                        data-testid="batch-cost-estimate"
                        sx={{ textAlign: "center", fontSize: "0.85rem" }}
                      >
                        Estimated cost: {formatCost(estimatedBatchCost)}
                      </FormHelperText>
                    )}
                    {!isBatchModeForTool && !isProcessing && singleRunCostUsd != null && (
                      <FormHelperText
                        data-testid="run-cost-estimate"
                        sx={{ textAlign: "center", fontSize: "0.85rem" }}
                      >
                        Estimate {formatCost(singleRunCostUsd)}
                      </FormHelperText>
                    )}
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
                  </>
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
          ...getHighContrastScrollbarStyles(),
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
