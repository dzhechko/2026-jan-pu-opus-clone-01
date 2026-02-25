import { createLogger } from '../lib/logger';

const logger = createLogger('worker-main');

async function main() {
  logger.info({ event: 'workers_starting' });

  // Import workers to register them
  await import('./stt');
  await import('./llm-analyze');
  await import('./video-render');
  await import('./publish');
  await import('./stats-collector');

  logger.info({ event: 'workers_started', workers: ['stt', 'llm', 'video', 'publish', 'stats'] });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info({ event: 'workers_shutting_down' });
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ event: 'workers_fatal', error: err });
  process.exit(1);
});
