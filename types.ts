import type { ElementType, ReactNode } from "react";

export interface ToolParameter {
  name: string;
  label: string;
  type: "text" | "select" | "textarea" | "art-style" | "aspect-ratio" | "size" | "checkbox";
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  optional?: boolean;
  artStyleCategories?: string[];
  /** When true, the "None" art style option is excluded (for art-style type only). */
  excludeNoneStyle?: boolean;
  /** Art style IDs to omit from the picker (for art-style type only). */
  excludeArtStyleIds?: string[];
}

export type ToolParams = Record<string, string>;
export type ToolParamsById = Record<string, ToolParams>;

export type ToolDerivedResultMode = "split-images" | "animated-gif";

export interface GeneratedTextResult {
  toolId: string;
  text: string;
  durationMs: number;
  cost: number;
  model: string;
  promptUsed: string;
}

export type ModelReasoningLevel = "default" | "none" | "low" | "medium" | "high";

/**
 * Last-measured generation cost and duration for a tool/model/reasoning/size
 * combination. Time scales roughly with price, so both live under one key.
 */
export interface MeasuredStats {
  cost: number;
  durationMs: number;
}

export interface ModelInfo {
  id: string;
  /**
   * Optional fallback OpenRouter model key. We send both `id` and `fallbackId`
   * to OpenRouter as a `models` array, and OpenRouter uses the first one that
   * works. This mainly handles the "preview" lifecycle: a model is first
   * published under a `...-preview` key and later republished without it. By
   * listing the successor key here, the app keeps working when the preview key
   * is retired — no code change needed.
   */
  fallbackId?: string;
  name: string;
  description: string;
  pricing: string;
  default?: boolean;
  badge?: string;
  initialReasoningLevel?: ModelReasoningLevel;
  supportedAspectRatios?: string[];
}

export interface ArtStyleDefinition {
  id: string;
  name: string;
  promptDetail: string;
  description: string;
  samplePageUrl?: string;
  sampleImageUrl?: string;
  categories?: string[];
}

export interface ArtStyle extends ArtStyleDefinition {
  previewUrl?: string | null;
  /** Internal asset key used to lazily resolve local preview files. */
  previewAssetKey?: string | null;
}

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  group?: "default" | "enhance" | "localize" | "text" | "games" | "more";
  icon: ElementType;
  parameters: ToolParameter[];
  promptTemplate: (params: Record<string, string>) => string;
  actionButtonLabel?: string;
  referenceImages: "0" | "0+" | "1" | "1+";
  outputType?: "image" | "text";
  /**
   * Models this tool may run on, in display order. The first recommended model
   * (see `recommendedModelIds`) is the default; the user can switch to any other
   * id in this list. When omitted, the tool falls back to the shared default
   * list (all image-capable catalog models, Gemini 3.1 Flash recommended).
   */
  modelIds?: string[];
  /**
   * Ordered subset of `modelIds` considered "recommended". May be empty (no
   * preference). The first entry is the tool's default model. Options are shown
   * default-first, then other recommended models, then remaining allowed ones.
   */
  recommendedModelIds?: string[];
  /**
   * Model ids to exclude for this tool even when they're in the default list
   * (e.g. a model that produces bad results for this specific task).
   */
  disallowedModelIds?: string[];
  editImage?: boolean; // Defaults to true; false means tool generates without editing a base image
  /**
   * Tool runs entirely in the browser with no OpenRouter call (e.g. PDF page
   * rasterization). Local tools don't require authentication and bypass the
   * normal generation pipeline in ImageToolsWorkspace.handleApplyTool.
   */
  localOnly?: boolean;
  /** Optional post-processing pipeline (run sequentially on the returned image). */
  postProcessingFunctions?: string[];
  /** Optional derived output handling for tools that split a generated sheet into assets. */
  derivedResultMode?: ToolDerivedResultMode;
  /**
   * For "split-images" and "animated-gif" tools, also keep the unsplit grid
   * sheet alongside the derived result (instead of discarding it once the
   * pieces / GIF are produced).
   */
  keepDerivedSourceSheet?: boolean;
  /**
   * The generation prompt asks the model to also return per-piece text as a
   * JSON array in its text channel (in the same order as the produced grid).
   * We parse that and store each entry as the matching piece's `caption`.
   */
  captionsFromTextChannel?: boolean;
  /**
   * Split the generated sheet by connected components with a small merge margin
   * (one panel illustration = one piece). Large white gutters keep panels apart
   * while the margin absorbs hairline gaps inside a panel.
   */
  splitByComponents?: boolean;
  /**
   * Force a reasoning level for this tool's image generation, overriding the
   * model default. Use a low level for mechanical tasks (crop/straighten/
   * arrange) so the model doesn't exhaust its token budget "thinking" and fail
   * to return an image.
   */
  imageReasoningLevel?: ModelReasoningLevel;
  /**
   * Request an output size + aspect ratio matched to the input image (rounded
   * up to the nearest supported size tier) instead of the default. Use for
   * tools that decompose a page so a high-res source isn't downscaled.
   */
  autoSizeFromInput?: boolean;
  /** Hidden tools without a shape picker can still override their requested aspect ratio. */
  hiddenAspectRatioDefault?: string;
  /** Tools without a size picker can still request a specific output size tier. */
  hiddenSizeDefault?: string;
}

