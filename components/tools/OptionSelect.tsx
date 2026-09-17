import React from "react";
import { Box, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { getAspectRatioOption } from "../../lib/aspectRatios";

/**
 * One row of a Shape, Size or Target Resolution menu. The three menus are one
 * kind of control: a heading, a select whose closed value looks exactly like
 * its rows, and rows of a name with an optional second line under it. The
 * caller builds the rows, because only it knows which facts exist and what
 * the selected model will be sent for each.
 */
export interface SelectOption {
  /** The value stored in the tool's params. */
  value: string;
  /** "Match Container", "2K", "16:9": the row's name. */
  label: string;
  /**
   * Small text under the name, in the open menu and on the closed control
   * alike: the pixels a Size row asks for, or the named ratio a Shape row
   * will be sent when the model only takes named ratios.
   */
  caption?: string;
  /** Where the numbers came from, shown on hover over the row. */
  tooltip?: string;
  /** A named ratio to draw as a swatch beside the name (Shape rows only). */
  swatchRatio?: string;
}

interface OptionSelectProps {
  /** The uppercase heading above the control. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** data-testid for the select's hidden input. */
  inputTestId: string;
  /** When set, each row gets data-testid `${optionTestIdPrefix}-${value}` (":" written "-"). */
  optionTestIdPrefix?: string;
}

const AspectRatioSwatch: React.FC<{ value: string }> = ({ value }) => {
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
          border: `1px solid ${alpha(muiTheme.palette.text.primary, 0.55)}`,
          bgcolor: alpha(muiTheme.palette.text.primary, 0.26),
        }}
      />
    </Box>
  );
};

const OptionRow: React.FC<{ option: SelectOption }> = ({ option }) => {
  const text = (
    <Stack spacing={0} sx={{ minWidth: 0 }}>
      <Typography noWrap variant="body2" sx={{ lineHeight: 1.2 }}>
        {option.label}
      </Typography>
      {option.caption && (
        <Typography noWrap variant="caption" sx={{ color: "text.secondary", lineHeight: 1.2 }}>
          {option.caption}
        </Typography>
      )}
    </Stack>
  );
  if (!option.swatchRatio) return text;
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
      <AspectRatioSwatch value={option.swatchRatio} />
      {text}
    </Stack>
  );
};

/** The uppercase heading the tool card puts above each of its controls. */
export const ControlHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="caption"
    sx={{
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "text.secondary",
    }}
  >
    {children}
  </Typography>
);

export const OptionSelect: React.FC<OptionSelectProps> = ({
  label,
  value,
  onChange,
  options,
  disabled = false,
  inputTestId,
  optionTestIdPrefix,
}) => {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <ControlHeading>{label}</ControlHeading>
      <TextField
        select
        value={selected?.value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        size="small"
        fullWidth
        disabled={disabled}
        inputProps={{ "data-testid": inputTestId }}
        SelectProps={{
          MenuProps: { disablePortal: false },
          renderValue: (selectedValue) => {
            const option = options.find((candidate) => candidate.value === selectedValue);
            return option ? <OptionRow option={option} /> : String(selectedValue);
          },
        }}
      >
        {options.map((option) => {
          const row = <OptionRow option={option} />;
          return (
            <MenuItem
              key={option.value}
              value={option.value}
              data-testid={
                optionTestIdPrefix
                  ? `${optionTestIdPrefix}-${option.value.replace(":", "-")}`
                  : undefined
              }
            >
              {option.tooltip ? (
                // The tooltip wraps the row's content rather than the MenuItem:
                // Select reads `value` off its direct children, so a wrapper
                // around the MenuItem itself would break selection.
                <Tooltip title={option.tooltip} placement="right">
                  <Box sx={{ display: "flex", width: "100%" }}>{row}</Box>
                </Tooltip>
              ) : (
                row
              )}
            </MenuItem>
          );
        })}
      </TextField>
    </Stack>
  );
};
