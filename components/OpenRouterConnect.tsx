import React, { useState } from "react";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";

interface OpenRouterConnectProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  usingEnvKey: boolean;
  authMethod: "oauth" | "manual" | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onProvideKey: (key: string) => void;
}

export function OpenRouterConnect({
  isAuthenticated,
  isLoading,
  usingEnvKey,
  authMethod,
  onConnect,
  onDisconnect,
  onProvideKey,
}: OpenRouterConnectProps) {
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyValue.trim()) {
      onProvideKey(keyValue.trim());
      setKeyValue("");
      setShowKeyInput(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setShowKeyInput(false);
    setKeyValue("");
  };

  // When authenticated, show disconnect link
  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <span
          data-testid="openrouter-status"
          className="flex items-center gap-2 text-sm"
          style={{ color: theme.colors.success }}
        >
          <Icon path={Icons.Check} className="w-4 h-4" />
          {usingEnvKey ? "Using env key" : "Connected"}
        </span>
        {!usingEnvKey && (
          <button
            data-testid="openrouter-disconnect"
            onClick={handleDisconnect}
            className="text-sm underline hover:no-underline transition-all"
            style={{ color: theme.colors.textMuted }}
            title={
              authMethod === "manual"
                ? "Forget stored API key"
                : "Disconnect and clear stored OpenRouter key"
            }
          >
            {authMethod === "manual"
              ? "Forget OpenRouter Key"
              : "Disconnect from OpenRouter"}
          </button>
        )}
      </div>
    );
  }

  // When not authenticated, show two options
  if (showKeyInput) {
    return (
      <form onSubmit={handleKeySubmit} className="flex items-center gap-2">
        <input
          type="password"
          data-testid="openrouter-key-input"
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          placeholder="Enter OpenRouter API key"
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
            width: "220px",
          }}
          autoFocus
        />
        <button
          type="submit"
          data-testid="openrouter-key-submit"
          disabled={!keyValue.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.textPrimary,
            opacity: keyValue.trim() ? 1 : 0.5,
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setShowKeyInput(false);
            setKeyValue("");
          }}
          className="px-2 py-2 rounded-lg text-sm transition-all"
          style={{ color: theme.colors.textMuted }}
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        data-testid="openrouter-connect"
        onClick={onConnect}
        disabled={isLoading}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
        style={{
          backgroundColor: theme.colors.accent,
          color: theme.colors.textPrimary,
          boxShadow: theme.colors.accentShadow,
          opacity: isLoading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = theme.colors.accentHover;
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = theme.colors.accent;
          }
        }}
        title="Connect using OpenRouter OAuth"
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
        ) : (
          <Icon path={Icons.Link} className="w-4 h-4" />
        )}
        Connect to OpenRouter
      </button>
      <button
        data-testid="openrouter-provide-key"
        onClick={() => setShowKeyInput(true)}
        disabled={isLoading}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border"
        style={{
          backgroundColor: "transparent",
          color: theme.colors.textSecondary,
          borderColor: theme.colors.border,
          opacity: isLoading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.surfaceAlt;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        title="Manually enter an OpenRouter API key"
      >
        Provide OpenRouter Key
      </button>
    </div>
  );
}
