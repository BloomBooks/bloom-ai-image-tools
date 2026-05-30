import React from "react";
import { Box, Button, Typography } from "@mui/material";
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
  const lastInitSignatureRef = React.useRef<string | null>(null);
  // Prevent bridge.ready() from firing more than once across React StrictMode
  // double-invocations of the effect, which would cause Bloom to send multiple
  // init messages.
  const readySentRef = React.useRef(false);

  const buildInitSignature = React.useCallback((payload: BloomHostInitPayload) => {
    const imageSignature = payload.bookImages.map((image) => `${image.id}:${image.src}`).join("|");
    return `${payload.sessionToken}::${payload.book.id}::${payload.httpBase}::${imageSignature}`;
  }, []);

  React.useEffect(() => {
    const unsubscribeInit = bridge.onInit((payload) => {
      const signature = buildInitSignature(payload);
      if (signature === lastInitSignatureRef.current) {
        return;
      }

      lastInitSignatureRef.current = signature;
      setInitPayload(payload);
      setStatus(``);
      //setStatus(`Connected to ${payload.book.title}`);
    });
    const unsubscribeRequestClose = bridge.onRequestClose(() => {
      bridge.cancel();
      onCancelComplete?.();
      setStatus("Host requested close. Sent cancel.");
    });

    if (!readySentRef.current) {
      readySentRef.current = true;
      bridge.ready();
    }

    return () => {
      unsubscribeInit();
      unsubscribeRequestClose();
    };
  }, [bridge, buildInitSignature, onCancelComplete]);

  const persistence = React.useMemo(() => {
    if (!initPayload) {
      return null;
    }
    return createBloomHostPersistence(bridge);
  }, [bridge, initPayload]);

  const hostBookImages = React.useMemo(
    () =>
      (initPayload?.bookImages || []).map((image) => ({
        id: image.id,
        src: image.src,
      })),
    [initPayload?.bookImages],
  );

  const hostBookImageUrls = React.useMemo(
    () => (initPayload?.bookImages || []).map((image) => image.src),
    [initPayload?.bookImages],
  );

  const buildReplacements = React.useCallback(
    (incomingIds?: Iterable<string>) => {
      const allowedIncomingIds = incomingIds ? new Set(incomingIds) : null;
      return Object.entries(replacementMap)
        .filter(([incomingId, item]) => {
          if (!item?.imageData) {
            return false;
          }

          return !allowedIncomingIds || allowedIncomingIds.has(incomingId);
        })
        .map(([incomingId, item]) => ({
          incomingId,
          newImageUrl: item?.imageData || "",
        }));
    },
    [replacementMap],
  );

  const handleCommit = React.useCallback(
    async (incomingIds?: Iterable<string>) => {
      if (!initPayload) {
        return;
      }

      const replacements = buildReplacements(incomingIds);

      try {
        await bridge.commit(replacements);
        onCommitComplete?.(replacements);
      } catch (error) {
        throw error;
      }
    },
    [bridge, buildReplacements, initPayload, onCommitComplete],
  );

  const handleCommitCurrentResult = React.useCallback(
    async (item: ImageRecord) => {
      if (!item.incomingSlotId || !item.imageData) {
        return;
      }

      const replacements = [
        {
          incomingId: item.incomingSlotId,
          newImageUrl: item.imageData,
        },
      ];

      try {
        await bridge.commit(replacements);
        onCommitComplete?.(replacements);
        setStatus("Committed 1 replacement.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Commit failed.");
      }
    },
    [bridge, onCommitComplete],
  );

  const handleCommitAll = React.useCallback(async () => {
    const replacements = buildReplacements();
    if (!replacements.length) {
      setStatus("No book image replacements are assigned yet.");
      return;
    }

    setStatus(
      `Committing ${replacements.length} replacement${replacements.length === 1 ? "" : "s"}...`,
    );
    try {
      await handleCommit();
      setStatus(
        `Committed ${replacements.length} replacement${replacements.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Commit failed.");
    }
  }, [buildReplacements, handleCommit]);

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
      <Box
        sx={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 1200,
        }}
      >
        <Button
          data-testid="bloom-host-cancel"
          variant="outlined"
          onClick={handleCancel}
          sx={{
            backgroundColor: "rgba(15, 23, 42, 0.76)",
            color: "#fff",
            borderColor: "rgba(255, 255, 255, 0.25)",
            "&:hover": {
              backgroundColor: "rgba(15, 23, 42, 0.9)",
              borderColor: "rgba(255, 255, 255, 0.4)",
            },
          }}
        >
          Cancel
        </Button>
      </Box>
      <ImageToolsWorkspace
        persistence={persistence}
        envApiKey={initPayload.apiKey || ""}
        bookImages={hostBookImages}
        bookImageUrls={hostBookImageUrls}
        bookImagesStripMode="host"
        oauthHost={{
          httpBase: initPayload.httpBase,
          sessionToken: initPayload.sessionToken,
          openExternalUrl: (url) => bridge.openExternalUrl(url),
        }}
        onReplacementsChange={setReplacementMap}
        onCommitCurrentResult={(item) => void handleCommitCurrentResult(item)}
        currentResultActionLabel="Replace the image in book with this image"
        currentResultActionTestId="bloom-host-commit-current-result"
        onCommitBookImages={() => void handleCommitAll()}
        bookImagesActionLabel="Replace images in your book with these images"
        bookImagesActionTestId="bloom-host-commit-book-images"
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
