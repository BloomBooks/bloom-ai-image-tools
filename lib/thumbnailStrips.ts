import {
  ImageRecord,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
} from "../types";

export interface ThumbnailStripConfig {
  id: ThumbnailStripId;
  label: string;
  allowRemove: boolean;
  allowReorder: boolean;
  allowDrop: boolean;
  pinByDefault?: boolean;
}

export const THUMBNAIL_STRIP_ORDER: ThumbnailStripId[] = [
  "history",
  "starred",
  "reference",
  "environment",
];

export const THUMBNAIL_STRIP_CONFIGS: Record<
  ThumbnailStripId,
  ThumbnailStripConfig
> = {
  history: {
    id: "history",
    label: "History",
    allowRemove: true,
    allowReorder: false,
    allowDrop: false,
    pinByDefault: true,
  },
  starred: {
    id: "starred",
    label: "Starred",
    allowRemove: true,
    allowReorder: true,
    allowDrop: true,
  },
  reference: {
    id: "reference",
    label: "Reference",
    allowRemove: true,
    allowReorder: true,
    allowDrop: true,
  },
  environment: {
    id: "environment",
    label: "Environment Images",
    allowRemove: false,
    allowReorder: false,
    allowDrop: false,
  },
};

export const resolveThumbnailStripConfigs = (
  overrides?: Partial<
    Record<ThumbnailStripId, Partial<Omit<ThumbnailStripConfig, "id">>>
  >
): Record<ThumbnailStripId, ThumbnailStripConfig> => {
  if (!overrides) {
    return THUMBNAIL_STRIP_CONFIGS;
  }

  const resolved: Partial<Record<ThumbnailStripId, ThumbnailStripConfig>> = {};
  THUMBNAIL_STRIP_ORDER.forEach((stripId) => {
    const base = THUMBNAIL_STRIP_CONFIGS[stripId];
    const override = overrides[stripId];
    resolved[stripId] = {
      ...base,
      ...(override || {}),
      id: stripId,
    };
  });

  return resolved as Record<ThumbnailStripId, ThumbnailStripConfig>;
};

const cloneStripArrays = (
  snapshot: ThumbnailStripsSnapshot
): Record<ThumbnailStripId, string[]> => {
  const cloned: Partial<Record<ThumbnailStripId, string[]>> = {};
  THUMBNAIL_STRIP_ORDER.forEach((id) => {
    cloned[id] = [...(snapshot.itemIdsByStrip[id] || [])];
  });
  return cloned as Record<ThumbnailStripId, string[]>;
};

export const createDefaultThumbnailStripsSnapshot =
  (): ThumbnailStripsSnapshot => ({
    activeStripId: "history",
    pinnedStripIds: ["history"],
    itemIdsByStrip: {
      history: [],
      starred: [],
      reference: [],
      environment: [],
    },
  });

const uniqueInsert = (
  list: string[],
  itemId: string,
  index: number,
  respectExistingIndex = true
): string[] => {
  const without = list.filter((id) => id !== itemId);
  const existingIndex = respectExistingIndex ? list.indexOf(itemId) : -1;
  const desiredIndex = existingIndex >= 0 ? existingIndex : index;
  const safeIndex = Math.min(Math.max(desiredIndex, 0), without.length);
  without.splice(safeIndex, 0, itemId);
  return without;
};

export const addItemToStrip = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId,
  itemId: string,
  index?: number
): ThumbnailStripsSnapshot => {
  const next = cloneStripArrays(snapshot);
  const targetList = next[stripId] || [];
  next[stripId] = uniqueInsert(
    targetList,
    itemId,
    index ?? targetList.length,
    true
  );
  return {
    ...snapshot,
    itemIdsByStrip: next,
  };
};

export const removeItemFromStrip = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId,
  itemId: string
): ThumbnailStripsSnapshot => {
  const next = cloneStripArrays(snapshot);
  next[stripId] = (next[stripId] || []).filter((id) => id !== itemId);
  return {
    ...snapshot,
    itemIdsByStrip: next,
  };
};

export const reorderItemInStrip = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId,
  itemId: string,
  targetIndex: number
): ThumbnailStripsSnapshot => {
  const next = cloneStripArrays(snapshot);
  const targetList = next[stripId] || [];
  if (!targetList.includes(itemId)) {
    return snapshot;
  }
  next[stripId] = uniqueInsert(targetList, itemId, targetIndex, false);
  return {
    ...snapshot,
    itemIdsByStrip: next,
  };
};

