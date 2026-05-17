import { AppState, ImageRecord, PersistedAppState } from "../types";

const hasAccessibleImage = (item: ImageRecord, allowFileBackedEntries: boolean) => {
  return !!item.imageData || (allowFileBackedEntries && !!item.imageFileName);
};

export const sanitizePersistedAppState = (
  persisted: PersistedAppState | null | undefined,
  options?: { allowFileBackedEntries?: boolean },
): PersistedAppState => {
  const allowFileBackedEntries = options?.allowFileBackedEntries ?? true;
  const history = Array.isArray(persisted?.history) ? (persisted?.history as ImageRecord[]) : [];
  const accessibleIds = new Set(
    history
      .filter((item) => hasAccessibleImage(item, allowFileBackedEntries))
      .map((item) => item.id),
  );

  const normalizeId = (id: string | null) => (id && accessibleIds.has(id) ? id : null);
  const referenceImageIds = Array.isArray(persisted?.referenceImageIds)
    ? (persisted?.referenceImageIds as string[]).filter((id) => accessibleIds.has(id))
    : [];

  return {
    targetImageId: normalizeId(persisted?.targetImageId ?? null),
    referenceImageIds,
    rightPanelImageId: normalizeId(persisted?.rightPanelImageId ?? null),
    history,
  };
};

const mergeImageRecord = (current: ImageRecord, incoming: ImageRecord) => {
  return {
    ...incoming,
    ...current,
    imageData: current.imageData || incoming.imageData,
    imageFileName: current.imageFileName || incoming.imageFileName,
    isStarred: current.isStarred ?? incoming.isStarred,
  };
};

export const mergeHistoryFields = (
  current: AppState,
  incoming: PersistedAppState,
  options?: { preserveCurrentOnlyHistory?: boolean },
): Pick<AppState, "history" | "targetImageId" | "referenceImageIds" | "rightPanelImageId"> => {
  const preserveCurrentOnlyHistory = options?.preserveCurrentOnlyHistory ?? true;
  const incomingById = new Map(incoming.history.map((item) => [item.id, item]));
  const mergedHistory = current.history.reduce<ImageRecord[]>((result, item) => {
    const incomingItem = incomingById.get(item.id);
    if (!incomingItem) {
      if (preserveCurrentOnlyHistory) {
        result.push(item);
      }
      return result;
    }
    incomingById.delete(item.id);
    result.push(mergeImageRecord(item, incomingItem));
    return result;
  }, []);
  incomingById.forEach((item) => mergedHistory.push(item));

  const validIds = new Set(mergedHistory.map((item) => item.id));
  const resolveId = (primary: string | null, fallback: string | null) => {
    if (primary && validIds.has(primary)) {
      return primary;
    }
    if (fallback && validIds.has(fallback)) {
      return fallback;
    }
    return null;
  };

  const mergedReferences = Array.from(
    new Set([...current.referenceImageIds, ...incoming.referenceImageIds]),
  ).filter((id) => validIds.has(id));

  return {
    history: mergedHistory,
    targetImageId: resolveId(current.targetImageId, incoming.targetImageId),
    rightPanelImageId: resolveId(current.rightPanelImageId, incoming.rightPanelImageId),
    referenceImageIds: mergedReferences,
  };
};
