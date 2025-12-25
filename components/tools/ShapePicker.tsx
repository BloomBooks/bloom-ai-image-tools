import React from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface ShapePickerProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}

export const ShapePicker: React.FC<ShapePickerProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  label,
}) => {
  const muiTheme = useTheme();

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      {label && (
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: muiTheme.palette.text.secondary,
          }}
        >
          {label}
        </Typography>
      )}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        {options.map((option) => {
          const isSelected = value === option;
          // Determine aspect ratio for visual representation
          let aspectRatio = "1 / 1"; // Square
          if (option === "Portrait Rectangle") {
            aspectRatio = "9 / 16";
          } else if (option === "Landscape Rectangle") {
            aspectRatio = "16 / 9";
          }
          return (
            <ButtonBase
              key={option}
              onClick={() => onChange(option)}
              disabled={disabled}
              title={option}
              data-testid={`shape-option-${option
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
              sx={{
                p: 0.5,
                borderRadius: 1,
                border: `2px solid ${
                  isSelected
                    ? muiTheme.palette.primary.main
                    : muiTheme.palette.divider
                }`,
                bgcolor: isSelected
                  ? alpha(muiTheme.palette.primary.main, 0.1)
                  : "transparent",
                transition: "all 0.15s ease",
                "&:hover": {
                  borderColor: isSelected
                    ? muiTheme.palette.primary.main
                    : muiTheme.palette.text.secondary,
                  bgcolor: isSelected
                    ? alpha(muiTheme.palette.primary.main, 0.15)
                    : alpha(muiTheme.palette.action.hover, 0.08),
                },
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Box
                  sx={{
                    aspectRatio,
                    height: option === "Portrait Rectangle" ? 16 : "auto",
                    width: option === "Portrait Rectangle" ? "auto" : 16,
                    maxWidth: 16,
                    maxHeight: 16,
                    borderRadius: 0.25,
                    bgcolor:
                      // isSelected
                      //   ? muiTheme.palette.primary.main
                      //   :
                      alpha(muiTheme.palette.text.primary, 0.4),
                    transition: "background-color 0.15s ease",
                  }}
                />
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Stack>
  );
};
