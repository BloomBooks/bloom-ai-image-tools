export interface ToolParameter {
  name: string;
  label: string;
  type: 'text' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  optional?: boolean;
}

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // SVG path d
  parameters: ToolParameter[];
  promptTemplate: (params: Record<string, string>) => string;
  requiresImage?: boolean; // Defaults to true
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

export type ViewMode = 'single' | 'compare';

export interface AppState {
  leftPanelImageId: string | null; // The "Edit This" source
  rightPanelImageId: string | null; // The "Result" or preview
  history: HistoryItem[];
  isProcessing: boolean;
  isAuthenticated: boolean; // True when an OpenRouter API key is available
  error: string | null; // Error message to display to user
}