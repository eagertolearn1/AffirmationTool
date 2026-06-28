const { Queue, Worker } = require('bullmq');
const IORedis  = require('ioredis');
const logger   = require('../utils/logger');

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

// ── Queue definitions ────────────────────────────────────────
const previewQueue          = new Queue('preview-generation',         { connection });
const affirmationQueue      = new Queue('affirmation-generation',     { connection });
const audioQueue            = new Queue('audio-generation',           { connection });
const infographicQueue      = new Queue('infographic-generation',     { connection });
const progressCardQueue     = new Queue('progress-card',              { connection });

// ── Worker processors ────────────────────────────────────────
const { processPreview }      = require('./previewWorker');
const { processAffirmations } = require('./affirmationWorker');
const { processAudio }        = require('./audioWorker');
const { processInfographic }  = require('./infographicWorker');
const { processProgressCard } = require('./progressCardWorker');

const WORKER_OPTS = {
  connection,
  concurrency: 3,
  limiter: { max: 10, duration: 1000 }, // max 10 jobs/sec per worker
};

function startWorkers() {
  const previewWorker = new Worker('preview-generation', processPreview,
    { ...WORKER_OPTS, concurrency: 5 }); // Higher concurrency — user is waiting

  const affirmationWorker = new Worker('affirmation-generation', processAffirmations,
    { ...WORKER_OPTS, concurrency: 3 });

  const audioWorker = new Worker('audio-generation', processAudio,
    { ...WORKER_OPTS, concurrency: 5 });

  const infographicWorker = new Worker('infographic-generation', processInfographic,
    { ...WORKER_OPTS, concurrency: 3 });

  const progressCardWorker = new Worker('progress-card', processProgressCard,
    { ...WORKER_OPTS, concurrency: 3 });

  const workers = [previewWorker, affirmationWorker, audioWorker, infographicWorker, progressCardWorker];

  workers.forEach(w => {
    w.on('completed', job => logger.info({ queue: w.name, jobId: job.id }, 'Job completed'));
    w.on('failed',    (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'Job failed'));
    w.on('error',     err => logger.error({ queue: w.name, err }, 'Worker error'));
  });

  logger.info('All BullMQ workers started');
  return workers;
}

module.exports = {
  previewQueue, affirmationQueue, audioQueue, infographicQueue, progressCardQueue,
  startWorkers, connection,
};
