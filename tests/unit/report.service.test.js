/**
 * Unit tests for report service - financial reports.
 * Tests income report, receivables, cash advances, reconciliation,
 * and filtering by date range, Branch, payment method, handler.
 *
 * Requirements: 35.1, 35.2, 35.3, 35.4
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

const { appPool } = require('../../src/config/database');
const reportService = require('../../src/services/report.service');

describe('Report Service - Financial Reports', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    appPool.execute.mockResolvedValue([[], []]);
  });

  describe('generateIncomeReport', () => {
    it('should return income summary with PPN breakdown', async () => {
      // Mock summary query
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 10,
          total_base_amount: '1500000.00',
          total_ppn_amount: '165000.00',
          total_revenue: '1665000.00',
          total_installation_fees: '100000.00',
          total_addon_charges: '50000.00',
          total_dp_deductions: '200000.00',
        }]])
        // Mock payment method breakdown
        .mockResolvedValueOnce([[
          { payment_method: 'VA', transaction_count: 5, total_amount: '800000.00' },
          { payment_method: 'QRIS', transaction_count: 3, total_amount: '500000.00' },
          { payment_method: 'Mitra', transaction_count: 2, total_amount: '365000.00' },
        ]])
        // Mock monthly breakdown
        .mockResolvedValueOnce([[
          { billing_period: '2024-01', invoice_count: 5, base_amount: '750000.00', ppn_amount: '82500.00', total_amount: '832500.00' },
          { billing_period: '2024-02', invoice_count: 5, base_amount: '750000.00', ppn_amount: '82500.00', total_amount: '832500.00' },
        ]]);

      const result = await reportService.generateIncomeReport({});

      expect(result.summary.totalInvoices).toBe(10);
      expect(result.summary.totalBaseAmount).toBe(1500000);
      expect(result.summary.totalPpnAmount).toBe(165000);
      expect(result.summary.totalRevenue).toBe(1665000);
      expect(result.paymentMethodBreakdown).toHaveLength(3);
      expect(result.paymentMethodBreakdown[0].paymentMethod).toBe('VA');
      expect(result.monthlyBreakdown).toHaveLength(2);
      expect(result.monthlyBreakdown[0].ppnAmount).toBe(82500);
    });

    it('should apply date range filter', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 3,
          total_base_amount: '450000.00',
          total_ppn_amount: '49500.00',
          total_revenue: '499500.00',
          total_installation_fees: '0.00',
          total_addon_charges: '0.00',
          total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateIncomeReport({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result.filters.startDate).toBe('2024-01-01');
      expect(result.filters.endDate).toBe('2024-01-31');
      expect(result.summary.totalInvoices).toBe(3);

      // Verify date params were passed to query
      const firstCall = appPool.execute.mock.calls[0];
      expect(firstCall[1]).toContain('2024-01-01');
      expect(firstCall[1]).toContain('2024-01-31');
    });

    it('should apply branch filter', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 2,
          total_base_amount: '300000.00',
          total_ppn_amount: '33000.00',
          total_revenue: '333000.00',
          total_installation_fees: '0.00',
          total_addon_charges: '0.00',
          total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateIncomeReport({ branchId: 1 });

      expect(result.filters.branchId).toBe(1);
      // Verify branch_id param was passed
      const firstCall = appPool.execute.mock.calls[0];
      expect(firstCall[1]).toContain(1);
    });

    it('should apply payment method filter', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 1,
          total_base_amount: '150000.00',
          total_ppn_amount: '16500.00',
          total_revenue: '166500.00',
          total_installation_fees: '0.00',
          total_addon_charges: '0.00',
          total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateIncomeReport({ paymentMethod: 'VA' });

      expect(result.filters.paymentMethod).toBe('VA');
      const firstCall = appPool.execute.mock.calls[0];
      expect(firstCall[1]).toContain('VA');
    });

    it('should apply handler filter', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 4,
          total_base_amount: '600000.00',
          total_ppn_amount: '66000.00',
          total_revenue: '666000.00',
          total_installation_fees: '0.00',
          total_addon_charges: '0.00',
          total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateIncomeReport({ handler: 'Mitra' });

      expect(result.filters.handler).toBe('Mitra');
      const firstCall = appPool.execute.mock.calls[0];
      expect(firstCall[1]).toContain('Mitra');
    });
  });

  describe('generateReceivablesReport', () => {
    it('should return receivables with aging analysis', async () => {
      appPool.execute.mockResolvedValueOnce([[
        {
          id: 1,
          invoice_number: 'INV-202401-00001',
          customer_id: 10,
          customer_name: 'John Doe',
          branch_id: 1,
          branch_name: 'Branch A',
          billing_period: '2024-01',
          base_amount: '150000.00',
          ppn_amount: '16500.00',
          total_amount: '166500.00',
          due_date: '2024-01-10',
          days_overdue: 45,
        },
        {
          id: 2,
          invoice_number: 'INV-202402-00001',
          customer_id: 11,
          customer_name: 'Jane Smith',
          branch_id: 1,
          branch_name: 'Branch A',
          billing_period: '2024-02',
          base_amount: '200000.00',
          ppn_amount: '22000.00',
          total_amount: '222000.00',
          due_date: '2024-02-10',
          days_overdue: 15,
        },
        {
          id: 3,
          invoice_number: 'INV-202403-00001',
          customer_id: 12,
          customer_name: 'Bob Wilson',
          branch_id: 2,
          branch_name: 'Branch B',
          billing_period: '2024-03',
          base_amount: '100000.00',
          ppn_amount: '11000.00',
          total_amount: '111000.00',
          due_date: '2024-03-10',
          days_overdue: -5,
        },
      ]]);

      const result = await reportService.generateReceivablesReport({});

      expect(result.summary.totalOutstandingInvoices).toBe(3);
      expect(result.summary.totalOutstandingAmount).toBe(499500);

      // Aging buckets
      expect(result.aging.current.count).toBe(1); // days_overdue = -5
      expect(result.aging.overdue1to30.count).toBe(1); // days_overdue = 15
      expect(result.aging.overdue31to60.count).toBe(1); // days_overdue = 45

      // PPN breakdown in aging
      expect(result.aging.overdue31to60.ppnAmount).toBe(16500);
      expect(result.aging.overdue1to30.ppnAmount).toBe(22000);

      // Invoice details
      expect(result.invoices).toHaveLength(3);
      expect(result.invoices[0].agingBucket).toBe('overdue31to60');
      expect(result.invoices[1].agingBucket).toBe('overdue1to30');
      expect(result.invoices[2].agingBucket).toBe('current');
    });

    it('should filter by branch', async () => {
      appPool.execute.mockResolvedValueOnce([[]]);

      const result = await reportService.generateReceivablesReport({ branchId: 1 });

      expect(result.filters.branchId).toBe(1);
      const call = appPool.execute.mock.calls[0];
      expect(call[1]).toContain(1);
    });

    it('should handle empty results', async () => {
      appPool.execute.mockResolvedValueOnce([[]]);

      const result = await reportService.generateReceivablesReport({});

      expect(result.summary.totalOutstandingInvoices).toBe(0);
      expect(result.summary.totalOutstandingAmount).toBe(0);
      expect(result.aging.current.count).toBe(0);
      expect(result.invoices).toHaveLength(0);
    });
  });

  describe('generateCashAdvancesReport', () => {
    it('should return cash advances summary for Mitra/Merchant', async () => {
      // Mock summary query
      appPool.execute
        .mockResolvedValueOnce([[
          {
            user_id: 1,
            full_name: 'Mitra A',
            role: 'Mitra',
            branch_id: 1,
            branch_name: 'Branch A',
            current_balance: '500000.00',
            total_topup: '1000000.00',
            total_deductions: '500000.00',
            total_refunds: '0.00',
            transaction_count: 10,
          },
          {
            user_id: 2,
            full_name: 'Merchant B',
            role: 'Merchant',
            branch_id: 1,
            branch_name: 'Branch A',
            current_balance: '200000.00',
            total_topup: '800000.00',
            total_deductions: '600000.00',
            total_refunds: '0.00',
            transaction_count: 8,
          },
        ]])
        // Mock detail query
        .mockResolvedValueOnce([[
          {
            id: 1,
            user_id: 1,
            full_name: 'Mitra A',
            role: 'Mitra',
            type: 'Topup',
            amount: '500000.00',
            balance_after: '500000.00',
            reference: 'TOP-001',
            created_at: '2024-01-15T10:00:00.000Z',
          },
        ]]);

      const result = await reportService.generateCashAdvancesReport({});

      expect(result.summary.totalAccounts).toBe(2);
      expect(result.summary.totalCurrentBalance).toBe(700000);
      expect(result.summary.totalTopup).toBe(1800000);
      expect(result.summary.totalDeductions).toBe(1100000);
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].role).toBe('Mitra');
      expect(result.transactions).toHaveLength(1);
    });

    it('should filter by handler role', async () => {
      appPool.execute
        .mockResolvedValueOnce([[
          {
            user_id: 1,
            full_name: 'Mitra A',
            role: 'Mitra',
            branch_id: 1,
            branch_name: 'Branch A',
            current_balance: '500000.00',
            total_topup: '1000000.00',
            total_deductions: '500000.00',
            total_refunds: '0.00',
            transaction_count: 10,
          },
        ]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateCashAdvancesReport({ handler: 'Mitra' });

      expect(result.filters.handler).toBe('Mitra');
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].role).toBe('Mitra');
    });
  });

  describe('generateReconciliationReport', () => {
    it('should return reconciliation data with PPN breakdown', async () => {
      // Mock invoice summary
      appPool.execute
        .mockResolvedValueOnce([[{
          total_generated: 20,
          total_base_billed: '3000000.00',
          total_ppn_billed: '330000.00',
          total_billed: '3330000.00',
          total_paid: '2664000.00',
          total_unpaid: '499500.00',
          total_waived: '166500.00',
          total_cancelled: '0.00',
        }]])
        // Mock payment summary
        .mockResolvedValueOnce([[{
          total_payments: 16,
          total_collected: '2664000.00',
          total_admin_fees: '48000.00',
        }]])
        // Mock handler breakdown
        .mockResolvedValueOnce([[
          { handler_role: 'System', transaction_count: 10, total_amount: '1664000.00', total_admin_fees: '0.00' },
          { handler_role: 'Mitra', transaction_count: 4, total_amount: '666000.00', total_admin_fees: '0.00' },
          { handler_role: 'Merchant', transaction_count: 2, total_amount: '334000.00', total_admin_fees: '48000.00' },
        ]]);

      const result = await reportService.generateReconciliationReport({});

      // Invoice summary with PPN
      expect(result.invoiceSummary.totalGenerated).toBe(20);
      expect(result.invoiceSummary.totalBaseBilled).toBe(3000000);
      expect(result.invoiceSummary.totalPpnBilled).toBe(330000);
      expect(result.invoiceSummary.totalBilled).toBe(3330000);
      expect(result.invoiceSummary.totalPaid).toBe(2664000);
      expect(result.invoiceSummary.totalUnpaid).toBe(499500);

      // Payment summary
      expect(result.paymentSummary.totalPayments).toBe(16);
      expect(result.paymentSummary.totalCollected).toBe(2664000);

      // Reconciliation
      expect(result.reconciliation.totalBilled).toBe(3330000);
      expect(result.reconciliation.totalCollected).toBe(2664000);
      expect(result.reconciliation.variance).toBe(666000);
      expect(result.reconciliation.collectionRate).toBe(80);

      // Handler breakdown
      expect(result.handlerBreakdown).toHaveLength(3);
    });

    it('should handle zero billed amount gracefully', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_generated: 0,
          total_base_billed: '0.00',
          total_ppn_billed: '0.00',
          total_billed: '0.00',
          total_paid: '0.00',
          total_unpaid: '0.00',
          total_waived: '0.00',
          total_cancelled: '0.00',
        }]])
        .mockResolvedValueOnce([[{
          total_payments: 0,
          total_collected: '0.00',
          total_admin_fees: '0.00',
        }]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateReconciliationReport({});

      expect(result.reconciliation.collectionRate).toBe(0);
      expect(result.reconciliation.variance).toBe(0);
    });
  });

  describe('generateFinancialReport', () => {
    it('should generate all report types when reportType is "all"', async () => {
      // Mock for income report (3 queries)
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 5, total_base_amount: '750000.00', total_ppn_amount: '82500.00',
          total_revenue: '832500.00', total_installation_fees: '0.00',
          total_addon_charges: '0.00', total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        // Mock for receivables (1 query)
        .mockResolvedValueOnce([[]])
        // Mock for cash advances (2 queries)
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        // Mock for reconciliation (3 queries)
        .mockResolvedValueOnce([[{
          total_generated: 5, total_base_billed: '750000.00', total_ppn_billed: '82500.00',
          total_billed: '832500.00', total_paid: '832500.00', total_unpaid: '0.00',
          total_waived: '0.00', total_cancelled: '0.00',
        }]])
        .mockResolvedValueOnce([[{
          total_payments: 5, total_collected: '832500.00', total_admin_fees: '0.00',
        }]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateFinancialReport({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result.reportType).toBe('all');
      expect(result.income).toBeDefined();
      expect(result.receivables).toBeDefined();
      expect(result.cashAdvances).toBeDefined();
      expect(result.reconciliation).toBeDefined();
      expect(result.generatedAt).toBeDefined();
    });

    it('should generate only income report when reportType is "income"', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 5, total_base_amount: '750000.00', total_ppn_amount: '82500.00',
          total_revenue: '832500.00', total_installation_fees: '0.00',
          total_addon_charges: '0.00', total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateFinancialReport({ reportType: 'income' });

      expect(result.reportType).toBe('income');
      expect(result.income).toBeDefined();
      expect(result.receivables).toBeUndefined();
      expect(result.cashAdvances).toBeUndefined();
    });

    it('should generate only receivables report when reportType is "receivables"', async () => {
      appPool.execute.mockResolvedValueOnce([[]]);

      const result = await reportService.generateFinancialReport({ reportType: 'receivables' });

      expect(result.reportType).toBe('receivables');
      expect(result.receivables).toBeDefined();
      expect(result.income).toBeUndefined();
    });

    it('should throw error for invalid report type', async () => {
      await expect(
        reportService.generateFinancialReport({ reportType: 'invalid' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should pass filters through to sub-reports', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{
          total_invoices: 2, total_base_amount: '300000.00', total_ppn_amount: '33000.00',
          total_revenue: '333000.00', total_installation_fees: '0.00',
          total_addon_charges: '0.00', total_dp_deductions: '0.00',
        }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateFinancialReport({
        reportType: 'income',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        branchId: 1,
        paymentMethod: 'VA',
        handler: 'Admin',
      });

      expect(result.filters.startDate).toBe('2024-01-01');
      expect(result.filters.endDate).toBe('2024-01-31');
      expect(result.filters.branchId).toBe(1);
      expect(result.filters.paymentMethod).toBe('VA');
      expect(result.filters.handler).toBe('Admin');
    });
  });
});
