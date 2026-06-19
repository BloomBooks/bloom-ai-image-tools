import React from "react";
import { Alert, Link } from "@mui/material";

// Where the user manages Auto Top-Up (the setting that turns an uncapped key from a
// "limited to current balance" risk into an unbounded one).
export const OPENROUTER_ACCOUNT_URL = "https://openrouter.ai/settings/credits";

/**
 * The single source of truth for the "this key has no spending limit" warning. Shown both
 * after a successful key test (OpenRouterConnect) and next to the credits meter
 * (OpenRouterCreditsHeader). The "OpenRouter account" hyperlink opens in the user's real
 * default browser via onOpenExternalUrl when supplied (the host bridge in Bloom); without
 * a handler it falls back to the plain href.
 */
export function NoSpendingLimitWarning({
  onOpenExternalUrl,
}: {
  onOpenExternalUrl?: (url: string) => void;
}) {
  return (
    <Alert severity="warning" sx={{ fontSize: "0.8rem", py: 0.5 }}>
      This key has no spending limit. Make sure that{" "}
      <Link
        href={OPENROUTER_ACCOUNT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!onOpenExternalUrl) return;
          e.preventDefault();
          onOpenExternalUrl(OPENROUTER_ACCOUNT_URL);
        }}
      >
        OpenRouter account
      </Link>{" "}
      does not have {"'Auto Top-Up'"} on
    </Alert>
  );
}
