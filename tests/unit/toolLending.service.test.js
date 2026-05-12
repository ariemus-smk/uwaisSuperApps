/**
 * Unit tests for tool lending service methods.
 * Tests borrowTool, approveBorrow, returnTool, and getBorrowedTools.
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => {
  const mockConnection = {
    execute: jest.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };

  return {
    appPool: {
      execute: jest.fn().mockResolvedValue([[], []]),
      query: jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn().mockResolvedValue(mockConnection),
    },
  };
});

const { appPool } = require('../../src/config/database');
const assetService = require('../../src/services/asset.service');

describe('Tool Lending Service', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]),
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    appPool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('borrowTool', () => {
    const validBorrowData = {
      asset_id: 1,
      teknisi_id: 5,
      branch_id: 1,
      borrow_date: '2024-03-01',
      expected_return_date: '2024-03-15',
    };

    it('should create a borrow request for an available tool', async () => {
      // findById for asset
      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Tersedia', product_name: 'Tang Crimping' }], []]);
      // findActiveByAssetId - no active lending
      appPool.execute.mockResolvedValueOnce([[], []]);
      // toolLendingModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 10 }, []]);

      const result = await assetService.borrowTool(validBorrowData);

      expect(result.id).toBe(10);
      expect(result.asset_id).toBe(1);
      expect(result.teknisi_id).toBe(5);
      expect(result.status).toBe('Requested');
      expect(result.borrow_date).toBe('2024-03-01');
      expect(result.expected_return_date).toBe('2024-03-15');
    });

    it('should throw 404 when asset not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.borrowTool(validBorrowData)).rejects.toMatchObject({
        message: 'Asset not found.',
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when asset is not available (already borrowed)', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Dipinjam', product_name: 'Tang' }], []]);

      await expect(assetService.borrowTool(validBorrowData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 409 when tool has an active lending record', async () => {
      // Asset is available
      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Tersedia', product_name: 'Tang' }], []]);
      // Active lending exists
      appPool.execute.mockResolvedValueOnce([[{ id: 5, asset_id: 1, status: 'Active' }], []]);

      await expect(assetService.borrowTool(validBorrowData)).rejects.toMatchObject({
        statusCode: 409,
        code: 'RESOURCE_CONFLICT',
      });
    });

    it('should throw 400 when expected_return_date is before borrow_date', async () => {
      const invalidData = {
        ...validBorrowData,
        borrow_date: '2024-03-15',
        expected_return_date: '2024-03-01',
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Tersedia', product_name: 'Tang' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.borrowTool(invalidData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when expected_return_date equals borrow_date', async () => {
      const invalidData = {
        ...validBorrowData,
        borrow_date: '2024-03-01',
        expected_return_date: '2024-03-01',
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Tersedia', product_name: 'Tang' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.borrowTool(invalidData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('approveBorrow', () => {
    it('should approve a requested lending and update asset status to Dipinjam', async () => {
      const mockLending = {
        id: 10,
        asset_id: 1,
        teknisi_id: 5,
        branch_id: 1,
        status: 'Requested',
        borrow_date: '2024-03-01',
        expected_return_date: '2024-03-15',
      };

      // findById for lending (with JOIN)
      appPool.execute.mockResolvedValueOnce([[mockLending], []]);

      // Transaction: update lending status + update asset status
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.approveBorrow(10, 2);

      expect(result.status).toBe('Active');
      expect(result.approved_by).toBe(2);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      // Verify asset status update to Dipinjam
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE assets SET status = ?'),
        ['Dipinjam', 5, 1]
      );
    });

    it('should throw 404 when lending record not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.approveBorrow(999, 2)).rejects.toMatchObject({
        message: 'Tool lending record not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when lending is not in Requested status', async () => {
      const mockLending = { id: 10, status: 'Active', asset_id: 1, teknisi_id: 5 };
      appPool.execute.mockResolvedValueOnce([[mockLending], []]);

      await expect(assetService.approveBorrow(10, 2)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should rollback transaction on error', async () => {
      const mockLending = { id: 10, status: 'Requested', asset_id: 1, teknisi_id: 5 };
      appPool.execute.mockResolvedValueOnce([[mockLending], []]);

      // First execute succeeds, second fails
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.approveBorrow(10, 2)).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('returnTool', () => {
    const mockActiveLending = {
      id: 10,
      asset_id: 1,
      teknisi_id: 5,
      branch_id: 1,
      status: 'Active',
      borrow_date: '2024-03-01',
      expected_return_date: '2024-03-15',
    };

    it('should return a tool in good condition and set asset to Tersedia', async () => {
      appPool.execute.mockResolvedValueOnce([[mockActiveLending], []]);

      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.returnTool(10, {
        condition_on_return: 'Baik',
        actual_return_date: '2024-03-14',
      });

      expect(result.status).toBe('Returned');
      expect(result.actual_return_date).toBe('2024-03-14');
      expect(result.condition_on_return).toBe('Baik');
      expect(result.asset_status).toBe('Tersedia');
      expect(result.responsible_teknisi_id).toBeNull();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should handle damaged tool return and set asset to Rusak', async () => {
      appPool.execute.mockResolvedValueOnce([[mockActiveLending], []]);

      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.returnTool(10, {
        condition_on_return: 'Rusak',
        actual_return_date: '2024-03-14',
      });

      expect(result.status).toBe('Returned');
      expect(result.asset_status).toBe('Rusak');
      expect(result.responsible_teknisi_id).toBe(5);
    });

    it('should handle lost tool and set lending status to Lost', async () => {
      appPool.execute.mockResolvedValueOnce([[mockActiveLending], []]);

      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.returnTool(10, {
        condition_on_return: 'Hilang',
        actual_return_date: '2024-03-14',
      });

      expect(result.status).toBe('Lost');
      expect(result.asset_status).toBe('Rusak');
      expect(result.responsible_teknisi_id).toBe(5);
    });

    it('should default actual_return_date to today when not provided', async () => {
      appPool.execute.mockResolvedValueOnce([[mockActiveLending], []]);

      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.returnTool(10, {
        condition_on_return: 'Baik',
      });

      const today = new Date().toISOString().split('T')[0];
      expect(result.actual_return_date).toBe(today);
    });

    it('should throw 404 when lending record not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.returnTool(999, { condition_on_return: 'Baik' })).rejects.toMatchObject({
        message: 'Tool lending record not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when lending is already returned', async () => {
      const returnedLending = { ...mockActiveLending, status: 'Returned' };
      appPool.execute.mockResolvedValueOnce([[returnedLending], []]);

      await expect(assetService.returnTool(10, { condition_on_return: 'Baik' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw 400 when lending is in Lost status', async () => {
      const lostLending = { ...mockActiveLending, status: 'Lost' };
      appPool.execute.mockResolvedValueOnce([[lostLending], []]);

      await expect(assetService.returnTool(10, { condition_on_return: 'Baik' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should rollback transaction on error', async () => {
      appPool.execute.mockResolvedValueOnce([[mockActiveLending], []]);

      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.returnTool(10, { condition_on_return: 'Baik' })).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('getBorrowedTools', () => {
    it('should return borrowed tools for a branch', async () => {
      const mockBranch = { id: 1, name: 'Branch A', status: 'Active' };
      const mockBorrowed = [
        {
          id: 10,
          asset_id: 1,
          teknisi_id: 5,
          status: 'Active',
          product_name: 'Tang Crimping',
          teknisi_name: 'Budi Teknisi',
          borrow_duration_days: 5,
        },
      ];

      // findById for branch
      appPool.execute.mockResolvedValueOnce([[mockBranch], []]);
      // count query
      appPool.execute.mockResolvedValueOnce([[{ total: 1 }], []]);
      // data query
      appPool.execute.mockResolvedValueOnce([mockBorrowed, []]);

      const result = await assetService.getBorrowedTools(1);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].teknisi_name).toBe('Budi Teknisi');
      expect(result.data[0].borrow_duration_days).toBe(5);
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.getBorrowedTools(999)).rejects.toMatchObject({
        message: 'Branch not found.',
        statusCode: 404,
      });
    });
  });
});
