import React from "react";
import { Box, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  AUTO_ASPECT_RATIO,
  getAspectRatioOption,
  getSupportedAspectRatioValues,
} from "../../lib/aspectRatios";

interface AspectRatioPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  allowAuto?: boolean;
  autoResolvedValue?: string;
  options?: readonly string[];
}

const AspectRatioSwatch: React.FC<{ value: string; emphasized?: boolean }> = ({
  value,
  emphasized = false,
}) => {
  const muiTheme = useTheme();
  const option = getAspectRatioOption(value);

  if (!option) {
    return null;
  }

  const maxWidth = 36;
  const maxHeight = 24;
  const ratio = option.width / option.height;
  const width = ratio >= 1 ? maxWidth : Math.max(6, maxHeight * ratio);
  const height = ratio >= 1 ? Math.max(6, maxWidth / ratio) : maxHeight;

  return (
    <Box
      sx={{
        width: 42,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width,
          height,
          borderRadius: 0.5,
          border: `1px solid ${alpha(muiTheme.palette.text.primary, emphasized ? 0.55 : 0.3)}`,
          bgcolor: alpha(muiTheme.palette.text.primary, emphasized ? 0.26 : 0.16),
        }}
      />
    </Box>
  );
};

const AspectRatioValue: React.FC<{
  value: string;
  autoResolvedValue?: string;
}> = ({ value, autoResolvedValue }) => {
  const isAuto = value === AUTO_ASPECT_RATIO;
  const previewValue = isAuto ? autoResolvedValue || "1:1" : value;

  return (
    <Stack direction="row" spacing={1.25} alignItems="center">
      <AspectRatioSwatch value={previewValue} emphasized />
      <Stack spacing={0} sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
          {isAuto ? "Auto" : value}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", lineHeight: 1.2 }}
        >
          {isAuto
            ? `Closest to input image${autoResolvedValue ? ` (${autoResolvedValue})` : ""}`
            : `Aspect ratio ${value}`}
        </Typography>
      </Stack>
    </Stack>
  );
};

export const AspectRatioPicker: React.FC<AspectRatioPickerProps> = ({
  value,
  onChange,
  disabled = false,
  label,
  allowAuto = false,
  autoResolvedValue,
  options,
}) => {
  const supportedOptions = getSupportedAspectRatioValues(options);
  const menuOptions = allowAuto
    ? [AUTO_ASPECT_RATIO, ...supportedOptions]
    : supportedOptions;

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      {label && (
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "text.secondary",
          }}
        >
          {label}
        </Typography>
      )}
      <TextField
        select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        size="small"
        disabled={disabled}
        inputProps={{ "data-testid": "input-aspectRatio" }}
        SelectProps={{
          MenuProps: { disablePortal: false },
          renderValue: (selected) => (
            <AspectRatioValue
              value={String(selected)}
              autoResolvedValue={autoResolvedValue}
            />
          ),
        }}
      >
        {menuOptions.map((option) => (
          <MenuItem
            key={option}
            value={option}
            data-testid={`aspect-ratio-option-${option.replace(":", "-")}`}
          >
            <AspectRatioValue
              value={option}
              autoResolvedValue={autoResolvedValue}
            />
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
};