export const setStripPinState = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId,
  pinned: boolean
): ThumbnailStripsSnapshot => {
  const nextPins = snapshot.pinnedStripIds.filter((id) => id !== stripId);
  if (pinned) {
    nextPins.push(stripId);
  }
  return {
    ...snapshot,
    pinnedStripIds: nextPins,
  };
};

export const setActiveStrip = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId
): ThumbnailStripsSnapshot => {
  if (snapshot.activeStripId === stripId) {
    return snapshot;
  }
  return { ...snapshot, activeStripId: stripId };
};

export const replaceStripItems = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId,
  itemIds: string[]
): ThumbnailStripsSnapshot => {
  const next = cloneStripArrays(snapshot);
  next[stripId] = Array.from(new Set(itemIds));
  return {
    ...snapshot,
    itemIdsByStrip: next,
  };
};

export const sanitizeThumbnailStrips = (
  snapshot: ThumbnailStripsSnapshot,
  validIds: Set<string>
): ThumbnailStripsSnapshot => {
  const next = cloneStripArrays(snapshot);
  THUMBNAIL_STRIP_ORDER.forEach((id) => {
    next[id] = (next[id] || []).filter((itemId) => validIds.has(itemId));
  });
  const rawPins = (snapshot as unknown as { pinnedStripIds?: unknown })
    .pinnedStripIds;
  const hasPins = Array.isArray(rawPins);
  const sanitizedPins = (hasPins ? rawPins : []).filter(
    (id): id is ThumbnailStripId =>
      typeof id === "string" && THUMBNAIL_STRIP_ORDER.includes(id as any)
  );
  const active = THUMBNAIL_STRIP_ORDER.includes(snapshot.activeStripId)
    ? snapshot.activeStripId
    : "history";
  return {
    activeStripId: active,
    pinnedStripIds: hasPins ? sanitizedPins : ["history"],
    itemIdsByStrip: next,
  };
};

export const isStripPinned = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId
): boolean => snapshot.pinnedStripIds.includes(stripId);

export const ensureStripHasItems = (
  snapshot: ThumbnailStripsSnapshot,
  stripId: ThumbnailStripId
): ThumbnailStripsSnapshot => {
  if (snapshot.itemIdsByStrip[stripId]) {
    return snapshot;
  }
  const next = cloneStripArrays(snapshot);
  next[stripId] = [];
  return { ...snapshot, itemIdsByStrip: next };
};

export const stripCollectionIncludes = (
  snapshot: ThumbnailStripsSnapshot,
  entryId: string
): boolean => {
  return THUMBNAIL_STRIP_ORDER.some((stripId) =>
    (snapshot.itemIdsByStrip[stripId] || []).includes(entryId)
  );
};

const filterNonEnvironment = (entries: ImageRecord[]) =>
  entries.filter((entry) => entry.origin !== "environment");

export const buildStripSnapshotFromEntries = (
  entries: ImageRecord[]
): ThumbnailStripsSnapshot => {
  const base = createDefaultThumbnailStripsSnapshot();
  // UI expectation: most recent items should appear first (leftmost).
  // App state keeps history oldest-first, so reverse for display ordering.
  const orderedHistory = filterNonEnvironment(entries)
    .map((entry) => entry.id)
    .reverse();
  base.itemIdsByStrip.history = orderedHistory;
  base.itemIdsByStrip.starred = entries
    .filter((entry) => entry.isStarred)
    .map((entry) => entry.id);
  return base;
};

export const hydrateThumbnailStripsSnapshot = (
  persisted: ThumbnailStripsSnapshot | null | undefined,
  entries: ImageRecord[]
): ThumbnailStripsSnapshot => {
  const fallback = buildStripSnapshotFromEntries(entries);
  if (!persisted) {
    return fallback;
  }
  const validIds = new Set(entries.map((entry) => entry.id));
  let sanitized = sanitizeThumbnailStrips(persisted, validIds);

  const starredIds = entries
    .filter((entry) => entry.isStarred)
    .map((entry) => entry.id);
  starredIds.forEach((id) => {
    if (!sanitized.itemIdsByStrip.starred.includes(id)) {
      sanitized = addItemToStrip(sanitized, "starred", id);
    }
  });

  sanitized = replaceStripItems(
    sanitized,
    "history",
    fallback.itemIdsByStrip.history
  );
  return sanitized;
};
