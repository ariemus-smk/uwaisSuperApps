/**
 * Unit tests for KPI service.
 * Tests the KPI score retrieval and history functionality.
 *
 * Requirements: 38.1, 40.1, 40.2
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
  },
}));

jest.mock('../../src/models/kpi.model');

const { appPool } = require('../../src/config/database');
const kpiModel = require('../../src/models/kpi.model');
const kpiService = require('../../src/services/kpi.service');

describe('KPI Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getScores', () => {
    it('should return paginated KPI scores with default options', async () => {
      kpiModel.findAll.mockResolvedValue({
        scores: [
          { id: 1, user_id: 1, period: '2024-06', score_percentage: 120, reward_eligible: 1 },
          { id: 2, user_id: 2, period: '2024-06', score_percentage: 85, reward_eligible: 0 },
        ],
        total: 2,
      });

      const result = await kpiService.getScores();

      expect(result.scores).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 2,
        totalPages: 1,
      });
      expect(kpiModel.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('should apply branch scoping filter', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ branchFilter: 3 });

      expect(kpiModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ branch_id: 3 })
      );
    });

    it('should apply period filter', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ period: '2024-06' });

      expect(kpiModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ period: '2024-06' })
      );
    });

    it('should apply role_type filter', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ role_type: 'Sales' });

      expect(kpiModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ role_type: 'Sales' })
      );
    });

    it('should apply user_id filter', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ user_id: 5 });

      expect(kpiModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 5 })
      );
    });

    it('should apply reward_eligible filter', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ reward_eligible: true });

      expect(kpiModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ reward_eligible: true })
      );
    });

    it('should calculate totalPages correctly', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: new Array(10), total: 45 });

      const result = await kpiService.getScores({ page: 1, limit: 10 });

      expect(result.pagination.totalPages).toBe(5);
      expect(result.pagination.totalItems).toBe(45);
    });

    it('should pass custom page and limit', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ page: 3, limit: 5 });

      expect(kpiModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, limit: 5 })
      );
    });

    it('should not include branchFilter when null', async () => {
      kpiModel.findAll.mockResolvedValue({ scores: [], total: 0 });

      await kpiService.getScores({ branchFilter: null });

      const callArgs = kpiModel.findAll.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('branch_id');
    });
  });

  describe('getHistory', () => {
    it('should return KPI history for a valid user', async () => {
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'John Sales', role: 'Sales', branch_id: 1 },
      ]]);

      kpiModel.findByUserId.mockResolvedValue({
        history: [
          { id: 1, period: '2024-06', score_percentage: 120 },
          { id: 2, period: '2024-05', score_percentage: 95 },
        ],
        total: 2,
      });

      const result = await kpiService.getHistory(1);

      expect(result.user).toEqual({ id: 1, full_name: 'John Sales', role: 'Sales', branch_id: 1 });
      expect(result.history).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 2,
        totalPages: 1,
      });
    });

    it('should throw 404 if user not found', async () => {
      appPool.execute.mockResolvedValue([[]]);

      await expect(kpiService.getHistory(999))
        .rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
    });

    it('should apply period_from filter', async () => {
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'John', role: 'Sales', branch_id: 1 },
      ]]);
      kpiModel.findByUserId.mockResolvedValue({ history: [], total: 0 });

      await kpiService.getHistory(1, { period_from: '2024-01' });

      expect(kpiModel.findByUserId).toHaveBeenCalledWith(1,
        expect.objectContaining({ period_from: '2024-01' })
      );
    });

    it('should apply period_to filter', async () => {
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'John', role: 'Sales', branch_id: 1 },
      ]]);
      kpiModel.findByUserId.mockResolvedValue({ history: [], total: 0 });

      await kpiService.getHistory(1, { period_to: '2024-06' });

      expect(kpiModel.findByUserId).toHaveBeenCalledWith(1,
        expect.objectContaining({ period_to: '2024-06' })
      );
    });

    it('should apply both period_from and period_to filters', async () => {
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'Jane', role: 'Teknisi', branch_id: 2 },
      ]]);
      kpiModel.findByUserId.mockResolvedValue({ history: [], total: 0 });

      await kpiService.getHistory(1, { period_from: '2024-01', period_to: '2024-06' });

      expect(kpiModel.findByUserId).toHaveBeenCalledWith(1,
        expect.objectContaining({ period_from: '2024-01', period_to: '2024-06' })
      );
    });

    it('should support pagination options', async () => {
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'John', role: 'Sales', branch_id: 1 },
      ]]);
      kpiModel.findByUserId.mockResolvedValue({ history: new Array(5), total: 25 });

      const result = await kpiService.getHistory(1, { page: 2, limit: 5 });

      expect(result.pagination).toEqual({
        page: 2,
        limit: 5,
        totalItems: 25,
        totalPages: 5,
      });
      expect(kpiModel.findByUserId).toHaveBeenCalledWith(1,
        expect.objectContaining({ page: 2, limit: 5 })
      );
    });

    it('should use default pagination when no options provided', async () => {
      appPool.execute.mockResolvedValue([[
        { id: 1, full_name: 'John', role: 'Sales', branch_id: 1 },
      ]]);
      kpiModel.findByUserId.mockResolvedValue({ history: [], total: 0 });

      await kpiService.getHistory(1);

      expect(kpiModel.findByUserId).toHaveBeenCalledWith(1,
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });
  });
});
