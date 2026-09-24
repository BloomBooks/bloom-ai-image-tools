/**
 * The analytics events this editor hands its host, and the pure functions that build
 * their properties.
 * ============================================================================
 *
 * The host (Bloom) forwards these to Segment exactly as sent: it does not know their names
 * or their properties, so the names here are the names in Segment. Two rules hold
 * everywhere in this file:
 *
 *   1. Every property an event declares is always present, even when it has no value:
 *      an empty string, 0 or false, never an omitted key, so each event has one shape to
 *      query.
 *   2. No value is ever free text. Prompts, parameter text, image names, page text and
 *      anything else lifted from the user's book stay out; counts, enum ids, durations,
 *      costs and model ids are what goes in. See IBloomHostControl.trackEvent.
 *
 * The builders live here, apart from the component that emits them, so they can be
 * tested directly (lib/__tests__/analyticsEvents.test.ts).
 */
import type {
  ImageRecord,
  ModelImageQuality,
  ModelInfo,
  ModelReasoningLevel,
  ToolDefinition,
} from "../types";
import { STYLE_PARAM_KEY } from "./artStyles";
import { getReferenceConstraints, getToolById } from "./toolHelpers";
import {
  getQualityLevelsForModel,
  getReasoningLevelsForModel,
  resolveToolQuality,
  resolveToolReasoningLevel,
} from "./modelsCatalog";

export type AnalyticsProperties = Record<string, string | number | boolean>;

/** One generation attempt (one image, so a batch of five fires five of these). */
// "AI Image Editor", not "AI Editor": Bloom may one day have AI tools for text or video.
export const GENERATE_EVENT = "AI Image Editor Generate";
/** One batch invocation: `phase` says whether this is its start or its end. */
export const BATCH_RUN_EVENT = "AI Image Editor Batch Run";
/** One tool in the ancestry of an image the user put into the book. */
export const ACCEPT_EVENT = "AI Image Editor Accept";
/** The editor finished starting up inside a host. */
export const OPEN_EVENT = "AI Image Editor Open";
/**
 * The user left without committing: the Cancel button, or the host's own close button.
 * A successful commit also ends the session, but the host removes the editor as soon as
 * it answers, so there is no chance to send anything then; that session's last events are
 * its `AI Image Editor Accept` events. `picturesCommitted` is how many pictures earlier
 * commits in this session put into the book, so a Close with 0 is a session that kept
 * nothing.
 */
export const CLOSE_EVENT = "AI Image Editor Close";
// Every event also carries `aiImageEditorSessionId` and `sessionSeconds`, added by the
// Bloom host bridge (createIframeBloomHostBridge), so a session's events can be grouped and
// its length read off its last event.

/** Where a run's result is headed, relative to the book image the user launched on. */
export type TargetPage = "current" | "other" | "none";

/**
 * Whether this tool offers the art-style picker. Read off the tool's own parameter list
 * rather than a list of tool ids here, so a tool that gains or loses the picker needs no
 * change in this file.
 */
export const toolHasArtStyleParam = (tool: ToolDefinition | null | undefined): boolean =>
  Boolean(tool?.parameters?.some((parameter) => parameter.type === "art-style"));

/**
 * The style id to report for a run. A style id is one of our own enum values (or "none"
 * when the user cleared the style), never anything the user typed. Tools with no style
 * picker report "" rather than dropping the property.
 */
export const getAnalyticsStyleId = (
  tool: ToolDefinition | null | undefined,
  params: Record<string, string> | null | undefined,
): string => {
  if (!toolHasArtStyleParam(tool)) {
    return "";
  }
  return (params?.[STYLE_PARAM_KEY] ?? "").trim();
};

/**
 * True when this tool takes reference images but does not require any, which is what
 * makes "how often do people bother?" answerable (count referenceCount > 0 among these).
 */
