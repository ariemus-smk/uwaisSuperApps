/**
 * Job Scheduler - Registry and Initialization
 * Uses node-cron to schedule and manage background jobs.
 * Provides a job execution wrapper that handles logging, error handling,
 * and status tracking via the job_logs table.
 *
 * Requirements: 42.1, 42.2, 42.3
 */

const cron = require('node-cron');
const jobLogModel = require('../models/jobLog.model');

/**
 * Registry of all scheduled jobs.
 * Each entry contains: name, schedule, handler, and cron task reference.
 * @type {Map<string, {name: string, schedule: string, handler: Function, task: object|null, description: string}>}
 */
const jobRegistry = new Map();

/**
 * Job execution wrapper.
 * Handles start/end time logging, records processed/failed tracking,
 * and status determination (Success, Partial, Failed).
 *
 * The handler function should return an object with:
 *   { records_processed: number, records_failed: number, errors: string[] }
 *
 * @param {string} jobName - Name of the job being executed
 * @param {Function} handler - Async function that performs the job work
 * @returns {Promise<object>} Job execution result with log ID and status
 */
async function executeJob(jobName, handler) {
  let logEntry;

  try {
    // Log job start
    logEntry = await jobLogModel.create({ job_name: jobName });
    console.log(`[JOB] ${jobName} started (log_id: ${logEntry.id})`);
  } catch (err) {
    console.error(`[JOB] ${jobName} failed to create log entry:`, err.message);
    // Still attempt to run the job even if logging fails
    logEntry = null;
  }

  let result;

  try {
    // Execute the job handler
    result = await handler();

    // Normalize result
    const records_processed = result?.records_processed || 0;
    const records_failed = result?.records_failed || 0;
    const errors = result?.errors || [];

    // Determine status
    let status;
    if (records_failed === 0) {
      status = 'Success';
    } else if (records_processed > 0) {
      status = 'Partial';
    } else {
      status = 'Failed';
    }

    const error_details = errors.length > 0 ? errors.join('\n') : null;

    // Log job completion
    if (logEntry) {
      await jobLogModel.complete(logEntry.id, {
        records_processed,
        records_failed,
        status,
        error_details,
      });
    }

    console.log(
      `[JOB] ${jobName} completed - status: ${status}, processed: ${records_processed}, failed: ${records_failed}`
    );

    return {
      log_id: logEntry?.id || null,
      job_name: jobName,
      status,
      records_processed,
      records_failed,
      error_details,
    };
  } catch (err) {
    // Job threw an unhandled error - mark as Failed
    const error_details = err.message || 'Unknown error';

    if (logEntry) {
      try {
        await jobLogModel.complete(logEntry.id, {
          records_processed: result?.records_processed || 0,
          records_failed: result?.records_failed || 0,
          status: 'Failed',
          error_details,
        });
      } catch (logErr) {
        console.error(`[JOB] ${jobName} failed to update log entry:`, logErr.message);
      }
    }

    console.error(`[JOB] ${jobName} failed with error:`, error_details);

    return {
      log_id: logEntry?.id || null,
      job_name: jobName,
      status: 'Failed',
      records_processed: 0,
      records_failed: 0,
      error_details,
    };
  }
}

/**
 * Register a job in the registry.
 * @param {object} jobDef - Job definition
 * @param {string} jobDef.name - Unique job name
 * @param {string} jobDef.schedule - Cron expression (node-cron format)
 * @param {Function} jobDef.handler - Async function to execute
 * @param {string} [jobDef.description=''] - Human-readable description
 */
function registerJob({ name, schedule, handler, description = '' }) {
  if (jobRegistry.has(name)) {
    console.warn(`[JOB] Job "${name}" is already registered. Overwriting.`);
  }

  jobRegistry.set(name, {
    name,
    schedule,
    handler,
    task: null,
    description,
  });
}

/**
 * Initialize and start all registered cron jobs.
 * Should be called after all jobs are registered (typically at server startup).
 */
function initializeScheduler() {
  for (const [name, job] of jobRegistry) {
    if (!cron.validate(job.schedule)) {
      console.error(`[JOB] Invalid cron expression for "${name}": ${job.schedule}`);
      continue;
    }

    const task = cron.schedule(job.schedule, async () => {
      await executeJob(name, job.handler);
    });

    job.task = task;
    console.log(`[JOB] Scheduled "${name}" with cron: ${job.schedule}`);
  }

  console.log(`[JOB] Scheduler initialized with ${jobRegistry.size} job(s).`);
}

/**
 * Stop all scheduled cron jobs.
 * Should be called during graceful shutdown.
 */
function stopScheduler() {
  for (const [name, job] of jobRegistry) {
    if (job.task) {
      job.task.stop();
      console.log(`[JOB] Stopped "${name}"`);
    }
  }
}

/**
 * Manually trigger a job by name.
 * Useful for Superadmin manual re-runs via API.
 * @param {string} jobName - Name of the job to trigger
 * @returns {Promise<object>} Job execution result
 * @throws {Error} If job name is not found in registry
 */
async function triggerJob(jobName) {
  const job = jobRegistry.get(jobName);
  if (!job) {
    const err = new Error(`Job "${jobName}" not found in registry`);
    err.statusCode = 404;
    err.code = 'JOB_NOT_FOUND';
    throw err;
  }

  return executeJob(jobName, job.handler);
}

/**
 * Get list of all registered jobs with their schedules and status.
 * @returns {Array<{name: string, schedule: string, description: string, active: boolean}>}
 */
function listJobs() {
  const jobs = [];
  for (const [, job] of jobRegistry) {
    jobs.push({
      name: job.name,
      schedule: job.schedule,
      description: job.description,
      active: job.task !== null,
    });
  }
  return jobs;
}

/**
 * Register all known jobs.
 * Called before initializeScheduler() to populate the registry.
 */
function registerAllJobs() {
  const billingGenerationJob = require('./billingGeneration.job');
  billingGenerationJob.register();

  const autoIsolirJob = require('./autoIsolir.job');
  autoIsolirJob.register();

  const nasHealthPollJob = require('./nasHealthPoll.job');
  nasHealthPollJob.register();

  const notificationBroadcastJob = require('./notificationBroadcast.job');
  notificationBroadcastJob.register();

  const fupEnforcementJob = require('./fupEnforcement.job');
  fupEnforcementJob.register();

  const fupResetJob = require('./fupReset.job');
  fupResetJob.register();

  const kpiCalculationJob = require('./kpiCalculation.job');
  kpiCalculationJob.register();
}

module.exports = {
  registerJob,
  registerAllJobs,
  initializeScheduler,
  stopScheduler,
  executeJob,
  triggerJob,
  listJobs,
  jobRegistry,
};
