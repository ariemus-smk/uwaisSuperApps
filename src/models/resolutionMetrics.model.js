/**
 * Resolution Metrics model for App DB.
 * Provides data access methods for the `teknisi_resolution_metrics` table.
 * Stores per-Teknisi resolution metrics for KPI tracking.
 *
 * Requirements: 27.1, 27.2, 27.3
 */

const { appPool } = require('../config/database');

/**
 * Record a resolution metric entry for a Teknisi.
 * Called when a ticket is resolved to store the resolution time and category.
 *
 * @param {object} data - Resolution metric data
 * @param {number} data.teknisi_id - Teknisi user ID
 * @param {number} data.ticket_id - Ticket ID
 * @param {number} data.resolution_time_minutes - Resolution time in minutes
 * @param {string|null} [data.resolution_category] - Resolution category (RemoteFix, FieldFix)
 * @param {boolean} [data.sla_compliant] - Whether resolved within SLA
 * @param {string} data.resolved_at - Resolution timestamp
 * @returns {Promise<object>} Created metric record with insertId
 */
async function create(data) {
  const {
    teknisi_id,
    ticket_id,
    resolution_time_minutes,
    resolution_category = null,
    sla_compliant = false,
    resolved_at,
  } = data;

  const [result] = await appPool.execute(
    `INSERT INTO teknisi_resolution_metrics
     (teknisi_id, ticket_id, resolution_time_minutes, resolution_category, sla_compliant, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [teknisi_id, ticket_id, resolution_time_minutes, resolution_category, sla_compliant ? 1 : 0, resolved_at]
  );

  return { id: result.insertId, ...data };
}

/**
 * Get aggregated resolution metrics for a specific Teknisi.
 * Returns: total tickets resolved, average resolution time, SLA compliance rate.
 *
 * Requirements: 27.2
 *
 * @param {number} teknisiId - Teknisi user ID
 * @param {object} [options={}] - Optional filters
 * @param {string} [options.period] - Filter by period (YYYY-MM format)
 * @param {string} [options.startDate] - Filter from date (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filter to date (YYYY-MM-DD)
 * @returns {Promise<object>} Aggregated metrics
 */
async function getMetricsByTeknisi(teknisiId, options = {}) {
  const { period, startDate, endDate } = options;

  let query = `SELECT
    COUNT(*) AS total_tickets_resolved,
    COALESCE(AVG(resolution_time_minutes), 0) AS avg_resolution_time_minutes,
    COALESCE(SUM(sla_compliant) / NULLIF(COUNT(*), 0) * 100, 0) AS sla_compliance_rate
  FROM teknisi_resolution_metrics
  WHERE teknisi_id = ?`;
  const params = [teknisiId];

  if (period) {
    query += ' AND DATE_FORMAT(resolved_at, \'%Y-%m\') = ?';
    params.push(period);
  }

  if (startDate) {
    query += ' AND resolved_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND resolved_at <= ?';
    params.push(endDate);
  }

  const [rows] = await appPool.execute(query, params);

  if (rows.length === 0) {
    return {
      total_tickets_resolved: 0,
      avg_resolution_time_minutes: 0,
      sla_compliance_rate: 0,
    };
  }

  return {
    total_tickets_resolved: Number(rows[0].total_tickets_resolved),
    avg_resolution_time_minutes: Math.round(Number(rows[0].avg_resolution_time_minutes)),
    sla_compliance_rate: Number(parseFloat(rows[0].sla_compliance_rate).toFixed(2)),
  };
}

/**
 * Get detailed resolution history for a Teknisi with pagination.
 *
 * @param {number} teknisiId - Teknisi user ID
 * @param {object} [options={}] - Optional filters
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=20] - Items per page
 * @returns {Promise<{records: Array, total: number}>} Paginated resolution records
 */
async function getHistoryByTeknisi(teknisiId, options = {}) {
  const { page = 1, limit = 20 } = options;

  const [countRows] = await appPool.execute(
    'SELECT COUNT(*) AS total FROM teknisi_resolution_metrics WHERE teknisi_id = ?',
    [teknisiId]
  );
  const total = countRows[0].total;

  const offset = (page - 1) * limit;
  const [rows] = await appPool.execute(
    `SELECT trm.*, t.issue_description, t.priority, t.customer_id
     FROM teknisi_resolution_metrics trm
     LEFT JOIN tickets t ON trm.ticket_id = t.id
     WHERE trm.teknisi_id = ?
     ORDER BY trm.resolved_at DESC
     LIMIT ? OFFSET ?`,
    [teknisiId, String(limit), String(offset)]
  );

  return { records: rows, total };
}

/**
 * Find a resolution metric by ticket ID.
 * @param {number} ticketId
 * @returns {Promise<object|null>} Resolution metric record or null
 */
async function findByTicketId(ticketId) {
  const [rows] = await appPool.execute(
    'SELECT * FROM teknisi_resolution_metrics WHERE ticket_id = ? LIMIT 1',
    [ticketId]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  create,
  getMetricsByTeknisi,
  getHistoryByTeknisi,
  findByTicketId,
};
