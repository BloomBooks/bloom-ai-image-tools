import React from "react";
import type {
  ModelInfo,
  ToolDefinition,
  ToolParameter,
  ToolParamsById,
} from "../types";
import { TOOLS } from "../tools/tools-registry";
import { Icon, Icons } from "./Icons";
import { CapabilityPanel } from "./CapabilityPanel";
import { theme } from "../themes";
import { ART_STYLES } from "../lib/artStyles";
import { ArtStylePicker } from "./ArtStylePicker";

interface ToolPanelProps {
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  isProcessing: boolean;
  onToolSelect: (toolId: string | null) => void;
  referenceImageCount: number;
  hasTargetImage: boolean;
  isAuthenticated: boolean;
  selectedModel: ModelInfo | null;
  activeToolId: string | null;
  paramsByTool: ToolParamsById;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
}

const requiresAtLeastOneReference = (tool: ToolDefinition) =>
  tool.referenceImages === "1" || tool.referenceImages === "1+";

const requiresEditImage = (tool: ToolDefinition) => tool.editImage !== false;

export const ToolPanel: React.FC<ToolPanelProps> = ({
  onApplyTool,
  isProcessing,
  onToolSelect,
  referenceImageCount,
  hasTargetImage,
  isAuthenticated,
  selectedModel,
  activeToolId,
  paramsByTool,
  onParamChange,
}) => {
  const resolvedActiveToolId = activeToolId ?? TOOLS[0]?.id ?? null;

  const handleToolSelect = (toolId: string, isDisabled: boolean) => {
    if (isDisabled) return;
    onToolSelect(toolId);
  };

  const handleParamChange = (toolId: string, name: string, value: string) => {
    onParamChange(toolId, name, value);
  };

  const hasUnfilledRequiredParams = (tool: ToolDefinition) => {
    const toolParams = paramsByTool[tool.id] || {};
    return tool.parameters.some((param) => {
      if (param.optional) return false;
      return !toolParams[param.name]?.trim();
    });
  };

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    tool: ToolDefinition
  ) => {
    event.preventDefault();
    if (isProcessing) return;
    const payload = paramsByTool[tool.id] || {};
    onApplyTool(tool.id, payload);
  };

  const renderParameterField = (tool: ToolDefinition, param: ToolParameter) => {
    const value = paramsByTool[tool.id]?.[param.name] ?? "";

    const label = (
      <label
        className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
        style={{ color: theme.colors.textSecondary }}
      >
        {param.label}
      </label>
    );

    if (param.type === "textarea") {
      return (
        <div key={param.name}>
          {label}
          <textarea
            data-testid={`input-${param.name}`}
            className="w-full rounded-md p-2.5 text-sm outline-none transition-all"
            style={{
              backgroundColor: theme.colors.surfaceAlt,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.textPrimary,
            }}
            rows={3}
            placeholder={param.placeholder}
            value={value}
            onChange={(event) =>
              handleParamChange(tool.id, param.name, event.target.value)
            }
          />
        </div>
      );
    }

    if (param.type === "select") {
      return (
        <div key={param.name}>
          {label}
          <select
            data-testid={`input-${param.name}`}
            className="w-full rounded-md p-2.5 text-sm outline-none"
            style={{
              backgroundColor: theme.colors.surfaceAlt,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.textPrimary,
            }}
            value={value}
            onChange={(event) =>
              handleParamChange(tool.id, param.name, event.target.value)
            }
          >
            {param.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (param.type === "art-style") {
      return (
        <div key={param.name}>
          {label}
          <ArtStylePicker
            styles={ART_STYLES}
            value={value}
            onChange={(next) => handleParamChange(tool.id, param.name, next)}
            disabled={isProcessing || ART_STYLES.length === 0}
            allowClear={param.optional}
            data-testid={`input-${param.name}`}
          />
        </div>
      );
    }

    return (
      <div key={param.name}>
        {label}
        <input
          type="text"
          className="w-full rounded-md p-2.5 text-sm outline-none transition-all"
          style={{
            backgroundColor: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
          }}
          placeholder={param.placeholder}
          value={value}
          onChange={(event) =>
            handleParamChange(tool.id, param.name, event.target.value)
          }
        />
      </div>
    );
  };

  return (
    <div
      className="w-80 border-r flex flex-col h-full shadow-xl z-20"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        boxShadow: theme.colors.panelShadow,
        color: theme.colors.textPrimary,
      }}
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {TOOLS.map((tool) => {
          const isActive = resolvedActiveToolId === tool.id;
          const needsReference =
            requiresAtLeastOneReference(tool) && referenceImageCount === 0;
          const needsTarget = requiresEditImage(tool) && !hasTargetImage;
          const isDisabled = !isAuthenticated || needsReference || needsTarget;
          const disabledReason = !isAuthenticated
            ? "Connect to OpenRouter"
            : needsTarget
            ? "Add an image to edit first"
            : needsReference
            ? "Add reference images"
            : undefined;
          const missingRequired = hasUnfilledRequiredParams(tool);
          const isSubmitDisabled = isProcessing || missingRequired;

          const effectiveCapabilities = isActive
            ? tool.referenceImages === "1+" && referenceImageCount > 1
              ? {
                  ...(tool.capabilities ?? {}),
                  "edit-with-reference-image": true,
                }
              : tool.capabilities
            : tool.capabilities;

          return (
            <div
              key={tool.id}
              className="rounded-xl transition-all duration-200 border relative"
              style={{
                backgroundColor: isDisabled
                  ? theme.colors.surfaceAlt
                  : isActive
                  ? theme.colors.surfaceRaised
                  : theme.colors.surface,
                borderColor: isDisabled
                  ? theme.colors.borderMuted
                  : isActive
                  ? theme.colors.accent
                  : theme.colors.border,
                opacity: isDisabled ? 0.6 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
                boxShadow: isActive ? theme.colors.accentShadow : "none",
              }}
            >
              <button
                type="button"
                onClick={() => handleToolSelect(tool.id, isDisabled)}
                className={`w-full text-left p-4 flex items-start gap-3 ${
                  isDisabled ? "cursor-not-allowed" : ""
                }`}
                disabled={isDisabled}
                title={disabledReason}
              >
                <div
                  className="p-2 rounded-lg"
                  style={{
                    backgroundColor: isActive
                      ? theme.colors.accent
                      : theme.colors.surfaceAlt,
                    color: isActive
                      ? theme.colors.textPrimary
                      : theme.colors.textMuted,
                  }}
                >
                  <Icon path={tool.icon} className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className="font-medium"
                    style={{
                      color: isActive
                        ? theme.colors.textPrimary
                        : theme.colors.textSecondary,
                    }}
                  >
                    {tool.title}
                  </h3>
                  {tool.description && (
                    <p
                      className="text-xs mt-1 leading-relaxed"
                      style={{ color: theme.colors.textSecondary }}
                    >
                      {tool.description}
                    </p>
                  )}
                </div>
              </button>

              {isActive && (
                <div
                  className="px-4 pb-4 pt-3 border-t animate-in slide-in-from-top-2 fade-in duration-200"
                  style={{ borderColor: theme.colors.borderMuted }}
                >
                  <form
                    onSubmit={(event) => handleSubmit(event, tool)}
                    className="space-y-4 mt-2"
                  >
                    {tool.parameters.map((param) =>
                      renderParameterField(tool, param)
                    )}

                    <CapabilityPanel
                      capabilities={effectiveCapabilities}
                      selectedModel={selectedModel}
                    />

                    <button
                      type="submit"
                      disabled={isSubmitDisabled}
                      className="w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: isSubmitDisabled
                          ? theme.colors.accentSubtle
                          : theme.colors.accent,
                        color: theme.colors.textPrimary,
                        cursor: isSubmitDisabled ? "not-allowed" : "pointer",
                        boxShadow: !isSubmitDisabled
                          ? theme.colors.accentShadow
                          : "none",
                        opacity: isSubmitDisabled ? 0.3 : 1,
                      }}
                    >
                      {isProcessing ? (
                        <>
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                          Processing...
                        </>
                      ) : (
                        <>
                          <span>
                            {tool.id === "generate_image"
                              ? "Generate Image"
                              : "Apply Changes"}
                          </span>
                          <Icon path={Icons.ArrowRight} className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
