/**
 * Unit tests for job scheduler infrastructure.
 * Tests job registry, execution wrapper, and scheduler lifecycle.
 *
 * Requirements: 42.1, 42.2, 42.3
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/jobLog.model');

const jobLogModel = require('../../src/models/jobLog.model');
const {
  registerJob,
  initializeScheduler,
  stopScheduler,
  executeJob,
  triggerJob,
  listJobs,
  jobRegistry,
} = require('../../src/jobs/index');

describe('Job Scheduler Infrastructure', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jobRegistry.clear();

    // Default mock for jobLogModel.create
    jobLogModel.create.mockResolvedValue({ id: 1, job_name: 'test-job', status: 'Running' });
    jobLogModel.complete.mockResolvedValue({ affectedRows: 1 });
  });

  afterAll(() => {
    stopScheduler();
  });

  describe('registerJob', () => {
    it('should register a job in the registry', () => {
      const handler = jest.fn();
      registerJob({
        name: 'billing-generation',
        schedule: '0 0 1 * *',
        handler,
        description: 'Generate monthly invoices',
      });

      expect(jobRegistry.has('billing-generation')).toBe(true);
      const job = jobRegistry.get('billing-generation');
      expect(job.name).toBe('billing-generation');
      expect(job.schedule).toBe('0 0 1 * *');
      expect(job.handler).toBe(handler);
      expect(job.description).toBe('Generate monthly invoices');
      expect(job.task).toBeNull();
    });

    it('should overwrite an existing job with the same name', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      registerJob({ name: 'my-job', schedule: '* * * * *', handler: handler1 });
      registerJob({ name: 'my-job', schedule: '0 * * * *', handler: handler2 });

      const job = jobRegistry.get('my-job');
      expect(job.handler).toBe(handler2);
      expect(job.schedule).toBe('0 * * * *');
    });

    it('should default description to empty string', () => {
      registerJob({ name: 'no-desc', schedule: '* * * * *', handler: jest.fn() });
      expect(jobRegistry.get('no-desc').description).toBe('');
    });
  });

  describe('executeJob', () => {
    it('should log job start and completion on success', async () => {
      const handler = jest.fn().mockResolvedValue({
        records_processed: 50,
        records_failed: 0,
        errors: [],
      });

      const result = await executeJob('billing-generation', handler);

      expect(jobLogModel.create).toHaveBeenCalledWith({ job_name: 'billing-generation' });
      expect(jobLogModel.complete).toHaveBeenCalledWith(1, {
        records_processed: 50,
        records_failed: 0,
        status: 'Success',
        error_details: null,
      });
      expect(result.status).toBe('Success');
      expect(result.records_processed).toBe(50);
      expect(result.records_failed).toBe(0);
      expect(result.log_id).toBe(1);
    });

    it('should mark status as Partial when some records fail', async () => {
      const handler = jest.fn().mockResolvedValue({
        records_processed: 45,
        records_failed: 5,
        errors: ['Customer 10: DB timeout', 'Customer 15: Invalid package'],
      });

      const result = await executeJob('billing-generation', handler);

      expect(jobLogModel.complete).toHaveBeenCalledWith(1, {
        records_processed: 45,
        records_failed: 5,
        status: 'Partial',
        error_details: 'Customer 10: DB timeout\nCustomer 15: Invalid package',
      });
      expect(result.status).toBe('Partial');
    });

    it('should mark status as Failed when all records fail', async () => {
      const handler = jest.fn().mockResolvedValue({
        records_processed: 0,
        records_failed: 10,
        errors: ['Database connection lost'],
      });

      const result = await executeJob('billing-generation', handler);

      expect(jobLogModel.complete).toHaveBeenCalledWith(1, {
        records_processed: 0,
        records_failed: 10,
        status: 'Failed',
        error_details: 'Database connection lost',
      });
      expect(result.status).toBe('Failed');
    });

    it('should mark status as Failed when handler throws an error', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await executeJob('nas-poll', handler);

      expect(jobLogModel.complete).toHaveBeenCalledWith(1, {
        records_processed: 0,
        records_failed: 0,
        status: 'Failed',
        error_details: 'Connection refused',
      });
      expect(result.status).toBe('Failed');
      expect(result.error_details).toBe('Connection refused');
    });

    it('should handle handler returning undefined/null gracefully', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      const result = await executeJob('empty-job', handler);

      expect(result.status).toBe('Success');
      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
    });

    it('should still run handler even if log creation fails', async () => {
      jobLogModel.create.mockRejectedValue(new Error('DB write failed'));
      const handler = jest.fn().mockResolvedValue({
        records_processed: 10,
        records_failed: 0,
        errors: [],
      });

      const result = await executeJob('resilient-job', handler);

      expect(handler).toHaveBeenCalled();
      expect(result.log_id).toBeNull();
      expect(result.status).toBe('Success');
    });
  });

  describe('triggerJob', () => {
    it('should execute a registered job by name', async () => {
      const handler = jest.fn().mockResolvedValue({
        records_processed: 5,
        records_failed: 0,
        errors: [],
      });

      registerJob({ name: 'test-trigger', schedule: '* * * * *', handler });

      const result = await triggerJob('test-trigger');

      expect(handler).toHaveBeenCalled();
      expect(result.status).toBe('Success');
      expect(result.job_name).toBe('test-trigger');
    });

    it('should throw error for unregistered job name', async () => {
      await expect(triggerJob('non-existent')).rejects.toThrow('Job "non-existent" not found in registry');
    });

    it('should throw with statusCode 404 for unregistered job', async () => {
      try {
        await triggerJob('missing-job');
      } catch (err) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('JOB_NOT_FOUND');
      }
    });
  });

  describe('listJobs', () => {
    it('should return empty array when no jobs registered', () => {
      const jobs = listJobs();
      expect(jobs).toEqual([]);
    });

    it('should return all registered jobs with metadata', () => {
      registerJob({ name: 'job-a', schedule: '0 0 1 * *', handler: jest.fn(), description: 'Job A' });
      registerJob({ name: 'job-b', schedule: '*/5 * * * *', handler: jest.fn(), description: 'Job B' });

      const jobs = listJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toEqual({
        name: 'job-a',
        schedule: '0 0 1 * *',
        description: 'Job A',
        active: false,
      });
      expect(jobs[1]).toEqual({
        name: 'job-b',
        schedule: '*/5 * * * *',
        description: 'Job B',
        active: false,
      });
    });
  });

  describe('initializeScheduler', () => {
    it('should start cron tasks for all registered jobs', () => {
      registerJob({ name: 'cron-job', schedule: '0 0 * * *', handler: jest.fn() });

      initializeScheduler();

      const job = jobRegistry.get('cron-job');
      expect(job.task).not.toBeNull();
    });

    it('should skip jobs with invalid cron expressions', () => {
      registerJob({ name: 'bad-cron', schedule: 'invalid', handler: jest.fn() });

      initializeScheduler();

      const job = jobRegistry.get('bad-cron');
      expect(job.task).toBeNull();
    });

    it('should mark jobs as active after initialization', () => {
      registerJob({ name: 'active-job', schedule: '*/10 * * * *', handler: jest.fn() });

      initializeScheduler();

      const jobs = listJobs();
      const activeJob = jobs.find((j) => j.name === 'active-job');
      expect(activeJob.active).toBe(true);
    });
  });

  describe('stopScheduler', () => {
    it('should stop all running cron tasks', () => {
      registerJob({ name: 'stop-test', schedule: '0 * * * *', handler: jest.fn() });
      initializeScheduler();

      const job = jobRegistry.get('stop-test');
      const stopSpy = jest.spyOn(job.task, 'stop');

      stopScheduler();

      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
