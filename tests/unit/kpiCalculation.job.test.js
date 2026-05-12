/**
 * Unit tests for KPI calculation job.
 * Tests the monthly KPI calculation handler including:
 * - Sales KPI: target vs actual new activations
 * - Teknisi KPI: SLA compliance rate and installation quality
 * - Storing scores in kpi_scores table
 * - Flagging reward-eligible employees
 * - Handling partial failures
 *
 * Requirements: 38.1, 38.2, 38.3, 38.4, 38.5
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
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

const { appPool } = require('../../src/config/database');
const { registerJob } = require('../../src/jobs/index');
const {
  register,
  kpiCalculationHandler,
  getPreviousMonthPeriod,
  getPreviousMonthDateRange,
  getActiveSalesUsers,
  getActiveTeknisiUsers,
  countSalesActivations,
  getTeknisiSlaMetrics,
  getTeknisiInstallationQuality,
  storeKpiScore,
  kpiScoreExists,
  calculateSalesScore,
  calculateTeknisiScore,
} = require('../../src/jobs/kpiCalculation.job');

describe('KPI Calculation Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'kpi-calculation',
        schedule: '0 0 1 * *',
        handler: kpiCalculationHandler,
        description: expect.stringContaining('KPI scores'),
      });
    });
  });

  describe('getPreviousMonthPeriod', () => {
    it('should return previous month period for a regular month', () => {
      const date = new Date(2025, 2, 1); // March 1, 2025
      expect(getPreviousMonthPeriod(date)).toBe('2025-02');
    });

    it('should handle January (wrap to previous year December)', () => {
      const date = new Date(2025, 0, 1); // January 1, 2025
      expect(getPreviousMonthPeriod(date)).toBe('2024-12');
    });

    it('should pad single-digit months', () => {
      const date = new Date(2025, 3, 1); // April 1, 2025
      expect(getPreviousMonthPeriod(date)).toBe('2025-03');
    });
  });

  describe('getPreviousMonthDateRange', () => {
    it('should return correct date range for a regular month', () => {
      const date = new Date(2025, 2, 1); // March 1, 2025
      const { startDate, endDate } = getPreviousMonthDateRange(date);
      expect(startDate).toBe('2025-02-01');
      expect(endDate).toBe('2025-02-28');
    });

    it('should handle leap year February', () => {
      const date = new Date(2024, 2, 1); // March 1, 2024 (leap year)
      const { startDate, endDate } = getPreviousMonthDateRange(date);
      expect(startDate).toBe('2024-02-01');
      expect(endDate).toBe('2024-02-29');
    });

    it('should handle January (wrap to previous year December)', () => {
      const date = new Date(2025, 0, 1); // January 1, 2025
      const { startDate, endDate } = getPreviousMonthDateRange(date);
      expect(startDate).toBe('2024-12-01');
      expect(endDate).toBe('2024-12-31');
    });

    it('should handle months with 30 days', () => {
      const date = new Date(2025, 5, 1); // June 1, 2025
      const { startDate, endDate } = getPreviousMonthDateRange(date);
      expect(startDate).toBe('2025-05-01');
      expect(endDate).toBe('2025-05-31');
    });
  });

  describe('getActiveSalesUsers', () => {
    it('should query for active Sales users', async () => {
      const mockUsers = [
        { id: 1, full_name: 'Sales A', branch_id: 1 },
        { id: 2, full_name: 'Sales B', branch_id: 2 },
      ];
      appPool.execute.mockResolvedValue([mockUsers, []]);

      const result = await getActiveSalesUsers();

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE role = ?'),
        ['Sales']
      );
      expect(result).toEqual(mockUsers);
    });
  });

  describe('getActiveTeknisiUsers', () => {
    it('should query for active Teknisi users', async () => {
      const mockUsers = [
        { id: 3, full_name: 'Teknisi A', branch_id: 1 },
      ];
      appPool.execute.mockResolvedValue([mockUsers, []]);

      const result = await getActiveTeknisiUsers();

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE role = ?'),
        ['Teknisi']
      );
      expect(result).toEqual(mockUsers);
    });
  });

  describe('countSalesActivations', () => {
    it('should count activations for a Sales user in the given period', async () => {
      appPool.execute.mockResolvedValue([[{ count: 5 }], []]);

      const result = await countSalesActivations(1, '2025-01-01', '2025-01-31');

      expect(result).toBe(5);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('registered_by'),
        [1, '2025-01-01 00:00:00', '2025-01-31 23:59:59']
      );
    });

    it('should return 0 when no activations found', async () => {
      appPool.execute.mockResolvedValue([[{ count: 0 }], []]);

      const result = await countSalesActivations(1, '2025-01-01', '2025-01-31');

      expect(result).toBe(0);
    });
  });

  describe('getTeknisiSlaMetrics', () => {
    it('should return SLA metrics for a Teknisi', async () => {
      appPool.execute.mockResolvedValue([[{
        total_resolved: 20,
        sla_compliant_count: 16,
      }], []]);

      const result = await getTeknisiSlaMetrics(3, '2025-01-01', '2025-01-31');

      expect(result.totalResolved).toBe(20);
      expect(result.slaCompliant).toBe(16);
      expect(result.slaComplianceRate).toBe(80);
    });

    it('should return 0 compliance rate when no tickets resolved', async () => {
      appPool.execute.mockResolvedValue([[{
        total_resolved: 0,
        sla_compliant_count: 0,
      }], []]);

      const result = await getTeknisiSlaMetrics(3, '2025-01-01', '2025-01-31');

      expect(result.totalResolved).toBe(0);
      expect(result.slaComplianceRate).toBe(0);
    });
  });

  describe('getTeknisiInstallationQuality', () => {
    it('should return 100% quality when no installations', async () => {
      appPool.execute.mockResolvedValue([[{ total_installations: 0 }], []]);

      const result = await getTeknisiInstallationQuality(3, '2025-01-01', '2025-01-31');

      expect(result.totalInstallations).toBe(0);
      expect(result.qualityScore).toBe(100);
    });

    it('should calculate quality score based on repeat issues', async () => {
      // First call: total installations
      appPool.execute
        .mockResolvedValueOnce([[{ total_installations: 10 }], []])
        // Second call: repeat issues
        .mockResolvedValueOnce([[{ repeat_issues: 2 }], []]);

      const result = await getTeknisiInstallationQuality(3, '2025-01-01', '2025-01-31');

      expect(result.totalInstallations).toBe(10);
      expect(result.qualityScore).toBe(80);
    });
  });

  describe('storeKpiScore', () => {
    it('should insert a KPI score record', async () => {
      appPool.execute.mockResolvedValue([{ insertId: 42 }, []]);

      const scoreData = {
        user_id: 1,
        period: '2025-01',
        role_type: 'Sales',
        target_value: 10,
        actual_value: 8,
        score_percentage: 80,
        reward_eligible: false,
        reward_amount: null,
      };

      const result = await storeKpiScore(scoreData);

      expect(result.id).toBe(42);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kpi_scores'),
        [1, '2025-01', 'Sales', 10, 8, 80, 0, null]
      );
    });

    it('should set reward_eligible to 1 when true', async () => {
      appPool.execute.mockResolvedValue([{ insertId: 43 }, []]);

      await storeKpiScore({
        user_id: 2,
        period: '2025-01',
        role_type: 'Sales',
        target_value: 10,
        actual_value: 12,
        score_percentage: 120,
        reward_eligible: true,
        reward_amount: null,
      });

      const params = appPool.execute.mock.calls[0][1];
      expect(params[6]).toBe(1); // reward_eligible = 1
    });
  });

  describe('kpiScoreExists', () => {
    it('should return true when score exists', async () => {
      appPool.execute.mockResolvedValue([[{ count: 1 }], []]);

      const result = await kpiScoreExists(1, '2025-01');

      expect(result).toBe(true);
    });

    it('should return false when no score exists', async () => {
      appPool.execute.mockResolvedValue([[{ count: 0 }], []]);

      const result = await kpiScoreExists(1, '2025-01');

      expect(result).toBe(false);
    });
  });

  describe('calculateSalesScore', () => {
    it('should calculate score as percentage of target', () => {
      const result = calculateSalesScore(8, 10);
      expect(result.score_percentage).toBe(80);
      expect(result.reward_eligible).toBe(false);
    });

    it('should flag as reward eligible when score >= 100%', () => {
      const result = calculateSalesScore(10, 10);
      expect(result.score_percentage).toBe(100);
      expect(result.reward_eligible).toBe(true);
    });

    it('should flag as reward eligible when exceeding target', () => {
      const result = calculateSalesScore(15, 10);
      expect(result.score_percentage).toBe(150);
      expect(result.reward_eligible).toBe(true);
    });

    it('should cap score at 200%', () => {
      const result = calculateSalesScore(25, 10);
      expect(result.score_percentage).toBe(200);
      expect(result.reward_eligible).toBe(true);
    });

    it('should return 0 when target is 0', () => {
      const result = calculateSalesScore(5, 0);
      expect(result.score_percentage).toBe(0);
      expect(result.reward_eligible).toBe(false);
    });

    it('should handle zero activations', () => {
      const result = calculateSalesScore(0, 10);
      expect(result.score_percentage).toBe(0);
      expect(result.reward_eligible).toBe(false);
    });
  });

  describe('calculateTeknisiScore', () => {
    it('should calculate weighted score (70% SLA + 30% quality)', () => {
      // SLA: 80%, Quality: 100%, Target: 80%
      // Combined: 80*0.7 + 100*0.3 = 56 + 30 = 86
      // Score: (86/80)*100 = 107.5%
      const result = calculateTeknisiScore(80, 100, 80);
      expect(result.score_percentage).toBe(107.5);
      expect(result.actual_value).toBe(86);
      expect(result.reward_eligible).toBe(true);
    });

    it('should flag as not reward eligible when below threshold', () => {
      // SLA: 50%, Quality: 60%, Target: 80%
      // Combined: 50*0.7 + 60*0.3 = 35 + 18 = 53
      // Score: (53/80)*100 = 66.25%
      const result = calculateTeknisiScore(50, 60, 80);
      expect(result.score_percentage).toBe(66.25);
      expect(result.reward_eligible).toBe(false);
    });

    it('should cap score at 200%', () => {
      // SLA: 200%, Quality: 200%, Target: 80%
      // Combined: 200*0.7 + 200*0.3 = 200
      // Score: (200/80)*100 = 250% -> capped at 200%
      const result = calculateTeknisiScore(200, 200, 80);
      expect(result.score_percentage).toBe(200);
    });

    it('should return 0 when target is 0', () => {
      const result = calculateTeknisiScore(80, 100, 0);
      expect(result.score_percentage).toBe(0);
      expect(result.reward_eligible).toBe(false);
    });
  });

  describe('kpiCalculationHandler', () => {
    it('should calculate KPI for Sales and Teknisi users', async () => {
      // Mock getActiveSalesUsers
      appPool.execute
        .mockResolvedValueOnce([[{ id: 1, full_name: 'Sales A', branch_id: 1 }], []])
        // Mock kpiScoreExists for Sales user
        .mockResolvedValueOnce([[{ count: 0 }], []])
        // Mock countSalesActivations
        .mockResolvedValueOnce([[{ count: 8 }], []])
        // Mock storeKpiScore for Sales
        .mockResolvedValueOnce([{ insertId: 1 }, []])
        // Mock getActiveTeknisiUsers
        .mockResolvedValueOnce([[{ id: 3, full_name: 'Teknisi A', branch_id: 1 }], []])
        // Mock kpiScoreExists for Teknisi user
        .mockResolvedValueOnce([[{ count: 0 }], []])
        // Mock getTeknisiSlaMetrics
        .mockResolvedValueOnce([[{ total_resolved: 20, sla_compliant_count: 16 }], []])
        // Mock getTeknisiInstallationQuality - total installations
        .mockResolvedValueOnce([[{ total_installations: 10 }], []])
        // Mock getTeknisiInstallationQuality - repeat issues
        .mockResolvedValueOnce([[{ repeat_issues: 1 }], []])
        // Mock storeKpiScore for Teknisi
        .mockResolvedValueOnce([{ insertId: 2 }, []]);

      const result = await kpiCalculationHandler();

      expect(result.records_processed).toBe(2);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should skip users with existing KPI scores for the period', async () => {
      // Mock getActiveSalesUsers
      appPool.execute
        .mockResolvedValueOnce([[{ id: 1, full_name: 'Sales A', branch_id: 1 }], []])
        // Mock kpiScoreExists - already exists
        .mockResolvedValueOnce([[{ count: 1 }], []])
        // Mock getActiveTeknisiUsers
        .mockResolvedValueOnce([[], []]);

      const result = await kpiCalculationHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
    });

    it('should handle partial failures and continue processing', async () => {
      // Mock getActiveSalesUsers - two users
      appPool.execute
        .mockResolvedValueOnce([[
          { id: 1, full_name: 'Sales A', branch_id: 1 },
          { id: 2, full_name: 'Sales B', branch_id: 1 },
        ], []])
        // Mock kpiScoreExists for Sales A
        .mockResolvedValueOnce([[{ count: 0 }], []])
        // Mock countSalesActivations for Sales A - throws error
        .mockRejectedValueOnce(new Error('DB connection lost'))
        // Mock kpiScoreExists for Sales B
        .mockResolvedValueOnce([[{ count: 0 }], []])
        // Mock countSalesActivations for Sales B
        .mockResolvedValueOnce([[{ count: 5 }], []])
        // Mock storeKpiScore for Sales B
        .mockResolvedValueOnce([{ insertId: 1 }, []])
        // Mock getActiveTeknisiUsers - empty
        .mockResolvedValueOnce([[], []]);

      const result = await kpiCalculationHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Sales 1');
      expect(result.errors[0]).toContain('DB connection lost');
    });

    it('should return zero counts when no users exist', async () => {
      // Mock getActiveSalesUsers - empty
      appPool.execute
        .mockResolvedValueOnce([[], []])
        // Mock getActiveTeknisiUsers - empty
        .mockResolvedValueOnce([[], []]);

      const result = await kpiCalculationHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });
});
