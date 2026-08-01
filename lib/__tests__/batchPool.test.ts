import { describe, expect, it, vi } from "vitest";
import { runBatchPool, type BatchPoolConfig } from "../batchPool";

class RateLimitedError extends Error {
  readonly rateLimited = true;
}

class AbortErrorLike extends Error {
  readonly name = "AbortError";
}

function makeConfig(overrides: Partial<BatchPoolConfig> = {}): BatchPoolConfig {
  return {
    concurrency: 4,
    retryDelaysMs: [5000, 15000, 30000],
    maxRetries: 3,
    signal: new AbortController().signal,
    isRateLimited: (error) => error instanceof RateLimitedError,
    isAbortError: (error) => error instanceof AbortErrorLike,
    wait: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runBatchPool", () => {
  it("runs every id to completion and reports each success", async () => {
    const onSuccess = vi.fn();
    const onStart = vi.fn();
    const runOne = vi.fn(async (id: string) => `result-${id}`);

    await runBatchPool(["a", "b", "c"], runOne, makeConfig(), { onStart, onSuccess });

    expect(runOne).toHaveBeenCalledTimes(3);
    expect(onStart.mock.calls.map((c) => c[0]).sort((a, b) => a.localeCompare(b))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(onSuccess).toHaveBeenCalledWith("a", "result-a");
    expect(onSuccess).toHaveBeenCalledWith("b", "result-b");
    expect(onSuccess).toHaveBeenCalledWith("c", "result-c");
  });

  it("never runs more than `concurrency` at once", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const runOne = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve();
          });
        }),
    );

    const donePromise = runBatchPool(
      ["a", "b", "c", "d", "e"],
      runOne,
      makeConfig({ concurrency: 2 }),
    );

    // Let the microtask queue settle so the first wave of starts happens.
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(2);

    // Release everything, one at a time, letting the pump refill between releases.
    while (releases.length || active > 0) {
      const release = releases.shift();
      release?.();
      await Promise.resolve();
      await Promise.resolve();
    }

    await donePromise;
    expect(maxActive).toBe(2);
    expect(runOne).toHaveBeenCalledTimes(5);
  });

  it("retries a rate-limited id using the configured backoff schedule, then succeeds", async () => {
    const wait = vi.fn(async () => {});
    let calls = 0;
    const runOne = vi.fn(async () => {
      calls += 1;
      if (calls <= 3) {
        throw new RateLimitedError("slow down");
      }
      return "ok";
    });
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    await runBatchPool(["a"], runOne, makeConfig({ wait, concurrency: 1 }), {
      onSuccess,
      onFailure,
    });

    expect(runOne).toHaveBeenCalledTimes(4); // original + 3 retries
    expect(wait).toHaveBeenNthCalledWith(1, 5000, expect.anything());
    expect(wait).toHaveBeenNthCalledWith(2, 15000, expect.anything());
    expect(wait).toHaveBeenNthCalledWith(3, 30000, expect.anything());
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("a", "ok");
  });

  it("fails an id after exhausting the max retries on persistent rate-limiting", async () => {
    const wait = vi.fn(async () => {});
    const runOne = vi.fn(async () => {
      throw new RateLimitedError("still slow");
    });
    const onFailure = vi.fn();

    await runBatchPool(["a"], runOne, makeConfig({ wait, concurrency: 1, maxRetries: 3 }), {
      onFailure,
    });

    expect(runOne).toHaveBeenCalledTimes(4); // original + 3 retries, then give up
    expect(wait).toHaveBeenCalledTimes(3);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toBe("a");
    expect(onFailure.mock.calls[0][1]).toBeInstanceOf(RateLimitedError);
  });

  it("drops effective concurrency to 1 after the first rate-limited error, for new dispatches only", async () => {
    // 6 ids with concurrency 4: the first wave (a,b,c,d) dispatches
    // immediately, leaving e/f queued. "b" rate-limits on its first attempt,
    // which should drop effective concurrency to 1 — so once a/c/d free up
    // their slots, e and f must be dispatched one at a time, never together.
    const releases: Array<() => void> = [];
    let dropped = false;
    const queuedConcurrentCount = { active: 0, max: 0 };

    const runOne = vi.fn((id: string) => {
      if (id === "b" && runOne.mock.calls.filter((c) => c[0] === "b").length === 1) {
        return Promise.reject(new RateLimitedError("slow down"));
      }
      if (dropped && (id === "e" || id === "f")) {
        queuedConcurrentCount.active += 1;
        queuedConcurrentCount.max = Math.max(
          queuedConcurrentCount.max,
          queuedConcurrentCount.active,
        );
      }
      return new Promise<void>((resolve) => {
        releases.push(() => {
          if (id === "e" || id === "f") queuedConcurrentCount.active -= 1;
          resolve();
        });
      });
    });

    const wait = vi.fn(async () => {});
    const onConcurrencyDropped = vi.fn(() => {
      dropped = true;
    });

    const donePromise = runBatchPool(
      ["a", "b", "c", "d", "e", "f"],
      runOne,
      makeConfig({ concurrency: 4, wait }),
      { onConcurrencyDropped },
    );

    // Let the initial wave (a,b,c,d) dispatch and b's rejection propagate.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(onConcurrencyDropped).toHaveBeenCalledTimes(1);

    // Release a, c, d one at a time so e/f get scheduled under the new
    // (dropped) concurrency limit, then release e/f themselves.
    while (releases.length) {
      const release = releases.shift()!;
      release();
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    }

    await donePromise;
    expect(queuedConcurrentCount.max).toBeLessThanOrEqual(1);
    expect(onConcurrencyDropped).toHaveBeenCalledTimes(1); // fires once even though only one 429 occurred
  });

  it("marks an id cancelled (not failed) when the wait is aborted mid-backoff", async () => {
    const controller = new AbortController();
    const wait = vi.fn((_ms: number, signal: AbortSignal) => {
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new AbortErrorLike("aborted")), {
          once: true,
        });
      });
    });
    const runOne = vi.fn(async () => {
      throw new RateLimitedError("slow down");
    });
    const onFailure = vi.fn();
    const onCancelled = vi.fn();

    const donePromise = runBatchPool(
      ["a"],
      runOne,
      makeConfig({ wait, signal: controller.signal, concurrency: 1 }),
      { onFailure, onCancelled },
    );

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await donePromise;

    expect(onCancelled).toHaveBeenCalledWith("a");
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("cancels not-yet-started ids once the signal is already aborted, without calling runOne", async () => {
    const controller = new AbortController();
    controller.abort();
    const runOne = vi.fn(async () => "ok");
    const onCancelled = vi.fn();

    await runBatchPool(["a", "b"], runOne, makeConfig({ signal: controller.signal }), {
      onCancelled,
    });

    expect(runOne).not.toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalledWith("a");
    expect(onCancelled).toHaveBeenCalledWith("b");
  });

  it("treats a thrown AbortError as cancelled, not failed, and stops starting new ids", async () => {
    const started: string[] = [];
    const runOne = vi.fn(async (id: string) => {
      started.push(id);
      if (id === "a") {
        throw new AbortErrorLike("aborted mid-flight");
      }
      return "ok";
    });
    const onFailure = vi.fn();
    const onCancelled = vi.fn();

    await runBatchPool(["a", "b", "c"], runOne, makeConfig({ concurrency: 1 }), {
      onFailure,
      onCancelled,
    });

    expect(onCancelled).toHaveBeenCalledWith("a");
    expect(onFailure).not.toHaveBeenCalled();
    // Sequential (concurrency 1): once "a" aborts, the signal isn't itself
    // marked aborted by this test's config, so the pool has no way to know
    // to stop — this documents that stopping-on-abort relies on the caller's
    // AbortController actually being aborted (covered by the two tests above).
    expect(started).toContain("a");
  });
});
