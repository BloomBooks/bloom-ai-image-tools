import React, { useEffect, useMemo } from "react";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";
import { useLastDragDelayMs } from "./components/dndDragState";
import { BloomHostShell } from "./components/BloomHostShell";
import { BloomHostHarness } from "./components/BloomHostHarness";
import { createWebViewBloomHostBridge } from "./services/host/BloomHostBridge";
import { StandaloneShell } from "./components/StandaloneShell";
import { seedHistory } from "./dev/seedHistory";

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

const hasBloomHostWebView = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(
    (
      window as Window & {
        chrome?: {
          webview?: { postMessage?: (message: unknown) => void };
        };
      }
    ).chrome?.webview?.postMessage,
  );
};

export default function App() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as Window & { seedHistory?: typeof seedHistory }).seedHistory = seedHistory;
    return () => {
      delete (window as Window & { seedHistory?: typeof seedHistory }).seedHistory;
    };
  }, []);

  const envApiKey = getEnvApiKey();
  const isBloomHarness =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "bloom-harness";
  const isBloomHost = hasBloomHostWebView();
  const bloomBridge = useMemo(
    () => (isBloomHost ? createWebViewBloomHostBridge() : null),
    [isBloomHost],
  );

  return (
    <>
      {isBloomHarness ? (
        <BloomHostHarness />
      ) : bloomBridge ? (
        <BloomHostShell bridge={bloomBridge} />
      ) : (
        <StandaloneShell envApiKey={envApiKey} />
      )}
      {import.meta.env.DEV && <DragTimingOverlay />}
    </>
  );
}
