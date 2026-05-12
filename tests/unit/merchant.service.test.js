/**
 * Unit tests for merchant service.
 * Tests topup, processPayment, getBalance, and calculateCommission.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => {
  const mockConnection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    execute: jest.fn().mockResolvedValue([{ insertId: 1 }, []]),
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

jest.mock('../../src/models/invoice.model');
jest.mock('../../src/models/payment.model');
jest.mock('../../src/models/user.model');

const { appPool } = require('../../src/config/database');
const invoiceModel = require('../../src/models/invoice.model');
const paymentModel = require('../../src/models/payment.model');
const userModel = require('../../src/models/user.model');
const merchantService = require('../../src/services/merchant.service');

describe('Merchant Service', () => {
  let mockConnection;

  beforeEach(() => {
    jest.resetAllMocks();
    mockConnection = appPool.__mockConnection;
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.execute.mockResolvedValue([{ insertId: 1 }, []]);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
    mockConnection.release.mockImplementation(() => {});
    appPool.getConnection.mockResolvedValue(mockConnection);
  });

  const mockMerchant = {
    id: 1,
    username: 'merchant01',
    full_name: 'Toko ABC',
    role: 'Merchant',
    branch_id: 1,
    status: 'Active',
    profit_sharing_pct: null,
    commission_amount: 2500,
    saldo: 500000,
  };

  const mockNonMerchant = {
    id: 2,
    username: 'admin01',
    full_name: 'Admin User',
    role: 'Admin',
    branch_id: 1,
    status: 'Active',
    saldo: 0,
  };

  const mockInvoice = {
    id: 10,
    invoice_number: 'INV-202401-00001',
    customer_id: 5,
    subscription_id: 3,
    total_amount: 166500,
    status: 'UNPAID',
  };

  describe('topup', () => {
    it('should top up Merchant saldo and create saldo_transaction record', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      mockConnection.execute.mockResolvedValue([{ insertId: 100 }, []]);

      const result = await merchantService.topup(1, 200000, 'TRF-001');

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(result.user_id).toBe(1);
      expect(result.type).toBe('Topup');
      expect(result.amount).toBe(200000);
      expect(result.balance_after).toBe(700000); // 500000 + 200000
      expect(result.reference).toBe('TRF-001');
    });

    it('should throw error if amount is zero or negative', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);

      await expect(merchantService.topup(1, 0, 'TRF-002')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      await expect(merchantService.topup(1, -5000, 'TRF-003')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw error if user is not a Merchant', async () => {
      userModel.findById.mockResolvedValue(mockNonMerchant);

      await expect(merchantService.topup(2, 100000, 'TRF-004')).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('should throw error if user not found', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(merchantService.topup(999, 100000, 'TRF-005')).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should rollback transaction on error', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(merchantService.topup(1, 100000, 'TRF-006')).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should handle null reference gracefully', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      mockConnection.execute.mockResolvedValue([{ insertId: 101 }, []]);

      const result = await merchantService.topup(1, 50000, null);

      expect(result.reference).toBeNull();
    });
  });

  describe('processPayment', () => {
    it('should deduct saldo, mark invoice LUNAS, and record commission', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 200 }, []]);

      const result = await merchantService.processPayment(1, 10);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(result.payment.invoice_id).toBe(10);
      expect(result.payment.amount).toBe(166500);
      expect(result.payment.method).toBe('Merchant');
      expect(result.payment.admin_fee).toBe(2500);
      expect(result.payment.status).toBe('Success');
      expect(result.balance_after).toBe(333500); // 500000 - 166500
      expect(result.commission).toBe(2500);
    });

    it('should throw INSUFFICIENT_BALANCE when saldo < payment amount', async () => {
      const lowSaldoMerchant = { ...mockMerchant, saldo: 100000 };
      userModel.findById.mockResolvedValue(lowSaldoMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      await expect(merchantService.processPayment(1, 10)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_BALANCE',
      });
    });

    it('should throw error when invoice not found', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(null);

      await expect(merchantService.processPayment(1, 999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw error when invoice is not UNPAID', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue({ ...mockInvoice, status: 'LUNAS' });

      await expect(merchantService.processPayment(1, 10)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw error if user is not a Merchant', async () => {
      userModel.findById.mockResolvedValue(mockNonMerchant);

      await expect(merchantService.processPayment(2, 10)).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('should rollback transaction on error during payment processing', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB write error'));

      await expect(merchantService.processPayment(1, 10)).rejects.toThrow('DB write error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should handle zero commission amount', async () => {
      const noCommissionMerchant = { ...mockMerchant, commission_amount: 0 };
      userModel.findById.mockResolvedValue(noCommissionMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 201 }, []]);

      const result = await merchantService.processPayment(1, 10);

      expect(result.commission).toBe(0);
      expect(result.payment.admin_fee).toBe(0);
    });

    it('should process payment when saldo exactly equals payment amount', async () => {
      const exactSaldoMerchant = { ...mockMerchant, saldo: 166500 };
      userModel.findById.mockResolvedValue(exactSaldoMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 202 }, []]);

      const result = await merchantService.processPayment(1, 10);

      expect(result.balance_after).toBe(0);
    });
  });

  describe('getBalance', () => {
    it('should return current saldo balance for a Merchant', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);

      const result = await merchantService.getBalance(1);

      expect(result.user_id).toBe(1);
      expect(result.full_name).toBe('Toko ABC');
      expect(result.saldo).toBe(500000);
      expect(result.commission_amount).toBe(2500);
    });

    it('should throw error if user is not a Merchant', async () => {
      userModel.findById.mockResolvedValue(mockNonMerchant);

      await expect(merchantService.getBalance(2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('should throw error if user not found', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(merchantService.getBalance(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should handle zero saldo', async () => {
      const zeroSaldoMerchant = { ...mockMerchant, saldo: 0 };
      userModel.findById.mockResolvedValue(zeroSaldoMerchant);

      const result = await merchantService.getBalance(1);

      expect(result.saldo).toBe(0);
    });
  });

  describe('calculateCommission', () => {
    it('should return the fixed commission amount for a Merchant', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);

      const commission = await merchantService.calculateCommission(1);

      expect(commission).toBe(2500);
    });

    it('should return 0 when commission_amount is null', async () => {
      const noCommission = { ...mockMerchant, commission_amount: null };
      userModel.findById.mockResolvedValue(noCommission);

      const commission = await merchantService.calculateCommission(1);

      expect(commission).toBe(0);
    });

    it('should throw error if user is not a Merchant', async () => {
      userModel.findById.mockResolvedValue(mockNonMerchant);

      await expect(merchantService.calculateCommission(2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });
  });

  describe('processPayment - transaction isolation and race conditions', () => {
    it('should use database transaction to ensure atomicity of saldo deduction', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.execute.mockResolvedValue([{ insertId: 300 }, []]);

      await merchantService.processPayment(1, 10);

      // Verify transaction boundaries are properly used
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      // Verify saldo update and invoice update happen within same transaction
      expect(mockConnection.execute).toHaveBeenCalledTimes(4); // saldo update, saldo_tx insert, invoice update, payment insert
    });

    it('should rollback all changes if saldo deduction succeeds but invoice update fails', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      // First execute (saldo update) succeeds, second (saldo_tx) succeeds,
      // third (invoice update) fails
      mockConnection.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ insertId: 1 }, []])
        .mockRejectedValueOnce(new Error('Invoice update failed'));

      await expect(merchantService.processPayment(1, 10)).rejects.toThrow('Invoice update failed');

      // Verify rollback was called - saldo should not be deducted
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it('should rollback if payment record creation fails after saldo deduction', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      // Saldo update, saldo_tx, invoice update succeed, payment insert fails
      mockConnection.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ insertId: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockRejectedValueOnce(new Error('Payment insert failed'));

      await expect(merchantService.processPayment(1, 10)).rejects.toThrow('Payment insert failed');

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    it('should correctly calculate new balance after deduction', async () => {
      // Test with various saldo amounts to ensure arithmetic correctness
      const merchant750k = { ...mockMerchant, saldo: 750000 };
      userModel.findById.mockResolvedValue(merchant750k);
      invoiceModel.findById.mockResolvedValue(mockInvoice); // total_amount: 166500
      mockConnection.execute.mockResolvedValue([{ insertId: 400 }, []]);

      const result = await merchantService.processPayment(1, 10);

      // 750000 - 166500 = 583500
      expect(result.balance_after).toBe(583500);
    });

    it('should always release connection even when transaction fails', async () => {
      userModel.findById.mockResolvedValue(mockMerchant);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      mockConnection.beginTransaction.mockRejectedValue(new Error('Connection lost'));

      await expect(merchantService.processPayment(1, 10)).rejects.toThrow('Connection lost');

      // Connection should still be released
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });
});
