import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import retroFuturism from "../assets/art-styles/retro-futurism.png";
import watercolorDream from "../assets/art-styles/watercolor-dream.png";
import paperCutCollage from "../assets/art-styles/paper-cut-collage.png";
import cleanLineArt from "../assets/art-styles/clean-line-art.png";
import {
  BloomCommitReplacement,
  createHarnessBloomHostBridge,
} from "../services/host/BloomHostBridge";
import { BloomHostShell } from "./BloomHostShell";
import { theme } from "../themes";

const HARNESS_BOOK_ID = "sample-book";

export const BloomHostHarness: React.FC = () => {
  const [commitPayload, setCommitPayload] = React.useState<BloomCommitReplacement[]>([]);
  const [wasCancelled, setWasCancelled] = React.useState(false);
  const [readyCount, setReadyCount] = React.useState(0);
  const requestCloseListenersRef = React.useRef<Array<() => void>>([]);

  const bridge = React.useMemo(
    () =>
      createHarnessBloomHostBridge({
        initPayload: {
          book: { id: HARNESS_BOOK_ID, title: "Harness Book" },
          bookImages: [retroFuturism, watercolorDream, paperCutCollage, cleanLineArt].map(
            (src, index) => ({
              id: `book-image-${index + 1}`,
              src,
              pageLabel: `Page ${index + 1}`,
            }),
          ),
          references: [],
          apiKey: "",
          sessionToken: "harness-session",
        },
        onCommit(replacements) {
          setCommitPayload(replacements);
          setWasCancelled(false);
        },
        onCancel() {
          setWasCancelled(true);
        },
        onReady() {
          setReadyCount((count) => count + 1);
        },
      }),
    [],
  );

  React.useEffect(() => {
    const unsubscribe = bridge.onRequestClose(() => {
      requestCloseListenersRef.current.forEach((listener) => listener());
    });
    return unsubscribe;
  }, [bridge]);

  return (
    <Box sx={{ backgroundColor: theme.colors.appBackground, minHeight: "100vh" }}>
      <Box
        sx={{
          position: "fixed",
          left: 12,
          top: 12,
          zIndex: 1300,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          maxWidth: 360,
        }}
      >
        <Stack direction="row" spacing={1}>
          <Button
            data-testid="bloom-harness-request-close"
            variant="outlined"
            onClick={() => bridge.cancel()}
          >
            Request Close
          </Button>
          <Button
            data-testid="bloom-harness-reset-state"
            variant="outlined"
            onClick={() => void bridge.clearState(`bloom-host:${HARNESS_BOOK_ID}:harness-session`)}
          >
            Reset State
          </Button>
        </Stack>
        <Typography
          data-testid="bloom-harness-ready-count"
          variant="caption"
          sx={{ color: theme.colors.textPrimary }}
        >
          ready calls: {readyCount}
        </Typography>
        <Typography
          data-testid="bloom-harness-cancelled"
          variant="caption"
          sx={{ color: theme.colors.textPrimary }}
        >
          cancelled: {wasCancelled ? "yes" : "no"}
        </Typography>
        <Box
          data-testid="bloom-harness-commit-payload"
          sx={{
            p: 1.5,
            borderRadius: 2,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            color: "#fff",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
          }}
        >
          {JSON.stringify(commitPayload, null, 2)}
        </Box>
      </Box>
      <BloomHostShell bridge={bridge} />
    </Box>
  );
};
