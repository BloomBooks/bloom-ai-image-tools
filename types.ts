export interface ToolParameter {
  name: string;
  label: string;
  type: "text" | "select" | "textarea" | "art-style";
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  optional?: boolean;
  artStyleCategories?: string[];
  /** When true, the "None" art style option is excluded (for art-style type only). */
  excludeNoneStyle?: boolean;
}

export type ToolParams = Record<string, string>;
export type ToolParamsById = Record<string, ToolParams>;

export type CapabilityName = string;

// Model capability scores are on a 0-5 scale.
export type CapabilityScore = 0 | 1 | 2 | 3 | 4 | 5;
export type ModelCapabilities = Partial<
  Record<CapabilityName, CapabilityScore>
>;

// Tool capability flags are boolean: true means the tool uses that capability.
export type ToolCapabilities = Partial<Record<CapabilityName, boolean>>;

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  pricing: string;
  default?: boolean;
  badge?: string;
  capabilities?: ModelCapabilities;
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
}

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // SVG path d
  parameters: ToolParameter[];
  promptTemplate: (params: Record<string, string>) => string;
  referenceImages: "0" | "0+" | "1" | "1+";
  editImage?: boolean; // Defaults to true; false means tool generates without editing a base image
  capabilities?: ToolCapabilities;
}

export interface HistoryItem {
  id: string;
  parentId: string | null;
  imageData: string; // Base64
  imageFileName?: string | null;
  toolId: string;
  parameters: Record<string, string>;
  durationMs: number;
  cost: number;
  model: string; // Model ID used (e.g., "google/gemini-2.5-flash-image")
  timestamp: number;
  promptUsed: string;
  resolution?: { width: number; height: number };
}

export type ViewMode = "single" | "compare";

export interface AppState {
  targetImageId: string | null; // Image chosen in the "Image to Edit" panel
  referenceImageIds: string[]; // Additional reference images ("like this")
  rightPanelImageId: string | null; // The "Result" or preview
  history: HistoryItem[];
  isProcessing: boolean;
  isAuthenticated: boolean; // True when an OpenRouter API key is available
  error: string | null; // Error message to display to user
}

export interface AuthState {
  apiKey: string | null;
  authMethod: "oauth" | "manual" | null;
}

export interface PersistedAppState {
  targetImageId: string | null;
  referenceImageIds: string[];
  rightPanelImageId: string | null;
  history: HistoryItem[];
}

export interface PersistedImageToolsState {
  version: number;
  appState: PersistedAppState;
  paramsByTool: ToolParamsById;
  activeToolId: string | null;
  selectedModelId: string | null;
  auth: AuthState;
  /** When true, the persisted history array is ordered newest -> oldest. */
  historyNewestFirst?: boolean;
}

export interface ImageToolsStatePersistence {
  load: () => Promise<PersistedImageToolsState | null>;
  save: (state: PersistedImageToolsState) => Promise<void>;
  clear: () => Promise<void>;
}
