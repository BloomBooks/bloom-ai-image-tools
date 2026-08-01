/**
 * Worker-pool orchestration for a batch run (PLAN-batch-processing.md WP7).
 *
 * Pure decision/orchestration logic only — no React state, no DOM, no
 * `openRouterService` imports. The caller supplies `runOne` (the actual
 * per-image work), predicates for classifying an error, and a `wait`
 * function for backoff delays, so this module is fully unit-testable
 * without real timers or network calls.
 *
 * Rules encoded here:
 * - Up to `concurrency` images run at once; when one settles, the next
 *   queued id starts. Dispatch order follows the `ids` array, so callers
 *   should pass ids in the order they want images to start.
 * - A rate-limited error (per `isRateLimited`) retries the SAME image after
 *   a backoff wait, up to `maxRetries` times, using `retryDelaysMs` in
 *   order (the last entry repeats if retries exceed the schedule length).
 * - The first rate-limited error seen anywhere in the run drops the pool's
 *   effective concurrency to 1 for the remainder of the run (new dispatches
 *   only — images already in flight are left to finish).
 * - An abort (signal already aborted, `wait` rejecting, or `isAbortError`
 *   on a thrown error) marks that id cancelled, not failed, and stops the
 *   pool from starting any further not-yet-started ids.
 */

export const BATCH_CONCURRENCY = 4;
export const BATCH_RATE_LIMIT_RETRY_DELAYS_MS = [5000, 15000, 30000];
export const BATCH_RATE_LIMIT_MAX_RETRIES = 3;

/**
 * Test-only override for the rate-limit backoff schedule, so an e2e spec can
 * exercise the retry path without waiting through the real 5s/15s/30s delays.
 * Read once per batch run by `resolveBatchRetryDelaysMs`.
 */
declare global {
  interface Window {
    __bloomBatchRetryDelaysMsOverride?: number[];
  }
}

export function resolveBatchRetryDelaysMs(): number[] {
  if (typeof window !== "undefined" && Array.isArray(window.__bloomBatchRetryDelaysMsOverride)) {
    return window.__bloomBatchRetryDelaysMsOverride;
  }
  return BATCH_RATE_LIMIT_RETRY_DELAYS_MS;
}

export interface BatchPoolConfig {
  concurrency: number;
  retryDelaysMs: number[];
  maxRetries: number;
  signal: AbortSignal;
  isRateLimited: (error: unknown) => boolean;
  isAbortError: (error: unknown) => boolean;
  /** Waits `ms`, rejecting immediately (or as soon as the signal aborts mid-wait). */
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface BatchPoolCallbacks<TResult> {
  onStart?: (id: string) => void;
  onSuccess?: (id: string, result: TResult) => void;
  onFailure?: (id: string, error: unknown) => void;
  onCancelled?: (id: string) => void;
  /** Fired once, the first time a rate-limited error drops concurrency to 1. */
  onConcurrencyDropped?: () => void;
}

/**
 * Runs `runOne` over `ids` with the concurrency/backoff rules described
 * above. Resolves once every id has settled (succeeded, failed, or been
 * cancelled). Never rejects — failures and cancellations are reported via
 * the callbacks instead.
 */
export async function runBatchPool<TResult>(
  ids: string[],
  runOne: (id: string) => Promise<TResult>,
  config: BatchPoolConfig,
  callbacks: BatchPoolCallbacks<TResult> = {},
): Promise<void> {
  if (ids.length === 0) return;

  let effectiveConcurrency = Math.max(1, config.concurrency);
  let concurrencyDropped = false;
  let nextIndex = 0;
  let activeCount = 0;

  const runWithRetries = async (id: string): Promise<void> => {
    let attempt = 0;
    for (;;) {
      if (config.signal.aborted) {
        callbacks.onCancelled?.(id);
        return;
      }

      callbacks.onStart?.(id);
      try {
        const result = await runOne(id);
        callbacks.onSuccess?.(id, result);
        return;
      } catch (error) {
        if (config.signal.aborted || config.isAbortError(error)) {
          callbacks.onCancelled?.(id);
          return;
        }

        if (config.isRateLimited(error) && attempt < config.maxRetries) {
          if (!concurrencyDropped) {
            concurrencyDropped = true;
            effectiveConcurrency = 1;
            callbacks.onConcurrencyDropped?.();
          }
          const delayMs =
            config.retryDelaysMs[Math.min(attempt, config.retryDelaysMs.length - 1)] ?? 0;
          attempt += 1;
          try {
            await config.wait(delayMs, config.signal);
          } catch {
            callbacks.onCancelled?.(id);
            return;
          }
          continue;
        }

        callbacks.onFailure?.(id, error);
        return;
      }
    }
  };

  await new Promise<void>((resolve) => {
    const maybeFinish = () => {
      if (activeCount === 0 && (nextIndex >= ids.length || config.signal.aborted)) {
        resolve();
      }
    };

    const pump = () => {
      if (config.signal.aborted) {
        // Nothing left to dispatch once aborted — report every not-yet-started
        // id as cancelled (rather than leaving it silently unresolved) so the
        // caller sees a settle event for every id it passed in.
        while (nextIndex < ids.length) {
          const id = ids[nextIndex];
          nextIndex += 1;
          callbacks.onCancelled?.(id);
        }
        maybeFinish();
        return;
      }

      while (activeCount < effectiveConcurrency && nextIndex < ids.length) {
        const id = ids[nextIndex];
        nextIndex += 1;
        activeCount += 1;
        void runWithRetries(id).finally(() => {
          activeCount -= 1;
          pump();
        });
      }
      maybeFinish();
    };

    pump();
  });
}
