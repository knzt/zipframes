import { startAuthService } from './compose.js';

const main = async (): Promise<void> => {
  const service = await startAuthService();
  let stopping = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.info(`received ${signal}, shutting down`);
    await service.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
