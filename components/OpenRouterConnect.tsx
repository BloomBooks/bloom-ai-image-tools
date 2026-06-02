import React, { useEffect, useState } from "react";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { theme } from "../themes";
import { fetchOpenRouterKeyStatus } from "../lib/openRouterKeyStatus";

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
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    setKeyValue(apiKeyPreview ?? "");
    setTestState("idle");
    setTestMessage("");
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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) {
        setKeyValue(trimmed);
        setTestState("idle");
        setTestMessage("");
        onProvideKey(trimmed);
      }
    } catch {
      // Clipboard access was denied or unavailable — let user type manually
    }
  };

  const handleTestKey = async () => {
    const key = keyValue.trim();
    if (!key) return;
    setTestState("testing");
    setTestMessage("");
    try {
      const status = await fetchOpenRouterKeyStatus(key);
      const remaining = status.limitRemaining;
      const balancePart =
        remaining !== null
          ? `, ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", currencyDisplay: "symbol" }).format(remaining)} available`
          : "";
      setTestState("success");
      setTestMessage(`Key verified${balancePart}`);
    } catch (err) {
      setTestState("error");
      setTestMessage(err instanceof Error ? err.message : "Key verification failed");
    }
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
    containerStyle: React.CSSProperties = {},
  ) => (
    <Box
      key={value}
      sx={{
        borderRadius: 3,
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        backgroundColor: connectionMode === value ? theme.colors.surfaceAlt : theme.colors.surface,
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
            {connectionMode === value ? description.active : description.inactive}
          </Typography>
        </Box>
      </Stack>
      <Box sx={{ pl: 4, fontSize: "0.9rem", color: theme.colors.textPrimary }}>{content}</Box>
    </Box>
  );

  const oauthButtonLabel = connectionMode === "oauth" ? "Disconnect" : "Connect";
  const oauthButtonAction = connectionMode === "oauth" ? handleDisconnect : onConnect;
  const oauthButtonTestId =
    connectionMode === "oauth" ? "openrouter-oauth-disconnect" : "openrouter-oauth-connect";

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
        OpenRouter credits are how you pre-pay for use of the AI Image Tools from Google and others.
        Once you have an OpenRouter account, you can either connect to it via login or paste in an
        API key.
      </Typography>

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
            color: theme.colors.textOnAccent,
            opacity: isLoading ? 0.6 : 1,
            "&:hover": {
              backgroundColor: theme.colors.accent,
              opacity: 0.9,
            },
          }}
        >
          {isLoading ? "Working..." : oauthButtonLabel}
        </Button>,
        "openrouter-option-oauth",
      )}

      <Divider
        sx={{
          color: theme.colors.textSecondary,
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
        }}
      >
        OR
      </Divider>

      {renderOptionCard(
        "apiKey",
        {
          active: "Connected with OpenRouter API key",
          inactive: "Connect with OpenRouter API key",
        },
        apiKeyDescriptions,
        <Stack spacing={1.5}>
          <TextField
            type="text"
            data-testid="openrouter-api-key-input"
            value={keyValue}
            onChange={(e) => {
              setKeyValue(e.target.value);
              setTestState("idle");
              setTestMessage("");
            }}
            onBlur={handleKeyBlur}
            placeholder="Paste OpenRouter key"
            disabled={usingEnvKey || connectionMode === "oauth"}
            size="small"
            fullWidth
            sx={{
              minWidth: 220,
              bgcolor: theme.colors.surface,
            }}
            InputProps={{
              endAdornment: !usingEnvKey && connectionMode !== "oauth" && !keyValue && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handlePaste}
                    aria-label="Paste API key"
                    edge="end"
                    sx={{
                      color: theme.colors.textSecondary,
                      "&:hover": { color: theme.colors.textPrimary },
                    }}
                  >
                    <ContentPasteIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {(hasManualKey || hasEnvKey) && connectionMode !== "oauth" && (
              <Button
                type="button"
                data-testid="openrouter-test-key"
                onClick={handleTestKey}
                disabled={testState === "testing"}
                variant="contained"
                size="small"
                startIcon={testState === "testing" ? <CircularProgress size={14} /> : undefined}
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                  px: 3,
                  backgroundColor: theme.colors.accent,
                  color: theme.colors.textOnAccent,
                  opacity: testState === "testing" ? 0.6 : 1,
                  "&:hover": { backgroundColor: theme.colors.accent, opacity: 0.9 },
                }}
              >
                {testState === "testing" ? "Testing…" : "Test Key"}
              </Button>
            )}
            {hasManualKey && !usingEnvKey && (
              <Button
                type="button"
                data-testid="openrouter-clear-key"
                onClick={handleDisconnect}
                disabled={connectionMode === "oauth"}
                variant="outlined"
                size="small"
                sx={{ opacity: connectionMode === "oauth" ? 0.5 : 1 }}
              >
                Forget Key
              </Button>
            )}
          </Stack>

          {testState !== "idle" && testMessage && (
            <Typography
              variant="caption"
              sx={{
                color:
                  testState === "success" ? (theme.colors.success ?? "success.main") : "error.main",
              }}
            >
              {testState === "success" ? `✔ ${testMessage}` : `✘ ${testMessage}`}
            </Typography>
          )}

          {usingEnvKey && (
            <Typography variant="caption" color="text.secondary">
              This key is provided by the environment and cannot be changed in this interface.
            </Typography>
          )}
        </Stack>,
        "openrouter-option-api-key",
        connectionMode === "oauth" ? { opacity: 0.3, pointerEvents: "none" } : {},
      )}
    </Stack>
  );
}
