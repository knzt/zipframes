export interface IntervalJob {
  /** Stops scheduling and waits for a run already in progress. */
  readonly stop: () => Promise<void>;
}

/**
 * Runs `task` every `intervalMs`, measured from the end of the previous run,
 * so two runs never overlap in the same process. A failing run is reported
 * and the next one is still scheduled.
 */
export const startIntervalJob = (
  task: () => Promise<void>,
  intervalMs: number,
  onError: (error: unknown) => void,
): IntervalJob => {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  const schedule = (): void => {
    timer = setTimeout(() => {
      running = task()
        .catch(onError)
        .finally(() => {
          if (!stopped) {
            schedule();
          }
        });
    }, intervalMs);
    timer.unref();
  };

  schedule();

  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
};
