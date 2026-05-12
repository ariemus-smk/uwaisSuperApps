/**
 * Integration tests for scheduled jobs infrastructure.
 * Tests the full job scheduler lifecycle including:
 * - registerAllJobs registers all expected jobs
 * - triggerJob executes registered jobs correctly
 * - getJobRegistry (jobRegistry) contains all jobs after registration
 * - getJobStatus (listJobs) returns correct status for all jobs
 *
 * Requirements: 6.1, 7.1, 41.2, 38.1
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    getConnection: jest.fn(),
  },
  radiusPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/jobLog.model');
jest.mock('../../src/services/billing.service');
jest.mock('../../src/services/coa.service');
jest.mock('../../src/services/notification.service');
jest.mock('../../src/services/nas.service');
jest.mock('../../src/models/customer.model');
jest.mock('../../src/models/invoice.model');
jest.mock('../../src/models/fupUsage.model');
jest.mock('../../src/services/ticket.service');
jest.mock('../../src/radiusModels/radacct.model');

const jobLogModel = require('../../src/models/jobLog.model');
const { appPool } = require('../../src/config/database');
const billingService = require('../../src/services/billing.service');
const coaService = require('../../src/services/coa.service');

const {
  registerJob,
  registerAllJobs,
  initializeScheduler,
  stopScheduler,
  triggerJob,
  listJobs,
  jobRegistry,
} = require('../../src/jobs/index');

describe('Scheduled Jobs Integration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jobRegistry.clear();

    jobLogModel.create.mockResolvedValue({ id: 1, job_name: 'test', status: 'Running' });
    jobLogModel.complete.mockResolvedValue({ affectedRows: 1 });
  });

  afterAll(() => {
    stopScheduler();
  });

  describe('registerAllJobs', () => {
    it('should register all expected jobs in the registry', () => {
      registerAllJobs();

      const registeredNames = Array.from(jobRegistry.keys());

      expect(registeredNames).toContain('billing-generation');
      expect(registeredNames).toContain('auto-isolir');
      expect(registeredNames).toContain('nas-health-poll');
      expect(registeredNames).toContain('notification-broadcast');
      expect(registeredNames).toContain('fup-enforcement');
      expect(registeredNames).toContain('fup-reset');
      expect(registeredNames).toContain('kpi-calculation');
    });

    it('should register exactly 7 jobs', () => {
      registerAllJobs();

      expect(jobRegistry.size).toBe(7);
    });

    it('should assign valid cron schedules to all jobs', () => {
      const cron = require('node-cron');
      registerAllJobs();

      for (const [name, job] of jobRegistry) {
        expect(cron.validate(job.schedule)).toBe(true);
      }
    });

    it('should assign handler functions to all jobs', () => {
      registerAllJobs();

      for (const [name, job] of jobRegistry) {
        expect(typeof job.handler).toBe('function');
      }
    });
  });

  describe('jobRegistry contents after registerAllJobs', () => {
    beforeEach(() => {
      registerAllJobs();
    });

    it('billing-generation should have schedule for 1st of month at midnight', () => {
      const job = jobRegistry.get('billing-generation');
      expect(job.schedule).toBe('0 0 1 * *');
      expect(job.description).toBeDefined();
    });

    it('auto-isolir should have schedule for 10th of month at 23:59', () => {
      const job = jobRegistry.get('auto-isolir');
      expect(job.schedule).toBe('59 23 10 * *');
      expect(job.description).toBeDefined();
    });

    it('fup-enforcement should have hourly schedule', () => {
      const job = jobRegistry.get('fup-enforcement');
      expect(job.schedule).toBe('0 * * * *');
    });

    it('kpi-calculation should have schedule for 1st of month', () => {
      const job = jobRegistry.get('kpi-calculation');
      expect(job.schedule).toBe('0 0 1 * *');
    });

    it('all jobs should have task set to null before initialization', () => {
      for (const [, job] of jobRegistry) {
        expect(job.task).toBeNull();
      }
    });
  });

  describe('listJobs (getJobStatus)', () => {
    it('should return all jobs as inactive before scheduler initialization', () => {
      registerAllJobs();

      const jobs = listJobs();

      expect(jobs).toHaveLength(7);
      jobs.forEach((job) => {
        expect(job.active).toBe(false);
        expect(job.name).toBeDefined();
        expect(job.schedule).toBeDefined();
      });
    });

    it('should return all jobs as active after scheduler initialization', () => {
      registerAllJobs();
      initializeScheduler();

      const jobs = listJobs();

      jobs.forEach((job) => {
        expect(job.active).toBe(true);
      });

      stopScheduler();
    });

    it('should include name, schedule, description, and active status for each job', () => {
      registerAllJobs();

      const jobs = listJobs();
      const billingJob = jobs.find((j) => j.name === 'billing-generation');

      expect(billingJob).toEqual({
        name: 'billing-generation',
        schedule: '0 0 1 * *',
        description: expect.any(String),
        active: false,
      });
    });
  });

  describe('triggerJob integration', () => {
    beforeEach(() => {
      registerAllJobs();
    });

    it('should execute billing-generation job and return result (Req 6.1)', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      const result = await triggerJob('billing-generation');

      expect(result.job_name).toBe('billing-generation');
      expect(result.status).toBe('Success');
      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
    });

    it('should execute auto-isolir job and return result (Req 7.1)', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      const result = await triggerJob('auto-isolir');

      expect(result.job_name).toBe('auto-isolir');
      expect(result.status).toBe('Success');
      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
    });

    it('should execute fup-enforcement job and return result (Req 41.2)', async () => {
      appPool.execute.mockResolvedValue([[]]);

      const result = await triggerJob('fup-enforcement');

      expect(result.job_name).toBe('fup-enforcement');
      expect(result.status).toBe('Success');
    });

    it('should execute kpi-calculation job and return result (Req 38.1)', async () => {
      // Mock getActiveSalesUsers returns empty
      appPool.execute
        .mockResolvedValueOnce([[], []])
        // Mock getActiveTeknisiUsers returns empty
        .mockResolvedValueOnce([[], []]);

      const result = await triggerJob('kpi-calculation');

      expect(result.job_name).toBe('kpi-calculation');
      expect(result.status).toBe('Success');
    });

    it('should throw JOB_NOT_FOUND for unregistered job name', async () => {
      await expect(triggerJob('non-existent-job')).rejects.toMatchObject({
        statusCode: 404,
        code: 'JOB_NOT_FOUND',
      });
    });

    it('should log job execution via jobLogModel', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      await triggerJob('billing-generation');

      expect(jobLogModel.create).toHaveBeenCalledWith({ job_name: 'billing-generation' });
      expect(jobLogModel.complete).toHaveBeenCalledWith(1, expect.objectContaining({
        status: 'Success',
      }));
    });

    it('should return Partial status when billing job has some failures', async () => {
      const mockSubscriptions = [
        { id: 1, pppoe_username: 'user1', customer_id: 10 },
        { id: 2, pppoe_username: 'user2', customer_id: 11 },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);
      billingService.generateInvoice
        .mockResolvedValueOnce({ id: 1, status: 'UNPAID' })
        .mockRejectedValueOnce(new Error('Package not found'));

      const result = await triggerJob('billing-generation');

      expect(result.status).toBe('Partial');
      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(1);
    });

    it('should return Failed status when auto-isolir job completely fails', async () => {
      appPool.execute.mockRejectedValue(new Error('Database connection lost'));

      const result = await triggerJob('auto-isolir');

      expect(result.status).toBe('Failed');
      expect(result.error_details).toContain('Database connection lost');
    });
  });

  describe('scheduler lifecycle', () => {
    it('should start and stop all jobs without errors', () => {
      registerAllJobs();

      expect(() => initializeScheduler()).not.toThrow();

      const jobs = listJobs();
      const activeCount = jobs.filter((j) => j.active).length;
      expect(activeCount).toBe(7);

      expect(() => stopScheduler()).not.toThrow();
    });

    it('should allow re-registration after stop', () => {
      registerAllJobs();
      initializeScheduler();
      stopScheduler();

      jobRegistry.clear();
      registerAllJobs();

      expect(jobRegistry.size).toBe(7);
    });
  });
});
