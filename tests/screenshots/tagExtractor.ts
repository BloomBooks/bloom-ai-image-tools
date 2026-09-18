// Runs inside the page (via page.evaluate), so it must not close over anything from this
// module other than its own arguments. It finds every visible piece of UI text that equals
// one of the editor's English strings and reports where it is, so the screenshot can be
// tagged with that string's id on Crowdin.

export type TagSource = "text" | "placeholder" | "label" | "alt";

export interface ExtractedTag {
  id: string;
  text: string;
  via: TagSource;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractionResult {
  tags: ExtractedTag[];
  /** Visible texts that matched nothing, for spotting strings we should have caught. */
  unmatched: string[];
}

export interface ExtractionInput {
  table: Record<string, string>;
  /** Drop text that something else (a dialog backdrop, a card scrolled away) is covering. */
  hitTest: boolean;
}

export function extractTags({ table, hitTest }: ExtractionInput): ExtractionResult {
  const normalize = (s: string | null | undefined) =>
    (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const exact = new Map<string, string>();
  const templates: { id: string; re: RegExp; literalLength: number }[] = [];
  for (const [id, english] of Object.entries(table)) {
    const n = normalize(english);
    if (!n) continue;
    if (/\{\d\}/.test(n)) {
      // "{0} and {1}" or "{0} left" would match almost any short text; text matching cannot
      // place such a string, so leave it to the coverage report.
      const letters = n.replace(/\{\d\}/g, "").replace(/[^\p{L}]/gu, "").length;
      if (letters < 8) continue;
      const pattern = n
        .split(/\{\d\}/)
        .map(escapeRegExp)
        .join("(.+?)");
      templates.push({
        id,
        re: new RegExp("^" + pattern + "$", "s"),
        literalLength: n.replace(/\{\d\}/g, "").length,
      });
    } else {
      exact.set(n, id);
    }
  }
  templates.sort((a, b) => b.literalLength - a.literalLength);

  // A template such as "{0} of {1}" would otherwise match any text containing " of ", so the
  // filled-in parts must look like values: short and on one line.
  const templateMatch = (n: string): string | undefined => {
    for (const t of templates) {
      const m = n.match(t.re);
      if (m && m.slice(1).every((part) => part.length <= 40 && !/[\r\n]/.test(part))) {
        return t.id;
      }
    }
    return undefined;
  };

  const match = (raw: string | null | undefined): string | undefined => {
    const n = normalize(raw);
    if (!n || n.length > 300) return undefined;
    // Tool titles may carry a step number ("1) Extract Cast of Characters") the code adds.
    const unnumbered = n.replace(/^\d+\)\s+/, "");
    return (
      exact.get(n) ?? templateMatch(n) ?? (unnumbered !== n ? exact.get(unnumbered) : undefined)
    );
  };

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const visibleRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const right = Math.min(viewportWidth, r.right);
    const bottom = Math.min(viewportHeight, r.bottom);
    if (right - x < 2 || bottom - y < 2) return null;
    if (!(el as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }))
      return null;
    if (hitTest) {
      const probe = document.elementFromPoint((x + right) / 2, (y + bottom) / 2);
      if (!probe || !(el.contains(probe) || probe.contains(el))) return null;
    }
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(right - x),
      height: Math.round(bottom - y),
    };
  };

  const rank: Record<TagSource, number> = { text: 0, placeholder: 1, label: 2, alt: 3 };
  const best = new Map<string, ExtractedTag>();
  const consider = (id: string, text: string, via: TagSource, el: Element) => {
    const rect = visibleRect(el);
    if (!rect) return;
    const candidate: ExtractedTag = { id, text: normalize(text), via, ...rect };
    const current = best.get(id);
    if (
      !current ||
      rank[via] < rank[current.via] ||
      (rank[via] === rank[current.via] &&
        candidate.width * candidate.height < current.width * current.height)
    ) {
      best.set(id, candidate);
    }
  };

  const unmatched = new Set<string>();
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (skip.has(el.tagName) || el.closest("svg")) continue;
    const html = el as HTMLElement;

    const textNodes = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "");
    const direct = normalize(textNodes.join(" "));
    if (direct) {
      // innerText carries CSS text-transform (the section headers are uppercased), so try
      // the raw textContent as well. A single text node may also be the string on its own,
      // next to a sibling node holding an icon character.
      let id =
        match(direct) ??
        match(el.textContent) ??
        match(html.innerText) ??
        textNodes.map(match).find(Boolean);
      let target: Element = el;
      if (!id) {
        // Text split across inline elements (a bold word, a link) lives in the parent.
        let ancestor: Element | null = el.parentElement;
        for (let depth = 0; ancestor && depth < 2 && !id; depth++) {
          if (ancestor.childElementCount <= 4) {
            id = match(ancestor.textContent);
            if (id) target = ancestor;
          }
          ancestor = ancestor.parentElement;
        }
      }
      if (id) {
        consider(id, target.textContent ?? direct, "text", target);
      } else if (visibleRect(el) && direct.length <= 200) {
        unmatched.add(direct);
      }
    }

    const control =
      el.closest(".MuiInputBase-root") ?? el.closest("button") ?? el.closest("[role=button]") ?? el;
    const input = el as HTMLInputElement;
    if (input.placeholder && input.value === "") {
      const id = match(input.placeholder);
      if (id) consider(id, input.placeholder, "placeholder", control);
    }
    for (const attr of ["title", "aria-label"]) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const id = match(value);
      if (id) consider(id, value, "label", control);
    }
    const alt = el.getAttribute("alt");
    if (alt) {
      const id = match(alt);
      if (id) consider(id, alt, "alt", el);
    }
  }

  const tags = Array.from(best.values()).sort((a, b) => a.y - b.y || a.x - b.x);
  return { tags, unmatched: Array.from(unmatched).slice(0, 200) };
}
