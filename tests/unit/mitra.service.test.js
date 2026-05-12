/**
 * Unit tests for Mitra payment service.
 * Tests topup, processPayment, getBalance, getReport, and profit sharing calculation.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => {
  const mockConnection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  return {
    appPool: {
      execute: jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      __mockConnection: mockConnection,
    },
  };
});

jest.mock('../../src/models/user.model');
jest.mock('../../src/models/invoice.model');

const { appPool } = require('../../src/config/database');
const userModel = require('../../src/models/user.model');
const invoiceModel = require('../../src/models/invoice.model');
const mitraService = require('../../src/services/mitra.service');

describe('Mitra Service', () => {
  let mockConnection;

  beforeEach(() => {
    jest.resetAllMocks();
    mockConnection = appPool.__mockConnection;
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.execute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
    appPool.getConnection.mockResolvedValue(mockConnection);
    appPool.execute.mockResolvedValue([[], []]);
  });

  const mockMitra = {
    id: 1,
    username: 'mitra_01',
    full_name: 'Mitra Satu',
    role: 'Mitra',
    branch_id: 1,
    status: 'Active',
    profit_sharing_pct: 10,
    commission_amount: null,
    saldo: 500000,
  };

  const mockNonMitraUser = {
    id: 2,
    username: 'admin_01',
    full_name: 'Admin User',
    role: 'Admin',
    branch_id: 1,
    status: 'Active',
    profit_sharing_pct: null,
    commission_amount: null,
    saldo: 0,
  };

  const mockInvoice = {
    id: 10,
    invoice_number: 'INV-202401-00001',
    customer_id: 5,
    subscription_id: 3,
    billing_period: '2024-01',
    base_amount: 150000,
    ppn_amount: 16500,
    total_amount: 166500,
    status: 'UNPAID',
    due_date: '2024-01-10',
  };

  describe('topup', () => {
    it('should top up Mitra balance and create saldo_transaction record', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      mockConnection.execute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]);

      const result = await mitraService.topup(1, 200000, 'TRF-20240101-001');

      expect(result.user_id).toBe(1);
      expect(result.type).toBe('Topup');
      expect(result.amount).toBe(200000);
      expect(result.balance_after).toBe(700000); // 500000 + 200000
      expect(result.reference).toBe('TRF-20240101-001');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw error if user is not a Mitra', async () => {
      userModel.findById.mockResolvedValue(mockNonMitraUser);

      await expect(
        mitraService.topup(2, 200000, 'TRF-001')
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('should throw error if user not found', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(
        mitraService.topup(999, 200000, 'TRF-001')
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw error if amount is zero or negative', async () => {
      userModel.findById.mockResolvedValue(mockMitra);

      await expect(
        mitraService.topup(1, 0, 'TRF-001')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      await expect(
        mitraService.topup(1, -100, 'TRF-001')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw error if reference is empty', async () => {
      userModel.findById.mockResolvedValue(mockMitra);

      await expect(
        mitraService.topup(1, 200000, '')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should rollback transaction on error', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        mitraService.topup(1, 200000, 'TRF-001')
      ).rejects.toThrow('DB error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('processPayment', () => {
    it('should deduct saldo, mark invoice as LUNAS, and return profit sharing', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]);

      const result = await mitraService.processPayment(1, 10);

      expect(result.invoice_id).toBe(10);
      expect(result.payment_amount).toBe(166500);
      expect(result.new_saldo).toBe(333500); // 500000 - 166500
      expect(result.profit_sharing.percentage).toBe(10);
      expect(result.profit_sharing.base_price).toBe(150000);
      expect(result.profit_sharing.profit_amount).toBe(15000); // 150000 * 10%
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw INSUFFICIENT_BALANCE when saldo < payment amount', async () => {
      const lowSaldoMitra = { ...mockMitra, saldo: 100000 };
      userModel.findById.mockResolvedValue(lowSaldoMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      await expect(
        mitraService.processPayment(1, 10)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_BALANCE',
      });
    });

    it('should throw error when invoice not found', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue(null);

      await expect(
        mitraService.processPayment(1, 999)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw error when invoice is already LUNAS', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue({ ...mockInvoice, status: 'LUNAS' });

      await expect(
        mitraService.processPayment(1, 10)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw error when user is not a Mitra', async () => {
      userModel.findById.mockResolvedValue(mockNonMitraUser);

      await expect(
        mitraService.processPayment(2, 10)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('should process payment when saldo equals payment amount exactly', async () => {
      const exactSaldoMitra = { ...mockMitra, saldo: 166500 };
      userModel.findById.mockResolvedValue(exactSaldoMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]);

      const result = await mitraService.processPayment(1, 10);

      expect(result.new_saldo).toBe(0);
      expect(result.payment_amount).toBe(166500);
    });

    it('should rollback transaction on error during payment', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        mitraService.processPayment(1, 10)
      ).rejects.toThrow('DB error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('should return current Mitra balance information', async () => {
      userModel.findById.mockResolvedValue(mockMitra);

      const result = await mitraService.getBalance(1);

      expect(result.user_id).toBe(1);
      expect(result.full_name).toBe('Mitra Satu');
      expect(result.saldo).toBe(500000);
      expect(result.profit_sharing_pct).toBe(10);
    });

    it('should throw error if user not found', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(mitraService.getBalance(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw error if user is not a Mitra', async () => {
      userModel.findById.mockResolvedValue(mockNonMitraUser);

      await expect(mitraService.getBalance(2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });
  });

  describe('getReport', () => {
    it('should return revenue report with summary and transaction history', async () => {
      userModel.findById.mockResolvedValue(mockMitra);

      // Mock payment summary query
      appPool.execute
        .mockResolvedValueOnce([[{ total_payments: 5, total_amount: 832500 }], []])
        // Mock topup summary query
        .mockResolvedValueOnce([[{ total_topups: 3, total_topup_amount: 1000000 }], []])
        // Mock history count query
        .mockResolvedValueOnce([[{ total: 8 }], []])
        // Mock history data query
        .mockResolvedValueOnce([[
          { id: 1, type: 'Topup', amount: 500000, balance_after: 500000 },
          { id: 2, type: 'Deduction', amount: 166500, balance_after: 333500 },
        ], []]);

      const result = await mitraService.getReport(1, { page: 1, limit: 20 });

      expect(result.user_id).toBe(1);
      expect(result.current_saldo).toBe(500000);
      expect(result.profit_sharing_pct).toBe(10);
      expect(result.summary.total_payments).toBe(5);
      expect(result.summary.total_payment_amount).toBe(832500);
      expect(result.summary.profit_sharing_earned).toBe(83250); // 832500 * 10%
      expect(result.summary.total_topups).toBe(3);
      expect(result.summary.total_topup_amount).toBe(1000000);
      expect(result.transactions.data).toHaveLength(2);
      expect(result.transactions.total).toBe(8);
    });

    it('should apply date filters when provided', async () => {
      userModel.findById.mockResolvedValue(mockMitra);

      appPool.execute
        .mockResolvedValueOnce([[{ total_payments: 2, total_amount: 333000 }], []])
        .mockResolvedValueOnce([[{ total_topups: 1, total_topup_amount: 500000 }], []])
        .mockResolvedValueOnce([[{ total: 3 }], []])
        .mockResolvedValueOnce([[], []]);

      const result = await mitraService.getReport(1, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      // Verify date params were passed to queries
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND created_at >= ?'),
        expect.arrayContaining([1, '2024-01-01', '2024-01-31 23:59:59'])
      );
      expect(result.summary.total_payments).toBe(2);
    });

    it('should throw error if user is not a Mitra', async () => {
      userModel.findById.mockResolvedValue(mockNonMitraUser);

      await expect(mitraService.getReport(2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });
  });

  describe('calculateProfitSharing', () => {
    it('should calculate profit sharing as percentage of base price', () => {
      const result = mitraService.calculateProfitSharing(mockMitra, 150000);

      expect(result.percentage).toBe(10);
      expect(result.base_price).toBe(150000);
      expect(result.profit_amount).toBe(15000); // 150000 * 10%
    });

    it('should handle zero profit sharing percentage', () => {
      const zeroPctMitra = { ...mockMitra, profit_sharing_pct: 0 };
      const result = mitraService.calculateProfitSharing(zeroPctMitra, 150000);

      expect(result.profit_amount).toBe(0);
    });

    it('should handle fractional percentages', () => {
      const fractionalMitra = { ...mockMitra, profit_sharing_pct: 7.5 };
      const result = mitraService.calculateProfitSharing(fractionalMitra, 200000);

      expect(result.percentage).toBe(7.5);
      expect(result.profit_amount).toBe(15000); // 200000 * 7.5%
    });

    it('should handle null profit_sharing_pct gracefully', () => {
      const nullPctMitra = { ...mockMitra, profit_sharing_pct: null };
      const result = mitraService.calculateProfitSharing(nullPctMitra, 150000);

      expect(result.profit_amount).toBe(0);
    });

    it('should handle high profit sharing percentage (e.g., 25%)', () => {
      const highPctMitra = { ...mockMitra, profit_sharing_pct: 25 };
      const result = mitraService.calculateProfitSharing(highPctMitra, 300000);

      expect(result.percentage).toBe(25);
      expect(result.base_price).toBe(300000);
      expect(result.profit_amount).toBe(75000); // 300000 * 25%
    });

    it('should handle very small base price amounts', () => {
      const result = mitraService.calculateProfitSharing(mockMitra, 1000);

      expect(result.profit_amount).toBe(100); // 1000 * 10%
    });

    it('should handle zero base price', () => {
      const result = mitraService.calculateProfitSharing(mockMitra, 0);

      expect(result.base_price).toBe(0);
      expect(result.profit_amount).toBe(0);
    });

    it('should round profit amount to 2 decimal places', () => {
      // 33333 * 10% = 3333.3 -> should round properly
      const result = mitraService.calculateProfitSharing(mockMitra, 33333);

      expect(result.profit_amount).toBe(3333.3);
    });

    it('should handle string base price by parsing to float', () => {
      const result = mitraService.calculateProfitSharing(mockMitra, '150000');

      expect(result.base_price).toBe(150000);
      expect(result.profit_amount).toBe(15000);
    });
  });

  describe('processPayment - transaction isolation and race conditions', () => {
    it('should use database transaction to ensure atomicity of saldo deduction', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]);

      await mitraService.processPayment(1, 10);

      // Verify transaction boundaries
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      // Verify all operations happen within the transaction
      expect(mockConnection.execute).toHaveBeenCalledTimes(3); // saldo update, saldo_tx insert, invoice update
    });

    it('should rollback all changes if invoice update fails after saldo deduction', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      // Saldo update succeeds, saldo_tx succeeds, invoice update fails
      mockConnection.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ insertId: 1 }, []])
        .mockRejectedValueOnce(new Error('Invoice update failed'));

      await expect(mitraService.processPayment(1, 10)).rejects.toThrow('Invoice update failed');

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should correctly calculate new balance after deduction with various amounts', async () => {
      const mitra1M = { ...mockMitra, saldo: 1000000 };
      userModel.findById.mockResolvedValue(mitra1M);
      invoiceModel.findById.mockResolvedValue(mockInvoice); // total_amount: 166500
      mockConnection.execute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]);

      const result = await mitraService.processPayment(1, 10);

      // 1000000 - 166500 = 833500
      expect(result.new_saldo).toBe(833500);
    });

    it('should always release connection even when beginTransaction fails', async () => {
      userModel.findById.mockResolvedValue(mockMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.beginTransaction.mockRejectedValue(new Error('Connection pool exhausted'));

      await expect(mitraService.processPayment(1, 10)).rejects.toThrow('Connection pool exhausted');

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should reject payment when saldo is exactly 1 unit less than required', async () => {
      const almostEnoughMitra = { ...mockMitra, saldo: 166499 }; // 1 less than 166500
      userModel.findById.mockResolvedValue(almostEnoughMitra);
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      await expect(mitraService.processPayment(1, 10)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_BALANCE',
      });

      // Should not even start a transaction
      expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
    });
  });
});
