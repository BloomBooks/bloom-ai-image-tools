/**
 * BloomHostedImageEditor — the editor's top-level component when it is embedded in Bloom.
 * ==================================================================================
 *
 * This is the editor side of the Bloom integration: the adapter that sits between a
 * `IBloomHostBridge` (how we talk to the host — see services/host/BloomHostBridge.ts)
 * and the actual `ImageToolsWorkspace` UI. Its job:
 *
 *   1. Call `bridge.ready()` once, then wait for the host's `init` payload (book info,
 *      whole-book images, enumerated history, httpBase + sessionToken).
 *   2. Build a Bloom-backed persistence layer so state/history land in the book's
 *      `.ai-image-editor/` folder over HTTP instead of in localStorage.
 *   3. Render `ImageToolsWorkspace` wired to that persistence, the host's book-image
 *      strip, and the host OAuth shim.
 *   4. Turn the user's "replace in book" actions into `bridge.commit(...)` calls.
 *      Image bytes are written to the history folder first and referenced by id, so
 *      they never cross the postMessage bridge (see `buildReplacement`).
 *
 * App.tsx renders this when the URL says `?mode=bloom-iframe` (real Bloom) and
 * BloomHostHarness.tsx renders it around a fake bridge for standalone dev/e2e.
 * Named "Embedded" — not "Host" — because this runs in the *guest* (the editor),
 * talking *to* the Bloom host.
 */
import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { ImageRecord } from "../types";
import { createBloomHostPersistence } from "../services/persistence/bloomHostPersistence";
import {
  IBloomCommitReplacement,
  IBloomHostBridge,
  IBloomHostInitPayload,
} from "../services/host/BloomHostBridge";
import { ImageToolsWorkspace } from "./ImageToolsWorkspace";
import { theme } from "../themes";

interface BloomHostedImageEditorProps {
  bridge: IBloomHostBridge;
  onCommitComplete?: (replacements: IBloomCommitReplacement[]) => void;
  onCancelComplete?: () => void;
}

export const BloomHostedImageEditor: React.FC<BloomHostedImageEditorProps> = ({
  bridge,
  onCommitComplete,
  onCancelComplete,
}) => {
  const [initPayload, setInitPayload] = React.useState<IBloomHostInitPayload | null>(null);
  const [replacementMap, setReplacementMap] = React.useState<Record<string, ImageRecord | null>>(
    {},
  );
  const [status, setStatus] = React.useState<string>("Waiting for host init...");
  const lastInitSignatureRef = React.useRef<string | null>(null);
  // Prevent bridge.ready() from firing more than once across React StrictMode
  // double-invocations of the effect, which would cause Bloom to send multiple
  // init messages.
  const readySentRef = React.useRef(false);

  const buildInitSignature = React.useCallback((payload: IBloomHostInitPayload) => {
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
    return createBloomHostPersistence(bridge, {
      historyImages: initPayload.history ?? [],
    });
  }, [bridge, initPayload]);

  const hostBookImages = React.useMemo(
    () =>
      (initPayload?.bookImages || []).map((image) => ({
        id: image.id,
        src: image.src,
        isPlaceholder: image.isPlaceholder,
      })),
    [initPayload?.bookImages],
  );

  const hostBookImageUrls = React.useMemo(
    () => (initPayload?.bookImages || []).map((image) => image.src),
    [initPayload?.bookImages],
  );

  // Build the commit payload for the assigned slots. Image *bytes* never cross the
  // postMessage bridge: a generated/uploaded result (a base64 data URL) is written
  // to the per-book history folder over the binary HTTP file endpoint and referenced
  // by `resultId`; an image that already has a host-served URL (e.g. another book
  // image reused as a replacement) is referenced by that `sourceUrl`. Returns null
  // for items that have neither (nothing to apply).
  const buildReplacement = React.useCallback(
    async (incomingId: string, item: ImageRecord): Promise<IBloomCommitReplacement | null> => {
      if (item.imageData?.startsWith("data:image/")) {
        // Ensure the bytes are on disk for the host to read. The persistence layer
        // normally writes this already; this guarantees presence (idempotent
        // overwrite) without racing the debounced save.
        await bridge.putFile(`history/${item.id}.png`, item.imageData);
        return { incomingId, resultId: item.id };
      }
      if (item.imageData) {
        return { incomingId, sourceUrl: item.imageData };
      }
      return null;
    },
    [bridge],
  );

  const collectAssignedEntries = React.useCallback(
    (incomingIds?: Iterable<string>) => {
      const allowedIncomingIds = incomingIds ? new Set(incomingIds) : null;
      return Object.entries(replacementMap)
        .filter(([incomingId, item]) => {
          if (!item?.imageData) {
            return false;
          }
          return !allowedIncomingIds || allowedIncomingIds.has(incomingId);
        })
        .map(([incomingId, item]) => ({ incomingId, item: item as ImageRecord }));
    },
    [replacementMap],
  );

  const handleCommit = React.useCallback(
    async (incomingIds?: Iterable<string>) => {
      if (!initPayload) {
        return;
      }

      const entries = collectAssignedEntries(incomingIds);
      const replacements = (
        await Promise.all(entries.map(({ incomingId, item }) => buildReplacement(incomingId, item)))
      ).filter((replacement): replacement is IBloomCommitReplacement => replacement !== null);

      await bridge.commit(replacements);
      onCommitComplete?.(replacements);
    },
    [bridge, buildReplacement, collectAssignedEntries, initPayload, onCommitComplete],
  );

  const handleCommitCurrentResult = React.useCallback(
    async (item: ImageRecord) => {
      if (!item.incomingSlotId || !item.imageData) {
        return;
      }

      try {
        const replacement = await buildReplacement(item.incomingSlotId, item);
        if (!replacement) {
          return;
        }
        await bridge.commit([replacement]);
        onCommitComplete?.([replacement]);
        setStatus("Committed 1 replacement.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Commit failed.");
      }
    },
    [bridge, buildReplacement, onCommitComplete],
  );

  const handleCommitAll = React.useCallback(async () => {
    const count = collectAssignedEntries().length;
    if (!count) {
      setStatus("No book image replacements are assigned yet.");
      return;
    }

    setStatus(`Committing ${count} replacement${count === 1 ? "" : "s"}...`);
    try {
      await handleCommit();
      setStatus(`Committed ${count} replacement${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Commit failed.");
    }
  }, [collectAssignedEntries, handleCommit]);

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
        selectedBookImageId={initPayload.selectedBookImageId}
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
