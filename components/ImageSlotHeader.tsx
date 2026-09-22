import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { theme } from "../themes";

interface ImageSlotHeaderProps {
  label: string;
  actions?: React.ReactNode;
  isStarred?: boolean;
  onToggleStar?: () => void;
}

export const ImageSlotHeader: React.FC<ImageSlotHeaderProps> = ({
  label,
  actions,
  isStarred = false,
  onToggleStar,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        width: "100%",
        borderRadius: 3,
        px: 1.5,
        py: 0.5,
        height: "auto",
        // Tall enough to hold the 32px hover action buttons without the header
        // (and the image below it) jumping when they appear.
        minHeight: 40,
        gap: 1,
        bgcolor: "transparent",
        border: "none",
        color: "text.primary",
      }}
    >
      <Typography
        variant="overline"
        sx={{
          fontWeight: 600,
          letterSpacing: "0.12em",
          opacity: 0.85,
          fontSize: 11,
          flexGrow: 1,
          minWidth: 0,
          lineHeight: 1.3,
          whiteSpace: "normal",
          overflowWrap: "anywhere",
        }}
      >
        {label}
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="flex-end"
        sx={{ flexWrap: "nowrap", flexShrink: 0 }}
      >
        {onToggleStar ? (
          <IconButton
            type="button"
            size="small"
            onClick={onToggleStar}
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              color: isStarred ? theme.colors.textOnAccent : theme.colors.textMuted,
              bgcolor: isStarred ? theme.colors.accent : "transparent",
              boxShadow: isStarred ? `0 6px 16px ${theme.colors.panelShadow}` : "none",
              transition: "color 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
              "&:hover": {
                bgcolor: isStarred ? theme.colors.accent : theme.colors.overlay,
              },
            }}
            title={isStarred ? "Unstar image" : "Star image"}
            aria-pressed={isStarred}
          >
            {isStarred ? <StarIcon fontSize="inherit" /> : <StarBorderIcon fontSize="inherit" />}
          </IconButton>
        ) : null}
        {actions ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "nowrap" }}>
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
};
