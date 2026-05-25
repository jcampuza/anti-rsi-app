import { describe, expect, it, vi } from 'vitest';
import { startSpacedLoop } from './spaced-loop';

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('startSpacedLoop', () => {
  it('runs task immediately then after interval', async () => {
    let runs = 0;

    const stop = startSpacedLoop(async () => {
      runs += 1;
    }, 30);

    expect(runs).toBe(1);
    await waitFor(() => runs >= 2);
    expect(runs).toBe(2);

    stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runs).toBe(2);
  });

  it('stops on first task error by default', async () => {
    let runs = 0;

    const stop = startSpacedLoop(async () => {
      runs += 1;
      throw new Error('fail');
    }, 30);

    await waitFor(() => runs === 1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(runs).toBe(1);

    stop();
  });

  it('continues after task error when continueOnError is true', async () => {
    let runs = 0;
    const onError = vi.fn();

    const stop = startSpacedLoop(
      async () => {
        runs += 1;
        if (runs === 1) {
          throw new Error('fail');
        }
      },
      30,
      { continueOnError: true, onError },
    );

    await waitFor(() => runs === 1);
    expect(onError).toHaveBeenCalledOnce();

    await waitFor(() => runs >= 2);
    expect(runs).toBe(2);

    stop();
  });

  it('passes an abortable signal to the task', async () => {
    let captured: AbortSignal | undefined;

    const stop = startSpacedLoop(async (signal) => {
      captured = signal;
    }, 30);

    await waitFor(() => captured !== undefined);
    expect(captured?.aborted).toBe(false);

    stop();
    expect(captured?.aborted).toBe(true);
  });

  it('rejects invalid intervalMs', () => {
    expect(() => startSpacedLoop(async () => {}, -1)).toThrow(
      'intervalMs must be a non-negative finite number',
    );
  });
});
