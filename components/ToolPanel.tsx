import React, { useState, useEffect } from "react";
import { TOOLS } from "../tools/registry";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";

interface ToolPanelProps {
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  isProcessing: boolean;
  onToolSelect?: (toolId: string | null) => void;
  hasSourceImage: boolean;
  isAuthenticated: boolean;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({
  onApplyTool,
  isProcessing,
  onToolSelect,
  hasSourceImage,
  isAuthenticated,
}) => {
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (onToolSelect) {
      onToolSelect(activeToolId);
    }
  }, [activeToolId, onToolSelect]);

  // If source image disappears and active tool requires it, deselect
  useEffect(() => {
    if (activeToolId && !hasSourceImage) {
      const tool = TOOLS.find((t) => t.id === activeToolId);
      if (tool && tool.requiresImage !== false) {
        setActiveToolId(null);
      }
    }
  }, [hasSourceImage, activeToolId]);

  const handleToolSelect = (id: string, isDisabled: boolean) => {
    if (isDisabled) return;

    if (activeToolId === id) {
      setActiveToolId(null);
    } else {
      setActiveToolId(id);
      const tool = TOOLS.find((t) => t.id === id);
      const defaults: Record<string, string> = {};
      tool?.parameters.forEach((p) => {
        if (p.defaultValue) defaults[p.name] = p.defaultValue;
      });
      setParams(defaults);
    }
  };

  const handleParamChange = (name: string, value: string) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeToolId) {
      onApplyTool(activeToolId, params);
    }
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
          const isActive = activeToolId === tool.id;
          const needsImage = tool.requiresImage !== false && !hasSourceImage;
          const isDisabled = !isAuthenticated || needsImage;

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
                onClick={() => handleToolSelect(tool.id, isDisabled)}
                className={`w-full text-left p-4 flex items-start gap-3 ${
                  isDisabled ? "cursor-not-allowed" : ""
                }`}
                disabled={isDisabled}
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
                  <p
                    className="text-xs mt-1 leading-relaxed"
                    style={{ color: theme.colors.textMuted }}
                  >
                    {tool.description}
                  </p>
                </div>
              </button>

              {isActive && (
                <div
                  className="p-4 pt-0 border-t mt-2 animate-in slide-in-from-top-2 fade-in duration-200"
                  style={{ borderColor: theme.colors.borderMuted }}
                >
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {tool.parameters.map((param) => (
                      <div key={param.name}>
                        <label
                          className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                          style={{ color: theme.colors.textMuted }}
                        >
                          {param.label}
                        </label>
                        {param.type === "textarea" ? (
                          <textarea
                            data-testid={`input-${param.name}`}
                            className="w-full rounded-md p-2.5 text-sm outline-none transition-all"
                            style={{
                              backgroundColor: theme.colors.surfaceAlt,
                              border: `1px solid ${theme.colors.border}`,
                              color: theme.colors.textPrimary,
                            }}
                            onFocus={(e) =>
                              (e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.colors.focus}`)
                            }
                            onBlur={(e) =>
                              (e.currentTarget.style.boxShadow = "none")
                            }
                            rows={3}
                            placeholder={param.placeholder}
                            value={params[param.name] || ""}
                            onChange={(e) =>
                              handleParamChange(param.name, e.target.value)
                            }
                            required
                          />
                        ) : param.type === "select" ? (
                          <select
                            data-testid={`input-${param.name}`}
                            className="w-full rounded-md p-2.5 text-sm outline-none"
                            style={{
                              backgroundColor: theme.colors.surfaceAlt,
                              border: `1px solid ${theme.colors.border}`,
                              color: theme.colors.textPrimary,
                            }}
                            onFocus={(e) =>
                              (e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.colors.focus}`)
                            }
                            onBlur={(e) =>
                              (e.currentTarget.style.boxShadow = "none")
                            }
                            value={params[param.name] || ""}
                            onChange={(e) =>
                              handleParamChange(param.name, e.target.value)
                            }
                          >
                            {param.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="w-full rounded-md p-2.5 text-sm outline-none transition-all"
                            style={{
                              backgroundColor: theme.colors.surfaceAlt,
                              border: `1px solid ${theme.colors.border}`,
                              color: theme.colors.textPrimary,
                            }}
                            onFocus={(e) =>
                              (e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.colors.focus}`)
                            }
                            onBlur={(e) =>
                              (e.currentTarget.style.boxShadow = "none")
                            }
                            placeholder={param.placeholder}
                            value={params[param.name] || ""}
                            onChange={(e) =>
                              handleParamChange(param.name, e.target.value)
                            }
                            required
                          />
                        )}
                      </div>
                    ))}

                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: isProcessing
                          ? theme.colors.accentSubtle
                          : theme.colors.accent,
                        color: theme.colors.textPrimary,
                        cursor: isProcessing ? "not-allowed" : "pointer",
                        boxShadow: !isProcessing
                          ? theme.colors.accentShadow
                          : "none",
                      }}
                      onMouseEnter={(e) =>
                        !isProcessing &&
                        (e.currentTarget.style.backgroundColor =
                          theme.colors.accentHover)
                      }
                      onMouseLeave={(e) =>
                        !isProcessing &&
                        (e.currentTarget.style.backgroundColor =
                          theme.colors.accent)
                      }
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
