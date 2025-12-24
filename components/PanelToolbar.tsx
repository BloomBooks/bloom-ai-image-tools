import React from "react";
import { Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface PanelToolbarProps {
  label: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelToolbar: React.FC<PanelToolbarProps> = ({
  label,
  actions,
  className,
}) => {
  const muiTheme = useTheme();
  const background = alpha(muiTheme.palette.background.paper, 0.9);

  return (
    <Paper
      elevation={6}
      className={className}
      square={false}
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
        bgcolor: background,
        color: muiTheme.palette.text.primary,
        backdropFilter: "blur(12px)",
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
    </Paper>
  );
};
