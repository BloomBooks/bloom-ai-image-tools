import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ImageRecord } from "../types";
import { createBloomHostPersistence } from "../services/persistence/bloomHostPersistence";
import {
  BloomCommitReplacement,
  BloomHostBridge,
  BloomHostInitPayload,
} from "../services/host/BloomHostBridge";
import { ImageToolsWorkspace } from "./ImageToolsWorkspace";
import { theme } from "../themes";

interface BloomHostShellProps {
  bridge: BloomHostBridge;
  onCommitComplete?: (replacements: BloomCommitReplacement[]) => void;
  onCancelComplete?: () => void;
}

export const BloomHostShell: React.FC<BloomHostShellProps> = ({
  bridge,
  onCommitComplete,
  onCancelComplete,
}) => {
  const [initPayload, setInitPayload] = React.useState<BloomHostInitPayload | null>(null);
  const [replacementMap, setReplacementMap] = React.useState<Record<string, ImageRecord | null>>(
    {},
  );
  const [status, setStatus] = React.useState<string>("Waiting for host init...");

  React.useEffect(() => {
    const unsubscribeInit = bridge.onInit((payload) => {
      setInitPayload(payload);
      setStatus(`Connected to ${payload.book.title}`);
    });
    const unsubscribeRequestClose = bridge.onRequestClose(() => {
      bridge.cancel();
      onCancelComplete?.();
      setStatus("Host requested close. Sent cancel.");
    });

    bridge.ready();

    return () => {
      unsubscribeInit();
      unsubscribeRequestClose();
    };
  }, [bridge, onCancelComplete]);

  const persistence = React.useMemo(() => {
    if (!initPayload) {
      return null;
    }
    return createBloomHostPersistence(
      bridge,
      `bloom-host:${initPayload.book.id}:${initPayload.sessionToken}`,
    );
  }, [bridge, initPayload]);

  const handleCommit = React.useCallback(async () => {
    if (!initPayload) {
      return;
    }

    const replacements = Object.entries(replacementMap)
      .filter(([, item]) => Boolean(item?.imageData))
      .map(([incomingId, item]) => ({
        incomingId,
        newImageUrl: item?.imageData || "",
      }));

    await bridge.commit(replacements);
    onCommitComplete?.(replacements);
    setStatus(`Committed ${replacements.length} replacement(s).`);
  }, [bridge, initPayload, onCommitComplete, replacementMap]);

  const handleCancel = React.useCallback(() => {
    bridge.cancel();
    onCancelComplete?.();
    setStatus("Cancelled.");
  }, [bridge, onCancelComplete]);

  if (!initPayload || !persistence) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.appBackground,
          color: theme.colors.textPrimary,
        }}
      >
        <Typography data-testid="bloom-host-status">{status}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative" }}>
      <Box
        sx={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 1200,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          alignItems: "flex-end",
        }}
      >
        <Stack direction="row" spacing={1}>
          <Button data-testid="bloom-host-cancel" variant="outlined" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            data-testid="bloom-host-commit"
            variant="contained"
            onClick={() => void handleCommit()}
          >
            Commit
          </Button>
        </Stack>
        <Typography
          data-testid="bloom-host-status"
          variant="caption"
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: 999,
            backgroundColor: "rgba(15, 23, 42, 0.76)",
            color: "#fff",
          }}
        >
          {status}
        </Typography>
      </Box>
      <ImageToolsWorkspace
        persistence={persistence}
        envApiKey={initPayload.apiKey || ""}
        bookImageUrls={initPayload.bookImages.map((image) => image.src)}
        bookImagesStripMode="host"
        onReplacementsChange={setReplacementMap}
        thumbnailStripConfigOverrides={{
          bookImages: {
            label: "Book Images",
            allowDrop: false,
            allowRemove: false,
            allowReorder: false,
          },
        }}
      />
    </Box>
  );
};
