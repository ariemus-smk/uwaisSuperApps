/**
 * Report service.
 * Handles financial reporting, Komdigi regulatory reports, and customer growth.
 * - Financial: income summary, receivables, cash advances (kasbon), reconciliation
 * - Komdigi: package report, customer report, revenue report with Excel export
 * - Growth: net growth calculation with MoM/YoY support
 * Supports filtering by date range, Branch, payment method, and handler.
 * Includes PPN breakdown in all financial reports.
 *
 * Requirements: 34.1, 34.2, 34.3, 34.4, 35.1, 35.2, 35.3, 35.4
 */

const { appPool } = require('../config/database');
const { INVOICE_STATUS, PAYMENT_STATUS, PACKAGE_STATUS, CUSTOMER_STATUS, ERROR_CODE } = require('../utils/constants');
const { createWorkbook, createMultiSheetWorkbook, workbookToBuffer } = require('../utils/excelExport');

/**
 * Build WHERE clause fragments and params for common financial report filters.
 *
 * @param {object} filters - Filter options
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {number} [filters.branchId] - Branch ID
 * @param {string} [filters.paymentMethod] - Payment method (VA, QRIS, Minimarket, Mitra, Merchant, Cash)
 * @param {string} [filters.handler] - Handler type (Admin, Mitra, Merchant)
 * @param {string} dateColumn - The date column to filter on
 * @param {string} [tableAlias='i'] - Table alias for the date column
 * @returns {{ whereClauses: string[], params: Array }}
 */