export const referenceImagesAreOptional = (tool: ToolDefinition | null | undefined): boolean => {
  const { min, max } = getReferenceConstraints(tool?.referenceImages ?? "0");
  return min === 0 && max > 0;
};

/** The reasoning level a run sends, or "" for a model that has no reasoning setting. */
export const getAnalyticsReasoningLevel = (
  tool: ToolDefinition,
  model: ModelInfo | null,
  reasoningByTool?: Record<string, ModelReasoningLevel>,
): string =>
  getReasoningLevelsForModel(model?.id).length === 0
    ? ""
    : resolveToolReasoningLevel(tool, model, reasoningByTool);

/** The image quality a run sends, or "" for a model that has no quality setting. */
export const getAnalyticsQuality = (
  tool: ToolDefinition,
  model: ModelInfo | null,
  qualityByTool?: Record<string, ModelImageQuality>,
): string =>
  getQualityLevelsForModel(model?.id).length === 0
    ? ""
    : (resolveToolQuality(tool, model, qualityByTool) ?? "");

/**
 * Which page an image is for: the one the editor was launched on ("current"), a
 * different slot in the same book ("other"), or no book slot at all ("none" — a
 * standalone or history image that is not headed into the book).
 */
export const resolveTargetPage = (
  slotId: string | null | undefined,
  launchedBookImageId: string | null | undefined,
  bookImageSlotIds: readonly string[],
): TargetPage => {
  if (!slotId) {
    return "none";
  }
  if (launchedBookImageId && slotId === launchedBookImageId) {
    return "current";
  }
  return bookImageSlotIds.includes(slotId) ? "other" : "none";
};

const roundUsd = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : 0;

/** Guards a corrupt or cyclic parentId chain from looping forever. */
const MAX_ANCESTRY_DEPTH = 64;

/**
 * Every tool step that contributed to `item`, oldest first: walk up the parentId chain
 * and keep the records whose toolId names a real tool. Book images, book-original
 * snapshots, uploads and recovered files name no tool and so contribute nothing, which
 * is what ends the chain at the picture the user started from.
 */
export const collectToolAncestry = (
  item: ImageRecord | null | undefined,
  itemsById: Record<string, ImageRecord | undefined>,
): ImageRecord[] => {
  const chain: ImageRecord[] = [];
  const seen = new Set<string>();
  let current: ImageRecord | null | undefined = item;
  let depth = 0;

  while (current && !seen.has(current.id) && depth < MAX_ANCESTRY_DEPTH) {
    seen.add(current.id);
    depth += 1;
    if (getToolById(current.toolId ?? null)) {
      chain.push(current);
    }
    current = current.parentId ? itemsById[current.parentId] : null;
  }

  return chain.reverse();
};

export interface AcceptEventContext {
  /** The record the user put into the book. */
  committed: ImageRecord;
  /** Everything the editor knows about, for the parentId walk. */
  itemsById: Record<string, ImageRecord | undefined>;
  /** The book slot the image went into. */
  slotId: string | null | undefined;
  /** The slot the editor was launched on, for targetPage. */
  launchedBookImageId: string | null | undefined;
  bookImageSlotIds: readonly string[];
  /** How many images this one commit put into the book: 1 from "Use this Image", and the
   *  number of filled slots from the "Replace" button that commits them all. A count rather
   *  than a flag, because `batch` already means something else on the generate event (the
   *  image was produced by a batch run), and one word cannot mean both. */
  acceptedCount: number;
  /** True when the slot held no image before this. */
  targetSlotEmpty: boolean;
  /** Date.now() at commit time, passed in so the builder stays pure. */
  nowMs: number;
}

/**
 * One event per tool in the accepted image's ancestry: every tool that contributed gets
 * the credit, so totals over-count images on purpose. `isFinalTool` is the filter that
 * counts each accepted image once.
 */
