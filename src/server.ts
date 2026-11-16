import { execSync } from 'child_process';
import { app } from './app.js';
import { config } from './config/index.js';
import { prisma } from './config/prisma.js';
import { logger } from './utils/logger.js';

// In production, ensure database migrations or schema synchronization have been applied to Neon/Postgres
if (config.isProduction) {
  try {
    logger.info('Ensuring database migrations are applied to production database...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('Database migrations applied successfully.');
  } catch (migErr) {
    logger.warn('prisma migrate deploy encountered an issue, attempting prisma db push fallback...', { error: migErr });
    try {
      execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
      logger.info('Database schema synchronized successfully via prisma db push.');
    } catch (pushErr) {
      logger.error('Critical: Failed to apply database schema to PostgreSQL database:', pushErr);
    }
  }
}

const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info(`UpdatePilot Backend server running on port ${config.PORT}`, {
    port: config.PORT,
    host: '0.0.0.0',
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
