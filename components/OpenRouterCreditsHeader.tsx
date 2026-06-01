import React, { useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/settings/credits";
const wiggle = keyframes`
  0%,
  100% {
    transform: translateX(0);
  }
  18% {
    transform: translateX(-6px) rotate(-4deg);
  }
  36% {
    transform: translateX(6px) rotate(4deg);
  }
  54% {
    transform: translateX(-4px) rotate(-3deg);
  }
  72% {
    transform: translateX(4px) rotate(3deg);
  }
`;

export type OpenRouterCreditsHeaderProps = {
  shouldShowConnectToOpenRouterCTA: boolean;
  connectCtaLabel: string;
  onOpenSettingsDialog: () => void;
  // When true (and not showing the connect CTA), render the Google AI Studio badge
  // instead of the OpenRouter credits bar (Google exposes no credits endpoint).
  isGoogleProvider: boolean;
  googleStudioUrl: string;
  // Credits UI state (only used when shouldShowConnectToOpenRouterCTA=false)
  creditsTooltipLabel: string;
  creditsTooltipLines: string[];
  creditsProgressFraction: number | null;
  creditsProgressAriaProps: React.HTMLAttributes<HTMLElement>;

  // Styling tokens (kept here so ImageToolsWorkspace remains the source of truth)
  creditsLabelColor: string;
  progressBorderColor: string;
  progressTrackBackground: string;
  progressFillColor: string;

  appColors: {
    accent: string;
    accentHover: string;
    accentShadow: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    panelShadow: string;
    textPrimary: string;
  };
};

export function OpenRouterCreditsHeader({
  shouldShowConnectToOpenRouterCTA,
  connectCtaLabel,
  onOpenSettingsDialog,
  isGoogleProvider,
  googleStudioUrl,
  creditsTooltipLabel,
  creditsTooltipLines,
  creditsProgressFraction,
  creditsProgressAriaProps,
  creditsLabelColor,
  progressBorderColor,
  progressTrackBackground,
  progressFillColor,
  appColors,
}: OpenRouterCreditsHeaderProps) {
  const [isWiggling, setIsWiggling] = useState(false);

  if (shouldShowConnectToOpenRouterCTA) {
    return (
      <Button
        type="button"
        onClick={onOpenSettingsDialog}
        data-testid="openrouter-connect-cta"
        variant="contained"
        disableElevation
        sx={{
          px: 3,
          py: 1.25,
          borderRadius: "999px",
          fontSize: "0.75rem",
          fontWeight: 400,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          backgroundColor: appColors.accent,
          color: appColors.surface,
          boxShadow: appColors.accentShadow,
          transformOrigin: "center",
          animation: isWiggling ? `${wiggle} 560ms ease` : "none",
          transition: "transform 150ms ease, background-color 150ms ease",
          "&:hover": {
            transform: "translateY(-2px)",
            backgroundColor: appColors.accentHover,
          },
        }}
      >
        {connectCtaLabel}
      </Button>
    );
  }

  if (isGoogleProvider) {
    return (
      <Box
        component="a"
        href={googleStudioUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="google-studio-badge"
        aria-label="Google AI Studio"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 2,
          py: 1,
          borderRadius: "999px",
          textDecoration: "none",
          border: `1px solid ${appColors.border}`,
          backgroundColor: appColors.surfaceAlt,
          boxShadow: appColors.panelShadow,
          color: appColors.textPrimary,
          fontSize: "0.8rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          transition: "opacity 150ms ease",
          "&:hover": { opacity: 0.85 },
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: appColors.accent,
          }}
        />
        Google AI Studio
        <Box component="span" aria-hidden sx={{ fontSize: "0.9rem" }}>
          ↗
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="a"
      href={OPENROUTER_CREDITS_URL}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={0}
      aria-label={creditsTooltipLabel}
      sx={{
        position: "relative",
        textAlign: "right",
        lineHeight: 1.2,
        cursor: "pointer",
        outline: "none",
        textDecoration: "none",
        color: "inherit",
        "&:hover [data-role='credits-tooltip'], &:focus-within [data-role='credits-tooltip']": {
          opacity: 1,
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: creditsLabelColor,
          display: "block",
        }}
      >
        OpenRouter Credits
      </Typography>

      <Stack spacing={0.75} alignItems="flex-end" mt={0.5}>
        <Box
          sx={{
            width: 160,
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            border: `1px solid ${progressBorderColor}`,
            backgroundColor: progressTrackBackground,
          }}
          {...creditsProgressAriaProps}
        >
          <Box
            sx={{
              height: "100%",
              borderRadius: 999,
              transition: "width 200ms ease",
              backgroundColor: progressFillColor,
              width: `${Math.max(0, Math.min(100, (creditsProgressFraction ?? 0) * 100))}%`,
              opacity: creditsProgressFraction !== null ? 1 : 0.35,
            }}
          />
        </Box>
      </Stack>

      {creditsTooltipLines.length > 0 && (
        <Box
          data-role="credits-tooltip"
          sx={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            px: 1.25,
            py: 1,
            borderRadius: 1,
            fontSize: "0.75rem",
            boxShadow: appColors.panelShadow,
            whiteSpace: "nowrap",
            transition: "opacity 150ms ease",
            opacity: 0,
            pointerEvents: "none",
            border: `1px solid ${progressBorderColor}`,
            backgroundColor: appColors.surface,
            color: appColors.textPrimary,
          }}
        >
          {creditsTooltipLines.map((line, index) => (
            <div key={`credits-tooltip-${index}`}>{line}</div>
          ))}
        </Box>
      )}
    </Box>
  );
}
