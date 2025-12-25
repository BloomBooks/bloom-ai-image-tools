import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Stack,
  Box,
  Paper,
  Button,
  Alert,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { IMAGE_TOOLS_FS_IMAGES_DIR } from "../services/persistence/constants";
import openRouterIcon from "../assets/openrouter.svg";
import { Icon, Icons } from "./Icons";
import { OpenRouterConnect } from "./OpenRouterConnect";
import { darkTheme } from "./materialUITheme";
import { theme as appTheme } from "../themes";

interface OpenRouterSectionProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  usingEnvKey: boolean;
  authMethod: "oauth" | "manual" | null;
  apiKeyPreview: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onProvideKey: (key: string) => void;
}

interface HistorySectionProps {
  isSupported: boolean;
  isLoading: boolean;
  isFolderPersistenceActive: boolean;
  directoryName: string | null;
  error: string | null;
  onEnableFolder: () => void;
  onDisableFolder: () => void;
}

interface AIImageToolsSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  openRouter: OpenRouterSectionProps;
  history: HistorySectionProps;
}

const folderPathFromName = (name: string | null) => {
  if (!name) {
    return null;
  }
  return `${name}/${IMAGE_TOOLS_FS_IMAGES_DIR}`;
};

const sectionCardStyles = {
  p: 3,
  borderRadius: 3,
  backgroundColor: "transparent",
  boxShadow: "none",
};

const nestedCardStyles = {
  p: 2,
  borderRadius: 2,
  backgroundColor: "transparent",
};

const primaryContainedButtonStyles = {
  borderRadius: 999,
  fontWeight: 600,
  px: 3,
  boxShadow: appTheme.colors.accentShadow,
  backgroundColor: appTheme.colors.accent,
  color: appTheme.colors.textPrimary,
  "&:hover": {
    backgroundColor: appTheme.colors.accentHover,
    boxShadow: appTheme.colors.accentShadow,
  },
};

const dialogBackground = "#000";

export const AIImageToolsSettingsDialog: React.FC<
  AIImageToolsSettingsDialogProps
> = ({ isOpen, onClose, openRouter, history }) => {
  if (!isOpen) {
    return null;
  }

  const folderPath = folderPathFromName(history.directoryName);
  const historyLoadingLabel = history.isLoading ? "Working..." : undefined;

  return (
    <ThemeProvider theme={darkTheme}>
      <Dialog
        open
        onClose={onClose}
        fullWidth
        maxWidth="md"
        aria-labelledby="ai-settings-title"
        PaperProps={{
          sx: {
            backgroundColor: dialogBackground,
            backgroundImage: "none",
            borderRadius: 3,
            color: appTheme.colors.textPrimary,
          },
        }}
      >
        <DialogTitle
          id="ai-settings-title"
          disableTypography
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pr: 1,
            gap: 2,
            backgroundColor: dialogBackground,
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                display: "inline-flex",
                backgroundColor: appTheme.colors.surface,
              }}
            >
              <Icon path={Icons.Gear} width={20} height={20} />
            </Box>
            <Typography variant="h6" component="p" fontWeight={600}>
              AI Image Tools settings
            </Typography>
          </Stack>
          <IconButton
            onClick={onClose}
            aria-label="Close settings dialog"
            size="small"
            sx={{
              color: appTheme.colors.textSecondary,
              "&:hover": {
                color: appTheme.colors.textPrimary,
                backgroundColor: "transparent",
              },
            }}
          >
            <Icon path={Icons.X} width={16} height={16} />
          </IconButton>
        </DialogTitle>

        <DialogContent
          sx={{
            backgroundColor: dialogBackground,
          }}
        >
          <Stack spacing={3}>
            <Paper
              elevation={0}
              square
              sx={sectionCardStyles}
              aria-labelledby="openrouter-section-title"
            >
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    component="img"
                    src={openRouterIcon}
                    alt="OpenRouter"
                    sx={{ width: 24, height: 24 }}
                  />
                  <Typography
                    id="openrouter-section-title"
                    variant="subtitle1"
                    fontWeight={600}
                  >
                    OpenRouter connection
                  </Typography>
                </Stack>

                <Box sx={nestedCardStyles}>
                  <Stack spacing={2}>
                    <OpenRouterConnect
                      isAuthenticated={openRouter.isAuthenticated}
                      isLoading={openRouter.isLoading}
                      usingEnvKey={openRouter.usingEnvKey}
                      authMethod={openRouter.authMethod}
                      apiKeyPreview={openRouter.apiKeyPreview}
                      onConnect={openRouter.onConnect}
                      onDisconnect={openRouter.onDisconnect}
                      onProvideKey={openRouter.onProvideKey}
                    />
                    {openRouter.usingEnvKey && (
                      <Typography variant="caption" color="text.secondary">
                        This environment-provided key cannot be edited here.
                        Restart the session to switch accounts.
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Paper>

            <Paper
              elevation={0}
              square
              sx={sectionCardStyles}
              aria-labelledby="history-section-title"
            >
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Icon path={Icons.History} width={20} height={20} />
                  <Box>
                    <Typography
                      id="history-section-title"
                      variant="subtitle1"
                      fontWeight={600}
                    >
                      History storage
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Keep more than the recent few entries by using a folder on
                      your computer.
                    </Typography>
                  </Box>
                </Stack>

                {!history.isSupported && (
                  <Alert
                    severity="warning"
                    icon={
                      <Box component="span" sx={{ display: "inline-flex" }}>
                        <Icon
                          path={Icons.AlertTriangle}
                          width={20}
                          height={20}
                        />
                      </Box>
                    }
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Local folders need Chromium-based browsers
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Try Chrome, Edge, Arc, or another Chromium browser to
                      unlock folder-backed history.
                    </Typography>
                  </Alert>
                )}

                {history.isFolderPersistenceActive ? (
                  <Box sx={nestedCardStyles}>
                    <Typography variant="body2" color="text.secondary">
                      Images are written to{" "}
                      <Box
                        component="span"
                        sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                      >
                        {folderPath || "your folder"}
                      </Box>
                      .
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => void history.onDisableFolder()}
                        disabled={history.isLoading}
                        sx={{
                          borderRadius: 999,
                          fontWeight: 600,
                          px: 3,
                          backgroundColor: appTheme.colors.surfaceAlt,
                          color: appTheme.colors.textPrimary,
                          "&:hover": {
                            backgroundColor: appTheme.colors.surface,
                          },
                        }}
                      >
                        {historyLoadingLabel ||
                          "Stop storing history in folder"}
                      </Button>
                    </Stack>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => void history.onEnableFolder()}
                    disabled={history.isLoading || !history.isSupported}
                    sx={{
                      ...primaryContainedButtonStyles,
                      alignSelf: "flex-start",
                    }}
                  >
                    {historyLoadingLabel || "Choose folder"}
                  </Button>
                )}

                {history.error && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {history.error}
                  </Alert>
                )}
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            py: 2,
            backgroundColor: dialogBackground,
          }}
        >
          <Button onClick={onClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
};
