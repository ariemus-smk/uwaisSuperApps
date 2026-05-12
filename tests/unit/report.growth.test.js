/**
 * Unit tests for Report service - Customer Growth Reports.
 * Tests calculateGrowth with MoM/YoY periods and groupBy dimensions.
 *
 * Requirements: 36.1, 36.2, 36.3, 36.4, 36.5
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
  },
}));

const { appPool } = require('../../src/config/database');
const {
  calculateGrowth,
  mergeGrowthData,
  GROWTH_PERIOD,
  GROWTH_GROUP_BY,
} = require('../../src/services/report.service');

describe('Report Service - Customer Growth', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('calculateGrowth', () => {
    it('should calculate net growth as activations minus churned (Req 36.1)', async () => {
      // Mock activations query
      appPool.execute
        .mockResolvedValueOnce([[
          { period: '2024-01', activations: 10 },
          { period: '2024-02', activations: 15 },
        ]])
        // Mock churned query
        .mockResolvedValueOnce([[
          { period: '2024-01', churned: 3 },
          { period: '2024-02', churned: 5 },
        ]]);

      const result = await calculateGrowth({ period: 'MoM' });

      expect(result.period).toBe('MoM');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        period: '2024-01',
        activations: 10,
        churned: 3,
        netGrowth: 7,
      });
      expect(result.data[1]).toEqual({
        period: '2024-02',
        activations: 15,
        churned: 5,
        netGrowth: 10,
      });
    });

    it('should support MoM period with monthly date format (Req 36.2)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'MoM' });

      // First call is activations - should use %Y-%m format
      const activationsCall = appPool.execute.mock.calls[0];
      expect(activationsCall[1][0]).toBe('%Y-%m');
    });

    it('should support YoY period with yearly date format (Req 36.3)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'YoY' });

      // First call is activations - should use %Y format
      const activationsCall = appPool.execute.mock.calls[0];
      expect(activationsCall[1][0]).toBe('%Y');
    });

    it('should throw error for invalid period type', async () => {
      await expect(calculateGrowth({ period: 'invalid' }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw error for invalid groupBy value', async () => {
      await expect(calculateGrowth({ period: 'MoM', groupBy: 'invalid' }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should map growth by Branch (Req 36.4)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[
          { period: '2024-01', activations: 8, branch_id: 1, group_name: 'Cabang A' },
          { period: '2024-01', activations: 5, branch_id: 2, group_name: 'Cabang B' },
        ]])
        .mockResolvedValueOnce([[
          { period: '2024-01', churned: 2, branch_id: 1, group_name: 'Cabang A' },
        ]]);

      const result = await calculateGrowth({ period: 'MoM', groupBy: 'branch' });

      expect(result.groupBy).toBe('branch');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        period: '2024-01',
        activations: 8,
        churned: 2,
        netGrowth: 6,
        branchId: 1,
        groupName: 'Cabang A',
      });
      expect(result.data[1]).toEqual({
        period: '2024-01',
        activations: 5,
        churned: 0,
        netGrowth: 5,
        branchId: 2,
        groupName: 'Cabang B',
      });
    });

    it('should map growth by Mitra (Req 36.4)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[
          { period: '2024-01', activations: 6, group_id: 10, group_name: 'Mitra Jaya' },
        ]])
        .mockResolvedValueOnce([[
          { period: '2024-01', churned: 1, group_id: 10, group_name: 'Mitra Jaya' },
        ]]);

      const result = await calculateGrowth({ period: 'MoM', groupBy: 'mitra' });

      expect(result.groupBy).toBe('mitra');
      expect(result.data[0]).toEqual({
        period: '2024-01',
        activations: 6,
        churned: 1,
        netGrowth: 5,
        groupId: 10,
        groupName: 'Mitra Jaya',
      });
    });

    it('should map growth by Sales agent (Req 36.4)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[
          { period: '2024-01', activations: 12, group_id: 5, group_name: 'Budi Sales' },
        ]])
        .mockResolvedValueOnce([[
          { period: '2024-01', churned: 0, group_id: 5, group_name: 'Budi Sales' },
        ]]);

      const result = await calculateGrowth({ period: 'MoM', groupBy: 'sales' });

      expect(result.groupBy).toBe('sales');
      expect(result.data[0]).toEqual({
        period: '2024-01',
        activations: 12,
        churned: 0,
        netGrowth: 12,
        groupId: 5,
        groupName: 'Budi Sales',
      });
    });

    it('should apply branch filter when provided', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'MoM', branchFilter: 3 });

      // Both queries should include branch filter
      const activationsQuery = appPool.execute.mock.calls[0][0];
      const churnedQuery = appPool.execute.mock.calls[1][0];
      expect(activationsQuery).toContain('c.branch_id = ?');
      expect(churnedQuery).toContain('c.branch_id = ?');
    });

    it('should apply date range filters when provided', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({
        period: 'MoM',
        startDate: '2024-01',
        endDate: '2024-06',
      });

      const activationsParams = appPool.execute.mock.calls[0][1];
      expect(activationsParams).toContain('2024-01');
      expect(activationsParams).toContain('2024-06');
    });

    it('should handle empty data gracefully', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await calculateGrowth({ period: 'MoM' });

      expect(result.data).toEqual([]);
      expect(result.period).toBe('MoM');
      expect(result.groupBy).toBeNull();
    });

    it('should handle periods with only activations (no churn)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[
          { period: '2024-03', activations: 20 },
        ]])
        .mockResolvedValueOnce([[]]);

      const result = await calculateGrowth({ period: 'MoM' });

      expect(result.data[0].netGrowth).toBe(20);
      expect(result.data[0].churned).toBe(0);
    });

    it('should handle periods with only churn (no activations)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[
          { period: '2024-03', churned: 8 },
        ]]);

      const result = await calculateGrowth({ period: 'MoM' });

      expect(result.data[0].netGrowth).toBe(-8);
      expect(result.data[0].activations).toBe(0);
    });

    it('should default to MoM when no period specified', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await calculateGrowth({});

      expect(result.period).toBe('MoM');
    });

    it('should query customer_audit_log for Aktif transitions (activations)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'MoM' });

      const activationsQuery = appPool.execute.mock.calls[0][0];
      expect(activationsQuery).toContain('customer_audit_log');
      expect(activationsQuery).toContain('new_status = ?');
      // Second param should be 'Aktif'
      expect(appPool.execute.mock.calls[0][1]).toContain('Aktif');
    });

    it('should query customer_audit_log for Terminated transitions (churned)', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'MoM' });

      const churnedQuery = appPool.execute.mock.calls[1][0];
      expect(churnedQuery).toContain('customer_audit_log');
      expect(churnedQuery).toContain('new_status = ?');
      // Second param should be 'Terminated'
      expect(appPool.execute.mock.calls[1][1]).toContain('Terminated');
    });

    it('should filter by Mitra role when groupBy is mitra', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'MoM', groupBy: 'mitra' });

      const activationsQuery = appPool.execute.mock.calls[0][0];
      expect(activationsQuery).toContain("u.role = 'Mitra'");
    });

    it('should filter by Sales role when groupBy is sales', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await calculateGrowth({ period: 'MoM', groupBy: 'sales' });

      const activationsQuery = appPool.execute.mock.calls[0][0];
      expect(activationsQuery).toContain("u.role = 'Sales'");
    });
  });

  describe('mergeGrowthData', () => {
    it('should merge activations and churned for same period', () => {
      const activations = [{ period: '2024-01', activations: 10 }];
      const churned = [{ period: '2024-01', churned: 3 }];

      const result = mergeGrowthData(activations, churned, undefined);

      expect(result).toHaveLength(1);
      expect(result[0].netGrowth).toBe(7);
    });

    it('should handle non-overlapping periods', () => {
      const activations = [{ period: '2024-01', activations: 10 }];
      const churned = [{ period: '2024-02', churned: 5 }];

      const result = mergeGrowthData(activations, churned, undefined);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ period: '2024-01', activations: 10, churned: 0, netGrowth: 10 });
      expect(result[1]).toEqual({ period: '2024-02', activations: 0, churned: 5, netGrowth: -5 });
    });

    it('should sort results by period ascending', () => {
      const activations = [
        { period: '2024-03', activations: 5 },
        { period: '2024-01', activations: 10 },
      ];
      const churned = [{ period: '2024-02', churned: 3 }];

      const result = mergeGrowthData(activations, churned, undefined);

      expect(result[0].period).toBe('2024-01');
      expect(result[1].period).toBe('2024-02');
      expect(result[2].period).toBe('2024-03');
    });

    it('should handle empty inputs', () => {
      const result = mergeGrowthData([], [], undefined);
      expect(result).toEqual([]);
    });

    it('should include group info when groupBy is branch', () => {
      const activations = [
        { period: '2024-01', activations: 10, branch_id: 1, group_name: 'Branch A' },
      ];
      const churned = [];

      const result = mergeGrowthData(activations, churned, GROWTH_GROUP_BY.BRANCH);

      expect(result[0].branchId).toBe(1);
      expect(result[0].groupName).toBe('Branch A');
    });

    it('should include group info when groupBy is mitra or sales', () => {
      const activations = [
        { period: '2024-01', activations: 5, group_id: 7, group_name: 'Agent X' },
      ];
      const churned = [];

      const result = mergeGrowthData(activations, churned, GROWTH_GROUP_BY.SALES);

      expect(result[0].groupId).toBe(7);
      expect(result[0].groupName).toBe('Agent X');
    });
  });

  describe('GROWTH_PERIOD constants', () => {
    it('should have MoM and YoY values', () => {
      expect(GROWTH_PERIOD.MOM).toBe('MoM');
      expect(GROWTH_PERIOD.YOY).toBe('YoY');
    });
  });

  describe('GROWTH_GROUP_BY constants', () => {
    it('should have branch, mitra, and sales values', () => {
      expect(GROWTH_GROUP_BY.BRANCH).toBe('branch');
      expect(GROWTH_GROUP_BY.MITRA).toBe('mitra');
      expect(GROWTH_GROUP_BY.SALES).toBe('sales');
    });
  });
});
