/**
 * App — the single entry point, which decides *how* the editor is running and renders
 * the matching shell. There is one built app; the URL's `?mode=` query selects a shell:
 *
 *   ?mode=bloom-iframe   Embedded in Bloom as an <iframe> overlay. Talk to the host
 *                        over postMessage via `createIframeBloomHostBridge()` and
 *                        render <BloomHostedImageEditor>. This is the production path.
 *   ?mode=bloom-harness  Standalone dev/e2e with a *fake* Bloom (BloomHostHarness),
 *                        which seeds demo data and an in-memory bridge.
 *   (no mode)            Plain standalone editor (<StandaloneImageEditor>), e.g. the demo
 *                        site, with browser/localStorage persistence.
 *
 * The same `dist`/`dist-app` build serves all three; Bloom loads `index.html` and adds
 * `?mode=bloom-iframe`. (A retired design embedded us in a dedicated WebView2 window via
 * `chrome.webview`; that bridge has been removed — Bloom always uses the iframe path.)
 */
import React, { useEffect, useMemo } from "react";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";
import { useLastDragDelayMs } from "./components/dndDragState";
import { BloomHostedImageEditor } from "./components/BloomHostedImageEditor";
import { BloomHostHarness } from "./components/BloomHostHarness";
import { createIframeBloomHostBridge } from "./services/host/BloomHostBridge";
import { StandaloneImageEditor } from "./components/StandaloneImageEditor";
import { seedHistory } from "./dev/seedHistory";
// import ThemeTuner from "./dev/ThemeTuner";

const ENV_API_KEY = (process.env.E2E_OPENROUTER_API_KEY || "").trim();

const getEnvApiKey = (): string => {
  if (!ENV_API_KEY) return "";
  if (typeof window === "undefined") {
    return ENV_API_KEY;
  }
  return window.sessionStorage?.getItem(ENV_KEY_SKIP_FLAG) === "1" ? "" : ENV_API_KEY;
};

function DragTimingOverlay() {
  const delayMs = useLastDragDelayMs();
  if (delayMs === null) return null;
  const color = delayMs < 100 ? "#4caf50" : delayMs < 300 ? "#ff9800" : "#f44336";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        color,
        fontFamily: "monospace",
        fontSize: 13,
        padding: "4px 10px",
        borderRadius: 6,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      drag delay: {delayMs}ms
    </div>
  );
}

export default function App() {
  const searchParams =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as Window & { seedHistory?: typeof seedHistory }).seedHistory = seedHistory;
    return () => {
      delete (window as Window & { seedHistory?: typeof seedHistory }).seedHistory;
    };
  }, []);

  const envApiKey = getEnvApiKey();
  const mode = searchParams?.get("mode") ?? "";
  const isBloomHarness = mode === "bloom-harness";
  const isBloomIframeHost = mode === "bloom-iframe";
  // Opt-in flag to exercise the Bloom-specific book-images features in the plain
  // standalone editor (dev/e2e). Off by default so the public demo stays clean.
  const bloomFeaturesParam = searchParams?.get("bloomFeatures") ?? null;
  const standaloneBloomFeatures =
    bloomFeaturesParam !== null && bloomFeaturesParam !== "0" && bloomFeaturesParam !== "false";
  const bloomBridge = useMemo(
    () => (isBloomIframeHost ? createIframeBloomHostBridge() : null),
    [isBloomIframeHost],
  );

  return (
    <>
      {isBloomHarness ? (
        <BloomHostHarness />
      ) : bloomBridge ? (
        <BloomHostedImageEditor
          bridge={bloomBridge}
          onCommitComplete={() => bloomBridge.cancel()}
        />
      ) : (
        <StandaloneImageEditor envApiKey={envApiKey} bloomFeatures={standaloneBloomFeatures} />
      )}
      {import.meta.env.DEV && <DragTimingOverlay />}
      {/* {import.meta.env.DEV && <ThemeTuner />} */}
    </>
  );
}
