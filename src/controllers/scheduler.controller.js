/**
 * Scheduler controller.
 * Handles HTTP requests for scheduled job management endpoints.
 * Allows Superadmin to view registered jobs, execution history, and manually trigger jobs.
 *
 * Requirements: 42.4
 */

const { listJobs, triggerJob } = require('../jobs/index');
const jobLogModel = require('../models/jobLog.model');
const { success, paginated, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/scheduler/jobs
 * List all registered scheduled jobs with their name, schedule, description, and last run status.
 */
async function getJobs(req, res) {
  try {
    // Get registered jobs from the scheduler
    const jobs = listJobs();

    // Get latest execution status per job
    const latestLogs = await jobLogModel.getLatestPerJob();
    const latestByName = {};
    for (const log of latestLogs) {
      latestByName[log.job_name] = {
        last_run_at: log.start_time,
        last_status: log.status,
        records_processed: log.records_processed,
        records_failed: log.records_failed,
      };
    }

    // Merge job definitions with last run status
    const result = jobs.map((job) => ({
      name: job.name,
      schedule: job.schedule,
      description: job.description,
      active: job.active,
      last_run: latestByName[job.name] || null,
    }));

    return success(res, result, 'Scheduled jobs retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/scheduler/logs
 * Get paginated job execution history with optional filters.
 */
async function getLogs(req, res) {
  try {
    const {
      job_name,
      status: logStatus,
      from_date,
      to_date,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const filters = {
      job_name,
      status: logStatus,
      from_date,
      to_date,
      page: pageNum,
      limit: limitNum,
    };

    const { logs, total } = await jobLogModel.findAll(filters);

    const totalPages = Math.ceil(total / limitNum);

    return paginated(
      res,
      logs,
      {
        page: pageNum,
        limit: limitNum,
        totalItems: total,
        totalPages,
      },
      'Job execution logs retrieved successfully.'
    );
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/scheduler/jobs/:name/run
 * Manually trigger a scheduled job by name.
 */
async function runJob(req, res) {
  try {
    const { name } = req.params;

    const result = await triggerJob(name);

    return success(res, result, `Job "${name}" executed successfully.`);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  getJobs,
  getLogs,
  runJob,
};
