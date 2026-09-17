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

/**
 * Fetches the translations once on mount and puts them in reach of every component
 * below. With no `getLocalizations` the English defaults stand, so the editor works the
 * same when there is no host to ask.
 */
export function LocalizationProvider({
  getLocalizations,
  children,
}: {
  getLocalizations?: (strings: Record<string, string>) => Promise<Record<string, string>>;
  children: React.ReactNode;
}): React.ReactElement {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const l10n = useL10nFromTranslations(translations);

  useEffect(() => {
    if (!getLocalizations) return;
    void getLocalizations(ALL_IMAGE_EDITOR_STRINGS).then(setTranslations);
    // Run once on mount; a UI language change requires a host restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <LocalizationContext.Provider value={l10n}>{children}</LocalizationContext.Provider>;
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