function buildFinancialFilters(filters, dateColumn, tableAlias = 'i') {
  const whereClauses = [];
  const params = [];

  if (filters.startDate) {
    whereClauses.push(`${tableAlias}.${dateColumn} >= ?`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    whereClauses.push(`${tableAlias}.${dateColumn} <= ?`);
    params.push(filters.endDate);
  }

  if (filters.branchId) {
    whereClauses.push('c.branch_id = ?');
    params.push(filters.branchId);
  }

  if (filters.paymentMethod) {
    whereClauses.push('p.method = ?');
    params.push(filters.paymentMethod);
  }

  if (filters.handler) {
    whereClauses.push('u.role = ?');
    params.push(filters.handler);
  }

  return { whereClauses, params };
}

/**
 * Generate income report showing total revenue by period with payment method breakdown.
 * Includes PPN breakdown showing base amount vs tax amount.
 *
 * @param {object} [filters={}] - Report filters
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {number} [filters.branchId] - Filter by Branch ID
 * @param {string} [filters.paymentMethod] - Filter by payment method
 * @param {string} [filters.handler] - Filter by handler role (Admin, Mitra, Merchant)
 * @returns {Promise<object>} Income report data
 *
 * Requirements: 35.1, 35.2, 35.3
 */
async function generateIncomeReport(filters = {}) {
  const { whereClauses, params } = buildFinancialFilters(filters, 'paid_at', 'i');

  // Only include paid invoices
  whereClauses.push(`i.status = ?`);
  params.push(INVOICE_STATUS.LUNAS);

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Summary totals with PPN breakdown
  const summaryQuery = `
    SELECT
      COUNT(*) AS total_invoices,
      COALESCE(SUM(i.base_amount), 0) AS total_base_amount,
      COALESCE(SUM(i.ppn_amount), 0) AS total_ppn_amount,
      COALESCE(SUM(i.total_amount), 0) AS total_revenue,
      COALESCE(SUM(i.installation_fee), 0) AS total_installation_fees,
      COALESCE(SUM(i.addon_charges), 0) AS total_addon_charges,
      COALESCE(SUM(i.dp_deduction), 0) AS total_dp_deductions
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN payments p ON p.invoice_id = i.id AND p.status = '${PAYMENT_STATUS.SUCCESS}'
    LEFT JOIN users u ON p.processed_by = u.id
    ${whereStr}
  `;

  const [summaryRows] = await appPool.execute(summaryQuery, params);
  const summary = summaryRows[0];

  // Payment method breakdown
  const methodBreakdownQuery = `
    SELECT
      p.method AS payment_method,
      COUNT(*) AS transaction_count,
      COALESCE(SUM(p.amount), 0) AS total_amount
    FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON p.processed_by = u.id
    ${whereStr.replace(/i\.status = \?/, 'p.status = ?').replace(INVOICE_STATUS.LUNAS, PAYMENT_STATUS.SUCCESS)}
    GROUP BY p.method
    ORDER BY total_amount DESC
  `;

  // Rebuild params for method breakdown (replace LUNAS with SUCCESS)
  const methodParams = [...params];
  const statusIdx = methodParams.indexOf(INVOICE_STATUS.LUNAS);
  if (statusIdx !== -1) {
    methodParams[statusIdx] = PAYMENT_STATUS.SUCCESS;
  }

  const [methodRows] = await appPool.execute(methodBreakdownQuery, methodParams);

  // Monthly breakdown with PPN
  const monthlyQuery = `
    SELECT
      i.billing_period,
      COUNT(*) AS invoice_count,
      COALESCE(SUM(i.base_amount), 0) AS base_amount,
      COALESCE(SUM(i.ppn_amount), 0) AS ppn_amount,
      COALESCE(SUM(i.total_amount), 0) AS total_amount
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN payments p ON p.invoice_id = i.id AND p.status = '${PAYMENT_STATUS.SUCCESS}'
    LEFT JOIN users u ON p.processed_by = u.id
    ${whereStr}
    GROUP BY i.billing_period
    ORDER BY i.billing_period DESC
  `;

  const [monthlyRows] = await appPool.execute(monthlyQuery, params);

  return {
    summary: {
      totalInvoices: summary.total_invoices,
      totalBaseAmount: parseFloat(summary.total_base_amount),
      totalPpnAmount: parseFloat(summary.total_ppn_amount),
      totalRevenue: parseFloat(summary.total_revenue),
      totalInstallationFees: parseFloat(summary.total_installation_fees),
      totalAddonCharges: parseFloat(summary.total_addon_charges),
      totalDpDeductions: parseFloat(summary.total_dp_deductions),
    },
    paymentMethodBreakdown: methodRows.map((row) => ({
      paymentMethod: row.payment_method,
      transactionCount: row.transaction_count,
      totalAmount: parseFloat(row.total_amount),
    })),
    monthlyBreakdown: monthlyRows.map((row) => ({
      billingPeriod: row.billing_period,
      invoiceCount: row.invoice_count,
      baseAmount: parseFloat(row.base_amount),
      ppnAmount: parseFloat(row.ppn_amount),
      totalAmount: parseFloat(row.total_amount),
    })),
    filters: {
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      branchId: filters.branchId || null,
      paymentMethod: filters.paymentMethod || null,
      handler: filters.handler || null,
    },
  };
}

/**
 * Generate receivables report showing outstanding invoices and aging analysis.
 * Groups outstanding amounts by aging buckets: current, 1-30 days, 31-60 days, 61-90 days, 90+ days.
 *
 * @param {object} [filters={}] - Report filters
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {number} [filters.branchId] - Filter by Branch ID
 * @returns {Promise<object>} Receivables report data
 *
 * Requirements: 35.1, 35.4
 */
async function generateReceivablesReport(filters = {}) {
  const whereClauses = [`i.status = ?`];
  const params = [INVOICE_STATUS.UNPAID];

  if (filters.branchId) {
    whereClauses.push('c.branch_id = ?');
    params.push(filters.branchId);
  }

  if (filters.startDate) {
    whereClauses.push('i.due_date >= ?');
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    whereClauses.push('i.due_date <= ?');
    params.push(filters.endDate);
  }

  const whereStr = `WHERE ${whereClauses.join(' AND ')}`;

  // Aging analysis query
  const agingQuery = `
    SELECT
      i.id,
      i.invoice_number,
      i.customer_id,
      c.full_name AS customer_name,
      c.branch_id,
      b.name AS branch_name,
      i.billing_period,
      i.base_amount,
      i.ppn_amount,
      i.total_amount,
      i.due_date,
      DATEDIFF(CURDATE(), i.due_date) AS days_overdue
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN branches b ON c.branch_id = b.id
    ${whereStr}
    ORDER BY i.due_date ASC
  `;

  const [rows] = await appPool.execute(agingQuery, params);

  // Categorize into aging buckets
  const aging = {
    current: { count: 0, totalAmount: 0, baseAmount: 0, ppnAmount: 0 },
    overdue1to30: { count: 0, totalAmount: 0, baseAmount: 0, ppnAmount: 0 },
    overdue31to60: { count: 0, totalAmount: 0, baseAmount: 0, ppnAmount: 0 },
    overdue61to90: { count: 0, totalAmount: 0, baseAmount: 0, ppnAmount: 0 },
    overdue90plus: { count: 0, totalAmount: 0, baseAmount: 0, ppnAmount: 0 },
  };

  const invoices = rows.map((row) => {
    const daysOverdue = row.days_overdue;
    const totalAmount = parseFloat(row.total_amount);
    const baseAmount = parseFloat(row.base_amount);
    const ppnAmount = parseFloat(row.ppn_amount);

    let bucket;
    if (daysOverdue <= 0) {
      bucket = 'current';
    } else if (daysOverdue <= 30) {
      bucket = 'overdue1to30';
    } else if (daysOverdue <= 60) {
      bucket = 'overdue31to60';
    } else if (daysOverdue <= 90) {
      bucket = 'overdue61to90';
    } else {
      bucket = 'overdue90plus';
    }

    aging[bucket].count += 1;
    aging[bucket].totalAmount += totalAmount;
    aging[bucket].baseAmount += baseAmount;
    aging[bucket].ppnAmount += ppnAmount;

    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      branchId: row.branch_id,
      branchName: row.branch_name,
      billingPeriod: row.billing_period,
      baseAmount,
      ppnAmount,
      totalAmount,
      dueDate: row.due_date,
      daysOverdue: Math.max(0, daysOverdue),
      agingBucket: bucket,
    };
  });

  // Round aging totals
  for (const bucket of Object.keys(aging)) {
    aging[bucket].totalAmount = Math.round(aging[bucket].totalAmount * 100) / 100;
    aging[bucket].baseAmount = Math.round(aging[bucket].baseAmount * 100) / 100;
    aging[bucket].ppnAmount = Math.round(aging[bucket].ppnAmount * 100) / 100;
  }

  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  return {
    summary: {
      totalOutstandingInvoices: invoices.length,
      totalOutstandingAmount: Math.round(totalOutstanding * 100) / 100,
    },
    aging,
    invoices,
    filters: {
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      branchId: filters.branchId || null,
    },
  };
}

/**
 * Generate cash advances (kasbon) report from saldo_transactions.
 * Shows Mitra/Merchant balance movements and outstanding advances.
 *
 * @param {object} [filters={}] - Report filters
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {number} [filters.branchId] - Filter by Branch ID
 * @param {string} [filters.handler] - Filter by handler role (Mitra, Merchant)
 * @returns {Promise<object>} Cash advances report data
 *
 * Requirements: 35.1, 35.2
 */
