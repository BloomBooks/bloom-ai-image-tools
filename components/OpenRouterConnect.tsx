import React, { useEffect, useState } from "react";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { theme } from "../themes";

type ConnectionMode = "disconnected" | "apiKey" | "oauth";

type OptionText = { active: string; inactive: string };

interface OpenRouterConnectProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  usingEnvKey: boolean;
  authMethod: "oauth" | "manual" | null;
  apiKeyPreview: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onProvideKey: (key: string) => void;
}

export function OpenRouterConnect({
  isAuthenticated,
  isLoading,
  usingEnvKey,
  authMethod,
  apiKeyPreview,
  onConnect,
  onDisconnect,
  onProvideKey,
}: OpenRouterConnectProps) {
  const [keyValue, setKeyValue] = useState(() => apiKeyPreview || "");

  useEffect(() => {
    setKeyValue(apiKeyPreview ?? "");
  }, [apiKeyPreview]);

  const hasOAuthConnection = authMethod === "oauth" && isAuthenticated;
  const hasManualKey = authMethod === "manual" && Boolean(apiKeyPreview);
  const hasEnvKey = usingEnvKey;
  const hasApiKey = (hasEnvKey || hasManualKey) && !hasOAuthConnection;

  const connectionMode: ConnectionMode = hasOAuthConnection
    ? "oauth"
    : hasApiKey
    ? "apiKey"
    : "disconnected";

  const handleDisconnect = () => {
    onDisconnect();
    setKeyValue("");
  };

  const handleKeyBlur = () => {
    if (usingEnvKey || connectionMode === "oauth") {
      return;
    }
    const trimmed = keyValue.trim();
    if (!trimmed) {
      handleDisconnect();
      return;
    }
    const previewTrimmed = (apiKeyPreview ?? "").trim();
    if (trimmed !== previewTrimmed) {
      onProvideKey(trimmed);
    }
    if (trimmed !== keyValue) {
      setKeyValue(trimmed);
    }
  };

  const visuallyHiddenStyles: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    border: 0,
  };

  const renderOptionCard = (
    value: ConnectionMode,
    labels: OptionText,
    description: OptionText,
    content: React.ReactNode,
    testId: string,
    containerStyle: React.CSSProperties = {}
  ) => (
    <Box
      key={value}
      sx={{
        borderRadius: 3,
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        backgroundColor:
          connectionMode === value
            ? theme.colors.surfaceAlt
            : theme.colors.surface,
        ...containerStyle,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <input
          type="radio"
          name="openrouter-connection-mode"
          id={`openrouter-${value}`}
          checked={connectionMode === value}
          readOnly
          data-testid={testId}
          style={{ ...visuallyHiddenStyles, accentColor: theme.colors.accent }}
        />
        <Box>
          <Typography
            component="label"
            htmlFor={`openrouter-${value}`}
            sx={{
              fontWeight: 600,
              color: theme.colors.textPrimary,
              display: "block",
            }}
          >
            {connectionMode === value ? labels.active : labels.inactive}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: theme.colors.textSecondary,
              display: "block",
              mt: 0.5,
            }}
          >
            {connectionMode === value
              ? description.active
              : description.inactive}
          </Typography>
        </Box>
      </Stack>
      <Box sx={{ pl: 4, fontSize: "0.9rem", color: theme.colors.textPrimary }}>
        {content}
      </Box>
    </Box>
  );

  const oauthButtonLabel =
    connectionMode === "oauth" ? "Disconnect" : "Connect";
  const oauthButtonAction =
    connectionMode === "oauth" ? handleDisconnect : onConnect;
  const oauthButtonTestId =
    connectionMode === "oauth"
      ? "openrouter-oauth-disconnect"
      : "openrouter-oauth-connect";

  const apiKeyDescriptions: OptionText = usingEnvKey
    ? {
        active: "An environment variable is supplying the OpenRouter key.",
        inactive: "This environment already provides an OpenRouter key.",
      }
    : {
        active: "",
        inactive: "",
      };

  const oauthDescriptions: OptionText = {
    active: "You are logged in via OpenRouter OAuth with this browser.",
    inactive: "",
  };

  return (
    <Stack
      component="fieldset"
      spacing={3}
      aria-label="OpenRouter connection"
      sx={{ border: "none", p: 0, m: 0, minInlineSize: 0 }}
    >
      <Typography variant="body2">
        OpenRouter credits are how you pre-pay for use of the AI Image Tools
        from Google and others. Once you have an OpenRouter account, you can
        either connect to it via login or paste in an API key.
      </Typography>

      {renderOptionCard(
        "apiKey",
        {
          active: "Connected with OpenRouter API key",
          inactive: "Connect with OpenRouter API key",
        },
        apiKeyDescriptions,
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "flex-start" }}
          >
            <TextField
              type="text"
              data-testid="openrouter-api-key-input"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              onBlur={handleKeyBlur}
              placeholder="Paste OpenRouter key"
              disabled={usingEnvKey || connectionMode === "oauth"}
              size="small"
              fullWidth
              sx={{
                minWidth: 220,
                flex: 1,
                bgcolor: theme.colors.surface,
              }}
            />
            {hasManualKey && !usingEnvKey && (
              <Button
                type="button"
                data-testid="openrouter-clear-key"
                onClick={handleDisconnect}
                disabled={connectionMode === "oauth"}
                variant="outlined"
                sx={{
                  minWidth: 120,
                  opacity: connectionMode === "oauth" ? 0.5 : 1,
                }}
              >
                Clear key
              </Button>
            )}
          </Stack>

          {usingEnvKey && (
            <Typography variant="caption" color="text.secondary">
              This key is provided by the environment and cannot be changed in
              this interface.
            </Typography>
          )}
        </Stack>,
        "openrouter-option-api-key",
        connectionMode === "oauth"
          ? { opacity: 0.3, pointerEvents: "none" }
          : {}
      )}

      {renderOptionCard(
        "oauth",
        {
          active: "Logged in with OpenRouter",
          inactive: "Connect with OpenRouter login",
        },
        oauthDescriptions,
        <Button
          type="button"
          data-testid={oauthButtonTestId}
          onClick={oauthButtonAction}
          disabled={isLoading}
          variant="contained"
          sx={{
            borderRadius: 2,
            fontWeight: 600,
            px: 3,
            backgroundColor: theme.colors.accent,
            color: theme.colors.textPrimary,
            opacity: isLoading ? 0.6 : 1,
            "&:hover": {
              backgroundColor: theme.colors.accent,
              opacity: 0.9,
            },
          }}
        >
          {isLoading ? "Working..." : oauthButtonLabel}
        </Button>,
        "openrouter-option-oauth"
      )}
    </Stack>
  );
}
