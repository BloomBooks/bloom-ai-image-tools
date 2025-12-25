import React from "react";
import { Box, Stack, Typography } from "@mui/material";

interface ImageSlotHeaderProps {
  label: string;
  actions?: React.ReactNode;
}

export const ImageSlotHeader: React.FC<ImageSlotHeaderProps> = ({
  label,
  actions,
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
        }}
      >
        {label}
      </Typography>
      {actions ? (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="flex-end"
          flexWrap="wrap"
        >
          {actions}
        </Stack>
      ) : null}
    </Box>
  );
};
