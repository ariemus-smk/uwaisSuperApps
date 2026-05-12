/**
 * Unit tests for payroll service.
 * Tests the payroll report generation, approval workflow, and salary slip retrieval.
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4, 40.5
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
  },
}));

jest.mock('../../src/models/payroll.model');
jest.mock('../../src/models/kpi.model');
jest.mock('../../src/models/overtime.model');

const { appPool } = require('../../src/config/database');
const payrollModel = require('../../src/models/payroll.model');
const kpiModel = require('../../src/models/kpi.model');
const overtimeModel = require('../../src/models/overtime.model');
const payrollService = require('../../src/services/payroll.service');

describe('Payroll Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Set up PAYROLL_STATUS on the mock
    payrollModel.PAYROLL_STATUS = {
      DRAFT: 'Draft',
      PENDING_APPROVAL: 'PendingApproval',
      APPROVED: 'Approved',
      REVISED: 'Revised',
    };
  });

  describe('generateReport', () => {
    it('should generate a payroll report consolidating KPI and overtime data', async () => {
      const period = '2024-06';

      // No existing report
      payrollModel.findByPeriod.mockResolvedValue(null);

      // Mock employees
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'John Sales', role: 'Sales', branch_id: 1 },
        { id: 2, full_name: 'Jane Teknisi', role: 'Teknisi', branch_id: 1 },
      ]]);

      // Mock KPI scores
      kpiModel.findByUserAndPeriod
        .mockResolvedValueOnce({ user_id: 1, score_percentage: 120, reward_eligible: 1, reward_amount: 500000 })
        .mockResolvedValueOnce({ user_id: 2, score_percentage: 85, reward_eligible: 0, reward_amount: null });

      // Mock overtime
      overtimeModel.getApprovedByMonth
        .mockResolvedValueOnce({ total_hours: 0, total_compensation: 0, records: [] })
        .mockResolvedValueOnce({ total_hours: 8, total_compensation: 200000, records: [] });

      // Mock create and submit
      payrollModel.create.mockResolvedValue({ id: 1, period, status: 'Draft' });
      payrollModel.submitForApproval.mockResolvedValue({ affectedRows: 1 });
      payrollModel.findById.mockResolvedValue({
        id: 1,
        period,
        status: 'PendingApproval',
        summary: JSON.stringify({
          period,
          total_employees: 2,
          total_kpi_rewards: 500000,
          total_overtime_compensation: 200000,
          total_additional_compensation: 700000,
          employees: [],
        }),
      });

      const result = await payrollService.generateReport(period);

      expect(result.id).toBe(1);
      expect(result.status).toBe('PendingApproval');
      expect(payrollModel.create).toHaveBeenCalledWith(expect.objectContaining({ period }));
      expect(payrollModel.submitForApproval).toHaveBeenCalledWith(1);
    });

    it('should reject invalid period format', async () => {
      await expect(payrollService.generateReport('2024-6'))
        .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });

    it('should reject if report already exists and is not Revised', async () => {
      payrollModel.findByPeriod.mockResolvedValue({ id: 1, period: '2024-06', status: 'Approved' });

      await expect(payrollService.generateReport('2024-06'))
        .rejects.toMatchObject({ statusCode: 409, code: 'RESOURCE_CONFLICT' });
    });

    it('should recalculate a revised report', async () => {
      const period = '2024-06';

      payrollModel.findByPeriod.mockResolvedValue({ id: 5, period, status: 'Revised' });

      // Mock employees - empty list for simplicity
      appPool.execute.mockResolvedValue([[]]);

      payrollModel.updateSummary.mockResolvedValue({ affectedRows: 1 });
      payrollModel.submitForApproval.mockResolvedValue({ affectedRows: 1 });
      payrollModel.findById.mockResolvedValue({ id: 5, period, status: 'PendingApproval', summary: '{}' });

      const result = await payrollService.generateReport(period);

      expect(result.id).toBe(5);
      expect(payrollModel.updateSummary).toHaveBeenCalledWith(5, expect.any(Object));
      expect(payrollModel.submitForApproval).toHaveBeenCalledWith(5);
    });
  });

  describe('getReports', () => {
    it('should return paginated payroll reports', async () => {
      payrollModel.findAll.mockResolvedValue({
        reports: [{ id: 1, period: '2024-06', status: 'Approved' }],
        total: 1,
      });

      const result = await payrollService.getReports({ page: 1, limit: 20 });

      expect(result.reports).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should pass filters to model', async () => {
      payrollModel.findAll.mockResolvedValue({ reports: [], total: 0 });

      await payrollService.getReports({ period: '2024-06', status: 'Approved' });

      expect(payrollModel.findAll).toHaveBeenCalledWith(expect.objectContaining({
        period: '2024-06',
        status: 'Approved',
      }));
    });
  });

  describe('approve', () => {
    it('should approve a PendingApproval report', async () => {
      payrollModel.findById
        .mockResolvedValueOnce({ id: 1, status: 'PendingApproval' })
        .mockResolvedValueOnce({ id: 1, status: 'Approved', approved_by: 10, approved_at: '2024-06-15' });
      payrollModel.approve.mockResolvedValue({ affectedRows: 1 });

      const result = await payrollService.approve(1, 10);

      expect(result.status).toBe('Approved');
      expect(payrollModel.approve).toHaveBeenCalledWith(1, 10);
    });

    it('should reject approval of non-existent report', async () => {
      payrollModel.findById.mockResolvedValue(null);

      await expect(payrollService.approve(999, 10))
        .rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    });

    it('should reject approval of report not in PendingApproval status', async () => {
      payrollModel.findById.mockResolvedValue({ id: 1, status: 'Draft' });

      await expect(payrollService.approve(1, 10))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_STATUS_TRANSITION' });
    });
  });

  describe('revise', () => {
    it('should revise a PendingApproval report', async () => {
      payrollModel.findById
        .mockResolvedValueOnce({ id: 1, status: 'PendingApproval' })
        .mockResolvedValueOnce({ id: 1, status: 'Revised' });
      payrollModel.revise.mockResolvedValue({ affectedRows: 1 });

      const result = await payrollService.revise(1);

      expect(result.status).toBe('Revised');
      expect(payrollModel.revise).toHaveBeenCalledWith(1);
    });

    it('should reject revision of non-existent report', async () => {
      payrollModel.findById.mockResolvedValue(null);

      await expect(payrollService.revise(999))
        .rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    });

    it('should reject revision of report not in PendingApproval status', async () => {
      payrollModel.findById.mockResolvedValue({ id: 1, status: 'Approved' });

      await expect(payrollService.revise(1))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_STATUS_TRANSITION' });
    });
  });

  describe('getSlip', () => {
    it('should return salary slip for an employee from approved report', async () => {
      const userId = 1;
      const employeeData = {
        user_id: 1,
        full_name: 'John Sales',
        kpi_score: 120,
        kpi_reward_amount: 500000,
        overtime_hours: 4,
        overtime_compensation: 100000,
        total_additional_compensation: 600000,
      };

      // Mock user lookup
      appPool.execute.mockResolvedValue([[{ id: 1, full_name: 'John Sales', role: 'Sales', branch_id: 1 }]]);

      // Mock findByPeriod for specific period
      payrollModel.findByPeriod.mockResolvedValue({
        id: 1,
        period: '2024-06',
        status: 'Approved',
        approved_at: '2024-06-15',
        summary: JSON.stringify({ employees: [employeeData] }),
      });

      const result = await payrollService.getSlip(userId, { period: '2024-06' });

      expect(result.user.id).toBe(1);
      expect(result.period).toBe('2024-06');
      expect(result.slip.kpi_reward_amount).toBe(500000);
      expect(result.slip.overtime_compensation).toBe(100000);
    });

    it('should return latest approved report when no period specified', async () => {
      const userId = 1;
      const employeeData = { user_id: 1, full_name: 'John', kpi_score: 100, total_additional_compensation: 0 };

      appPool.execute.mockResolvedValue([[{ id: 1, full_name: 'John', role: 'Sales', branch_id: 1 }]]);

      payrollModel.findAll.mockResolvedValue({
        reports: [{
          id: 2,
          period: '2024-07',
          status: 'Approved',
          approved_at: '2024-07-15',
          summary: JSON.stringify({ employees: [employeeData] }),
        }],
        total: 1,
      });

      const result = await payrollService.getSlip(userId, {});

      expect(result.period).toBe('2024-07');
      expect(payrollModel.findAll).toHaveBeenCalledWith(expect.objectContaining({ status: 'Approved', limit: 1 }));
    });

    it('should throw if user not found', async () => {
      appPool.execute.mockResolvedValue([[]]);

      await expect(payrollService.getSlip(999, {}))
        .rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    });

    it('should throw if no approved report found', async () => {
      appPool.execute.mockResolvedValue([[{ id: 1, full_name: 'John', role: 'Sales', branch_id: 1 }]]);
      payrollModel.findAll.mockResolvedValue({ reports: [], total: 0 });

      await expect(payrollService.getSlip(1, {}))
        .rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    });

    it('should throw if report is not approved', async () => {
      appPool.execute.mockResolvedValue([[{ id: 1, full_name: 'John', role: 'Sales', branch_id: 1 }]]);
      payrollModel.findByPeriod.mockResolvedValue({ id: 1, period: '2024-06', status: 'Draft', summary: '{}' });

      await expect(payrollService.getSlip(1, { period: '2024-06' }))
        .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });

    it('should throw if employee not found in report', async () => {
      appPool.execute.mockResolvedValue([[{ id: 5, full_name: 'Unknown', role: 'Sales', branch_id: 1 }]]);
      payrollModel.findByPeriod.mockResolvedValue({
        id: 1,
        period: '2024-06',
        status: 'Approved',
        approved_at: '2024-06-15',
        summary: JSON.stringify({ employees: [{ user_id: 1, full_name: 'John' }] }),
      });

      await expect(payrollService.getSlip(5, { period: '2024-06' }))
        .rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    });
  });
});
