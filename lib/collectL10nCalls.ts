/**
 * Finds every `l10n("<id>", "<english>")` call in a chunk of source and returns the
 * id/English pairs. Used by the test that keeps `lib/staticStrings.ts` in step with the
 * call sites, and by the script that regenerates that file.
 *
 * It reads the literal arguments only: a call whose id or English is built at runtime
 * (the tools' text, whose IDs come from the tool registry) is skipped, since there is no
 * literal to read.
 */
const CALL = /\bl10n\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

const unquote = (literal: string): string =>
  JSON.parse(literal.startsWith("'") ? `"${literal.slice(1, -1).replace(/"/g, '\\"')}"` : literal);

export const collectL10nCalls = (source: string): Array<[string, string]> => {
  const pairs: Array<[string, string]> = [];
  for (const match of source.matchAll(CALL)) {
    pairs.push([unquote(match[1]), unquote(match[2])]);
  }
  return pairs;
};
