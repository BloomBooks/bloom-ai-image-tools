import { PersistedImageToolsState } from "../../types";

const migrateLegacyBookImagesNaming = (
  state: PersistedImageToolsState,
): PersistedImageToolsState => {
  const stripIdsByStrip = state.thumbnailStrips?.itemIdsByStrip as
    | Record<string, string[]>
    | undefined;
  const legacyBookImageIds = stripIdsByStrip?.["environment"] || [];
  const currentBookImageIds = state.thumbnailStrips?.itemIdsByStrip.bookImages || [];
  const thumbnailStrips = state.thumbnailStrips
    ? {
        ...state.thumbnailStrips,
        activeStripId:
          (state.thumbnailStrips.activeStripId as string) === "environment"
            ? "bookImages"
            : state.thumbnailStrips.activeStripId,
        pinnedStripIds: state.thumbnailStrips.pinnedStripIds.map((stripId) =>
          (stripId as string) === "environment" ? "bookImages" : stripId,
        ),
        itemIdsByStrip: {
          ...state.thumbnailStrips.itemIdsByStrip,
          bookImages: currentBookImageIds.length > 0 ? currentBookImageIds : legacyBookImageIds,
        },
      }
    : state.thumbnailStrips;

  const history = state.appState.history.map((entry) => ({
    ...entry,
    origin: (entry.origin as string) === "environment" ? "bookImages" : entry.origin,
    toolId: (entry.toolId as string) === "environment" ? "bookImages" : entry.toolId,
  }));

  return {
    ...state,
    thumbnailStrips,
    appState: {
      ...state.appState,
      history,
    },
  };
};

const cloneHistory = (history: PersistedImageToolsState["appState"]["history"]) => {
  if (!Array.isArray(history)) {
    return [];
  }
  return [...history];
};

export const prepareStateForPersistence = (
  state: PersistedImageToolsState,
): PersistedImageToolsState => {
  const migrated = migrateLegacyBookImagesNaming(state);
  const history = cloneHistory(migrated.appState.history);

  return {
    ...migrated,
    historyNewestFirst: true,
    appState: {
      ...migrated.appState,
      history: history.reverse(),
    },
  };
};

export const restoreStateFromPersistence = (
  state: PersistedImageToolsState,
): PersistedImageToolsState => {
  const migrated = migrateLegacyBookImagesNaming(state);

  if (!migrated.historyNewestFirst) {
    return migrated;
  }

  const history = cloneHistory(migrated.appState.history);

  return {
    ...migrated,
    appState: {
      ...migrated.appState,
      history: history.reverse(),
    },
  };
};
