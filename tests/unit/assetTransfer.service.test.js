/**
 * Unit tests for asset transfer service.
 * Tests inter-branch transfer initiation, receipt confirmation, and return transfers.
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => {
  const mockConnection = {
    execute: jest.fn().mockResolvedValue([{ insertId: 1 }, []]),
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

describe('Asset Service - Inter-Branch Transfer', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn().mockResolvedValue([{ insertId: 1 }, []]),
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    appPool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('initiateTransfer', () => {
    const validTransferData = {
      source_branch_id: 1,
      destination_branch_id: 2,
      items: [{ asset_id: 10 }],
      initiated_by: 5,
    };

    it('should create transfer record and set assets to DalamPengiriman', async () => {
      // findById for source branch
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // findById for destination branch
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Active' }], []]);
      // findById for asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 10,
        serial_number: 'SN-001',
        product_name: 'Router',
        category: 'PerangkatAktif',
        status: 'Tersedia',
        branch_id: 1,
        remaining_quantity: 1,
      }], []]);
      // updateStatusTx (asset to DalamPengiriman)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // assetTransferModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 50 }, []]);

      const result = await assetService.initiateTransfer(validTransferData);

      expect(result.id).toBe(50);
      expect(result.source_branch_id).toBe(1);
      expect(result.destination_branch_id).toBe(2);
      expect(result.status).toBe('InTransit');
      expect(result.type).toBe('Transfer');
      expect(result.source_branch_name).toBe('Branch A');
      expect(result.destination_branch_name).toBe('Branch B');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should throw when source and destination are the same branch', async () => {
      await expect(
        assetService.initiateTransfer({
          ...validTransferData,
          source_branch_id: 1,
          destination_branch_id: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('different'),
      });
    });

    it('should throw when source branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Source branch'),
      });
    });

    it('should throw when source branch is inactive', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Inactive' }], []]);

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not active'),
      });
    });

    it('should throw when destination branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Destination branch'),
      });
    });

    it('should throw when destination branch is inactive', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Inactive' }], []]);

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not active'),
      });
    });

    it('should throw when items array is empty', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Active' }], []]);

      await expect(
        assetService.initiateTransfer({ ...validTransferData, items: [] })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('At least one item'),
      });
    });

    it('should throw when asset does not belong to source branch', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{
        id: 10,
        serial_number: 'SN-001',
        product_name: 'Router',
        category: 'PerangkatAktif',
        status: 'Tersedia',
        branch_id: 3, // different branch
        remaining_quantity: 1,
      }], []]);

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('does not belong to source branch'),
      });
    });

    it('should throw when asset is not available (not Tersedia)', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{
        id: 10,
        serial_number: 'SN-001',
        product_name: 'Router',
        category: 'PerangkatAktif',
        status: 'Dipinjam',
        branch_id: 1,
        remaining_quantity: 1,
      }], []]);

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not available for transfer'),
      });
    });

    it('should rollback on error during transaction', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{
        id: 10,
        serial_number: 'SN-001',
        product_name: 'Router',
        category: 'PerangkatAktif',
        status: 'Tersedia',
        branch_id: 1,
        remaining_quantity: 1,
      }], []]);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        assetService.initiateTransfer(validTransferData)
      ).rejects.toThrow('DB error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should transfer multiple assets in one transfer', async () => {
      const multiItemData = {
        ...validTransferData,
        items: [{ asset_id: 10 }, { asset_id: 11 }],
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[{ id: 2, name: 'Branch B', status: 'Active' }], []]);
      // First asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', product_name: 'Router',
        category: 'PerangkatAktif', status: 'Tersedia', branch_id: 1, remaining_quantity: 1,
      }], []]);
      // Second asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 11, serial_number: 'SN-002', product_name: 'Switch',
        category: 'PerangkatAktif', status: 'Tersedia', branch_id: 1, remaining_quantity: 1,
      }], []]);
      // updateStatusTx for asset 10
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // updateStatusTx for asset 11
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // assetTransferModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 50 }, []]);

      const result = await assetService.initiateTransfer(multiItemData);

      expect(result.id).toBe(50);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('confirmReceipt', () => {
    it('should confirm receipt and move assets to destination branch', async () => {
      // findById for transfer
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        type: 'Transfer',
        status: 'InTransit',
        items: JSON.stringify([
          { asset_id: 10, serial_number: 'SN-001', product_name: 'Router', category: 'PerangkatAktif', quantity: 1 },
        ]),
        initiated_by: 5,
        initiated_at: '2024-01-15T10:00:00.000Z',
        source_branch_name: 'Branch A',
        destination_branch_name: 'Branch B',
      }], []]);
      // updateStatusTx for asset (Tersedia + branch_id change)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // assetTransferModel.update (status to Received)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.confirmReceipt(50, 8);

      expect(result.status).toBe('Received');
      expect(result.confirmed_by).toBe(8);
      expect(result.confirmed_at).toBeDefined();
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw when transfer not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        assetService.confirmReceipt(999, 8)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Transfer record not found'),
      });
    });

    it('should throw when transfer is not in InTransit status', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        status: 'Received',
        items: '[]',
      }], []]);

      await expect(
        assetService.confirmReceipt(50, 8)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should rollback on error during confirmation', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'InTransit',
        items: JSON.stringify([{ asset_id: 10, serial_number: 'SN-001', product_name: 'Router', category: 'PerangkatAktif', quantity: 1 }]),
      }], []]);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        assetService.confirmReceipt(50, 8)
      ).rejects.toThrow('DB error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('returnTransfer', () => {
    it('should create return transfer and set assets to DalamPengiriman', async () => {
      // findById for original transfer
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        type: 'Transfer',
        status: 'Received',
        items: JSON.stringify([
          { asset_id: 10, serial_number: 'SN-001', product_name: 'Router', category: 'PerangkatAktif', quantity: 1 },
          { asset_id: 11, serial_number: 'SN-002', product_name: 'Switch', category: 'PerangkatAktif', quantity: 1 },
        ]),
        initiated_by: 5,
      }], []]);
      // findById for asset 10
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', product_name: 'Router',
        category: 'PerangkatAktif', status: 'Tersedia', branch_id: 2, remaining_quantity: 1,
      }], []]);
      // updateStatusTx for asset 10 (DalamPengiriman)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // assetTransferModel.create (return transfer)
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 51 }, []]);
      // assetTransferModel.update (original transfer to Returned)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.returnTransfer(50, {
        items: [{ asset_id: 10 }],
        initiated_by: 8,
      });

      expect(result.id).toBe(51);
      expect(result.type).toBe('Return');
      expect(result.status).toBe('InTransit');
      expect(result.source_branch_id).toBe(2); // reversed: destination becomes source
      expect(result.destination_branch_id).toBe(1); // reversed: source becomes destination
      expect(result.original_transfer_id).toBe(50);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw when original transfer not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        assetService.returnTransfer(999, { items: [{ asset_id: 10 }], initiated_by: 8 })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Original transfer record not found'),
      });
    });

    it('should throw when original transfer is not in Received status', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        status: 'InTransit',
        items: '[]',
      }], []]);

      await expect(
        assetService.returnTransfer(50, { items: [{ asset_id: 10 }], initiated_by: 8 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw when asset was not part of original transfer', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'Received',
        items: JSON.stringify([{ asset_id: 10, serial_number: 'SN-001' }]),
      }], []]);

      await expect(
        assetService.returnTransfer(50, { items: [{ asset_id: 99 }], initiated_by: 8 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not part of the original transfer'),
      });
    });

    it('should throw when asset is not at destination branch', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'Received',
        items: JSON.stringify([{ asset_id: 10, serial_number: 'SN-001' }]),
      }], []]);
      // Asset is at branch 3, not destination branch 2
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', product_name: 'Router',
        category: 'PerangkatAktif', status: 'Tersedia', branch_id: 3, remaining_quantity: 1,
      }], []]);

      await expect(
        assetService.returnTransfer(50, { items: [{ asset_id: 10 }], initiated_by: 8 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not at the destination branch'),
      });
    });

    it('should throw when asset is not available for return', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'Received',
        items: JSON.stringify([{ asset_id: 10, serial_number: 'SN-001' }]),
      }], []]);
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', product_name: 'Router',
        category: 'PerangkatAktif', status: 'Terpasang', branch_id: 2, remaining_quantity: 1,
      }], []]);

      await expect(
        assetService.returnTransfer(50, { items: [{ asset_id: 10 }], initiated_by: 8 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not available for return'),
      });
    });

    it('should throw when items array is empty', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'Received',
        items: JSON.stringify([{ asset_id: 10 }]),
      }], []]);

      await expect(
        assetService.returnTransfer(50, { items: [], initiated_by: 8 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('At least one item'),
      });
    });

    it('should rollback on error during return transfer', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'Received',
        items: JSON.stringify([{ asset_id: 10, serial_number: 'SN-001' }]),
      }], []]);
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', product_name: 'Router',
        category: 'PerangkatAktif', status: 'Tersedia', branch_id: 2, remaining_quantity: 1,
      }], []]);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        assetService.returnTransfer(50, { items: [{ asset_id: 10 }], initiated_by: 8 })
      ).rejects.toThrow('DB error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('getTransferById', () => {
    it('should return transfer record with parsed items', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 50,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'InTransit',
        items: JSON.stringify([{ asset_id: 10, serial_number: 'SN-001' }]),
        source_branch_name: 'Branch A',
        destination_branch_name: 'Branch B',
      }], []]);

      const result = await assetService.getTransferById(50);

      expect(result.id).toBe(50);
      expect(result.items).toEqual([{ asset_id: 10, serial_number: 'SN-001' }]);
    });

    it('should throw 404 when transfer not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        assetService.getTransferById(999)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('getTransferHistory', () => {
    it('should return transfer history for a branch', async () => {
      // findById for branch
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // count query
      appPool.execute.mockResolvedValueOnce([[{ total: 2 }], []]);
      // data query
      appPool.execute.mockResolvedValueOnce([[
        { id: 50, source_branch_id: 1, destination_branch_id: 2, status: 'Received' },
        { id: 51, source_branch_id: 2, destination_branch_id: 1, status: 'InTransit' },
      ], []]);

      const result = await assetService.getTransferHistory(1);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        assetService.getTransferHistory(999)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
