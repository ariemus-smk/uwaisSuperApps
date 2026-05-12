/**
 * Unit tests for direct sale and stock opname functionality in asset service.
 * Tests direct sale recording, stock deduction, and stock opname workflow.
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

describe('Asset Service - Direct Sales', () => {
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

  describe('recordDirectSale', () => {
    const validSaleData = {
      customer_id: 1,
      branch_id: 1,
      sold_by: 2,
      payment_method: 'Cash',
      total_amount: 500000,
      items: [
        {
          asset_id: 10,
          category: 'PerangkatAktif',
          quantity: 1,
          serial_number: 'SN-001',
          product_name: 'Router Mikrotik',
          unit_price: 500000,
        },
      ],
    };

    it('should record a Cash direct sale and set payment_status to Lunas', async () => {
      // findById for asset validation
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, serial_number: 'SN-001',
        product_name: 'Router Mikrotik', category: 'PerangkatAktif',
        remaining_quantity: 1,
      }], []]);
      // findById again inside transaction for PerangkatAktif
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, serial_number: 'SN-001',
        product_name: 'Router Mikrotik', category: 'PerangkatAktif',
        remaining_quantity: 1,
      }], []]);
      // updateStatusTx via connection
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // directSaleModel.create via connection
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 5 }, []]);

      const result = await assetService.recordDirectSale(validSaleData);

      expect(result.id).toBe(5);
      expect(result.payment_status).toBe('Lunas');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].serial_number).toBe('SN-001');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should record a Hutang direct sale and set payment_status to Piutang', async () => {
      const hutangData = { ...validSaleData, payment_method: 'Hutang' };

      // findById for asset validation
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, serial_number: 'SN-001',
        product_name: 'Router Mikrotik', category: 'PerangkatAktif',
        remaining_quantity: 1,
      }], []]);
      // findById again inside transaction
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, serial_number: 'SN-001',
        product_name: 'Router Mikrotik', category: 'PerangkatAktif',
        remaining_quantity: 1,
      }], []]);
      // updateStatusTx
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // directSaleModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 6 }, []]);

      const result = await assetService.recordDirectSale(hutangData);

      expect(result.payment_status).toBe('Piutang');
    });

    it('should deduct Kabel stock per meter', async () => {
      const kabelSaleData = {
        customer_id: 1,
        branch_id: 1,
        sold_by: 2,
        payment_method: 'Cash',
        total_amount: 100000,
        items: [
          { category: 'Kabel', quantity: 50, product_name: 'Kabel FO', unit_price: 2000 },
        ],
      };

      // getAvailableQuantity for stock validation
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 100 }], []]);
      // findAvailable for Kabel inside transaction
      appPool.execute.mockResolvedValueOnce([[
        { id: 20, serial_number: 'UBG-20240101-000001', product_name: 'Kabel FO', category: 'Kabel', remaining_quantity: 100, status: 'Tersedia' },
      ], []]);
      // updateRemainingQuantity via connection (partial deduction)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // directSaleModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 7 }, []]);

      const result = await assetService.recordDirectSale(kabelSaleData);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(50);
      expect(result.items[0].category).toBe('Kabel');
      // Verify partial deduction: 100 - 50 = 50 remaining
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE assets SET remaining_quantity'),
        [50, 20]
      );
    });

    it('should deduct Aksesoris stock per piece', async () => {
      const aksSaleData = {
        customer_id: 1,
        branch_id: 1,
        sold_by: 2,
        payment_method: 'Cash',
        total_amount: 50000,
        items: [
          { category: 'Aksesoris', quantity: 5, product_name: 'Connector SC', unit_price: 10000 },
        ],
      };

      // getAvailableQuantity for stock validation
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 20 }], []]);
      // findAvailable for Aksesoris inside transaction
      appPool.execute.mockResolvedValueOnce([[
        { id: 30, serial_number: 'UBG-20240101-000010', product_name: 'Connector SC', category: 'Aksesoris', remaining_quantity: 20, status: 'Tersedia' },
      ], []]);
      // updateRemainingQuantity via connection
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // directSaleModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 8 }, []]);

      const result = await assetService.recordDirectSale(aksSaleData);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(5);
      expect(result.items[0].category).toBe('Aksesoris');
    });

    it('should throw INSUFFICIENT_STOCK when not enough stock', async () => {
      const insufficientData = {
        customer_id: 1,
        branch_id: 1,
        sold_by: 2,
        payment_method: 'Cash',
        total_amount: 100000,
        items: [
          { category: 'Kabel', quantity: 200, product_name: 'Kabel FO', unit_price: 500 },
        ],
      };

      // getAvailableQuantity returns less than requested
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 50 }], []]);

      await expect(assetService.recordDirectSale(insufficientData))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INSUFFICIENT_STOCK',
        });
    });

    it('should throw when asset_id is not available', async () => {
      const unavailableData = {
        ...validSaleData,
        items: [{ asset_id: 99, category: 'PerangkatAktif', quantity: 1 }],
      };

      // findById returns asset with non-Tersedia status
      appPool.execute.mockResolvedValueOnce([[{
        id: 99, status: 'Dipinjam', branch_id: 1,
      }], []]);

      await expect(assetService.recordDirectSale(unavailableData))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INSUFFICIENT_STOCK',
        });
    });

    it('should throw for invalid payment method', async () => {
      const invalidData = { ...validSaleData, payment_method: 'Transfer' };

      await expect(assetService.recordDirectSale(invalidData))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw when items array is empty', async () => {
      const emptyData = { ...validSaleData, items: [] };

      await expect(assetService.recordDirectSale(emptyData))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw for invalid category', async () => {
      const invalidCatData = {
        ...validSaleData,
        items: [{ category: 'InvalidCat', quantity: 1 }],
      };

      await expect(assetService.recordDirectSale(invalidCatData))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should rollback transaction on error', async () => {
      // findById for asset validation passes
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, serial_number: 'SN-001',
        product_name: 'Router', category: 'PerangkatAktif', remaining_quantity: 1,
      }], []]);
      // findById inside transaction passes
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, serial_number: 'SN-001',
        product_name: 'Router', category: 'PerangkatAktif', remaining_quantity: 1,
      }], []]);
      // updateStatusTx fails
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.recordDirectSale(validSaleData)).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});

describe('Asset Service - Stock Opname', () => {
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

  describe('initiateStockOpname', () => {
    it('should initiate a stock opname session for a branch', async () => {
      // findById for branch validation
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // findActiveByBranch - no active session
      appPool.execute.mockResolvedValueOnce([[], []]);
      // getStockSummary
      appPool.execute.mockResolvedValueOnce([[
        { category: 'PerangkatAktif', status: 'Tersedia', count: 10, total_quantity: 10 },
        { category: 'Kabel', status: 'Tersedia', count: 5, total_quantity: 500 },
        { category: 'Aksesoris', status: 'Tersedia', count: 3, total_quantity: 100 },
      ], []]);
      // stockOpnameModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await assetService.initiateStockOpname({
        branch_id: 1,
        conducted_by: 2,
      });

      expect(result.id).toBe(1);
      expect(result.branch_name).toBe('Branch A');
      expect(result.system_stock).toHaveLength(3);
      expect(result.status).toBe('InProgress');
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.initiateStockOpname({ branch_id: 999, conducted_by: 2 }))
        .rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
    });

    it('should throw 400 when branch is inactive', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Inactive' }], []]);

      await expect(assetService.initiateStockOpname({ branch_id: 1, conducted_by: 2 }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw 409 when active session already exists', async () => {
      // Branch found and active
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // Active session exists
      appPool.execute.mockResolvedValueOnce([[{ id: 5, branch_id: 1, status: 'InProgress' }], []]);

      await expect(assetService.initiateStockOpname({ branch_id: 1, conducted_by: 2 }))
        .rejects.toMatchObject({
          statusCode: 409,
          code: 'RESOURCE_CONFLICT',
        });
    });
  });

  describe('submitOpnameCounts', () => {
    it('should compare physical counts against system records and generate adjustments', async () => {
      // findById for opname
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments: null,
        branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);
      // getAvailableQuantity for PerangkatAktif
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 10 }], []]);
      // getAvailableQuantity for Kabel
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 500 }], []]);
      // stockOpnameModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.submitOpnameCounts(1, {
        counts: [
          { category: 'PerangkatAktif', physical_quantity: 8, reason: '2 units missing' },
          { category: 'Kabel', physical_quantity: 480, reason: '20m unaccounted' },
        ],
      });

      expect(result.opname_id).toBe(1);
      expect(result.adjustments).toHaveLength(2);
      expect(result.adjustments[0].system_quantity).toBe(10);
      expect(result.adjustments[0].physical_quantity).toBe(8);
      expect(result.adjustments[0].difference).toBe(-2);
      expect(result.adjustments[1].system_quantity).toBe(500);
      expect(result.adjustments[1].physical_quantity).toBe(480);
      expect(result.adjustments[1].difference).toBe(-20);
      expect(result.has_discrepancies).toBe(true);
    });

    it('should report no discrepancies when counts match', async () => {
      // findById for opname
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments: null,
        branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);
      // getAvailableQuantity for PerangkatAktif
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 10 }], []]);
      // stockOpnameModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.submitOpnameCounts(1, {
        counts: [
          { category: 'PerangkatAktif', physical_quantity: 10 },
        ],
      });

      expect(result.has_discrepancies).toBe(false);
      expect(result.adjustments[0].difference).toBe(0);
      expect(result.adjustments[0].reason).toBe('Match');
    });

    it('should throw 404 when opname not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.submitOpnameCounts(999, { counts: [{ category: 'Kabel', physical_quantity: 10 }] }))
        .rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
    });

    it('should throw when opname is not InProgress', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'Completed', adjustments: '[]',
        branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);

      await expect(assetService.submitOpnameCounts(1, { counts: [{ category: 'Kabel', physical_quantity: 10 }] }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_STATUS_TRANSITION',
        });
    });

    it('should throw for invalid category', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments: null,
        branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);

      await expect(assetService.submitOpnameCounts(1, { counts: [{ category: 'Invalid', physical_quantity: 10 }] }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw when counts array is empty', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments: null,
        branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);

      await expect(assetService.submitOpnameCounts(1, { counts: [] }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });
  });

  describe('finalizeStockOpname', () => {
    it('should finalize opname and adjust stock for deficits (Kabel)', async () => {
      const adjustments = JSON.stringify([
        { category: 'Kabel', system_quantity: 500, physical_quantity: 480, difference: -20, reason: 'Loss' },
      ]);

      // findById for opname
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments,
        conducted_by: 2, branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);
      // findAvailable for Kabel (to deduct deficit)
      appPool.execute.mockResolvedValueOnce([[
        { id: 20, remaining_quantity: 100, category: 'Kabel' },
      ], []]);
      // updateRemainingQuantity via connection
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // stockOpnameModel.update via connection
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.finalizeStockOpname(1);

      expect(result.status).toBe('Completed');
      expect(result.adjustments).toHaveLength(1);
      expect(result.completed_at).toBeDefined();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should finalize opname and mark PerangkatAktif as Rusak for deficit', async () => {
      const adjustments = JSON.stringify([
        { category: 'PerangkatAktif', system_quantity: 10, physical_quantity: 8, difference: -2, reason: '2 missing' },
      ]);

      // findById for opname
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments,
        conducted_by: 2, branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);
      // findAvailable for PerangkatAktif
      appPool.execute.mockResolvedValueOnce([[
        { id: 50, remaining_quantity: 1, category: 'PerangkatAktif' },
        { id: 51, remaining_quantity: 1, category: 'PerangkatAktif' },
        { id: 52, remaining_quantity: 1, category: 'PerangkatAktif' },
      ], []]);
      // updateStatusTx for asset 50 (mark as Rusak)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // updateStatusTx for asset 51 (mark as Rusak)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // stockOpnameModel.update
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.finalizeStockOpname(1);

      expect(result.status).toBe('Completed');
      // Two assets marked as Rusak + opname status update = 3 connection.execute calls
      expect(mockConnection.execute).toHaveBeenCalledTimes(3);
    });

    it('should skip adjustment when difference is 0', async () => {
      const adjustments = JSON.stringify([
        { category: 'Kabel', system_quantity: 100, physical_quantity: 100, difference: 0, reason: 'Match' },
      ]);

      // findById for opname
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments,
        conducted_by: 2, branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);
      // stockOpnameModel.update via connection (only status update, no stock changes)
      mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await assetService.finalizeStockOpname(1);

      expect(result.status).toBe('Completed');
      // Only the opname status update should be called (no stock adjustments)
      expect(mockConnection.execute).toHaveBeenCalledTimes(1);
    });

    it('should throw 404 when opname not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.finalizeStockOpname(999))
        .rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
    });

    it('should throw when opname is not InProgress', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'Completed', adjustments: '[]',
        branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);

      await expect(assetService.finalizeStockOpname(1))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_STATUS_TRANSITION',
        });
    });

    it('should throw when no adjustments have been submitted', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments: null,
        conducted_by: 2, branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);

      await expect(assetService.finalizeStockOpname(1))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should rollback transaction on error', async () => {
      const adjustments = JSON.stringify([
        { category: 'Kabel', system_quantity: 500, physical_quantity: 480, difference: -20, reason: 'Loss' },
      ]);

      // findById for opname
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, branch_id: 1, status: 'InProgress', adjustments,
        conducted_by: 2, branch_name: 'Branch A', conducted_by_name: 'Admin',
      }], []]);
      // findAvailable fails
      appPool.execute.mockResolvedValueOnce([[
        { id: 20, remaining_quantity: 100, category: 'Kabel' },
      ], []]);
      // updateRemainingQuantity fails
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.finalizeStockOpname(1)).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});
