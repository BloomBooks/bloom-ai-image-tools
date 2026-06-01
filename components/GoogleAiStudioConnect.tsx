import React, { useEffect, useState } from "react";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { theme } from "../themes";
import { validateGoogleApiKey } from "../lib/googleKeyStatus";

const GOOGLE_API_KEYS_URL = "https://aistudio.google.com/apikey";

interface GoogleAiStudioConnectProps {
  apiKeyPreview: string | null;
  onProvideKey: (key: string) => void;
  onDisconnect: () => void;
}

export function GoogleAiStudioConnect({
  apiKeyPreview,
  onProvideKey,
  onDisconnect,
}: GoogleAiStudioConnectProps) {
  const [keyValue, setKeyValue] = useState(() => apiKeyPreview || "");
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    setKeyValue(apiKeyPreview ?? "");
    setTestState("idle");
    setTestMessage("");
  }, [apiKeyPreview]);

  const hasKey = Boolean(apiKeyPreview);

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
      const status = await validateGoogleApiKey(key);
      setTestState("success");
      setTestMessage(
        status.modelCount > 0
          ? `Key verified (${status.modelCount} models available)`
          : "Key verified",
      );
    } catch (err) {
      setTestState("error");
      setTestMessage(err instanceof Error ? err.message : "Key verification failed");
    }
  };

  const handleKeyBlur = () => {
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

  return (
    <Stack
      component="fieldset"
      spacing={2}
      aria-label="Google AI Studio connection"
      sx={{ border: "none", p: 0, m: 0, minInlineSize: 0 }}
    >
      <Typography variant="body2">
        A Google AI Studio API key lets you call Google's Gemini image models directly. Get a key at{" "}
        <Box
          component="a"
          href={GOOGLE_API_KEYS_URL}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: theme.colors.accent }}
        >
          aistudio.google.com/apikey
        </Box>
        .
      </Typography>

      <Stack spacing={1.5}>
        <TextField
          type="text"
          data-testid="google-api-key-input"
          value={keyValue}
          onChange={(e) => {
            setKeyValue(e.target.value);
            setTestState("idle");
            setTestMessage("");
          }}
          onBlur={handleKeyBlur}
          placeholder="Paste Google AI Studio key"
          size="small"
          fullWidth
          sx={{
            minWidth: 220,
            bgcolor: theme.colors.surface,
          }}
          InputProps={{
            endAdornment: !keyValue && (
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
          {hasKey && (
            <Button
              type="button"
              data-testid="google-test-key"
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
                "&:hover": {
                  backgroundColor: theme.colors.accent,
                  opacity: 0.9,
                },
              }}
            >
              {testState === "testing" ? "Testing…" : "Test Key"}
            </Button>
          )}
          {hasKey && (
            <Button
              type="button"
              data-testid="google-clear-key"
              onClick={handleDisconnect}
              variant="outlined"
              size="small"
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
      </Stack>
    </Stack>
  );
}