async function generateCashAdvancesReport(filters = {}) {
  const whereClauses = [];
  const params = [];

  if (filters.startDate) {
    whereClauses.push('st.created_at >= ?');
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    whereClauses.push('st.created_at <= ?');
    params.push(`${filters.endDate} 23:59:59`);
  }

  if (filters.branchId) {
    whereClauses.push('u.branch_id = ?');
    params.push(filters.branchId);
  }

  if (filters.handler) {
    whereClauses.push('u.role = ?');
    params.push(filters.handler);
  } else {
    // Default: only Mitra and Merchant
    whereClauses.push("u.role IN ('Mitra', 'Merchant')");
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Summary by user with current balance
  const summaryQuery = `
    SELECT
      u.id AS user_id,
      u.full_name,
      u.role,
      u.branch_id,
      b.name AS branch_name,
      u.saldo AS current_balance,
      COALESCE(SUM(CASE WHEN st.type = 'Topup' THEN st.amount ELSE 0 END), 0) AS total_topup,
      COALESCE(SUM(CASE WHEN st.type = 'Deduction' THEN st.amount ELSE 0 END), 0) AS total_deductions,
      COALESCE(SUM(CASE WHEN st.type = 'Refund' THEN st.amount ELSE 0 END), 0) AS total_refunds,
      COUNT(st.id) AS transaction_count
    FROM users u
    LEFT JOIN saldo_transactions st ON st.user_id = u.id
      ${filters.startDate ? 'AND st.created_at >= ?' : ''}
      ${filters.endDate ? `AND st.created_at <= ?` : ''}
    LEFT JOIN branches b ON u.branch_id = b.id
    WHERE ${filters.handler ? 'u.role = ?' : "u.role IN ('Mitra', 'Merchant')"}
    ${filters.branchId ? 'AND u.branch_id = ?' : ''}
    GROUP BY u.id, u.full_name, u.role, u.branch_id, b.name, u.saldo
    ORDER BY u.role, u.full_name
  `;

  // Build params for summary query (different structure due to LEFT JOIN conditions)
  const summaryParams = [];
  if (filters.startDate) summaryParams.push(filters.startDate);
  if (filters.endDate) summaryParams.push(`${filters.endDate} 23:59:59`);
  if (filters.handler) {
    summaryParams.push(filters.handler);
  }
  if (filters.branchId) summaryParams.push(filters.branchId);

  const [summaryRows] = await appPool.execute(summaryQuery, summaryParams);

  // Transaction details
  const detailQuery = `
    SELECT
      st.id,
      st.user_id,
      u.full_name,
      u.role,
      st.type,
      st.amount,
      st.balance_after,
      st.reference,
      st.created_at
    FROM saldo_transactions st
    INNER JOIN users u ON st.user_id = u.id
    LEFT JOIN branches b ON u.branch_id = b.id
    ${whereStr}
    ORDER BY st.created_at DESC
    LIMIT 500
  `;

  const [detailRows] = await appPool.execute(detailQuery, params);

  const totalBalance = summaryRows.reduce((sum, row) => sum + parseFloat(row.current_balance || 0), 0);
  const totalTopup = summaryRows.reduce((sum, row) => sum + parseFloat(row.total_topup), 0);
  const totalDeductions = summaryRows.reduce((sum, row) => sum + parseFloat(row.total_deductions), 0);

  return {
    summary: {
      totalAccounts: summaryRows.length,
      totalCurrentBalance: Math.round(totalBalance * 100) / 100,
      totalTopup: Math.round(totalTopup * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
    },
    accounts: summaryRows.map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      role: row.role,
      branchId: row.branch_id,
      branchName: row.branch_name,
      currentBalance: parseFloat(row.current_balance || 0),
      totalTopup: parseFloat(row.total_topup),
      totalDeductions: parseFloat(row.total_deductions),
      totalRefunds: parseFloat(row.total_refunds),
      transactionCount: row.transaction_count,
    })),
    transactions: detailRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name,
      role: row.role,
      type: row.type,
      amount: parseFloat(row.amount),
      balanceAfter: parseFloat(row.balance_after),
      reference: row.reference,
      createdAt: row.created_at,
    })),
    filters: {
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      branchId: filters.branchId || null,
      handler: filters.handler || null,
    },
  };
}

/**
 * Generate reconciliation report comparing invoices generated vs payments received.
 * Helps identify discrepancies between billing and actual collections.
 *
 * @param {object} [filters={}] - Report filters
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {number} [filters.branchId] - Filter by Branch ID
 * @param {string} [filters.paymentMethod] - Filter by payment method
 * @param {string} [filters.handler] - Filter by handler role (Admin, Mitra, Merchant)
 * @returns {Promise<object>} Reconciliation report data
 *
 * Requirements: 35.1, 35.2, 35.3
 */
