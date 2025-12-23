export interface ToolParameter {
  name: string;
  label: string;
  type: "text" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  optional?: boolean;
}

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

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // SVG path d
  parameters: ToolParameter[];
  promptTemplate: (params: Record<string, string>) => string;
  referenceImages: "0" | "0+" | "1" | "1+";
  capabilities?: ToolCapabilities;
}

export interface HistoryItem {
  id: string;
  parentId: string | null;
  imageData: string; // Base64
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
  referenceImageIds: string[]; // Reference images for the active tool
  rightPanelImageId: string | null; // The "Result" or preview
  history: HistoryItem[];
  isProcessing: boolean;
  isAuthenticated: boolean; // True when an OpenRouter API key is available
  error: string | null; // Error message to display to user
}
