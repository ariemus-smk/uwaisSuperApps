/**
 * Unit tests for bill waiver functionality.
 * Focuses on multi-month isolir waiver calculation and audit trail recording.
 *
 * Requirements: 11.1, 11.2
 * - 11.1: WHEN a customer has been in Isolir status for more than 1 month and then makes a payment,
 *         THE Backend SHALL waive (cancel) all invoices generated during the isolir period.
 * - 11.2: WHEN invoices are waived, THE Backend SHALL record the waiver with reason "Extended Isolir"
 *         and the waived amount for audit purposes.
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/invoice.model');
jest.mock('../../src/models/subscription.model');
jest.mock('../../src/models/package.model');
jest.mock('../../src/models/customer.model');
jest.mock('../../src/utils/prorataCalc');

const { appPool } = require('../../src/config/database');
const invoiceModel = require('../../src/models/invoice.model');
const customerModel = require('../../src/models/customer.model');
const billingService = require('../../src/services/billing.service');

describe('Bill Waiver - Extended Isolir', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    appPool.execute.mockResolvedValue([[], []]);
  });

  /**
   * Helper to create a date N days in the past.
   */
  function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  describe('Waiver calculation for multi-month isolir (Requirement 11.1)', () => {
    it('should waive all invoices when customer isolated for 2 months (60 days)', async () => {
      customerModel.findById.mockResolvedValue({
        id: 1,
        lifecycle_status: 'Isolir',
        full_name: 'Customer A',
      });

      const isolirDate = daysAgo(60);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 10, invoice_number: 'INV-202401-00001', billing_period: '2024-01', total_amount: 150000, status: 'UNPAID' },
          { id: 11, invoice_number: 'INV-202402-00001', billing_period: '2024-02', total_amount: 150000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(1);

      expect(result.waived).toBe(true);
      expect(result.waivedInvoices).toHaveLength(2);
      expect(result.totalWaivedAmount).toBe(300000);
      expect(result.isolirDays).toBe(60);
    });

    it('should waive all invoices when customer isolated for 3 months (90 days)', async () => {
      customerModel.findById.mockResolvedValue({
        id: 2,
        lifecycle_status: 'Isolir',
        full_name: 'Customer B',
      });

      const isolirDate = daysAgo(90);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 20, invoice_number: 'INV-202401-00005', billing_period: '2024-01', total_amount: 200000, status: 'UNPAID' },
          { id: 21, invoice_number: 'INV-202402-00005', billing_period: '2024-02', total_amount: 200000, status: 'UNPAID' },
          { id: 22, invoice_number: 'INV-202403-00005', billing_period: '2024-03', total_amount: 200000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(2);

      expect(result.waived).toBe(true);
      expect(result.waivedInvoices).toHaveLength(3);
      expect(result.totalWaivedAmount).toBe(600000);
      expect(result.isolirDays).toBe(90);
    });

    it('should NOT waive invoices when isolir duration is exactly 30 days (boundary)', async () => {
      customerModel.findById.mockResolvedValue({
        id: 3,
        lifecycle_status: 'Isolir',
        full_name: 'Customer C',
      });

      const isolirDate = daysAgo(30);

      appPool.execute.mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []]);

      const result = await billingService.waiveExtendedIsolir(3);

      expect(result.waived).toBe(false);
      expect(result.waivedInvoices).toHaveLength(0);
      expect(result.totalWaivedAmount).toBe(0);
      expect(result.isolirDays).toBe(30);
      expect(invoiceModel.update).not.toHaveBeenCalled();
    });

    it('should waive invoices when isolir duration is 31 days (just over threshold)', async () => {
      customerModel.findById.mockResolvedValue({
        id: 4,
        lifecycle_status: 'Isolir',
        full_name: 'Customer D',
      });

      const isolirDate = daysAgo(31);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 30, invoice_number: 'INV-202402-00010', billing_period: '2024-02', total_amount: 166500, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(4);

      expect(result.waived).toBe(true);
      expect(result.waivedInvoices).toHaveLength(1);
      expect(result.totalWaivedAmount).toBe(166500);
      expect(result.isolirDays).toBe(31);
    });

    it('should correctly sum waived amounts for invoices with different totals (PPN variations)', async () => {
      customerModel.findById.mockResolvedValue({
        id: 5,
        lifecycle_status: 'Isolir',
        full_name: 'Customer E',
      });

      const isolirDate = daysAgo(75);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 40, invoice_number: 'INV-202401-00020', billing_period: '2024-01', total_amount: 166500, status: 'UNPAID' },
          { id: 41, invoice_number: 'INV-202402-00020', billing_period: '2024-02', total_amount: 222000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(5);

      expect(result.waived).toBe(true);
      expect(result.totalWaivedAmount).toBe(388500); // 166500 + 222000
      expect(result.waivedInvoices[0].waived_amount).toBe(166500);
      expect(result.waivedInvoices[1].waived_amount).toBe(222000);
    });

    it('should return waived=false when no unpaid invoices exist during isolir period', async () => {
      customerModel.findById.mockResolvedValue({
        id: 6,
        lifecycle_status: 'Isolir',
        full_name: 'Customer F',
      });

      const isolirDate = daysAgo(45);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[], []]); // No unpaid invoices

      const result = await billingService.waiveExtendedIsolir(6);

      expect(result.waived).toBe(false);
      expect(result.waivedInvoices).toHaveLength(0);
      expect(result.totalWaivedAmount).toBe(0);
    });

    it('should throw error when customer is not in Isolir status', async () => {
      customerModel.findById.mockResolvedValue({
        id: 7,
        lifecycle_status: 'Aktif',
        full_name: 'Customer G',
      });

      await expect(billingService.waiveExtendedIsolir(7)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw error when customer not found', async () => {
      customerModel.findById.mockResolvedValue(null);

      await expect(billingService.waiveExtendedIsolir(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw error when isolir start date not found in audit log', async () => {
      customerModel.findById.mockResolvedValue({
        id: 8,
        lifecycle_status: 'Isolir',
        full_name: 'Customer H',
      });

      appPool.execute.mockResolvedValueOnce([[], []]); // No audit log entries

      await expect(billingService.waiveExtendedIsolir(8)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('Audit trail recording (Requirement 11.2)', () => {
    it('should record waiver reason "Extended Isolir" on each waived invoice', async () => {
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Isolir',
        full_name: 'Audit Customer',
      });

      const isolirDate = daysAgo(50);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 100, invoice_number: 'INV-202401-00100', billing_period: '2024-01', total_amount: 150000, status: 'UNPAID' },
          { id: 101, invoice_number: 'INV-202402-00100', billing_period: '2024-02', total_amount: 150000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      await billingService.waiveExtendedIsolir(10);

      // Verify each invoice update includes the waiver reason
      expect(invoiceModel.update).toHaveBeenCalledTimes(2);
      expect(invoiceModel.update).toHaveBeenCalledWith(100, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
      expect(invoiceModel.update).toHaveBeenCalledWith(101, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
    });

    it('should record the waived amount per invoice in the result', async () => {
      customerModel.findById.mockResolvedValue({
        id: 11,
        lifecycle_status: 'Isolir',
        full_name: 'Amount Audit Customer',
      });

      const isolirDate = daysAgo(65);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 200, invoice_number: 'INV-202401-00200', billing_period: '2024-01', total_amount: 111000, status: 'UNPAID' },
          { id: 201, invoice_number: 'INV-202402-00200', billing_period: '2024-02', total_amount: 222000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(11);

      // Each waived invoice should include the waived_amount for audit
      expect(result.waivedInvoices[0]).toEqual({
        id: 200,
        invoice_number: 'INV-202401-00200',
        billing_period: '2024-01',
        waived_amount: 111000,
      });
      expect(result.waivedInvoices[1]).toEqual({
        id: 201,
        invoice_number: 'INV-202402-00200',
        billing_period: '2024-02',
        waived_amount: 222000,
      });
    });

    it('should record total waived amount rounded to 2 decimal places', async () => {
      customerModel.findById.mockResolvedValue({
        id: 12,
        lifecycle_status: 'Isolir',
        full_name: 'Rounding Customer',
      });

      const isolirDate = daysAgo(40);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 300, invoice_number: 'INV-202401-00300', billing_period: '2024-01', total_amount: 166500.33, status: 'UNPAID' },
          { id: 301, invoice_number: 'INV-202402-00300', billing_period: '2024-02', total_amount: 166500.67, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(12);

      // Total should be rounded: 166500.33 + 166500.67 = 333001.00
      expect(result.totalWaivedAmount).toBe(333001);
    });

    it('should set invoice status to WAIVED (not CANCELLED or other status)', async () => {
      customerModel.findById.mockResolvedValue({
        id: 13,
        lifecycle_status: 'Isolir',
        full_name: 'Status Check Customer',
      });

      const isolirDate = daysAgo(35);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 400, invoice_number: 'INV-202401-00400', billing_period: '2024-01', total_amount: 100000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      await billingService.waiveExtendedIsolir(13);

      // Verify the status is specifically 'WAIVED' (not CANCELLED)
      const updateCall = invoiceModel.update.mock.calls[0];
      expect(updateCall[1].status).toBe('WAIVED');
      expect(updateCall[1].waiver_reason).toBe('Extended Isolir');
    });

    it('should include invoice_number and billing_period in waiver audit data', async () => {
      customerModel.findById.mockResolvedValue({
        id: 14,
        lifecycle_status: 'Isolir',
        full_name: 'Audit Data Customer',
      });

      const isolirDate = daysAgo(45);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 500, invoice_number: 'INV-202403-00500', billing_period: '2024-03', total_amount: 175000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(14);

      // Audit data should include identifying information
      const waivedInvoice = result.waivedInvoices[0];
      expect(waivedInvoice).toHaveProperty('id', 500);
      expect(waivedInvoice).toHaveProperty('invoice_number', 'INV-202403-00500');
      expect(waivedInvoice).toHaveProperty('billing_period', '2024-03');
      expect(waivedInvoice).toHaveProperty('waived_amount', 175000);
    });

    it('should record isolir duration in days for audit context', async () => {
      customerModel.findById.mockResolvedValue({
        id: 15,
        lifecycle_status: 'Isolir',
        full_name: 'Duration Customer',
      });

      const isolirDate = daysAgo(55);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 600, invoice_number: 'INV-202401-00600', billing_period: '2024-01', total_amount: 100000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(15);

      // isolirDays should be recorded for audit context
      expect(result.isolirDays).toBe(55);
      expect(result.waived).toBe(true);
    });
  });

  describe('waiveInvoice - single invoice waiver with audit', () => {
    it('should record "Extended Isolir" reason when waiving a single invoice', async () => {
      const mockInvoice = { id: 1, status: 'UNPAID', total_amount: 166500 };
      invoiceModel.findById
        .mockResolvedValueOnce(mockInvoice)
        .mockResolvedValueOnce({ ...mockInvoice, status: 'WAIVED', waiver_reason: 'Extended Isolir' });
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveInvoice(1, 'Extended Isolir');

      expect(invoiceModel.update).toHaveBeenCalledWith(1, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
      expect(result.status).toBe('WAIVED');
      expect(result.waiver_reason).toBe('Extended Isolir');
    });

    it('should reject waiver without a reason (audit requirement)', async () => {
      const mockInvoice = { id: 2, status: 'UNPAID', total_amount: 100000 };
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      await expect(billingService.waiveInvoice(2, '')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      await expect(billingService.waiveInvoice(2, null)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should only allow waiving UNPAID invoices', async () => {
      invoiceModel.findById.mockResolvedValue({ id: 3, status: 'LUNAS', total_amount: 166500 });

      await expect(billingService.waiveInvoice(3, 'Extended Isolir')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });
  });
});
