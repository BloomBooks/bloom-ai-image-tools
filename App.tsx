import React, { useMemo } from "react";
import { ImageToolsWorkspace } from "./src";
import { createBrowserImageToolsPersistence } from "./services/persistence/browserPersistence";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";

const ENV_API_KEY = (process.env.E2E_OPENROUTER_API_KEY || "").trim();

const getEnvApiKey = (): string => {
  if (!ENV_API_KEY) return "";
  if (typeof window === "undefined") {
    return ENV_API_KEY;
  }
  return window.sessionStorage?.getItem(ENV_KEY_SKIP_FLAG) === "1"
    ? ""
    : ENV_API_KEY;
};

export default function App() {
  const persistence = useMemo(() => createBrowserImageToolsPersistence(), []);

  const envApiKey = getEnvApiKey();

  return (
    <ImageToolsWorkspace persistence={persistence} envApiKey={envApiKey} />
  );
}
