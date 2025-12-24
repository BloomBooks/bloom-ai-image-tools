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
import { lightTheme } from "./materialUITheme";

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

export const AIImageToolsSettingsDialog: React.FC<
  AIImageToolsSettingsDialogProps
> = ({ isOpen, onClose, openRouter, history }) => {
  if (!isOpen) {
    return null;
  }

  const folderPath = folderPathFromName(history.directoryName);
  const historyLoadingLabel = history.isLoading ? "Working..." : undefined;

  return (
    <ThemeProvider theme={lightTheme}>
      <Dialog
        open
        onClose={onClose}
        fullWidth
        maxWidth="md"
        aria-labelledby="ai-settings-title"
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
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                display: "inline-flex",
              }}
            >
              <Icon path={Icons.Gear} className="w-5 h-5" />
            </Box>
            <Typography variant="h6" component="p" fontWeight={600}>
              AI Image Tools settings
            </Typography>
          </Stack>
          <IconButton onClick={onClose} aria-label="Close settings dialog" size="small">
            <Icon path={Icons.X} className="w-4 h-4" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: 3 }} aria-labelledby="openrouter-section-title">
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    component="img"
                    src={openRouterIcon}
                    alt="OpenRouter"
                    sx={{ width: 24, height: 24 }}
                  />
                  <Typography id="openrouter-section-title" variant="subtitle1" fontWeight={600}>
                    OpenRouter connection
                  </Typography>
                </Stack>

                <Paper variant="outlined" sx={{ p: 2 }}>
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
                        This environment-provided key cannot be edited here. Restart the session to switch
                        accounts.
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }} aria-labelledby="history-section-title">
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Icon path={Icons.History} className="w-5 h-5" />
                  <Box>
                    <Typography id="history-section-title" variant="subtitle1" fontWeight={600}>
                      History storage
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Keep more than the recent few entries by using a folder on your computer.
                    </Typography>
                  </Box>
                </Stack>

                {!history.isSupported && (
                  <Alert
                    severity="warning"
                    icon={
                      <Box component="span" sx={{ display: "inline-flex" }}>
                        <Icon path={Icons.AlertTriangle} className="w-5 h-5" />
                      </Box>
                    }
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Local folders need Chromium-based browsers
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Try Chrome, Edge, Arc, or another Chromium browser to unlock folder-backed history.
                    </Typography>
                  </Alert>
                )}

                {history.isFolderPersistenceActive ? (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Images are written to{" "}
                      <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                        {folderPath || "your folder"}
                      </Box>
                      .
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                      <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => void history.onDisableFolder()}
                        disabled={history.isLoading}
                      >
                        {historyLoadingLabel || "Stop storing history in folder"}
                      </Button>
                    </Stack>
                  </Paper>
                ) : (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => void history.onEnableFolder()}
                    disabled={history.isLoading || !history.isSupported}
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

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="outlined" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
};