export const buildAcceptEventProperties = (context: AcceptEventContext): AnalyticsProperties[] => {
  const chain = collectToolAncestry(context.committed, context.itemsById);
  const targetPage = resolveTargetPage(
    context.slotId,
    context.launchedBookImageId,
    context.bookImageSlotIds,
  );

  return chain.map((ancestor, index) => ({
    tool: ancestor.toolId ?? "",
    model: ancestor.model ?? "",
    styleId: ancestor.sourceStyleId ?? "",
    reasoningLevel: ancestor.reasoningLevel ?? "",
    isFinalTool: ancestor.id === context.committed.id,
    chainLength: chain.length,
    chainPosition: index + 1,
    acceptedCount: context.acceptedCount,
    targetPage,
    targetSlotEmpty: context.targetSlotEmpty,
    secondsSinceGenerated:
      typeof ancestor.timestamp === "number" && ancestor.timestamp > 0
        ? Math.max(0, Math.round((context.nowMs - ancestor.timestamp) / 1000))
        : 0,
    costUSD: roundUsd(ancestor.cost),
  }));
};

export interface GenerateEventContext {
  tool: ToolDefinition;
  params: Record<string, string>;
  toolModel: ModelInfo | null;
  reasoningByTool?: Record<string, ModelReasoningLevel>;
  qualityByTool?: Record<string, ModelImageQuality>;
  /** References actually sent, after the tool's cap. */
  referenceCount: number;
  /** False for a picture made from nothing. */
  hasTargetImage: boolean;
  /** True when no OpenRouter call is made (browser-side tool, or the local dummy model). */
  runsLocally: boolean;
  batch: boolean;
  /** How many images this run covers: the batch's size, or 1. */
  batchSize: number;
  slotId: string | null | undefined;
  launchedBookImageId: string | null | undefined;
  bookImageSlotIds: readonly string[];
  targetSlotEmpty: boolean;
}

/**
 * The properties every generate attempt carries, whatever its outcome. The outcome
 * itself (result, attemptNumber, duration, cost) is added by the caller, which is the
 * only thing that knows how the attempt ended.
 */
export const buildGenerateEventProperties = (
  context: GenerateEventContext,
): AnalyticsProperties => ({
  tool: context.tool.id,
  model: context.toolModel?.id ?? "",
  // Whether they are editing a picture that was already there or making one from nothing.
  sourceKind: context.hasTargetImage ? "existing image" : "blank",
  referenceCount: context.referenceCount,
  batch: context.batch,
  runsLocally: context.runsLocally,
  styleId: getAnalyticsStyleId(context.tool, context.params),
  reasoningLevel: getAnalyticsReasoningLevel(
    context.tool,
    context.toolModel,
    context.reasoningByTool,
  ),
  quality: getAnalyticsQuality(context.tool, context.toolModel, context.qualityByTool),
  referenceImagesOptional: referenceImagesAreOptional(context.tool),
  targetPage: resolveTargetPage(
    context.slotId,
    context.launchedBookImageId,
    context.bookImageSlotIds,
  ),
  targetSlotEmpty: context.targetSlotEmpty,
  batchSize: context.batchSize,
});

export interface BatchRunEventContext {
  tool: ToolDefinition;
  toolModel: ModelInfo | null;
  params: Record<string, string>;
  imageCount: number;
  /** "started" when the run begins, "finished" when it is over however it ended. */
  phase: "started" | "finished";
  succeeded: number;
  failed: number;
  cancelled: number;
}

/**
 * One event per batch invocation, sent twice: once as it starts and once as it ends.
 * Both carry the same property set (the counts are 0 at the start) so the event has one
 * shape for the host to register.
 */
export const buildBatchRunEventProperties = (
  context: BatchRunEventContext,
): AnalyticsProperties => ({
  tool: context.tool.id,
  model: context.toolModel?.id ?? "",
  styleId: getAnalyticsStyleId(context.tool, context.params),
  imageCount: context.imageCount,
  phase: context.phase,
  succeeded: context.succeeded,
  failed: context.failed,
  cancelled: context.cancelled,
});
