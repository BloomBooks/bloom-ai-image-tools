import React from "react";
import { Box, Button, Dialog, DialogContent, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { useBrandedDarkTheme } from "./materialUITheme";
import { theme } from "../themes";
import { interpolateJsx, useL10n } from "../lib/localization";

interface OpenRouterWelcomeDialogProps {
  isOpen: boolean;
  onConnect: () => void;
  onDismiss: () => void;
}

export function OpenRouterWelcomeDialog({
  isOpen,
  onConnect,
  onDismiss,
}: OpenRouterWelcomeDialogProps) {
  const darkTheme = useBrandedDarkTheme();
  const l10n = useL10n();
  return (
    <ThemeProvider theme={darkTheme}>
      <Dialog
        open={isOpen}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: "#000",
            backgroundImage: "none",
            borderRadius: 3,
            color: theme.colors.textPrimary,
          },
        }}
      >
        <DialogContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Typography variant="h6" fontWeight={700}>
              {l10n("AiImageEditor.Welcome.Title", "Connect to generate images")}
            </Typography>

            <Typography variant="body1" sx={{ color: theme.colors.textSecondary, lineHeight: 1.7 }}>
              {interpolateJsx(
                l10n(
                  "AiImageEditor.Welcome.Explanation",
                  "Bloom AI Image Tools creates images using AI models from Google and other providers. These models charge per image — you pay for them through {0}, a service that lets you pre-load credits and use them across providers. Credits start at $5 — enough for roughly 25–50 images — and are only spent when you generate images. There's no subscription.",
                ),
                [
                  <Box
                    key="openrouter"
                    component="span"
                    sx={{ color: theme.colors.textPrimary, fontWeight: 600 }}
                  >
                    OpenRouter
                  </Box>,
                ],
              )}
            </Typography>

            <Typography variant="body2" sx={{ color: theme.colors.textMuted, lineHeight: 1.6 }}>
              {l10n(
                "AiImageEditor.Welcome.CreditsNote",
                "Your credits are purchased directly from OpenRouter. Bloom doesn't receive any part of what you spend.",
              )}
            </Typography>

            <Stack spacing={1.5} pt={1}>
              <Button
                variant="contained"
                onClick={onConnect}
                fullWidth
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                  py: 1.25,
                  backgroundColor: theme.colors.accent,
                  color: theme.colors.textOnAccent,
                  boxShadow: theme.colors.accentShadow,
                  "&:hover": {
                    backgroundColor: theme.colors.accent,
                    opacity: 0.9,
                    boxShadow: theme.colors.accentShadow,
                  },
                }}
              >
                {l10n("AiImageEditor.Welcome.Connect", "Connect to AI Image Generators")}
              </Button>
              <Button
                variant="text"
                onClick={onDismiss}
                fullWidth
                sx={{
                  color: theme.colors.textMuted,
                  fontWeight: 400,
                  "&:hover": { color: theme.colors.textSecondary, backgroundColor: "transparent" },
                }}
              >
                {l10n("AiImageEditor.Welcome.JustLookAround", "I just want to look around")}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
}
