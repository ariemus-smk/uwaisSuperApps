/**
 * Unit tests for FUP enforcement job.
 * Tests the FUP enforcement handler including:
 * - Querying cumulative data usage from radacct
 * - Triggering CoA speed reduction when quota exceeded
 * - Skipping already-throttled subscriptions
 * - Updating FUP usage tracking records
 * - Handling failures gracefully
 *
 * Requirements: 41.1, 41.2, 41.4
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/radiusModels/radacct.model');
jest.mock('../../src/models/fupUsage.model');
jest.mock('../../src/services/coa.service');
jest.mock('../../src/models/jobLog.model');
jest.mock('../../src/jobs/index', () => {
  const actual = jest.requireActual('../../src/jobs/index');
  return {
    ...actual,
    registerJob: jest.fn(),
  };
});

const { appPool } = require('../../src/config/database');
const radacctModel = require('../../src/radiusModels/radacct.model');
const fupUsageModel = require('../../src/models/fupUsage.model');
const coaService = require('../../src/services/coa.service');
const { registerJob } = require('../../src/jobs/index');
const {
  register,
  fupEnforcementHandler,
  getFupEnabledSubscriptions,
  getUsageFromRadacct,
  getCurrentBillingPeriod,
  getBillingPeriodStartDate,
  getBillingPeriodEndDate,
} = require('../../src/jobs/fupEnforcement.job');

describe('FUP Enforcement Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'fup-enforcement',
        schedule: expect.any(String),
        handler: fupEnforcementHandler,
        description: expect.stringContaining('FUP'),
      });
    });

    it('should use default cron schedule of every hour', () => {
      register();

      const call = registerJob.mock.calls[0][0];
      expect(call.schedule).toBe('0 * * * *');
    });
  });

  describe('getCurrentBillingPeriod', () => {
    it('should return current month in YYYY-MM format', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 5, 15)); // June 15, 2024

      const result = getCurrentBillingPeriod();
      expect(result).toBe('2024-06');

      jest.useRealTimers();
    });

    it('should pad single-digit months with leading zero', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 0, 10)); // January 10, 2024

      const result = getCurrentBillingPeriod();
      expect(result).toBe('2024-01');

      jest.useRealTimers();
    });
  });

  describe('getBillingPeriodStartDate', () => {
    it('should return first day of the billing period', () => {
      expect(getBillingPeriodStartDate('2024-06')).toBe('2024-06-01');
      expect(getBillingPeriodStartDate('2024-01')).toBe('2024-01-01');
    });
  });

  describe('getBillingPeriodEndDate', () => {
    it('should return last day of the billing period with time', () => {
      expect(getBillingPeriodEndDate('2024-06')).toBe('2024-06-30 23:59:59');
      expect(getBillingPeriodEndDate('2024-01')).toBe('2024-01-31 23:59:59');
    });

    it('should handle February correctly (non-leap year)', () => {
      expect(getBillingPeriodEndDate('2023-02')).toBe('2023-02-28 23:59:59');
    });

    it('should handle February correctly (leap year)', () => {
      expect(getBillingPeriodEndDate('2024-02')).toBe('2024-02-29 23:59:59');
    });
  });

  describe('getUsageFromRadacct', () => {
    it('should return total bytes (input + output) from radacct', async () => {
      radacctModel.getUsageSummary.mockResolvedValue({
        inputOctets: 5368709120, // 5 GB upload
        outputOctets: 10737418240, // 10 GB download
        sessionTime: 86400,
      });

      const result = await getUsageFromRadacct('user1@pppoe', '2024-06-01', '2024-06-30 23:59:59');

      expect(result).toBe(16106127360); // 15 GB total
      expect(radacctModel.getUsageSummary).toHaveBeenCalledWith(
        'user1@pppoe',
        '2024-06-01',
        '2024-06-30 23:59:59'
      );
    });

    it('should handle zero usage', async () => {
      radacctModel.getUsageSummary.mockResolvedValue({
        inputOctets: 0,
        outputOctets: 0,
        sessionTime: 0,
      });

      const result = await getUsageFromRadacct('user1@pppoe', '2024-06-01', '2024-06-30 23:59:59');
      expect(result).toBe(0);
    });
  });

  describe('getFupEnabledSubscriptions', () => {
    it('should query active subscriptions with FUP-enabled packages', async () => {
      const mockRows = [
        {
          subscription_id: 1,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          customer_id: 10,
          package_id: 3,
          package_name: 'Premium 50Mbps',
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          upload_rate_limit: 10240,
          download_rate_limit: 51200,
        },
      ];

      appPool.execute.mockResolvedValue([mockRows]);

      const result = await getFupEnabledSubscriptions();

      expect(result).toEqual(mockRows);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('fup_enabled = 1'),
        ['Active']
      );
    });
  });

  describe('fupEnforcementHandler', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 5, 15)); // June 15, 2024
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should trigger CoA speed reduction when quota is exceeded', async () => {
      // 100 GB quota, 110 GB used
      const subscriptions = [
        {
          subscription_id: 1,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          customer_id: 10,
          package_id: 3,
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          upload_rate_limit: 10240,
          download_rate_limit: 51200,
        },
      ];

      appPool.execute.mockResolvedValue([subscriptions]);
      radacctModel.getUsageSummary.mockResolvedValue({
        inputOctets: 53687091200, // 50 GB
        outputOctets: 64424509440, // 60 GB = 110 GB total > 100 GB quota
        sessionTime: 1296000,
      });
      fupUsageModel.findBySubscriptionAndPeriod.mockResolvedValue(null); // Not yet tracked
      coaService.speedChange.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      fupUsageModel.markExceeded.mockResolvedValue({ affectedRows: 1 });

      const result = await fupEnforcementHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify CoA was sent with FUP reduced speed
      expect(coaService.speedChange).toHaveBeenCalledWith(
        1, // subscription_id
        5, // nas_id
        'user1@pppoe',
        '2048k/4096k' // FUP rate limit
      );

      // Verify usage was marked as exceeded
      expect(fupUsageModel.markExceeded).toHaveBeenCalledWith(
        1,
        '2024-06',
        expect.any(Number)
      );
    });

    it('should skip CoA when subscription is already throttled', async () => {
      const subscriptions = [
        {
          subscription_id: 1,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          customer_id: 10,
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          upload_rate_limit: 10240,
          download_rate_limit: 51200,
        },
      ];

      appPool.execute.mockResolvedValue([subscriptions]);
      radacctModel.getUsageSummary.mockResolvedValue({
        inputOctets: 53687091200,
        outputOctets: 64424509440, // 110 GB total > 100 GB quota
        sessionTime: 1296000,
      });
      // Already throttled
      fupUsageModel.findBySubscriptionAndPeriod.mockResolvedValue({
        id: 1,
        subscription_id: 1,
        billing_period: '2024-06',
        bytes_used: 107374182400,
        threshold_exceeded: 1,
        exceeded_at: '2024-06-10 10:00:00',
      });
      fupUsageModel.upsert.mockResolvedValue({ id: 1 });

      const result = await fupEnforcementHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);

      // CoA should NOT be sent again
      expect(coaService.speedChange).not.toHaveBeenCalled();
      expect(fupUsageModel.markExceeded).not.toHaveBeenCalled();

      // Should update usage tracking instead
      expect(fupUsageModel.upsert).toHaveBeenCalled();
    });

    it('should update usage tracking when below threshold', async () => {
      const subscriptions = [
        {
          subscription_id: 1,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          customer_id: 10,
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          upload_rate_limit: 10240,
          download_rate_limit: 51200,
        },
      ];

      appPool.execute.mockResolvedValue([subscriptions]);
      radacctModel.getUsageSummary.mockResolvedValue({
        inputOctets: 10737418240, // 10 GB
        outputOctets: 21474836480, // 20 GB = 30 GB total < 100 GB quota
        sessionTime: 432000,
      });
      fupUsageModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      fupUsageModel.upsert.mockResolvedValue({ id: 1 });

      const result = await fupEnforcementHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);

      // No CoA should be sent
      expect(coaService.speedChange).not.toHaveBeenCalled();
      expect(fupUsageModel.markExceeded).not.toHaveBeenCalled();

      // Should update usage tracking
      expect(fupUsageModel.upsert).toHaveBeenCalledWith({
        subscription_id: 1,
        billing_period: '2024-06',
        bytes_used: 32212254720, // 30 GB in bytes
      });
    });

    it('should handle no FUP-enabled subscriptions gracefully', async () => {
      appPool.execute.mockResolvedValue([[]]);

      const result = await fupEnforcementHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(radacctModel.getUsageSummary).not.toHaveBeenCalled();
    });

    it('should continue processing when one subscription fails', async () => {
      const subscriptions = [
        {
          subscription_id: 1,
          pppoe_username: 'user1@pppoe',
          nas_id: 5,
          customer_id: 10,
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          upload_rate_limit: 10240,
          download_rate_limit: 51200,
        },
        {
          subscription_id: 2,
          pppoe_username: 'user2@pppoe',
          nas_id: 6,
          customer_id: 11,
          fup_enabled: 1,
          fup_quota_gb: 50,
          fup_upload_speed: 1024,
          fup_download_speed: 2048,
          upload_rate_limit: 5120,
          download_rate_limit: 25600,
        },
      ];

      appPool.execute.mockResolvedValue([subscriptions]);

      // First subscription: radacct query fails
      radacctModel.getUsageSummary
        .mockRejectedValueOnce(new Error('RADIUS DB connection timeout'))
        .mockResolvedValueOnce({
          inputOctets: 5368709120,
          outputOctets: 10737418240,
          sessionTime: 86400,
        });

      fupUsageModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      fupUsageModel.upsert.mockResolvedValue({ id: 1 });

      const result = await fupEnforcementHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('user1@pppoe');
      expect(result.errors[0]).toContain('RADIUS DB connection timeout');
    });

    it('should skip CoA when nas_id is null', async () => {
      const subscriptions = [
        {
          subscription_id: 1,
          pppoe_username: 'user1@pppoe',
          nas_id: null, // No NAS assigned
          customer_id: 10,
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 2048,
          fup_download_speed: 4096,
          upload_rate_limit: 10240,
          download_rate_limit: 51200,
        },
      ];

      appPool.execute.mockResolvedValue([subscriptions]);
      radacctModel.getUsageSummary.mockResolvedValue({
        inputOctets: 53687091200,
        outputOctets: 64424509440, // 110 GB > 100 GB
        sessionTime: 1296000,
      });
      fupUsageModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      fupUsageModel.markExceeded.mockResolvedValue({ affectedRows: 1 });

      const result = await fupEnforcementHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);

      // CoA should NOT be sent (no NAS)
      expect(coaService.speedChange).not.toHaveBeenCalled();

      // But should still mark as exceeded
      expect(fupUsageModel.markExceeded).toHaveBeenCalledWith(1, '2024-06', expect.any(Number));
    });
  });
});
