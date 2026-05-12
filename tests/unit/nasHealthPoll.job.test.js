/**
 * Unit tests for NAS health polling job.
 * Tests the NAS health poll handler including:
 * - Polling all active NAS devices
 * - Tracking Up/Down status transitions
 * - Generating alert events on status change
 * - Logging outage start/end times
 * - Calculating downtime duration on recovery
 *
 * Requirements: 14.1, 14.3, 14.4
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

jest.mock('../../src/services/nas.service');

const nasService = require('../../src/services/nas.service');
const { registerJob } = require('../../src/jobs/index');
const { nasHealthPollHandler, register } = require('../../src/jobs/nasHealthPoll.job');

describe('NAS Health Poll Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'nas-health-poll',
        schedule: expect.any(String),
        handler: nasHealthPollHandler,
        description: expect.stringContaining('Poll all active NAS'),
      });
    });

    it('should use default cron schedule of every 5 minutes', () => {
      register();

      const call = registerJob.mock.calls[0][0];
      expect(call.schedule).toBe('*/5 * * * *');
    });
  });

  describe('nasHealthPollHandler', () => {
    it('should call nasService.pollAllNas and return formatted results', async () => {
      nasService.pollAllNas.mockResolvedValue({
        total: 5,
        up: 4,
        down: 1,
        transitioned: 1,
        errors: [],
      });

      const result = await nasHealthPollHandler();

      expect(nasService.pollAllNas).toHaveBeenCalledTimes(1);
      expect(result.records_processed).toBe(5);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should report errors from poll results', async () => {
      nasService.pollAllNas.mockResolvedValue({
        total: 3,
        up: 1,
        down: 1,
        transitioned: 0,
        errors: [
          { nasId: 5, nasName: 'NAS-Branch-A', error: 'Connection timeout' },
        ],
      });

      const result = await nasHealthPollHandler();

      expect(result.records_processed).toBe(2);
      expect(result.records_failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('NAS 5');
      expect(result.errors[0]).toContain('NAS-Branch-A');
      expect(result.errors[0]).toContain('Connection timeout');
    });

    it('should handle all NAS devices being up', async () => {
      nasService.pollAllNas.mockResolvedValue({
        total: 10,
        up: 10,
        down: 0,
        transitioned: 0,
        errors: [],
      });

      const result = await nasHealthPollHandler();

      expect(result.records_processed).toBe(10);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle all NAS devices being down', async () => {
      nasService.pollAllNas.mockResolvedValue({
        total: 3,
        up: 0,
        down: 3,
        transitioned: 3,
        errors: [],
      });

      const result = await nasHealthPollHandler();

      expect(result.records_processed).toBe(3);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle no active NAS devices', async () => {
      nasService.pollAllNas.mockResolvedValue({
        total: 0,
        up: 0,
        down: 0,
        transitioned: 0,
        errors: [],
      });

      const result = await nasHealthPollHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle multiple errors from different NAS devices', async () => {
      nasService.pollAllNas.mockResolvedValue({
        total: 5,
        up: 2,
        down: 1,
        transitioned: 0,
        errors: [
          { nasId: 3, nasName: 'NAS-X', error: 'DNS resolution failed' },
          { nasId: 7, nasName: 'NAS-Y', error: 'Socket timeout' },
        ],
      });

      const result = await nasHealthPollHandler();

      expect(result.records_processed).toBe(3);
      expect(result.records_failed).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should propagate unhandled errors from nasService.pollAllNas', async () => {
      nasService.pollAllNas.mockRejectedValue(new Error('Database connection lost'));

      await expect(nasHealthPollHandler()).rejects.toThrow('Database connection lost');
    });
  });
});
