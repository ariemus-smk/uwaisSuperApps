/**
 * KPI Calculation Scheduled Job
 * Runs at 00:00 on the 1st of every month (configurable via KPI_CRON env var).
 * Calculates monthly KPI scores for Sales and Teknisi employees:
 *
 * - Sales KPI: target customer acquisitions vs actual new activations
 * - Teknisi KPI: SLA compliance rate and installation quality metrics
 *
 * Stores scores in kpi_scores table and flags reward-eligible employees.
 *
 * Requirements: 38.1, 38.2, 38.3, 38.4, 38.5
 */

const { registerJob } = require('./index');
const { appPool } = require('../config/database');
const { USER_ROLE } = require('../utils/constants');

/** Cron schedule: 00:00 on the 1st of every month */
const KPI_CRON_SCHEDULE = process.env.KPI_CRON || '0 0 1 * *';

/** Default Sales target (new activations per month) - configurable via env */
const DEFAULT_SALES_TARGET = parseInt(process.env.KPI_SALES_TARGET, 10) || 10;

/** Default Teknisi SLA target percentage */
const DEFAULT_TEKNISI_SLA_TARGET = parseFloat(process.env.KPI_TEKNISI_SLA_TARGET) || 80;

/** Reward eligibility threshold (score percentage >= this value) */
const REWARD_THRESHOLD = parseFloat(process.env.KPI_REWARD_THRESHOLD) || 100;

/**
 * Get the previous month's period string (YYYY-MM) relative to the given date.
 * Since the job runs on the 1st, we calculate KPI for the previous month.
 *
 * @param {Date} [now=new Date()] - Reference date
 * @returns {string} Period in YYYY-MM format
 */
function getPreviousMonthPeriod(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed, so current month

  // Previous month
  let targetYear = year;
  let targetMonth = month - 1;
  if (targetMonth < 0) {
    targetMonth = 11;
    targetYear = year - 1;
  }

  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
}

/**
 * Get the date range for the previous month.
 *
 * @param {Date} [now=new Date()] - Reference date
 * @returns {{startDate: string, endDate: string}} Start and end dates in YYYY-MM-DD format
 */
function getPreviousMonthDateRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  let targetYear = year;
  let targetMonth = month - 1;
  if (targetMonth < 0) {
    targetMonth = 11;
    targetYear = year - 1;
  }

  const startDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
  // Last day of the target month
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const endDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}

/**
 * Fetch all active Sales users.
 *
 * @returns {Promise<Array<{id: number, full_name: string, branch_id: number}>>}
 */
async function getActiveSalesUsers() {
  const [rows] = await appPool.execute(
    `SELECT id, full_name, branch_id FROM users WHERE role = ? AND status = 'Active'`,
    [USER_ROLE.SALES]
  );
  return rows;
}

/**
 * Fetch all active Teknisi users.
 *
 * @returns {Promise<Array<{id: number, full_name: string, branch_id: number}>>}
 */
async function getActiveTeknisiUsers() {
  const [rows] = await appPool.execute(
    `SELECT id, full_name, branch_id FROM users WHERE role = ? AND status = 'Active'`,
    [USER_ROLE.TEKNISI]
  );
  return rows;
}

/**
 * Count new customer activations attributed to a Sales user in a given period.
 * A "new activation" is a customer whose lifecycle_status transitioned to 'Aktif'
 * during the period and was registered by the Sales user.
 *
 * Requirements: 38.1
 *
 * @param {number} salesUserId - Sales user ID
 * @param {string} startDate - Period start date (YYYY-MM-DD)
 * @param {string} endDate - Period end date (YYYY-MM-DD)
 * @returns {Promise<number>} Count of new activations
 */
