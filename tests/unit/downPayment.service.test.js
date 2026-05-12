/**
 * Unit tests for Down Payment service.
 * Requirements: 46.1, 46.2, 46.3, 46.4
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

const { appPool } = require('../../src/config/database');
const downPaymentService = require('../../src/services/downPayment.service');

describe('Down Payment Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordDP', () => {
    it('should record a new down payment successfully', async () => {
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await downPaymentService.recordDP(10, 500000, '2024-01-15', 3);

      expect(result).toMatchObject({
        id: 1,
        customer_id: 10,
        amount: 500000,
        payment_date: '2024-01-15',
        received_by: 3,
        applied: 0,
      });
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO down_payments'),
        [10, 500000, '2024-01-15', 3]
      );
    });

    it('should throw error when amount is zero', async () => {
      await expect(
        downPaymentService.recordDP(10, 0, '2024-01-15', 3)
      ).rejects.toThrow('Down payment amount must be greater than zero');
    });

    it('should throw error when amount is negative', async () => {
      await expect(
        downPaymentService.recordDP(10, -100, '2024-01-15', 3)
      ).rejects.toThrow('Down payment amount must be greater than zero');
    });

    it('should throw error when amount is null', async () => {
      await expect(
        downPaymentService.recordDP(10, null, '2024-01-15', 3)
      ).rejects.toThrow('Down payment amount must be greater than zero');
    });
  });

  describe('getDP', () => {
    it('should return all DP records for a customer', async () => {
      const mockDPs = [
        { id: 1, customer_id: 10, amount: 500000, applied: 0 },
        { id: 2, customer_id: 10, amount: 200000, applied: 1 },
      ];
      appPool.execute.mockResolvedValueOnce([mockDPs, []]);

      const result = await downPaymentService.getDP(10);

      expect(result).toEqual(mockDPs);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM down_payments WHERE customer_id = ?'),
        [10]
      );
    });

    it('should return empty array when customer has no DPs', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await downPaymentService.getDP(99);

      expect(result).toEqual([]);
    });
  });

  describe('getDPBalance', () => {
    it('should return total unapplied DP balance', async () => {
      appPool.execute.mockResolvedValueOnce([[{ balance: '750000.00' }], []]);

      const result = await downPaymentService.getDPBalance(10);

      expect(result).toBe(750000);
    });

    it('should return 0 when no unapplied DPs exist', async () => {
      appPool.execute.mockResolvedValueOnce([[{ balance: '0' }], []]);

      const result = await downPaymentService.getDPBalance(10);

      expect(result).toBe(0);
    });
  });

  describe('applyDPToInvoice', () => {
    it('should return zero deduction when no unapplied DPs exist', async () => {
      // findUnappliedByCustomerId returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await downPaymentService.applyDPToInvoice(10, 300000);

      expect(result).toEqual({ deductionAmount: 0, remainingDP: 0 });
    });

    it('should fully consume DP when DP <= invoice total', async () => {
      const mockDPs = [
        { id: 1, customer_id: 10, amount: '200000.00', payment_date: '2024-01-15', received_by: 3 },
      ];
      // findUnappliedByCustomerId
      appPool.execute.mockResolvedValueOnce([mockDPs, []]);
      // markApplied
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // getBalance (after application)
      appPool.execute.mockResolvedValueOnce([[{ balance: '0' }], []]);

      const result = await downPaymentService.applyDPToInvoice(10, 300000, 5);

      expect(result.deductionAmount).toBe(200000);
      expect(result.remainingDP).toBe(0);
    });

    it('should carry over excess when DP > invoice total', async () => {
      const mockDPs = [
        { id: 1, customer_id: 10, amount: '500000.00', payment_date: '2024-01-15', received_by: 3 },
      ];
      // findUnappliedByCustomerId
      appPool.execute.mockResolvedValueOnce([mockDPs, []]);
      // updateAmount (set to deducted amount)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // markApplied
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // createCarryOver (INSERT)
      appPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);
      // getBalance (after application)
      appPool.execute.mockResolvedValueOnce([[{ balance: '200000.00' }], []]);

      const result = await downPaymentService.applyDPToInvoice(10, 300000, 5);

      expect(result.deductionAmount).toBe(300000);
      expect(result.remainingDP).toBe(200000);
    });

    it('should apply multiple DPs to a single invoice', async () => {
      const mockDPs = [
        { id: 1, customer_id: 10, amount: '100000.00', payment_date: '2024-01-10', received_by: 3 },
        { id: 2, customer_id: 10, amount: '150000.00', payment_date: '2024-01-12', received_by: 3 },
      ];
      // findUnappliedByCustomerId
      appPool.execute.mockResolvedValueOnce([mockDPs, []]);
      // markApplied for DP 1
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // markApplied for DP 2
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // getBalance (after application)
      appPool.execute.mockResolvedValueOnce([[{ balance: '0' }], []]);

      const result = await downPaymentService.applyDPToInvoice(10, 300000, 5);

      expect(result.deductionAmount).toBe(250000);
      expect(result.remainingDP).toBe(0);
    });

    it('should return zero deduction when invoice total is zero', async () => {
      // getBalance (called because invoiceTotal <= 0)
      appPool.execute.mockResolvedValueOnce([[{ balance: '500000.00' }], []]);

      const result = await downPaymentService.applyDPToInvoice(10, 0);

      expect(result.deductionAmount).toBe(0);
      expect(result.remainingDP).toBe(500000);
    });

    it('should handle DP exactly equal to invoice total', async () => {
      const mockDPs = [
        { id: 1, customer_id: 10, amount: '300000.00', payment_date: '2024-01-15', received_by: 3 },
      ];
      // findUnappliedByCustomerId
      appPool.execute.mockResolvedValueOnce([mockDPs, []]);
      // markApplied
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // getBalance (after application)
      appPool.execute.mockResolvedValueOnce([[{ balance: '0' }], []]);

      const result = await downPaymentService.applyDPToInvoice(10, 300000, 5);

      expect(result.deductionAmount).toBe(300000);
      expect(result.remainingDP).toBe(0);
    });
  });
});
