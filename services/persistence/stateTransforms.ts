import { PersistedImageToolsState } from "../../types";

const cloneHistory = (history: PersistedImageToolsState["appState"]["history"]) => {
  if (!Array.isArray(history)) {
    return [];
  }
  return [...history];
};

export const prepareStateForPersistence = (
  state: PersistedImageToolsState
): PersistedImageToolsState => {
  const history = cloneHistory(state.appState.history);

  return {
    ...state,
    historyNewestFirst: true,
    appState: {
      ...state.appState,
      history: history.reverse(),
    },
  };
};

export const restoreStateFromPersistence = (
  state: PersistedImageToolsState
): PersistedImageToolsState => {
  if (!state.historyNewestFirst) {
    return state;
  }

  const history = cloneHistory(state.appState.history);

  return {
    ...state,
    appState: {
      ...state.appState,
      history: history.reverse(),
    },
  };
};