async function generateReconciliationReport(filters = {}) {
  const invoiceWhere = [];
  const invoiceParams = [];
  const paymentWhere = [];
  const paymentParams = [];

  // Invoice filters
  if (filters.startDate) {
    invoiceWhere.push('i.generation_date >= ?');
    invoiceParams.push(filters.startDate);
    paymentWhere.push('p.paid_at >= ?');
    paymentParams.push(filters.startDate);
  }

  if (filters.endDate) {
    invoiceWhere.push('i.generation_date <= ?');
    invoiceParams.push(filters.endDate);
    paymentWhere.push('p.paid_at <= ?');
    paymentParams.push(`${filters.endDate} 23:59:59`);
  }

  if (filters.branchId) {
    invoiceWhere.push('c.branch_id = ?');
    invoiceParams.push(filters.branchId);
    paymentWhere.push('c.branch_id = ?');
    paymentParams.push(filters.branchId);
  }

  if (filters.paymentMethod) {
    paymentWhere.push('p.method = ?');
    paymentParams.push(filters.paymentMethod);
  }

  if (filters.handler) {
    paymentWhere.push('u.role = ?');
    paymentParams.push(filters.handler);
  }

  // Total invoices generated in period
  const invoiceWhereStr = invoiceWhere.length > 0 ? `WHERE ${invoiceWhere.join(' AND ')}` : '';
  const invoiceSummaryQuery = `
    SELECT
      COUNT(*) AS total_generated,
      COALESCE(SUM(i.base_amount), 0) AS total_base_billed,
      COALESCE(SUM(i.ppn_amount), 0) AS total_ppn_billed,
      COALESCE(SUM(i.total_amount), 0) AS total_billed,
      COALESCE(SUM(CASE WHEN i.status = 'LUNAS' THEN i.total_amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN i.status = 'UNPAID' THEN i.total_amount ELSE 0 END), 0) AS total_unpaid,
      COALESCE(SUM(CASE WHEN i.status = 'WAIVED' THEN i.total_amount ELSE 0 END), 0) AS total_waived,
      COALESCE(SUM(CASE WHEN i.status = 'CANCELLED' THEN i.total_amount ELSE 0 END), 0) AS total_cancelled
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    ${invoiceWhereStr}
  `;

  const [invoiceSummary] = await appPool.execute(invoiceSummaryQuery, invoiceParams);

  // Total payments received in period
  paymentWhere.push(`p.status = ?`);
  paymentParams.push(PAYMENT_STATUS.SUCCESS);

  const paymentWhereStr = paymentWhere.length > 0 ? `WHERE ${paymentWhere.join(' AND ')}` : '';
  const paymentSummaryQuery = `
    SELECT
      COUNT(*) AS total_payments,
      COALESCE(SUM(p.amount), 0) AS total_collected,
      COALESCE(SUM(p.admin_fee), 0) AS total_admin_fees
    FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON p.processed_by = u.id
    ${paymentWhereStr}
  `;

  const [paymentSummary] = await appPool.execute(paymentSummaryQuery, paymentParams);

  // Payment breakdown by handler
  const handlerBreakdownQuery = `
    SELECT
      COALESCE(u.role, 'System') AS handler_role,
      COUNT(*) AS transaction_count,
      COALESCE(SUM(p.amount), 0) AS total_amount,
      COALESCE(SUM(p.admin_fee), 0) AS total_admin_fees
    FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN users u ON p.processed_by = u.id
    ${paymentWhereStr}
    GROUP BY u.role
    ORDER BY total_amount DESC
  `;

  const [handlerRows] = await appPool.execute(handlerBreakdownQuery, paymentParams);

  const inv = invoiceSummary[0];
  const pay = paymentSummary[0];

  const totalBilled = parseFloat(inv.total_billed);
  const totalCollected = parseFloat(pay.total_collected);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 10000) / 100 : 0;

  return {
    invoiceSummary: {
      totalGenerated: inv.total_generated,
      totalBaseBilled: parseFloat(inv.total_base_billed),
      totalPpnBilled: parseFloat(inv.total_ppn_billed),
      totalBilled: parseFloat(inv.total_billed),
      totalPaid: parseFloat(inv.total_paid),
      totalUnpaid: parseFloat(inv.total_unpaid),
      totalWaived: parseFloat(inv.total_waived),
      totalCancelled: parseFloat(inv.total_cancelled),
    },
    paymentSummary: {
      totalPayments: pay.total_payments,
      totalCollected: parseFloat(pay.total_collected),
      totalAdminFees: parseFloat(pay.total_admin_fees),
    },
    reconciliation: {
      totalBilled,
      totalCollected,
      variance: Math.round((totalBilled - totalCollected) * 100) / 100,
      collectionRate,
    },
    handlerBreakdown: handlerRows.map((row) => ({
      handlerRole: row.handler_role,
      transactionCount: row.transaction_count,
      totalAmount: parseFloat(row.total_amount),
      totalAdminFees: parseFloat(row.total_admin_fees),
    })),
    filters: {
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      branchId: filters.branchId || null,
      paymentMethod: filters.paymentMethod || null,
      handler: filters.handler || null,
    },
  };
}

/**
 * Generate a comprehensive financial report combining income, receivables,
 * cash advances, and reconciliation data.
 *
 * @param {object} [filters={}] - Report filters
 * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
 * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
 * @param {number} [filters.branchId] - Filter by Branch ID
 * @param {string} [filters.paymentMethod] - Filter by payment method
 * @param {string} [filters.handler] - Filter by handler role (Admin, Mitra, Merchant)
 * @param {string} [filters.reportType] - Specific report type: income, receivables, cashAdvances, reconciliation, or all
 * @returns {Promise<object>} Combined financial report data
 * @throws {Error} If invalid report type specified
 *
 * Requirements: 35.1, 35.2, 35.3, 35.4
 */
