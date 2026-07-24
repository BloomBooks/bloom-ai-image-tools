/**
 * BloomHostHarness — a *fake* Bloom host for running the embedded editor standalone.
 * =================================================================================
 *
 * Reached via `?mode=bloom-harness` (see App.tsx). There is no real Bloom here: this
 * component stands in for everything the C# host + overlay JS would normally provide,
 * so we can develop and e2e-test the Bloom integration in a plain browser.
 *
 * It builds a `createHarnessBloomHostBridge` (in-memory files, synchronous init) seeded
 * with a realistic `init` payload — a sample book, whole-book images including an empty
 * placeholder slot, and an enumerated history folder (with one sidecar-less "orphan" to
 * exercise recovery) — then renders <BloomHostedImageEditor> around it. The on-screen panel
 * surfaces what a real host would receive: the commit payload, ready-call count, and
 * cancel state, which the Playwright specs assert against (tests/bloom-host-harness.spec.ts).
 *
 * The `?seed=` query selects alternate starting states (current-result, stale-reopen)
 * to test load/rehydration edge cases.
 */
import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import retroFuturism from "../assets/art-styles/retro-futurism.png";
import watercolorDream from "../assets/art-styles/watercolor-dream.png";
import paperCutCollage from "../assets/art-styles/paper-cut-collage.png";
import cleanLineArt from "../assets/art-styles/clean-line-art.png";
import {
  IBloomCommitReplacement,
  IBloomHostHistoryImage,
  createHarnessBloomHostBridge,
} from "../services/host/BloomHostBridge";
import { ImageCredits, PersistedImageToolsState } from "../types";
import { BloomHostedImageEditor } from "./BloomHostedImageEditor";
import { theme } from "../themes";

const HARNESS_BOOK_ID = "sample-book";

// A deliberately unreachable httpBase. The harness bridge serves all file I/O from an
// in-memory Map and opens external URLs in a real tab, so it never fetches this. The
// only consumer of `httpBase` is the host-OAuth flow, which fundamentally needs a real
// Bloom server and so isn't exercised here. We do NOT hard-code Bloom's real port
// (8089 is only its default; the live port is whatever Bloom bound and is supplied via
// `init`) — using `.invalid` makes it obvious this value is a stand-in, not an endpoint.
const HARNESS_UNUSED_HTTP_BASE = "https://bloom-host.invalid/bloom/api/aiImageEditor";
const SEEDED_RESULT_HISTORY_ID = "history-seeded-result-1";

// IP credits for some book-image slots (others deliberately have none).
const HARNESS_BOOK_IMAGE_CREDITS: Record<string, ImageCredits> = {
  "book-image-1": {
    copyrightNotice: "Copyright © 2020, Acme Art Collective",
    creator: "Ada Artist",
    license: "http://creativecommons.org/licenses/by/4.0/",
    attributionUrl: "https://acme-art.invalid/retro-futurism",
    collectionName: "Acme Art Collective",
    collectionUri: "https://acme-art.invalid",
  },
  "book-image-3": {
    copyrightNotice: "Copyright © 2018, Paper Cut Press",
    creator: "Pat Papercut",
    license: "http://creativecommons.org/licenses/by-nc/3.0/",
  },
};

// Default harness history: the host enumerates `.ai-image-editor/history/` and
// supplies each image with its `<id>.json` sidecar — except the last entry, an
// "orphan" dropped in by hand with no sidecar, which is still recovered.
const DEMO_HISTORY: IBloomHostHistoryImage[] = [
  {
    id: "history-edit-1",
    url: paperCutCollage,
    metadata: {
      id: "history-edit-1",
      parentId: null,
      toolId: "edit-image",
      parameters: { prompt: "Make it papercut" },
      durationMs: 1200,
      cost: 0.01,
      model: "google/gemini-2.5-flash-image",
      timestamp: 1000,
      promptUsed: "Make it papercut",
      sourceSummary: "Papercut edit",
      origin: "generated",
    },
  },
  {
    id: "history-edit-2",
    url: cleanLineArt,
    metadata: {
      id: "history-edit-2",
      parentId: "history-edit-1",
      toolId: "edit-image",
      parameters: { prompt: "Clean line art" },
      durationMs: 1500,
      cost: 0.01,
      model: "google/gemini-2.5-flash-image",
      timestamp: 2000,
      promptUsed: "Clean line art",
      sourceSummary: "Line art edit",
      isStarred: true,
      origin: "generated",
      // Credits carried from an edited source image, persisted in the sidecar.
      credits: {
        copyrightNotice: "Copyright © 2015, History House",
        creator: "Hana History",
        license: "http://creativecommons.org/licenses/by-sa/4.0/",
      },
    },
  },
  // Orphan: present in the folder, no sidecar.
  { id: "history-orphan-1", url: watercolorDream },
];

// A single enumerated history image that is the current result, assigned to
// book-image-1. The host supplies the bytes by URL + a sidecar.
const seededResultHistoryImage = (resultUrl: string): IBloomHostHistoryImage => ({
  id: SEEDED_RESULT_HISTORY_ID,
  url: resultUrl,
  metadata: {
    id: SEEDED_RESULT_HISTORY_ID,
    parentId: null,
    incomingSlotId: "book-image-1",
    toolId: "edit-image",
    parameters: {},
    durationMs: 0,
    cost: 0,
    model: "manual",
    timestamp: 1,
    promptUsed: "",
    sourceSummary: "",
    origin: "generated",
  },
});