export interface EthnicityCategory {
  id: string;
  label: string;
  description: string;
}

export interface ImageRecordData {
  id: string;
  parentId: string | null;
  incomingSlotId?: string;
  imageData: string; // Base64
  imageFileName?: string | null;
  /**
   * Human-facing text for the image (e.g. an OCR-extracted panel caption).
   * Stored as real text data — distinct from `imageFileName` (storage name) —
   * so it can be edited, persisted, and pasted into apps like Bloom as text.
   */
  caption?: string | null;
  /**
   * Human-assigned name for the subject of the image (e.g. a character's name
   * like "Maria"). Editable below character thumbnails. When this image is used
   * as a reference or edit target, the name is sent alongside the image so the
   * prompt can refer to the person/character by name.
   */
  name?: string | null;
  toolId: string;
  parameters: Record<string, string>;
  sourceStyleId?: string | null;
  durationMs: number;
  cost: number;
  model: string; // Model ID used (e.g., "google/gemini-2.5-flash-image")
  reasoningLevel?: ModelReasoningLevel | null;
  timestamp: number;
  promptUsed: string;
  sourceSummary?: string | null;
  resolution?: { width: number; height: number };
  isStarred?: boolean;
  origin?: "generated" | "uploaded" | "bookImages";
}

/** @deprecated Use ImageRecordData. */
export type ImageEntry = ImageRecordData;

export type ImageRecord = ImageRecordData;

/**
 * Per-image history metadata persisted alongside the image bytes as a
 * `history/<id>.json` sidecar (Bloom-host path). It is everything in an
 * {@link ImageRecordData} except the image bytes themselves — those live in
 * the sibling `history/<id>.png` and are referenced by URL at runtime. The
 * folder is the source of truth: the host enumerates it and supplies each
 * image with its parsed sidecar (see `IBloomHostHistoryImage`).
 */
export type HistoryImageSidecar = Omit<ImageRecordData, "imageData">;

/** @deprecated Use ImageRecord. */
export type HistoryItem = ImageRecord;

export type ViewMode = "single" | "compare";

export interface AppState {
  targetImageId: string | null; // Image chosen in the "Image to Edit" panel
  referenceImageIds: string[]; // Additional reference images ("like this")
  rightPanelImageId: string | null; // The "Result" or preview
  history: ImageRecord[];
  isProcessing: boolean;
  isAuthenticated: boolean; // True when an OpenRouter API key is available
  error: ReactNode | null; // Error message to display to user
}

export interface GenerationProgressState {
  startedAt: number;
  estimatedDurationMs: number;
  /**
   * Optional phase indicator for tools that run more than a single image fetch
   * (e.g. break-comic: redraw sheet → transcribe captions → split). Only set
   * when there is more than one phase; the loading overlay shows it as
   * "Phase {phaseIndex}/{phaseCount}: {phaseLabel}".
   */
  phaseLabel?: string;
  phaseIndex?: number;
  phaseCount?: number;
}

export interface GenerationTimingState {
  lastDurationMs: number | null;
  promptDurationsByKey: Record<string, number>;
  toolDurationsByKey: Record<string, number>;
}

export type ThumbnailStripId = "history" | "characters" | "starred" | "reference" | "bookImages";

export interface ThumbnailStripsSnapshot {
  activeStripId: ThumbnailStripId;
  pinnedStripIds: ThumbnailStripId[];
  itemIdsByStrip: Record<ThumbnailStripId, string[]>;
}

export type ImageSlotActionKey = "upload" | "paste" | "copy" | "download" | "remove";

export interface AuthState {
  apiKey: string | null;
  authMethod: "oauth" | "manual" | null;
}

export interface PersistedAppState {
  targetImageId: string | null;
  referenceImageIds: string[];
  rightPanelImageId: string | null;
  history: ImageRecord[];
}

export interface PersistedImageToolsState {
  version: number;
  appState: PersistedAppState;
  replacementImageIdByIncomingId?: Record<string, string | null>;
  paramsByTool: ToolParamsById;
  activeToolId: string | null;
  /** toolId -> chosen model id (per-tool model selection). */
  modelByTool?: Record<string, string>;
  /** toolId -> reasoning-level override for that tool's selected model. */
  reasoningByTool?: Record<string, ModelReasoningLevel>;
  /**
   * Last-measured cost + duration keyed by
   * `${toolId}|${modelId}|${reasoningLevel}|${sizeToken}`, shown in the per-tool
   * model indicator's tooltip and reused as the price/time estimate going forward.
   */
  measuredStatsByKey?: Record<string, MeasuredStats>;
  generationTiming?: GenerationTimingState;
  auth: AuthState;
  /** When true, the persisted history array is ordered newest -> oldest. */
  historyNewestFirst?: boolean;
  selectedArtStyleId?: string | null;
  thumbnailStrips?: ThumbnailStripsSnapshot;
}

export interface HistoryManifest {
  version: number;
  appState: PersistedAppState;
  thumbnailStrips?: ThumbnailStripsSnapshot;
}

export interface ImageToolsStatePersistence {
  load: () => Promise<PersistedImageToolsState | null>;
  save: (state: PersistedImageToolsState) => Promise<void>;
  clear: () => Promise<void>;
}