async function generateFinancialReport(filters = {}) {
  const { reportType = 'all', ...reportFilters } = filters;

  const validTypes = ['all', 'income', 'receivables', 'cashAdvances', 'reconciliation'];
  if (!validTypes.includes(reportType)) {
    throw Object.assign(
      new Error(`Invalid report type '${reportType}'. Valid types: ${validTypes.join(', ')}`),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    reportType,
    filters: {
      startDate: reportFilters.startDate || null,
      endDate: reportFilters.endDate || null,
      branchId: reportFilters.branchId || null,
      paymentMethod: reportFilters.paymentMethod || null,
      handler: reportFilters.handler || null,
    },
  };

  if (reportType === 'all' || reportType === 'income') {
    report.income = await generateIncomeReport(reportFilters);
  }

  if (reportType === 'all' || reportType === 'receivables') {
    report.receivables = await generateReceivablesReport(reportFilters);
  }

  if (reportType === 'all' || reportType === 'cashAdvances') {
    report.cashAdvances = await generateCashAdvancesReport(reportFilters);
  }

  if (reportType === 'all' || reportType === 'reconciliation') {
    report.reconciliation = await generateReconciliationReport(reportFilters);
  }

  return report;
}

// ============================================================================
// Customer Growth Constants (Requirements: 36.1, 36.2, 36.3, 36.4)
// ============================================================================

/**
 * Growth period types.
 */
const GROWTH_PERIOD = Object.freeze({
  MOM: 'MoM',
  YOY: 'YoY',
});

/**
 * Growth grouping dimensions.
 */
const GROWTH_GROUP_BY = Object.freeze({
  BRANCH: 'branch',
  MITRA: 'mitra',
  SALES: 'sales',
});

// module.exports is at the end of the file (after all function definitions)

// ============================================================================
// Komdigi Regulatory Reports (Requirements: 34.1, 34.2, 34.3, 34.4)
// ============================================================================

/**
 * Generate Komdigi package report data.
 * Lists all active service packages with their QoS specifications.
 *
 * Requirements: 34.1
 *
 * @returns {Promise<Array<object>>} Array of package data for Komdigi report
 */
async function generateKomdigiPackages() {
  const [rows] = await appPool.execute(
    `SELECT
      p.id,
      p.name AS package_name,
      p.upload_rate_limit,
      p.download_rate_limit,
      p.upload_burst_limit,
      p.download_burst_limit,
      p.upload_burst_threshold,
      p.download_burst_threshold,
      p.monthly_price,
      p.ppn_enabled,
      p.fup_enabled,
      p.fup_quota_gb,
      p.fup_upload_speed,
      p.fup_download_speed,
      p.status,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.package_id = p.id AND s.status = 'Active') AS active_subscribers
    FROM packages p
    WHERE p.status = ?
    ORDER BY p.name ASC`,
    [PACKAGE_STATUS.ACTIVE]
  );

  return rows.map((row) => ({
    id: row.id,
    package_name: row.package_name,
    upload_speed_kbps: row.upload_rate_limit,
    download_speed_kbps: row.download_rate_limit,
    upload_burst_kbps: row.upload_burst_limit,
    download_burst_kbps: row.download_burst_limit,
    upload_threshold_kbps: row.upload_burst_threshold,
    download_threshold_kbps: row.download_burst_threshold,
    monthly_price: row.monthly_price,
    ppn_enabled: row.ppn_enabled ? 'Ya' : 'Tidak',
    fup_enabled: row.fup_enabled ? 'Ya' : 'Tidak',
    fup_quota_gb: row.fup_quota_gb || '-',
    fup_upload_speed_kbps: row.fup_upload_speed || '-',
    fup_download_speed_kbps: row.fup_download_speed || '-',
    active_subscribers: row.active_subscribers,
  }));
}

/**
 * Generate Komdigi customer report data.
 * Includes total subscribers per package, distribution by Branch/region,
 * and customer growth metrics.
 *
 * Requirements: 34.2
 *
 * @param {object} [options={}] - Report options
 * @param {string} [options.period] - Period filter (YYYY-MM)
 * @returns {Promise<object>} Customer report data with summary and breakdowns
 */
async function generateKomdigiCustomers(options = {}) {
  const { period } = options;

  // Total subscribers per package
  const [subscribersByPackage] = await appPool.execute(
    `SELECT
      p.name AS package_name,
      COUNT(s.id) AS subscriber_count
    FROM subscriptions s
    INNER JOIN packages p ON s.package_id = p.id
    WHERE s.status = 'Active'
    GROUP BY p.id, p.name
    ORDER BY subscriber_count DESC`
  );

  // Subscriber distribution by Branch/region
  const [subscribersByBranch] = await appPool.execute(
    `SELECT
      b.name AS branch_name,
      COUNT(c.id) AS subscriber_count,
      SUM(CASE WHEN c.lifecycle_status = 'Aktif' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN c.lifecycle_status = 'Isolir' THEN 1 ELSE 0 END) AS isolir_count,
      SUM(CASE WHEN c.lifecycle_status = 'Terminated' THEN 1 ELSE 0 END) AS terminated_count
    FROM customers c
    INNER JOIN branches b ON c.branch_id = b.id
    GROUP BY b.id, b.name
    ORDER BY b.name ASC`
  );

  // Subscriber distribution by status
  const [subscribersByStatus] = await appPool.execute(
    `SELECT
      lifecycle_status AS status,
      COUNT(*) AS count
    FROM customers
    GROUP BY lifecycle_status
    ORDER BY count DESC`
  );

  // Customer growth metrics
  let growthQuery = `
    SELECT
      DATE_FORMAT(created_at, '%Y-%m') AS period,
      COUNT(*) AS new_customers
    FROM customers
  `;
  const growthParams = [];

  if (period) {
    growthQuery += ' WHERE DATE_FORMAT(created_at, \'%Y-%m\') = ?';
    growthParams.push(period);
  } else {
    growthQuery += ' WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)';
  }

  growthQuery += ' GROUP BY DATE_FORMAT(created_at, \'%Y-%m\') ORDER BY period DESC';

  const [growthData] = await appPool.execute(growthQuery, growthParams);

  // Total active subscribers
  const [totalActive] = await appPool.execute(
    'SELECT COUNT(*) AS total FROM customers WHERE lifecycle_status = \'Aktif\''
  );

  return {
    summary: {
      total_active_subscribers: totalActive[0].total,
      report_generated_at: new Date().toISOString(),
    },
    subscribers_by_package: subscribersByPackage,
    subscribers_by_branch: subscribersByBranch,
    subscribers_by_status: subscribersByStatus,
    growth_metrics: growthData,
  };
}

/**
 * Generate Komdigi revenue report data.
 * Includes monthly revenue totals, breakdown by payment type,
 * and breakdown by payment handler.
 *
 * Requirements: 34.3
 *
 * @param {object} [options={}] - Report options
 * @param {string} [options.period] - Period filter (YYYY-MM)
 * @param {string} [options.start_date] - Start date filter (YYYY-MM-DD)
 * @param {string} [options.end_date] - End date filter (YYYY-MM-DD)
 * @returns {Promise<object>} Revenue report data with totals and breakdowns
 */
async function generateKomdigiRevenue(options = {}) {
  const { period, start_date, end_date } = options;

  // Build date filter conditions
  let dateCondition = '';
  const dateParams = [];

  if (period) {
    dateCondition = 'AND DATE_FORMAT(p.paid_at, \'%Y-%m\') = ?';
    dateParams.push(period);
  } else if (start_date && end_date) {
    dateCondition = 'AND p.paid_at >= ? AND p.paid_at <= ?';
    dateParams.push(start_date, end_date);
  } else {
    // Default: last 12 months
    dateCondition = 'AND p.paid_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)';
  }

  // Monthly revenue totals
  const [monthlyRevenue] = await appPool.execute(
    `SELECT
      DATE_FORMAT(p.paid_at, '%Y-%m') AS period,
      COUNT(p.id) AS transaction_count,
      SUM(p.amount) AS total_revenue
    FROM payments p
    WHERE p.status = 'Success'
    ${dateCondition}
    GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m')
    ORDER BY period DESC`,
    dateParams
  );

  // Revenue breakdown by payment type/method
  const [revenueByMethod] = await appPool.execute(
    `SELECT
      p.method AS payment_method,
      COUNT(p.id) AS transaction_count,
      SUM(p.amount) AS total_amount
    FROM payments p
    WHERE p.status = 'Success'
    ${dateCondition}
    GROUP BY p.method
    ORDER BY total_amount DESC`,
    dateParams
  );

  // Revenue breakdown by payment handler (Admin, Mitra, Merchant)
  const [revenueByHandler] = await appPool.execute(
    `SELECT
      CASE
        WHEN u.role = 'Mitra' THEN 'Mitra'
        WHEN u.role = 'Merchant' THEN 'Merchant'
        WHEN u.role IS NOT NULL THEN 'Admin'
        ELSE 'Gateway (Tripay)'
      END AS handler_type,
      COUNT(p.id) AS transaction_count,
      SUM(p.amount) AS total_amount
    FROM payments p
    LEFT JOIN users u ON p.processed_by = u.id
    WHERE p.status = 'Success'
    ${dateCondition}
    GROUP BY handler_type
    ORDER BY total_amount DESC`,
    dateParams
  );

  // Calculate grand total
  const grandTotal = monthlyRevenue.reduce(
    (sum, row) => sum + parseFloat(row.total_revenue || 0),
    0
  );

  return {
    summary: {
      grand_total_revenue: grandTotal,
      total_transactions: monthlyRevenue.reduce((sum, row) => sum + row.transaction_count, 0),
      report_generated_at: new Date().toISOString(),
    },
    monthly_revenue: monthlyRevenue,
    revenue_by_payment_method: revenueByMethod,
    revenue_by_handler: revenueByHandler,
  };
}

/**
 * Export Komdigi package report as Excel buffer.
 *
 * Requirements: 34.1, 34.4
 *
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportKomdigiPackagesExcel() {
  const data = await generateKomdigiPackages();

  const columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Nama Paket', key: 'package_name', width: 25 },
    { header: 'Upload (kbps)', key: 'upload_speed_kbps', width: 15 },
    { header: 'Download (kbps)', key: 'download_speed_kbps', width: 15 },
    { header: 'Burst Upload (kbps)', key: 'upload_burst_kbps', width: 18 },
    { header: 'Burst Download (kbps)', key: 'download_burst_kbps', width: 20 },
    { header: 'Threshold Upload (kbps)', key: 'upload_threshold_kbps', width: 22 },
    { header: 'Threshold Download (kbps)', key: 'download_threshold_kbps', width: 24 },
    { header: 'Harga Bulanan (Rp)', key: 'monthly_price', width: 18 },
    { header: 'PPN', key: 'ppn_enabled', width: 8 },
    { header: 'FUP', key: 'fup_enabled', width: 8 },
    { header: 'Kuota FUP (GB)', key: 'fup_quota_gb', width: 14 },
    { header: 'Pelanggan Aktif', key: 'active_subscribers', width: 16 },
  ];

  const rows = data.map((item, idx) => ({
    no: idx + 1,
    ...item,
  }));

  const workbook = createWorkbook('Laporan Paket', columns, rows, {
    title: 'Laporan Paket Layanan - Komdigi',
    subtitle: `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
  });

  return workbookToBuffer(workbook);
}

/**
 * Export Komdigi customer report as Excel buffer.
 *
 * Requirements: 34.2, 34.4
 *
 * @param {object} [options={}] - Report options
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportKomdigiCustomersExcel(options = {}) {
  const data = await generateKomdigiCustomers(options);

  const sheets = [
    {
      sheetName: 'Per Paket',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Nama Paket', key: 'package_name', width: 30 },
        { header: 'Jumlah Pelanggan', key: 'subscriber_count', width: 18 },
      ],
      rows: data.subscribers_by_package.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Pelanggan Per Paket - Komdigi',
        subtitle: `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      },
    },
    {
      sheetName: 'Per Wilayah',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Cabang/Wilayah', key: 'branch_name', width: 25 },
        { header: 'Total Pelanggan', key: 'subscriber_count', width: 16 },
        { header: 'Aktif', key: 'active_count', width: 10 },
        { header: 'Isolir', key: 'isolir_count', width: 10 },
        { header: 'Terminated', key: 'terminated_count', width: 12 },
      ],
      rows: data.subscribers_by_branch.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Distribusi Pelanggan Per Wilayah - Komdigi',
        subtitle: `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      },
    },
    {
      sheetName: 'Per Status',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Jumlah', key: 'count', width: 12 },
      ],
      rows: data.subscribers_by_status.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Pelanggan Per Status - Komdigi',
        subtitle: `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      },
    },
    {
      sheetName: 'Pertumbuhan',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Periode', key: 'period', width: 15 },
        { header: 'Pelanggan Baru', key: 'new_customers', width: 16 },
      ],
      rows: data.growth_metrics.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Pertumbuhan Pelanggan - Komdigi',
        subtitle: `Total Aktif: ${data.summary.total_active_subscribers}`,
      },
    },
  ];

  const workbook = createMultiSheetWorkbook(sheets);
  return workbookToBuffer(workbook);
}

/**
 * Export Komdigi revenue report as Excel buffer.
 *
 * Requirements: 34.3, 34.4
 *
 * @param {object} [options={}] - Report options
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportKomdigiRevenueExcel(options = {}) {
  const data = await generateKomdigiRevenue(options);

  const sheets = [
    {
      sheetName: 'Pendapatan Bulanan',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Periode', key: 'period', width: 15 },
        { header: 'Jumlah Transaksi', key: 'transaction_count', width: 18 },
        { header: 'Total Pendapatan (Rp)', key: 'total_revenue', width: 22 },
      ],
      rows: data.monthly_revenue.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Laporan Pendapatan Bulanan - Komdigi',
        subtitle: `Total: Rp ${data.summary.grand_total_revenue.toLocaleString('id-ID')}`,
      },
    },
    {
      sheetName: 'Per Metode Bayar',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Metode Pembayaran', key: 'payment_method', width: 22 },
        { header: 'Jumlah Transaksi', key: 'transaction_count', width: 18 },
        { header: 'Total (Rp)', key: 'total_amount', width: 18 },
      ],
      rows: data.revenue_by_payment_method.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Pendapatan Per Metode Pembayaran - Komdigi',
        subtitle: `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      },
    },
    {
      sheetName: 'Per Handler',
      columns: [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Tipe Handler', key: 'handler_type', width: 22 },
        { header: 'Jumlah Transaksi', key: 'transaction_count', width: 18 },
        { header: 'Total (Rp)', key: 'total_amount', width: 18 },
      ],
      rows: data.revenue_by_handler.map((item, idx) => ({
        no: idx + 1,
        ...item,
      })),
      options: {
        title: 'Pendapatan Per Handler - Komdigi',
        subtitle: `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      },
    },
  ];

  const workbook = createMultiSheetWorkbook(sheets);
  return workbookToBuffer(workbook);
}

// ============================================================================
// Customer Growth Reporting (Requirements: 36.1, 36.2, 36.3, 36.4, 36.5)
// ============================================================================

/**
 * Calculate customer growth metrics.
 * Net growth = new activations - churned (terminated) customers per period.
 *
 * @param {object} options - Query options
 * @param {string} options.period - Period type: 'MoM' or 'YoY'
 * @param {string} [options.startDate] - Start date (YYYY-MM) for the report range
 * @param {string} [options.endDate] - End date (YYYY-MM) for the report range
 * @param {string} [options.groupBy] - Group by dimension: 'branch', 'mitra', or 'sales'
 * @param {number|null} [options.branchFilter] - Branch ID for scoping (null = all branches)
 * @returns {Promise<object>} Growth report data with periods and metrics
 */
async function calculateGrowth(options = {}) {
  const {
    period = GROWTH_PERIOD.MOM,
    startDate,
    endDate,
    groupBy,
    branchFilter = null,
  } = options;

  // Validate period type
  if (period !== GROWTH_PERIOD.MOM && period !== GROWTH_PERIOD.YOY) {
    throw Object.assign(new Error('Invalid period type. Must be "MoM" or "YoY".'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate groupBy if provided
  const validGroups = Object.values(GROWTH_GROUP_BY);
  if (groupBy && !validGroups.includes(groupBy)) {
    throw Object.assign(
      new Error(`Invalid groupBy value. Must be one of: ${validGroups.join(', ')}`),
      { statusCode: 400, code: ERROR_CODE.VALIDATION_ERROR }
    );
  }

  // Determine date format and grouping based on period type
  const dateFormat = period === GROWTH_PERIOD.MOM ? '%Y-%m' : '%Y';

  // Build the activations query (transitions to 'Aktif')
  const activationsData = await getActivations(dateFormat, startDate, endDate, branchFilter, groupBy);

  // Build the churned query (transitions to 'Terminated')
  const churnedData = await getChurned(dateFormat, startDate, endDate, branchFilter, groupBy);

  // Merge activations and churned into net growth
  const growthData = mergeGrowthData(activationsData, churnedData, groupBy);

  return {
    period,
    groupBy: groupBy || null,
    data: growthData,
  };
}

/**
 * Get activation counts grouped by period (and optionally by dimension).
 * Activations are determined from customer_audit_log where new_status = 'Aktif'.
 *
 * @param {string} dateFormat - MySQL DATE_FORMAT pattern ('%Y-%m' or '%Y')
 * @param {string|undefined} startDate - Start period filter
 * @param {string|undefined} endDate - End period filter
 * @param {number|null} branchFilter - Branch ID filter
 * @param {string|undefined} groupBy - Grouping dimension
 * @returns {Promise<Array>} Activation counts per period/group
 */
async function getActivations(dateFormat, startDate, endDate, branchFilter, groupBy) {
  let query = `
    SELECT 
      DATE_FORMAT(cal.changed_at, ?) AS period,
      COUNT(*) AS activations
  `;

  const params = [dateFormat];

  // Add grouping columns
  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    query += `, c.branch_id, b.name AS group_name`;
  } else if (groupBy === GROWTH_GROUP_BY.MITRA) {
    query += `, c.registered_by AS group_id, u.full_name AS group_name`;
  } else if (groupBy === GROWTH_GROUP_BY.SALES) {
    query += `, c.registered_by AS group_id, u.full_name AS group_name`;
  }

  query += `
    FROM customer_audit_log cal
    JOIN customers c ON cal.customer_id = c.id
  `;

  // Join for group name resolution
  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    query += ` JOIN branches b ON c.branch_id = b.id`;
  } else if (groupBy === GROWTH_GROUP_BY.MITRA || groupBy === GROWTH_GROUP_BY.SALES) {
    query += ` LEFT JOIN users u ON c.registered_by = u.id`;
  }

  query += ` WHERE cal.new_status = ?`;
  params.push(CUSTOMER_STATUS.AKTIF);

  // Filter by role when grouping by Mitra or Sales
  if (groupBy === GROWTH_GROUP_BY.MITRA) {
    query += ` AND u.role = 'Mitra'`;
  } else if (groupBy === GROWTH_GROUP_BY.SALES) {
    query += ` AND u.role = 'Sales'`;
  }

  // Apply date filters
  if (startDate) {
    query += ` AND DATE_FORMAT(cal.changed_at, ?) >= ?`;
    params.push(dateFormat, startDate);
  }

  if (endDate) {
    query += ` AND DATE_FORMAT(cal.changed_at, ?) <= ?`;
    params.push(dateFormat, endDate);
  }

  // Apply branch filter
  if (branchFilter) {
    query += ` AND c.branch_id = ?`;
    params.push(branchFilter);
  }

  // Group by period and dimension
  query += ` GROUP BY period`;
  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    query += `, c.branch_id, b.name`;
  } else if (groupBy === GROWTH_GROUP_BY.MITRA || groupBy === GROWTH_GROUP_BY.SALES) {
    query += `, c.registered_by, u.full_name`;
  }

  query += ` ORDER BY period ASC`;

  const [rows] = await appPool.execute(query, params);
  return rows;
}

/**
 * Get churned (terminated) counts grouped by period (and optionally by dimension).
 * Churn is determined from customer_audit_log where new_status = 'Terminated'.
 *
 * @param {string} dateFormat - MySQL DATE_FORMAT pattern ('%Y-%m' or '%Y')
 * @param {string|undefined} startDate - Start period filter
 * @param {string|undefined} endDate - End period filter
 * @param {number|null} branchFilter - Branch ID filter
 * @param {string|undefined} groupBy - Grouping dimension
 * @returns {Promise<Array>} Churned counts per period/group
 */
async function getChurned(dateFormat, startDate, endDate, branchFilter, groupBy) {
  let query = `
    SELECT 
      DATE_FORMAT(cal.changed_at, ?) AS period,
      COUNT(*) AS churned
  `;

  const params = [dateFormat];

  // Add grouping columns
  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    query += `, c.branch_id, b.name AS group_name`;
  } else if (groupBy === GROWTH_GROUP_BY.MITRA) {
    query += `, c.registered_by AS group_id, u.full_name AS group_name`;
  } else if (groupBy === GROWTH_GROUP_BY.SALES) {
    query += `, c.registered_by AS group_id, u.full_name AS group_name`;
  }

  query += `
    FROM customer_audit_log cal
    JOIN customers c ON cal.customer_id = c.id
  `;

  // Join for group name resolution
  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    query += ` JOIN branches b ON c.branch_id = b.id`;
  } else if (groupBy === GROWTH_GROUP_BY.MITRA || groupBy === GROWTH_GROUP_BY.SALES) {
    query += ` LEFT JOIN users u ON c.registered_by = u.id`;
  }

  query += ` WHERE cal.new_status = ?`;
  params.push(CUSTOMER_STATUS.TERMINATED);

  // Filter by role when grouping by Mitra or Sales
  if (groupBy === GROWTH_GROUP_BY.MITRA) {
    query += ` AND u.role = 'Mitra'`;
  } else if (groupBy === GROWTH_GROUP_BY.SALES) {
    query += ` AND u.role = 'Sales'`;
  }

  // Apply date filters
  if (startDate) {
    query += ` AND DATE_FORMAT(cal.changed_at, ?) >= ?`;
    params.push(dateFormat, startDate);
  }

  if (endDate) {
    query += ` AND DATE_FORMAT(cal.changed_at, ?) <= ?`;
    params.push(dateFormat, endDate);
  }

  // Apply branch filter
  if (branchFilter) {
    query += ` AND c.branch_id = ?`;
    params.push(branchFilter);
  }

  // Group by period and dimension
  query += ` GROUP BY period`;
  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    query += `, c.branch_id, b.name`;
  } else if (groupBy === GROWTH_GROUP_BY.MITRA || groupBy === GROWTH_GROUP_BY.SALES) {
    query += `, c.registered_by, u.full_name`;
  }

  query += ` ORDER BY period ASC`;

  const [rows] = await appPool.execute(query, params);
  return rows;
}

