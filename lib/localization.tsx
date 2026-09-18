import React, { useCallback, useContext, useEffect, useState } from "react";
import { ALL_IMAGE_EDITOR_STRINGS } from "./allStrings";

export type L10nFunc = (id: string, english: string, p0?: string, p1?: string) => string;

function applyParams(s: string, p0?: string, p1?: string): string {
  if (p0 !== undefined) s = s.replace("{0}", p0);
  if (p1 !== undefined) s = s.replace("{1}", p1);
  return s;
}

const defaultL10n: L10nFunc = (_id, english, p0, p1) => applyParams(english, p0, p1);

export const LocalizationContext = React.createContext<L10nFunc>(defaultL10n);

export function useL10n(): L10nFunc {
  return useContext(LocalizationContext);
}

/** What the host told us about itself, beside the strings it answered with. */
type LocalizationState = {
  /** The host's UI language, e.g. "en", "fr", "es-419". "en" when there is no host to ask. */
  uiLanguageId: string;
};

const LocalizationStateContext = React.createContext<LocalizationState>({ uiLanguageId: "en" });

const isEnglish = (languageId: string): boolean =>
  languageId === "en" || languageId.toLowerCase().startsWith("en-");

/**
 * Whether the host's UI is in English.
 *
 * For English text that is deliberately never translated and is better absent than shown in
 * the wrong language: the art style descriptions, which are long, numerous, and worth nobody's
 * translation budget. Hide that text when this is false.
 *
 * Only for text that a blank is a sane state for. A label, a button or a menu row must never
 * vanish; those are localized and use `useL10n`.
 */
export function useIsEnglishUi(): boolean {
  return isEnglish(useContext(LocalizationStateContext).uiLanguageId);
}

/**
 * Fetches the translations once on mount and puts them in reach of every component
 * below. With no `getLocalizations` the English defaults stand, so the editor works the
 * same when there is no host to ask.
 */
export function LocalizationProvider({
  getLocalizations,
  getUiLanguageId,
  children,
}: {
  getLocalizations?: (strings: Record<string, string>) => Promise<Record<string, string>>;
  getUiLanguageId?: () => Promise<string>;
  children: React.ReactNode;
}): React.ReactElement {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [uiLanguageId, setUiLanguageId] = useState("en");
  const l10n = useL10nFromTranslations(translations);
  const state = React.useMemo(() => ({ uiLanguageId }), [uiLanguageId]);

  useEffect(() => {
    if (getLocalizations) {
      void getLocalizations(ALL_IMAGE_EDITOR_STRINGS).then(setTranslations);
    }
    if (getUiLanguageId) {
      void getUiLanguageId().then(setUiLanguageId);
    }
    // Run once on mount; a UI language change requires a host restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocalizationStateContext.Provider value={state}>
      <LocalizationContext.Provider value={l10n}>{children}</LocalizationContext.Provider>
    </LocalizationStateContext.Provider>
  );
}

/** Interpolate React elements into a localized template string containing {0}, {1}, … markers.
 *  Returns an array of React nodes suitable for rendering inside a JSX element. */
export function interpolateJsx(template: string, elements: React.ReactNode[]): React.ReactNode[] {
  return template.split(/(\{[0-9]+\})/).map((part) => {
    const match = part.match(/^\{([0-9]+)\}$/);
    return match ? elements[parseInt(match[1], 10)] : part;
  });
}

/** Build a memoized l10n function from a translations dictionary. */
export function useL10nFromTranslations(translations: Record<string, string>): L10nFunc {
  return useCallback(
    (id: string, english: string, p0?: string, p1?: string): string =>
      applyParams(translations[id] ?? english, p0, p1),
    [translations],
  );
}
