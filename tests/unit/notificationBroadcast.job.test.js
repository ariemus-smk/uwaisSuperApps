/**
 * Unit tests for Notification Broadcast Job.
 * Tests the notification broadcast handler including:
 * - Processing queued notifications in batches
 * - Sending via WhatsApp API
 * - Handling retries and failures
 * - Marking notifications as Failed after max retries
 *
 * Requirements: 30.1, 30.4
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
  radiusPool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/models/jobLog.model');
jest.mock('../../src/jobs/index', () => {
  const actual = jest.requireActual('../../src/jobs/index');
  return {
    ...actual,
    registerJob: jest.fn(),
  };
});

jest.mock('../../src/services/notification.service');

const notificationService = require('../../src/services/notification.service');
const { registerJob } = require('../../src/jobs/index');
const { notificationBroadcastHandler, register } = require('../../src/jobs/notificationBroadcast.job');

describe('Notification Broadcast Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'notification-broadcast',
        schedule: expect.any(String),
        handler: notificationBroadcastHandler,
        description: expect.stringContaining('Process queued notifications'),
      });
    });

    it('should use default cron schedule of every 10 seconds', () => {
      register();

      const call = registerJob.mock.calls[0][0];
      expect(call.schedule).toBe('*/10 * * * * *');
    });
  });

  describe('notificationBroadcastHandler', () => {
    it('should call notificationService.processQueue and return formatted results', async () => {
      notificationService.processQueue.mockResolvedValue({
        processed: 5,
        sent: 4,
        failed: 0,
        retried: 1,
      });

      const result = await notificationBroadcastHandler();

      expect(notificationService.processQueue).toHaveBeenCalledTimes(1);
      expect(result.records_processed).toBe(5); // sent + retried
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should report permanently failed notifications in errors', async () => {
      notificationService.processQueue.mockResolvedValue({
        processed: 10,
        sent: 7,
        failed: 2,
        retried: 1,
      });

      const result = await notificationBroadcastHandler();

      expect(result.records_processed).toBe(8); // sent + retried
      expect(result.records_failed).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('2 notification(s) permanently failed');
    });

    it('should handle all notifications sent successfully', async () => {
      notificationService.processQueue.mockResolvedValue({
        processed: 10,
        sent: 10,
        failed: 0,
        retried: 0,
      });

      const result = await notificationBroadcastHandler();

      expect(result.records_processed).toBe(10);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle empty queue (no queued notifications)', async () => {
      notificationService.processQueue.mockResolvedValue({
        processed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
      });

      const result = await notificationBroadcastHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle all notifications failing after max retries', async () => {
      notificationService.processQueue.mockResolvedValue({
        processed: 5,
        sent: 0,
        failed: 5,
        retried: 0,
      });

      const result = await notificationBroadcastHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(5);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('5 notification(s) permanently failed');
    });

    it('should handle mix of retried and failed notifications', async () => {
      notificationService.processQueue.mockResolvedValue({
        processed: 8,
        sent: 3,
        failed: 2,
        retried: 3,
      });

      const result = await notificationBroadcastHandler();

      expect(result.records_processed).toBe(6); // sent(3) + retried(3)
      expect(result.records_failed).toBe(2);
      expect(result.errors).toHaveLength(1);
    });

    it('should propagate unhandled errors from notificationService.processQueue', async () => {
      notificationService.processQueue.mockRejectedValue(new Error('Database connection lost'));

      await expect(notificationBroadcastHandler()).rejects.toThrow('Database connection lost');
    });
  });
});