/**
 * Merge activation and churn data into a unified growth report.
 * Calculates net growth = activations - churned for each period/group combination.
 *
 * @param {Array} activationsData - Activation rows from DB
 * @param {Array} churnedData - Churned rows from DB
 * @param {string|undefined} groupBy - Grouping dimension
 * @returns {Array} Merged growth data with net calculation
 */
function mergeGrowthData(activationsData, churnedData, groupBy) {
  const growthMap = new Map();

  // Build composite key for grouping
  const buildKey = (row) => {
    if (groupBy === GROWTH_GROUP_BY.BRANCH) {
      return `${row.period}::${row.branch_id}`;
    } else if (groupBy === GROWTH_GROUP_BY.MITRA || groupBy === GROWTH_GROUP_BY.SALES) {
      return `${row.period}::${row.group_id}`;
    }
    return row.period;
  };

  // Process activations
  for (const row of activationsData) {
    const key = buildKey(row);
    const entry = growthMap.get(key) || createGrowthEntry(row, groupBy);
    entry.activations = Number(row.activations);
    entry.netGrowth = entry.activations - entry.churned;
    growthMap.set(key, entry);
  }

  // Process churned
  for (const row of churnedData) {
    const key = buildKey(row);
    const entry = growthMap.get(key) || createGrowthEntry(row, groupBy);
    entry.churned = Number(row.churned);
    entry.netGrowth = entry.activations - entry.churned;
    growthMap.set(key, entry);
  }

  // Convert to sorted array
  const result = Array.from(growthMap.values());
  result.sort((a, b) => {
    if (a.period !== b.period) return a.period.localeCompare(b.period);
    if (a.groupName && b.groupName) return a.groupName.localeCompare(b.groupName);
    return 0;
  });

  return result;
}

