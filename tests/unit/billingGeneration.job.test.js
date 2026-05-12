/**
 * Unit tests for billing generation job.
 * Tests the monthly invoice generation handler including:
 * - Generating invoices for all active subscriptions
 * - Handling partial failures (continue processing, log errors)
 * - Handling duplicate invoices gracefully
 * - Queuing notifications via billing service
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 42.3
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
  },
}));

jest.mock('../../src/services/billing.service');
jest.mock('../../src/models/subscription.model');
jest.mock('../../src/models/jobLog.model');
jest.mock('../../src/jobs/index', () => {
  const actual = jest.requireActual('../../src/jobs/index');
  return {
    ...actual,
    registerJob: jest.fn(),
  };
});

const { appPool } = require('../../src/config/database');
const billingService = require('../../src/services/billing.service');
const { registerJob } = require('../../src/jobs/index');
const {
  billingGenerationHandler,
  getActiveSubscriptions,
  register,
} = require('../../src/jobs/billingGeneration.job');

describe('Billing Generation Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'billing-generation',
        schedule: expect.any(String),
        handler: billingGenerationHandler,
        description: expect.stringContaining('monthly invoices'),
      });
    });

    it('should use cron schedule for 1st of month at midnight', () => {
      register();

      const call = registerJob.mock.calls[0][0];
      // Default schedule: 0 0 1 * * (midnight on 1st)
      expect(call.schedule).toBe('0 0 1 * *');
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should query for subscriptions with Active status', async () => {
      const mockSubscriptions = [
        {
          id: 1,
          customer_id: 10,
          package_id: 5,
          pppoe_username: 'user1',
          activated_at: '2024-01-15',
          customer_name: 'John',
          whatsapp_number: '081234567890',
          email: 'john@example.com',
          package_name: 'Basic 10Mbps',
          monthly_price: 200000,
          ppn_enabled: 1,
        },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);

      const result = await getActiveSubscriptions();

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.status = ?'),
        ['Active']
      );
      expect(result).toEqual(mockSubscriptions);
    });

    it('should return empty array when no active subscriptions', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      const result = await getActiveSubscriptions();

      expect(result).toEqual([]);
    });
  });

  describe('billingGenerationHandler', () => {
    it('should generate invoices for all active subscriptions', async () => {
      const mockSubscriptions = [
        { id: 1, pppoe_username: 'user1', customer_id: 10 },
        { id: 2, pppoe_username: 'user2', customer_id: 11 },
        { id: 3, pppoe_username: 'user3', customer_id: 12 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);
      billingService.generateInvoice.mockResolvedValue({ id: 1, status: 'UNPAID' });

      const result = await billingGenerationHandler();

      expect(result.records_processed).toBe(3);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(billingService.generateInvoice).toHaveBeenCalledTimes(3);
    });

    it('should pass correct options to generateInvoice', async () => {
      const mockSubscriptions = [
        { id: 5, pppoe_username: 'user5', customer_id: 20 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);
      billingService.generateInvoice.mockResolvedValue({ id: 1, status: 'UNPAID' });

      await billingGenerationHandler();

      const callArgs = billingService.generateInvoice.mock.calls[0];
      expect(callArgs[0]).toBe(5); // subscriptionId
      expect(callArgs[1]).toEqual({
        isFirstInvoice: false,
        billingPeriod: expect.stringMatching(/^\d{4}-\d{2}$/),
        generationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });

    it('should handle partial failures and continue processing', async () => {
      const mockSubscriptions = [
        { id: 1, pppoe_username: 'user1', customer_id: 10 },
        { id: 2, pppoe_username: 'user2', customer_id: 11 },
        { id: 3, pppoe_username: 'user3', customer_id: 12 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);

      billingService.generateInvoice
        .mockResolvedValueOnce({ id: 1, status: 'UNPAID' })
        .mockRejectedValueOnce(
          Object.assign(new Error('Package not found.'), { statusCode: 404, code: 'RESOURCE_NOT_FOUND' })
        )
        .mockResolvedValueOnce({ id: 3, status: 'UNPAID' });

      const result = await billingGenerationHandler();

      expect(result.records_processed).toBe(2);
      expect(result.records_failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Subscription 2');
      expect(result.errors[0]).toContain('Package not found');
    });

    it('should treat duplicate invoice errors as processed (not failed)', async () => {
      const mockSubscriptions = [
        { id: 1, pppoe_username: 'user1', customer_id: 10 },
        { id: 2, pppoe_username: 'user2', customer_id: 11 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);

      billingService.generateInvoice
        .mockResolvedValueOnce({ id: 1, status: 'UNPAID' })
        .mockRejectedValueOnce(
          Object.assign(new Error('Invoice already exists for subscription 2 in period 2025-01.'), {
            statusCode: 409,
            code: 'RESOURCE_ALREADY_EXISTS',
          })
        );

      const result = await billingGenerationHandler();

      expect(result.records_processed).toBe(2);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should return zero counts when no active subscriptions exist', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      const result = await billingGenerationHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(billingService.generateInvoice).not.toHaveBeenCalled();
    });

    it('should handle all subscriptions failing', async () => {
      const mockSubscriptions = [
        { id: 1, pppoe_username: 'user1', customer_id: 10 },
        { id: 2, pppoe_username: 'user2', customer_id: 11 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);

      billingService.generateInvoice
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await billingGenerationHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should include subscription pppoe_username in error messages', async () => {
      const mockSubscriptions = [
        { id: 7, pppoe_username: 'pppoe_john', customer_id: 15 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);
      billingService.generateInvoice.mockRejectedValue(new Error('Timeout'));

      const result = await billingGenerationHandler();

      expect(result.errors[0]).toContain('Subscription 7');
      expect(result.errors[0]).toContain('pppoe_john');
      expect(result.errors[0]).toContain('Timeout');
    });

    it('should handle subscription with missing pppoe_username gracefully', async () => {
      const mockSubscriptions = [
        { id: 9, pppoe_username: null, customer_id: 20 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);
      billingService.generateInvoice.mockRejectedValue(new Error('Some error'));

      const result = await billingGenerationHandler();

      expect(result.errors[0]).toContain('Subscription 9');
      expect(result.errors[0]).toContain('unknown');
    });

    it('should use current date for billing period and generation date', async () => {
      const mockSubscriptions = [
        { id: 1, pppoe_username: 'user1', customer_id: 10 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);
      billingService.generateInvoice.mockResolvedValue({ id: 1, status: 'UNPAID' });

      await billingGenerationHandler();

      const now = new Date();
      const expectedPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const expectedDate = now.toISOString().slice(0, 10);

      const callArgs = billingService.generateInvoice.mock.calls[0][1];
      expect(callArgs.billingPeriod).toBe(expectedPeriod);
      expect(callArgs.generationDate).toBe(expectedDate);
    });
  });
});
