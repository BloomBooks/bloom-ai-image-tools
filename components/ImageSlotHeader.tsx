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
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        borderRadius: 3,
        px: 1.5,
        py: 1,
        height: 48,
        minHeight: 48,
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
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          overflow: "hidden",
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
              color: isStarred ? theme.colors.accent : theme.colors.textMuted,
              transition: "color 120ms ease",
            }}
            title={isStarred ? "Unstar image" : "Star image"}
            aria-pressed={isStarred}
          >
            {isStarred ? (
              <StarIcon fontSize="inherit" />
            ) : (
              <StarBorderIcon fontSize="inherit" />
            )}
          </IconButton>
        ) : null}
        {actions ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexWrap: "nowrap" }}
          >
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
};
