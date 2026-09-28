import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startIntervalJob } from '../../../../src/infrastructure/scheduling/intervalJob.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startIntervalJob', () => {
  it('runs the task every interval, counted from the end of the previous run', async () => {
    const task = vi.fn(() => Promise.resolve());
    const job = startIntervalJob(task, 1000, vi.fn());

    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);

    await job.stop();
  });

  it('reports a failing run and keeps scheduling', async () => {
    const failure = new Error('db down');
    const task = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const job = startIntervalJob(task, 1000, onError);

    await vi.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(task).toHaveBeenCalledTimes(2);
    await job.stop();
  });

  it('waits for the run in progress on stop and schedules no more', async () => {
    let finish: () => void = () => undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const job = startIntervalJob(task, 1000, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);

    const stopped = job.stop();
    finish();
    await stopped;
    await vi.advanceTimersByTimeAsync(5000);

    expect(task).toHaveBeenCalledOnce();
  });
});