async function countSalesActivations(salesUserId, startDate, endDate) {
  const [rows] = await appPool.execute(
    `SELECT COUNT(*) AS count
     FROM customer_audit_log cal
     INNER JOIN customers c ON cal.customer_id = c.id
     WHERE c.registered_by = ?
       AND cal.new_status = 'Aktif'
       AND cal.changed_at >= ?
       AND cal.changed_at <= ?`,
    [salesUserId, `${startDate} 00:00:00`, `${endDate} 23:59:59`]
  );
  return Number(rows[0].count);
}

/**
 * Get Teknisi SLA compliance metrics for a given period.
 * SLA compliance = (tickets resolved within SLA / total tickets resolved) * 100
 *
 * Requirements: 38.2
 *
 * @param {number} teknisiId - Teknisi user ID
 * @param {string} startDate - Period start date (YYYY-MM-DD)
 * @param {string} endDate - Period end date (YYYY-MM-DD)
 * @returns {Promise<{totalResolved: number, slaCompliant: number, slaComplianceRate: number}>}
 */
async function getTeknisiSlaMetrics(teknisiId, startDate, endDate) {
  const [rows] = await appPool.execute(
    `SELECT
       COUNT(*) AS total_resolved,
       COALESCE(SUM(sla_compliant), 0) AS sla_compliant_count
     FROM teknisi_resolution_metrics
     WHERE teknisi_id = ?
       AND resolved_at >= ?
       AND resolved_at <= ?`,
    [teknisiId, `${startDate} 00:00:00`, `${endDate} 23:59:59`]
  );

  const totalResolved = Number(rows[0].total_resolved);
  const slaCompliant = Number(rows[0].sla_compliant_count);
  const slaComplianceRate = totalResolved > 0
    ? (slaCompliant / totalResolved) * 100
    : 0;

  return {
    totalResolved,
    slaCompliant,
    slaComplianceRate: Math.round(slaComplianceRate * 100) / 100,
  };
}

/**
 * Get Teknisi installation quality metrics for a given period.
 * Installation quality is measured by the ratio of installations that did NOT
 * generate a follow-up ticket within the same period.
 *
 * Requirements: 38.2
 *
 * @param {number} teknisiId - Teknisi user ID
 * @param {string} startDate - Period start date (YYYY-MM-DD)
 * @param {string} endDate - Period end date (YYYY-MM-DD)
 * @returns {Promise<{totalInstallations: number, qualityScore: number}>}
 */
async function getTeknisiInstallationQuality(teknisiId, startDate, endDate) {
  // Count installations completed by this teknisi in the period
  const [installRows] = await appPool.execute(
    `SELECT COUNT(*) AS total_installations
     FROM tickets t
     WHERE t.assigned_teknisi_id = ?
       AND t.status IN ('Resolved', 'Closed')
       AND t.resolution_category = 'FieldFix'
       AND t.resolved_at >= ?
       AND t.resolved_at <= ?`,
    [teknisiId, `${startDate} 00:00:00`, `${endDate} 23:59:59`]
  );

  const totalInstallations = Number(installRows[0].total_installations);

  if (totalInstallations === 0) {
    return { totalInstallations: 0, qualityScore: 100 };
  }

  // Count tickets that had repeat issues (same customer, same subscription, new ticket after resolution)
  const [repeatRows] = await appPool.execute(
    `SELECT COUNT(DISTINCT t1.id) AS repeat_issues
     FROM tickets t1
     INNER JOIN tickets t2 ON t1.subscription_id = t2.subscription_id
       AND t2.assigned_teknisi_id = ?
       AND t2.status IN ('Resolved', 'Closed')
       AND t2.resolved_at >= ?
       AND t2.resolved_at <= ?
       AND t1.created_at > t2.resolved_at
       AND t1.created_at <= ?
     WHERE t1.subscription_id IS NOT NULL`,
    [teknisiId, `${startDate} 00:00:00`, `${endDate} 23:59:59`, `${endDate} 23:59:59`]
  );

  const repeatIssues = Number(repeatRows[0].repeat_issues);
  const qualityScore = Math.max(0, ((totalInstallations - repeatIssues) / totalInstallations) * 100);

  return {
    totalInstallations,
    qualityScore: Math.round(qualityScore * 100) / 100,
  };
}

