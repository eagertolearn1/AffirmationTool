const app    = require('./src/app');
const logger = require('./src/utils/logger');
const { startWorkers, connection } = require('./src/workers/index');
const { startScheduler }           = require('./src/services/scheduler');

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// Start BullMQ workers
startWorkers();
logger.info('BullMQ workers started');

// Start WhatsApp reminder scheduler
startScheduler(connection);
logger.info('WhatsApp scheduler started');

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
  process.exit(1);
});
