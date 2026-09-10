import React from "react";
import { Button, Dialog, DialogContent, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { useBrandedDarkTheme } from "./materialUITheme";
import { theme } from "../themes";

/**
 * What a playground session is told on opening: the editor is here to be looked at, and
 * what it would take to actually run something. Shown in place of
 * OpenRouterWelcomeDialog, whose offer to connect this session cannot take up.
 */
interface PlaygroundNoticeDialogProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function PlaygroundNoticeDialog({ isOpen, onDismiss }: PlaygroundNoticeDialogProps) {
  const darkTheme = useBrandedDarkTheme();
  return (
    <ThemeProvider theme={darkTheme}>
      <Dialog
        open={isOpen}
        onClose={onDismiss}
        maxWidth="sm"
        fullWidth
        data-testid="playground-notice-dialog"
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
            <Typography variant="body1" sx={{ color: theme.colors.textPrimary, lineHeight: 1.7 }}>
              This tool is in &quot;look-around&quot; mode. To actually edit or create images, you
              will need a subscription and a book that is not based on the &quot;Playground&quot;
              template.
            </Typography>

            <Button
              variant="contained"
              onClick={onDismiss}
              data-testid="playground-notice-dismiss"
              sx={{
                alignSelf: "flex-end",
                borderRadius: 2,
                fontWeight: 600,
                px: 4,
                py: 1,
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
              OK
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
}
