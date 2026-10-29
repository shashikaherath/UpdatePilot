import { app } from './app.js';
import { config } from './config/index.js';
import { prisma } from './config/prisma.js';
import { logger } from './utils/logger.js';

const server = app.listen(config.PORT, () => {
  logger.info(`UpdatePilot Backend server running on port ${config.PORT}`, {
    port: config.PORT,
    environment: config.NODE_ENV,
    apiPrefix: config.API_PREFIX,
    agentApiPrefix: config.AGENT_API_PREFIX,
    docsUrl: `http://localhost:${config.PORT}/api/docs`,
  });
});

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await prisma.$disconnect();
      logger.info('Database connections closed.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during database disconnection:', err);
      process.exit(1);
    }
  });

  // Force close after 10s if stuck
  setTimeout(() => {
    logger.error('Forcefully terminating process after shutdown timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
