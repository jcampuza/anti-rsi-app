import { describe, expect, it, vi } from "vitest";
import { retryWithBackoff } from "./retry";

describe("retryWithBackoff", () => {
  it("retries failed operations with configured backoff delays", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("still not ready"))
      .mockResolvedValue("ready");

    try {
      const result = retryWithBackoff(operation, {
        retries: 5,
        delaysMs: [250, 500, 1_000, 2_000, 4_000],
      });

      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(500);

      await expect(result).resolves.toBe("ready");
      expect(operation).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws the last error after retries are exhausted", async () => {
    vi.useFakeTimers();
    const finalError = new Error("failed");
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(finalError);

    try {
      const result = retryWithBackoff(operation, {
        retries: 1,
        delaysMs: [250],
      });
      const assertion = expect(result).rejects.toBe(finalError);

      await vi.advanceTimersByTimeAsync(250);

      await assertion;
      expect(operation).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
