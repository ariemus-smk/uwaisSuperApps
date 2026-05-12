/**
 * Job Log model for App DB.
 * Provides data access methods for the `job_logs` table.
 * Tracks scheduled job executions with start/end times, records processed/failed, and status.
 *
 * Requirements: 42.1, 42.2, 42.3
 */

const { appPool } = require('../config/database');

/**
 * Create a new job log entry (marks job start).
 * @param {object} logData - Job log data
 * @param {string} logData.job_name - Name of the scheduled job
 * @returns {Promise<object>} Created log entry with insertId and start_time
 */
async function create(logData) {
  const { job_name } = logData;

  const [result] = await appPool.execute(
    `INSERT INTO job_logs (job_name, start_time, status)
     VALUES (?, NOW(), 'Running')`,
    [job_name]
  );

  return { id: result.insertId, job_name, status: 'Running' };
}

/**
 * Mark a job log as completed with results.
 * @param {number} id - Job log ID
 * @param {object} resultData - Completion data
 * @param {number} resultData.records_processed - Number of records successfully processed
 * @param {number} resultData.records_failed - Number of records that failed
 * @param {string} resultData.status - Final status (Success, Partial, Failed)
 * @param {string|null} [resultData.error_details] - Error details if any failures occurred
 * @returns {Promise<object>} Query result
 */
async function complete(id, resultData) {
  const {
    records_processed = 0,
    records_failed = 0,
    status,
    error_details = null,
  } = resultData;

  const [result] = await appPool.execute(
    `UPDATE job_logs
     SET end_time = NOW(), records_processed = ?, records_failed = ?, status = ?, error_details = ?
     WHERE id = ?`,
    [records_processed, records_failed, status, error_details, id]
  );

  return result;
}

/**
 * Find a job log entry by ID.
 * @param {number} id
 * @returns {Promise<object|null>} Job log record or null
 */
async function findById(id) {
  const [rows] = await appPool.execute(
    'SELECT * FROM job_logs WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find job logs by job name with optional pagination.
 * @param {string} jobName - Name of the job
 * @param {object} [options={}] - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{logs: Array, total: number}>} Paginated log list
 */
async function findByJobName(jobName, options = {}) {
  const { page = 1, limit = 20 } = options;

  const [countRows] = await appPool.execute(
    'SELECT COUNT(*) as total FROM job_logs WHERE job_name = ?',
    [jobName]
  );
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  const [rows] = await appPool.execute(
    'SELECT * FROM job_logs WHERE job_name = ? ORDER BY start_time DESC LIMIT ? OFFSET ?',
    [jobName, String(limit), String(offset)]
  );

  return { logs: rows, total };
}

/**
 * Find all job logs with optional filters and pagination.
 * @param {object} [filters={}] - Optional filters
 * @param {string} [filters.job_name] - Filter by job name
 * @param {string} [filters.status] - Filter by status (Success, Partial, Failed)
 * @param {string} [filters.from_date] - Filter from date (YYYY-MM-DD)
 * @param {string} [filters.to_date] - Filter to date (YYYY-MM-DD)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<{logs: Array, total: number}>} Paginated log list
 */
async function findAll(filters = {}) {
  const { job_name, status, from_date, to_date, page = 1, limit = 20 } = filters;

  let countQuery = 'SELECT COUNT(*) as total FROM job_logs WHERE 1=1';
  let dataQuery = 'SELECT * FROM job_logs WHERE 1=1';
  const params = [];

  if (job_name) {
    countQuery += ' AND job_name = ?';
    dataQuery += ' AND job_name = ?';
    params.push(job_name);
  }

  if (status) {
    countQuery += ' AND status = ?';
    dataQuery += ' AND status = ?';
    params.push(status);
  }

  if (from_date) {
    countQuery += ' AND start_time >= ?';
    dataQuery += ' AND start_time >= ?';
    params.push(from_date);
  }

  if (to_date) {
    countQuery += ' AND start_time <= ?';
    dataQuery += ' AND start_time <= ?';
    params.push(`${to_date} 23:59:59`);
  }

  const [countRows] = await appPool.execute(countQuery, params);
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  dataQuery += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, String(limit), String(offset)];

  const [rows] = await appPool.execute(dataQuery, dataParams);

  return { logs: rows, total };
}

/**
 * Get the most recent execution for each job name.
 * Useful for displaying job status on a dashboard.
 * @returns {Promise<Array>} List of most recent log per job
 */
async function getLatestPerJob() {
  const [rows] = await appPool.execute(
    `SELECT jl.*
     FROM job_logs jl
     INNER JOIN (
       SELECT job_name, MAX(start_time) as max_start
       FROM job_logs
       GROUP BY job_name
     ) latest ON jl.job_name = latest.job_name AND jl.start_time = latest.max_start
     ORDER BY jl.start_time DESC`
  );
  return rows;
}

module.exports = {
  create,
  complete,
  findById,
  findByJobName,
  findAll,
  getLatestPerJob,
};
