/**
 * Unit tests for branch service.
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

const { appPool } = require('../../src/config/database');
const branchService = require('../../src/services/branch.service');

describe('Branch Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllBranches', () => {
    it('should return all branches without filters', async () => {
      const mockBranches = [
        { id: 1, name: 'Branch A', status: 'Active' },
        { id: 2, name: 'Branch B', status: 'Inactive' },
      ];
      appPool.execute.mockResolvedValueOnce([mockBranches, []]);

      const result = await branchService.getAllBranches();

      expect(result).toEqual(mockBranches);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM branches ORDER BY name ASC',
        []
      );
    });

    it('should filter branches by status', async () => {
      const mockBranches = [{ id: 1, name: 'Branch A', status: 'Active' }];
      appPool.execute.mockResolvedValueOnce([mockBranches, []]);

      const result = await branchService.getAllBranches({ status: 'Active' });

      expect(result).toEqual(mockBranches);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM branches WHERE status = ? ORDER BY name ASC',
        ['Active']
      );
    });
  });

  describe('getBranchById', () => {
    it('should return a branch when found', async () => {
      const mockBranch = { id: 1, name: 'Branch A', status: 'Active' };
      appPool.execute.mockResolvedValueOnce([[mockBranch], []]);

      const result = await branchService.getBranchById(1);

      expect(result).toEqual(mockBranch);
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(branchService.getBranchById(999)).rejects.toMatchObject({
        message: 'Branch not found.',
        statusCode: 404,
      });
    });
  });

  describe('createBranch', () => {
    const branchData = {
      name: 'New Branch',
      address: 'Jl. Merdeka No. 1',
      contact_phone: '081234567890',
      contact_email: 'branch@example.com',
    };

    it('should create a branch successfully', async () => {
      // findByName returns empty (no duplicate)
      appPool.execute.mockResolvedValueOnce([[], []]);
      // create returns insertId
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await branchService.createBranch(branchData);

      expect(result).toMatchObject({
        id: 1,
        name: 'New Branch',
        status: 'Active',
      });
    });

    it('should throw 409 when branch name already exists', async () => {
      const existing = { id: 1, name: 'New Branch' };
      appPool.execute.mockResolvedValueOnce([[existing], []]);

      await expect(branchService.createBranch(branchData)).rejects.toMatchObject({
        message: 'Branch with this name already exists.',
        statusCode: 409,
      });
    });
  });

  describe('updateBranch', () => {
    const mockBranch = {
      id: 1,
      name: 'Branch A',
      address: 'Old Address',
      contact_phone: '081111111111',
      contact_email: 'old@example.com',
      status: 'Active',
    };

    it('should update a branch successfully', async () => {
      // findById (check exists)
      appPool.execute.mockResolvedValueOnce([[mockBranch], []]);
      // update query
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      const updatedBranch = { ...mockBranch, address: 'New Address' };
      appPool.execute.mockResolvedValueOnce([[updatedBranch], []]);

      const result = await branchService.updateBranch(1, { address: 'New Address' });

      expect(result.address).toBe('New Address');
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        branchService.updateBranch(999, { address: 'New Address' })
      ).rejects.toMatchObject({
        message: 'Branch not found.',
        statusCode: 404,
      });
    });

    it('should throw 409 when updating to a duplicate name', async () => {
      // findById (check exists)
      appPool.execute.mockResolvedValueOnce([[mockBranch], []]);
      // findByName (check duplicate)
      const existing = { id: 2, name: 'Duplicate Name' };
      appPool.execute.mockResolvedValueOnce([[existing], []]);

      await expect(
        branchService.updateBranch(1, { name: 'Duplicate Name' })
      ).rejects.toMatchObject({
        message: 'Branch with this name already exists.',
        statusCode: 409,
      });
    });
  });

  describe('updateBranchStatus', () => {
    const activeBranch = { id: 1, name: 'Branch A', status: 'Active' };
    const inactiveBranch = { id: 2, name: 'Branch B', status: 'Inactive' };

    it('should deactivate an active branch', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[activeBranch], []]);
      // updateStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...activeBranch, status: 'Inactive' }], []]);

      const result = await branchService.updateBranchStatus(1, 'Inactive');

      expect(result.status).toBe('Inactive');
    });

    it('should activate an inactive branch', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[inactiveBranch], []]);
      // updateStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...inactiveBranch, status: 'Active' }], []]);

      const result = await branchService.updateBranchStatus(2, 'Active');

      expect(result.status).toBe('Active');
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        branchService.updateBranchStatus(999, 'Inactive')
      ).rejects.toMatchObject({
        message: 'Branch not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 for invalid status value', async () => {
      appPool.execute.mockResolvedValueOnce([[activeBranch], []]);

      await expect(
        branchService.updateBranchStatus(1, 'InvalidStatus')
      ).rejects.toMatchObject({
        message: 'Invalid status. Must be Active or Inactive.',
        statusCode: 400,
      });
    });

    it('should throw 400 when branch already has the requested status', async () => {
      appPool.execute.mockResolvedValueOnce([[activeBranch], []]);

      await expect(
        branchService.updateBranchStatus(1, 'Active')
      ).rejects.toMatchObject({
        message: 'Branch is already Active.',
        statusCode: 400,
      });
    });
  });

  describe('isBranchActive', () => {
    it('should return true for an active branch', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Active' }], []]);

      const result = await branchService.isBranchActive(1);

      expect(result).toBe(true);
    });

    it('should return false for an inactive branch', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, status: 'Inactive' }], []]);

      const result = await branchService.isBranchActive(1);

      expect(result).toBe(false);
    });

    it('should return false when branch does not exist', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await branchService.isBranchActive(999);

      expect(result).toBe(false);
    });
  });
});