/**
 * Store a KPI score record in the kpi_scores table.
 *
 * Requirements: 38.5
 *
 * @param {object} scoreData - KPI score data
 * @param {number} scoreData.user_id - Employee user ID
 * @param {string} scoreData.period - Period (YYYY-MM)
 * @param {string} scoreData.role_type - 'Sales' or 'Teknisi'
 * @param {number} scoreData.target_value - Target value
 * @param {number} scoreData.actual_value - Actual achieved value
 * @param {number} scoreData.score_percentage - Score as percentage
 * @param {boolean} scoreData.reward_eligible - Whether eligible for reward
 * @param {number|null} [scoreData.reward_amount] - Reward amount if eligible
 * @returns {Promise<object>} Created record with insertId
 */
async function storeKpiScore(scoreData) {
  const {
    user_id,
    period,
    role_type,
    target_value,
    actual_value,
    score_percentage,
    reward_eligible,
    reward_amount = null,
  } = scoreData;

  const [result] = await appPool.execute(
    `INSERT INTO kpi_scores (user_id, period, role_type, target_value, actual_value, score_percentage, reward_eligible, reward_amount, calculated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [user_id, period, role_type, target_value, actual_value, score_percentage, reward_eligible ? 1 : 0, reward_amount]
  );

  return { id: result.insertId, ...scoreData };
}

/**
 * Check if KPI scores already exist for a user in a given period.
 * Prevents duplicate calculations.
 *
 * @param {number} userId - User ID
 * @param {string} period - Period (YYYY-MM)
 * @returns {Promise<boolean>} True if scores already exist
 */
async function kpiScoreExists(userId, period) {
  const [rows] = await appPool.execute(
    'SELECT COUNT(*) AS count FROM kpi_scores WHERE user_id = ? AND period = ?',
    [userId, period]
  );
  return Number(rows[0].count) > 0;
}

/**
 * Calculate Sales KPI score.
 * Score = (actual_activations / target) * 100, capped at 200%.
 *
 * Requirements: 38.1, 38.4
 *
 * @param {number} actualActivations - Number of new activations
 * @param {number} target - Target number of activations
 * @returns {{score_percentage: number, reward_eligible: boolean}}
 */
function calculateSalesScore(actualActivations, target) {
  if (target <= 0) {
    return { score_percentage: 0, reward_eligible: false };
  }

  const scorePercentage = Math.min((actualActivations / target) * 100, 200);
  const rewardEligible = scorePercentage >= REWARD_THRESHOLD;

  return {
    score_percentage: Math.round(scorePercentage * 100) / 100,
    reward_eligible: rewardEligible,
  };
}

/**
 * Calculate Teknisi KPI score.
 * Combined score from SLA compliance (70% weight) and installation quality (30% weight).
 *
 * Requirements: 38.2, 38.4
 *
 * @param {number} slaComplianceRate - SLA compliance percentage (0-100)
 * @param {number} installationQualityScore - Installation quality percentage (0-100)
 * @param {number} slaTarget - SLA target percentage
 * @returns {{score_percentage: number, actual_value: number, reward_eligible: boolean}}
 */
function calculateTeknisiScore(slaComplianceRate, installationQualityScore, slaTarget) {
  // Weighted combined score: 70% SLA + 30% quality
  const combinedScore = (slaComplianceRate * 0.7) + (installationQualityScore * 0.3);

  // Score relative to target
  const scorePercentage = slaTarget > 0
    ? Math.min((combinedScore / slaTarget) * 100, 200)
    : 0;

  const rewardEligible = scorePercentage >= REWARD_THRESHOLD;

  return {
    score_percentage: Math.round(scorePercentage * 100) / 100,
    actual_value: Math.round(combinedScore * 100) / 100,
    reward_eligible: rewardEligible,
  };
}

/**
 * KPI calculation job handler.
 * Calculates monthly KPI scores for all active Sales and Teknisi employees.
 *
 * Requirements: 38.1, 38.2, 38.3, 38.4, 38.5
 *
 * @returns {Promise<{records_processed: number, records_failed: number, errors: string[]}>}
 */
async function kpiCalculationHandler() {
  const now = new Date();
  const period = getPreviousMonthPeriod(now);
  const { startDate, endDate } = getPreviousMonthDateRange(now);

  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors = [];

  // --- Calculate Sales KPI (Req 38.1) ---
  const salesUsers = await getActiveSalesUsers();

  for (const salesUser of salesUsers) {
    try {
      // Skip if already calculated for this period
      const exists = await kpiScoreExists(salesUser.id, period);
      if (exists) {
        recordsProcessed++;
        continue;
      }

      const actualActivations = await countSalesActivations(salesUser.id, startDate, endDate);
      const { score_percentage, reward_eligible } = calculateSalesScore(actualActivations, DEFAULT_SALES_TARGET);

      await storeKpiScore({
        user_id: salesUser.id,
        period,
        role_type: USER_ROLE.SALES,
        target_value: DEFAULT_SALES_TARGET,
        actual_value: actualActivations,
        score_percentage,
        reward_eligible,
        reward_amount: null,
      });

      recordsProcessed++;
    } catch (err) {
      recordsFailed++;
      errors.push(`Sales ${salesUser.id} (${salesUser.full_name}): ${err.message}`);
      console.error(`[KPICalculation] Failed for Sales ${salesUser.id}:`, err.message);
    }
  }

  // --- Calculate Teknisi KPI (Req 38.2) ---
  const teknisiUsers = await getActiveTeknisiUsers();

  for (const teknisiUser of teknisiUsers) {
    try {
      // Skip if already calculated for this period
      const exists = await kpiScoreExists(teknisiUser.id, period);
      if (exists) {
        recordsProcessed++;
        continue;
      }

      const slaMetrics = await getTeknisiSlaMetrics(teknisiUser.id, startDate, endDate);
      const qualityMetrics = await getTeknisiInstallationQuality(teknisiUser.id, startDate, endDate);

      const { score_percentage, actual_value, reward_eligible } = calculateTeknisiScore(
        slaMetrics.slaComplianceRate,
        qualityMetrics.qualityScore,
        DEFAULT_TEKNISI_SLA_TARGET
      );

      await storeKpiScore({
        user_id: teknisiUser.id,
        period,
        role_type: USER_ROLE.TEKNISI,
        target_value: DEFAULT_TEKNISI_SLA_TARGET,
        actual_value,
        score_percentage,
        reward_eligible,
        reward_amount: null,
      });

      recordsProcessed++;
    } catch (err) {
      recordsFailed++;
      errors.push(`Teknisi ${teknisiUser.id} (${teknisiUser.full_name}): ${err.message}`);
      console.error(`[KPICalculation] Failed for Teknisi ${teknisiUser.id}:`, err.message);
    }
  }

  return {
    records_processed: recordsProcessed,
    records_failed: recordsFailed,
    errors,
  };
}

/**
 * Register the KPI calculation job with the scheduler.
 */
function register() {
  registerJob({
    name: 'kpi-calculation',
    schedule: KPI_CRON_SCHEDULE,
    handler: kpiCalculationHandler,
    description: 'Calculate monthly KPI scores for Sales and Teknisi on the 1st of each month',
  });
}

module.exports = {
  register,
  kpiCalculationHandler,
  getPreviousMonthPeriod,
  getPreviousMonthDateRange,
  getActiveSalesUsers,
  getActiveTeknisiUsers,
  countSalesActivations,
  getTeknisiSlaMetrics,
  getTeknisiInstallationQuality,
  storeKpiScore,
  kpiScoreExists,
  calculateSalesScore,
  calculateTeknisiScore,
};
