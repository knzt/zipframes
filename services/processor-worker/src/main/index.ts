import { startWorker } from './compose.js';

const worker = await startWorker();

const shutdown = async (signal: string): Promise<void> => {
  console.info(`received ${signal}, shutting down`);
  await worker.stop();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