/**
 * Create a new growth entry object.
 * @param {object} row - Source row from DB
 * @param {string|undefined} groupBy - Grouping dimension
 * @returns {object} Growth entry with default values
 */
function createGrowthEntry(row, groupBy) {
  const entry = {
    period: row.period,
    activations: 0,
    churned: 0,
    netGrowth: 0,
  };

  if (groupBy === GROWTH_GROUP_BY.BRANCH) {
    entry.branchId = row.branch_id;
    entry.groupName = row.group_name || 'Unknown';
  } else if (groupBy === GROWTH_GROUP_BY.MITRA || groupBy === GROWTH_GROUP_BY.SALES) {
    entry.groupId = row.group_id;
    entry.groupName = row.group_name || 'Unknown';
  }

  return entry;
}

module.exports = {
  // Financial reports (Requirements: 35.1-35.4)
  generateIncomeReport,
  generateReceivablesReport,
  generateCashAdvancesReport,
  generateReconciliationReport,
  generateFinancialReport,
  // Komdigi regulatory reports (Requirements: 34.1-34.4)
  generateKomdigiPackages,
  generateKomdigiCustomers,
  generateKomdigiRevenue,
  exportKomdigiPackagesExcel,
  exportKomdigiCustomersExcel,
  exportKomdigiRevenueExcel,
  // Customer growth reports (Requirements: 36.1-36.5)
  calculateGrowth,
  mergeGrowthData,
  GROWTH_PERIOD,
  GROWTH_GROUP_BY,
};
