/**
 * Unit tests for FUP reset job.
 * Tests the FUP reset handler including:
 * - Resetting FUP usage counters for all subscriptions
 * - Restoring original speed profiles via CoA for throttled subscriptions
 * - Handling CoA failures gracefully
 * - Correct billing period calculation
 *
 * Requirements: 41.3
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/models/fupUsage.model');
jest.mock('../../src/services/radius.service');
jest.mock('../../src/services/coa.service');
jest.mock('../../src/models/jobLog.model');
jest.mock('../../src/jobs/index', () => {
  const actual = jest.requireActual('../../src/jobs/index');
  return {
    ...actual,
    registerJob: jest.fn(),
  };
});

const fupUsageModel = require('../../src/models/fupUsage.model');
const radiusService = require('../../src/services/radius.service');
const coaService = require('../../src/services/coa.service');
const { registerJob } = require('../../src/jobs/index');
const {
  register,
  fupResetHandler,
  getPreviousBillingPeriod,
} = require('../../src/jobs/fupReset.job');

describe('FUP Reset Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'fup-reset',
        schedule: expect.any(String),
        handler: fupResetHandler,
        description: expect.stringContaining('FUP'),
      });
    });

    it('should use cron schedule for 1st of month at 00:00', () => {
      register();

      const call = registerJob.mock.calls[0][0];
      expect(call.schedule).toBe('0 0 1 * *');
    });
  });

  describe('getPreviousBillingPeriod', () => {
    it('should return previous month in YYYY-MM format', () => {
      // Mock current date to March 1, 2024
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 2, 1)); // March 1, 2024

      const result = getPreviousBillingPeriod();
      expect(result).toBe('2024-02');

      jest.useRealTimers();
    });

    it('should handle January (return December of previous year)', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 0, 1)); // January 1, 2024

      const result = getPreviousBillingPeriod();
      expect(result).toBe('2023-12');

      jest.useRealTimers();
    });

    it('should pad single-digit months with leading zero', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 4, 1)); // May 1, 2024

      const result = getPreviousBillingPeriod();
      expect(result).toBe('2024-04');

      jest.useRealTimers();
    });
  });

  describe('fupResetHandler', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 2, 1)); // March 1, 2024
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should restore speed for throttled subscriptions and reset usage records', async () => {
      const throttledSubscriptions = [
        {
          fup_usage_id: 1,
          subscription_id: 101,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          subscription_status: 'Active',
          upload_rate_limit: 10240,
          download_rate_limit: 20480,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          fup_enabled: true,
          bytes_used: 107374182400,
          exceeded_at: '2024-02-15 10:00:00',
        },
      ];

      fupUsageModel.findThrottledByPeriod.mockResolvedValue(throttledSubscriptions);
      radiusService.resetFUPProfile.mockResolvedValue({ removed: true });
      coaService.sendCoA.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      fupUsageModel.resetByPeriod.mockResolvedValue(1);

      const result = await fupResetHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify RADIUS profile was reset
      expect(radiusService.resetFUPProfile).toHaveBeenCalledWith('user1@pppoe');

      // Verify CoA was sent with original speed
      expect(coaService.sendCoA).toHaveBeenCalledWith(
        101,
        5,
        'FUP',
        {
          username: 'user1@pppoe',
          rateLimit: '10240k/20480k',
        }
      );

      // Verify bulk reset was called
      expect(fupUsageModel.resetByPeriod).toHaveBeenCalledWith('2024-02');
    });

    it('should handle no throttled subscriptions gracefully', async () => {
      fupUsageModel.findThrottledByPeriod.mockResolvedValue([]);
      fupUsageModel.resetByPeriod.mockResolvedValue(0);

      const result = await fupResetHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(radiusService.resetFUPProfile).not.toHaveBeenCalled();
      expect(coaService.sendCoA).not.toHaveBeenCalled();
      expect(fupUsageModel.resetByPeriod).toHaveBeenCalledWith('2024-02');
    });

    it('should continue processing when CoA fails for a subscription', async () => {
      const throttledSubscriptions = [
        {
          fup_usage_id: 1,
          subscription_id: 101,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          subscription_status: 'Active',
          upload_rate_limit: 10240,
          download_rate_limit: 20480,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          fup_enabled: true,
          bytes_used: 107374182400,
          exceeded_at: '2024-02-15 10:00:00',
        },
        {
          fup_usage_id: 2,
          subscription_id: 102,
          pppoe_username: 'user2@pppoe',
          nas_id: 6,
          subscription_status: 'Active',
          upload_rate_limit: 5120,
          download_rate_limit: 10240,
          fup_upload_speed: 1024,
          fup_download_speed: 2048,
          fup_enabled: true,
          bytes_used: 53687091200,
          exceeded_at: '2024-02-20 14:00:00',
        },
      ];

      fupUsageModel.findThrottledByPeriod.mockResolvedValue(throttledSubscriptions);
      radiusService.resetFUPProfile.mockResolvedValue({ removed: true });
      // First CoA fails (NAK), second succeeds
      coaService.sendCoA
        .mockResolvedValueOnce({ success: false, responseStatus: 'NAK', retryCount: 3, logId: 1 })
        .mockResolvedValueOnce({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 2 });
      fupUsageModel.resetByPeriod.mockResolvedValue(2);

      const result = await fupResetHandler();

      // Both should be processed (CoA failure is logged but doesn't fail the record)
      expect(result.records_processed).toBe(2);
      expect(result.records_failed).toBe(0);
      expect(radiusService.resetFUPProfile).toHaveBeenCalledTimes(2);
      expect(coaService.sendCoA).toHaveBeenCalledTimes(2);
    });

    it('should count as failed when RADIUS reset throws an error', async () => {
      const throttledSubscriptions = [
        {
          fup_usage_id: 1,
          subscription_id: 101,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          subscription_status: 'Active',
          upload_rate_limit: 10240,
          download_rate_limit: 20480,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          fup_enabled: true,
          bytes_used: 107374182400,
          exceeded_at: '2024-02-15 10:00:00',
        },
      ];

      fupUsageModel.findThrottledByPeriod.mockResolvedValue(throttledSubscriptions);
      radiusService.resetFUPProfile.mockRejectedValue(new Error('RADIUS DB connection failed'));
      fupUsageModel.resetByPeriod.mockResolvedValue(1);

      const result = await fupResetHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('user1@pppoe');
      expect(result.errors[0]).toContain('RADIUS DB connection failed');
    });

    it('should skip CoA when nas_id is null', async () => {
      const throttledSubscriptions = [
        {
          fup_usage_id: 1,
          subscription_id: 101,
          pppoe_username: 'user1@pppoe',
          nas_id: null,
          subscription_status: 'Active',
          upload_rate_limit: 10240,
          download_rate_limit: 20480,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          fup_enabled: true,
          bytes_used: 107374182400,
          exceeded_at: '2024-02-15 10:00:00',
        },
      ];

      fupUsageModel.findThrottledByPeriod.mockResolvedValue(throttledSubscriptions);
      radiusService.resetFUPProfile.mockResolvedValue({ removed: true });
      fupUsageModel.resetByPeriod.mockResolvedValue(1);

      const result = await fupResetHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
      expect(radiusService.resetFUPProfile).toHaveBeenCalledWith('user1@pppoe');
      expect(coaService.sendCoA).not.toHaveBeenCalled();
    });

    it('should log error but not fail when bulk reset throws', async () => {
      fupUsageModel.findThrottledByPeriod.mockResolvedValue([]);
      fupUsageModel.resetByPeriod.mockRejectedValue(new Error('DB timeout'));

      const result = await fupResetHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Bulk reset');
      expect(result.errors[0]).toContain('DB timeout');
    });
  });
});