// UI-only state.json that points the result pane at the seeded result. History
// itself now comes from the enumerated folder, not from state.json.
const createSeededResultUiState = (): PersistedImageToolsState => ({
  version: 1,
  appState: {
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: SEEDED_RESULT_HISTORY_ID,
    history: [],
  },
  replacementImageIdByIncomingId: {},
  paramsByTool: {},
  activeToolId: null,
  auth: {
    apiKey: null,
    authMethod: null,
  },
  thumbnailStrips: {
    activeStripId: "bookImages",
    pinnedStripIds: [],
    itemIdsByStrip: {
      history: [],
      characters: [],
      starred: [],
      reference: [],
      bookImages: [],
    },
  },
});

// Simulates relaunching after a prior session: a stale book-image record for
// book-image-1 (an old image) and a replacement assignment are persisted. On
// load the host should refresh book-image-1 to the *current* init image and start
// with empty replacement slots.
const createStaleReopenState = (): PersistedImageToolsState => ({
  version: 1,
  appState: {
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: null,
    history: [
      {
        id: SEEDED_RESULT_HISTORY_ID,
        parentId: null,
        incomingSlotId: "book-image-1",
        imageData: watercolorDream,
        imageFileName: null,
        toolId: "edit-image",
        parameters: {},
        sourceStyleId: null,
        durationMs: 0,
        cost: 0,
        model: "manual",
        timestamp: 1,
        promptUsed: "",
        sourceSummary: "",
        resolution: undefined,
        isStarred: false,
        origin: "generated",
      },
      {
        // Stale "current" book image persisted under book-image-1's slot id; the
        // init supplies retroFuturism for that slot, which should win.
        id: "book-image-1",
        parentId: null,
        incomingSlotId: undefined,
        imageData: paperCutCollage,
        imageFileName: null,
        toolId: "bookImages",
        parameters: {},
        sourceStyleId: null,
        durationMs: 0,
        cost: 0,
        model: "",
        timestamp: 0,
        promptUsed: "Book Image",
        sourceSummary: "Book Image",
        resolution: undefined,
        isStarred: false,
        origin: "bookImages",
      },
    ],
  },
  replacementImageIdByIncomingId: { "book-image-1": SEEDED_RESULT_HISTORY_ID },
  paramsByTool: {},
  activeToolId: null,
  auth: { apiKey: null, authMethod: null },
  thumbnailStrips: {
    activeStripId: "bookImages",
    pinnedStripIds: [],
    itemIdsByStrip: {
      history: [SEEDED_RESULT_HISTORY_ID],
      characters: [],
      starred: [],
      reference: [],
      bookImages: ["book-image-1", "book-image-2", "book-image-3", "book-image-4", "book-image-5"],
    },
  },
});

export const BloomHostHarness: React.FC = () => {
  const [commitPayload, setCommitPayload] = React.useState<IBloomCommitReplacement[]>([]);
  const [wasCancelled, setWasCancelled] = React.useState(false);
  const [readyCount, setReadyCount] = React.useState(0);
  const requestCloseListenersRef = React.useRef<Array<() => void>>([]);
  const seedMode =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("seed") : null;
  // The harness plays a developer-mode Bloom by default (the e2e specs lean on
  // the free dummy model); `?devtools=off` simulates a normal end-user Bloom.
  const showDeveloperTools =
    typeof window === "undefined" ||
    new URLSearchParams(window.location.search).get("devtools") !== "off";
  const initialFiles = React.useMemo(() => {
    if (seedMode === "current-result") {
      return { "state.json": JSON.stringify(createSeededResultUiState()) };
    }
    if (seedMode === "stale-reopen") {
      return { "state.json": JSON.stringify(createStaleReopenState()) };
    }
    return undefined;
  }, [seedMode]);

  const historyImages = React.useMemo<IBloomHostHistoryImage[]>(() => {
    if (seedMode === "current-result") {
      return [seededResultHistoryImage(retroFuturism)];
    }
    return DEMO_HISTORY;
  }, [seedMode]);

  const bridge = React.useMemo(
    () =>
      createHarnessBloomHostBridge({
        initPayload: {
          book: { id: HARNESS_BOOK_ID, title: "Harness Book" },
          bookImages: [
            ...[retroFuturism, watercolorDream, paperCutCollage, cleanLineArt].map(
              (src, index) => ({
                id: `book-image-${index + 1}`,
                src,
                pageLabel: `Page ${index + 1}`,
                // Some slots carry IP credits (as a real book would), others
                // don't — the specs assert both cases round-trip on commit.
                credits: HARNESS_BOOK_IMAGE_CREDITS[`book-image-${index + 1}`] ?? null,
              }),
            ),
            // An empty placeholder slot: the editor should show its own placeholder
            // graphic rather than try to load the book's placeHolder.png.
            {
              id: "book-image-5",
              src: "https://bloom-book.invalid/placeHolder.png",
              pageLabel: "Page 5",
              isPlaceholder: true,
            },
          ],
          // The host enumerates `.ai-image-editor/history/` and supplies the list;
          // see DEMO_HISTORY (includes an unsidecar'd orphan to exercise recovery).
          history: historyImages,
          references: [],
          apiKey: "",
          httpBase: HARNESS_UNUSED_HTTP_BASE,
          sessionToken: "harness-session",
          // Simulate launching on a specific image: it should land in "Image to Edit".
          selectedBookImageId: "book-image-3",
          showDeveloperTools,
        },
        initialFiles,
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
    [initialFiles, historyImages, showDeveloperTools],
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
          // The debug overlay floats above the editor's tool sidebar; it must
          // never steal clicks meant for the app underneath (its own buttons
          // opt back in).
          pointerEvents: "none",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ pointerEvents: "auto" }}>
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
            onClick={() => void bridge.clearAllFiles()}
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
      <BloomHostedImageEditor bridge={bridge} />
    </Box>
  );
};
