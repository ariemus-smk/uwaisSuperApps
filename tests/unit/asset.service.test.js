/**
 * Unit tests for asset service.
 * Tests inbound recording, categorization, SN generation, and stock tracking.
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

describe('Asset Service', () => {
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

  describe('recordInbound', () => {
    const validInboundData = {
      invoice_number: 'INV-2024-001',
      purchase_date: '2024-01-15',
      invoice_file_url: 'https://storage.example.com/invoices/inv-001.pdf',
      supplier_name: 'PT Supplier Utama',
      branch_id: 1,
      recorded_by: 2,
      items: [
        {
          product_name: 'Router Mikrotik RB750Gr3',
          brand_model: 'Mikrotik RB750Gr3',
          category: 'PerangkatAktif',
          serial_number: 'MK-SN-12345',
          mac_address: 'AA:BB:CC:DD:EE:FF',
        },
      ],
    };

    it('should record inbound with manufacturer serial number', async () => {
      // findById for branch validation
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // getExistingSerialsByDate
      appPool.execute.mockResolvedValueOnce([[], []]);
      // assetInboundModel.create via connection
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 10 }, []]);
      // asset insert via connection
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 100 }, []]);

      const result = await assetService.recordInbound(validInboundData);

      expect(result.inbound).toBeDefined();
      expect(result.inbound.id).toBe(10);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].serial_number).toBe('MK-SN-12345');
      expect(result.assets[0].category).toBe('PerangkatAktif');
      expect(result.assets[0].status).toBe('Tersedia');
      expect(result.totalItems).toBe(1);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should auto-generate serial number when no SN or MAC provided', async () => {
      const dataWithoutSN = {
        ...validInboundData,
        items: [
          {
            product_name: 'Konektor RJ45',
            brand_model: 'AMP Cat6',
            category: 'Aksesoris',
            quantity: 100,
          },
        ],
      };

      // findById for branch validation
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // getExistingSerialsByDate - no existing serials
      appPool.execute.mockResolvedValueOnce([[], []]);
      // assetInboundModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 11 }, []]);
      // asset insert
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 101 }, []]);

      const result = await assetService.recordInbound(dataWithoutSN);

      expect(result.assets[0].serial_number).toMatch(/^UBG-\d{8}-\d{6}$/);
      expect(result.assets[0].quantity).toBe(100);
      expect(result.assets[0].remaining_quantity).toBe(100);
    });

    it('should use MAC address as serial number when MAC provided but no SN', async () => {
      const dataWithMAC = {
        ...validInboundData,
        items: [
          {
            product_name: 'ONU ZTE F660',
            brand_model: 'ZTE F660',
            category: 'PerangkatAktif',
            mac_address: '11:22:33:44:55:66',
          },
        ],
      };

      // findById for branch validation
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      // getExistingSerialsByDate
      appPool.execute.mockResolvedValueOnce([[], []]);
      // assetInboundModel.create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 12 }, []]);
      // asset insert
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 102 }, []]);

      const result = await assetService.recordInbound(dataWithMAC);

      expect(result.assets[0].serial_number).toBe('11:22:33:44:55:66');
      expect(result.assets[0].mac_address).toBe('11:22:33:44:55:66');
    });

    it('should categorize PerangkatAktif with quantity 1', async () => {
      const data = {
        ...validInboundData,
        items: [
          {
            product_name: 'Switch 8 Port',
            brand_model: 'TP-Link TL-SG108',
            category: 'PerangkatAktif',
            serial_number: 'TPLINK-001',
            quantity: 5, // should be overridden to 1
          },
        ],
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 13 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 103 }, []]);

      const result = await assetService.recordInbound(data);

      expect(result.assets[0].quantity).toBe(1);
      expect(result.assets[0].remaining_quantity).toBe(1);
    });

    it('should handle Kabel category with meters quantity', async () => {
      const data = {
        ...validInboundData,
        items: [
          {
            product_name: 'Kabel FO Drop 2 Core',
            brand_model: 'Furukawa',
            category: 'Kabel',
            quantity: 500, // 500 meters per roll
          },
        ],
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 14 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 104 }, []]);

      const result = await assetService.recordInbound(data);

      expect(result.assets[0].category).toBe('Kabel');
      expect(result.assets[0].quantity).toBe(500);
      expect(result.assets[0].remaining_quantity).toBe(500);
    });

    it('should handle Aksesoris category with pieces quantity', async () => {
      const data = {
        ...validInboundData,
        items: [
          {
            product_name: 'Konektor SC/APC',
            brand_model: 'Generic',
            category: 'Aksesoris',
            quantity: 50, // 50 pieces per pack
          },
        ],
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 15 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 105 }, []]);

      const result = await assetService.recordInbound(data);

      expect(result.assets[0].category).toBe('Aksesoris');
      expect(result.assets[0].quantity).toBe(50);
      expect(result.assets[0].remaining_quantity).toBe(50);
    });

    it('should handle multiple items in a single inbound', async () => {
      const data = {
        ...validInboundData,
        items: [
          {
            product_name: 'Router Mikrotik',
            brand_model: 'RB750Gr3',
            category: 'PerangkatAktif',
            serial_number: 'MK-001',
          },
          {
            product_name: 'Kabel FO',
            brand_model: 'Furukawa',
            category: 'Kabel',
            quantity: 300,
          },
          {
            product_name: 'Konektor RJ45',
            brand_model: 'AMP',
            category: 'Aksesoris',
            quantity: 200,
          },
        ],
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);
      // inbound create
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 16 }, []]);
      // 3 asset inserts
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 106 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 107 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 108 }, []]);

      const result = await assetService.recordInbound(data);

      expect(result.assets).toHaveLength(3);
      expect(result.totalItems).toBe(3);
      expect(result.assets[0].category).toBe('PerangkatAktif');
      expect(result.assets[1].category).toBe('Kabel');
      expect(result.assets[2].category).toBe('Aksesoris');
    });

    it('should auto-generate sequential SNs for multiple items without SN', async () => {
      const data = {
        ...validInboundData,
        items: [
          { product_name: 'Item A', category: 'Aksesoris', quantity: 10 },
          { product_name: 'Item B', category: 'Aksesoris', quantity: 20 },
        ],
      };

      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 17 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 109 }, []]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 110 }, []]);

      const result = await assetService.recordInbound(data);

      // Both should have auto-generated SNs with sequential numbers
      const sn1 = result.assets[0].serial_number;
      const sn2 = result.assets[1].serial_number;
      expect(sn1).toMatch(/^UBG-\d{8}-000001$/);
      expect(sn2).toMatch(/^UBG-\d{8}-000002$/);
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.recordInbound(validInboundData)).rejects.toMatchObject({
        message: 'Branch not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when branch is inactive', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Inactive' }], []]);

      await expect(assetService.recordInbound(validInboundData)).rejects.toMatchObject({
        message: 'Cannot record inbound to an inactive branch.',
        statusCode: 400,
      });
    });

    it('should throw 400 when items array is empty', async () => {
      const data = { ...validInboundData, items: [] };
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);

      await expect(assetService.recordInbound(data)).rejects.toMatchObject({
        message: 'At least one item is required for inbound.',
        statusCode: 400,
      });
    });

    it('should throw 400 for invalid category', async () => {
      const data = {
        ...validInboundData,
        items: [{ product_name: 'Test', category: 'InvalidCategory' }],
      };
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);

      await expect(assetService.recordInbound(data)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when product_name is missing', async () => {
      const data = {
        ...validInboundData,
        items: [{ category: 'PerangkatAktif', serial_number: 'SN-001' }],
      };
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);

      await expect(assetService.recordInbound(data)).rejects.toMatchObject({
        message: 'Product name is required for each item.',
        statusCode: 400,
      });
    });

    it('should rollback transaction on error', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, name: 'Branch A', status: 'Active' }], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);
      // inbound create succeeds
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 18 }, []]);
      // asset insert fails
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.recordInbound(validInboundData)).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('getInboundById', () => {
    it('should return inbound with associated assets', async () => {
      const mockInbound = { id: 1, invoice_number: 'INV-001', branch_id: 1 };
      const mockAssets = [
        { id: 10, serial_number: 'SN-001', inbound_id: 1 },
        { id: 11, serial_number: 'SN-002', inbound_id: 1 },
      ];

      // findById for inbound
      appPool.execute.mockResolvedValueOnce([[mockInbound], []]);
      // findByInboundId for assets
      appPool.execute.mockResolvedValueOnce([mockAssets, []]);

      const result = await assetService.getInboundById(1);

      expect(result.id).toBe(1);
      expect(result.invoice_number).toBe('INV-001');
      expect(result.assets).toHaveLength(2);
    });

    it('should throw 404 when inbound not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.getInboundById(999)).rejects.toMatchObject({
        message: 'Asset inbound record not found.',
        statusCode: 404,
      });
    });
  });

  describe('getAssetById', () => {
    it('should return asset when found', async () => {
      const mockAsset = { id: 1, serial_number: 'SN-001', status: 'Tersedia' };
      appPool.execute.mockResolvedValueOnce([[mockAsset], []]);

      const result = await assetService.getAssetById(1);

      expect(result).toEqual(mockAsset);
    });

    it('should throw 404 when asset not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.getAssetById(999)).rejects.toMatchObject({
        message: 'Asset not found.',
        statusCode: 404,
      });
    });
  });

  describe('getStockSummary', () => {
    it('should return stock summary for a branch', async () => {
      const mockBranch = { id: 1, name: 'Branch A', status: 'Active' };
      const mockSummary = [
        { category: 'PerangkatAktif', status: 'Tersedia', count: 10, total_quantity: 10 },
        { category: 'Kabel', status: 'Tersedia', count: 5, total_quantity: 2500 },
        { category: 'Aksesoris', status: 'Tersedia', count: 8, total_quantity: 800 },
      ];

      // findById for branch
      appPool.execute.mockResolvedValueOnce([[mockBranch], []]);
      // getStockSummary
      appPool.execute.mockResolvedValueOnce([mockSummary, []]);

      const result = await assetService.getStockSummary(1);

      expect(result.branch_id).toBe(1);
      expect(result.branch_name).toBe('Branch A');
      expect(result.stock).toHaveLength(3);
    });

    it('should throw 404 when branch not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.getStockSummary(999)).rejects.toMatchObject({
        message: 'Branch not found.',
        statusCode: 404,
      });
    });
  });
});


describe('Asset Service - Outbound and Installation', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    appPool.getConnection.mockResolvedValue(mockConnection);
  });

  describe('requestOutbound', () => {
    it('should validate stock availability and return request details', async () => {
      // getAvailableQuantity for Kabel
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 500 }], []]);

      const result = await assetService.requestOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'Kabel', quantity: 100 }],
        notes: 'Installation for customer #42',
      });

      expect(result.branch_id).toBe(1);
      expect(result.teknisi_id).toBe(5);
      expect(result.status).toBe('Pending');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].category).toBe('Kabel');
      expect(result.items[0].quantity).toBe(100);
    });

    it('should throw INSUFFICIENT_STOCK when not enough stock', async () => {
      // getAvailableQuantity returns less than requested
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 50 }], []]);

      await expect(assetService.requestOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'Kabel', quantity: 100 }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_STOCK',
      });
    });

    it('should throw when items array is empty', async () => {
      await expect(assetService.requestOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw for invalid category', async () => {
      await expect(assetService.requestOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'InvalidCat', quantity: 1 }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should validate specific asset_id when provided', async () => {
      // getAvailableQuantity
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 5 }], []]);
      // findById for specific asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Tersedia', branch_id: 1, category: 'PerangkatAktif',
      }], []]);

      const result = await assetService.requestOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'PerangkatAktif', quantity: 1, asset_id: 10 }],
      });

      expect(result.items[0].asset_id).toBe(10);
    });

    it('should throw when specific asset is not available', async () => {
      // getAvailableQuantity
      appPool.execute.mockResolvedValueOnce([[{ total_quantity: 5 }], []]);
      // findById - asset is Rusak
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Rusak', branch_id: 1, category: 'PerangkatAktif',
      }], []]);

      await expect(assetService.requestOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'PerangkatAktif', quantity: 1, asset_id: 10 }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('approveOutbound', () => {
    it('should approve outbound for PerangkatAktif and update status to DibawaTeknisi', async () => {
      // findAvailable for PerangkatAktif
      appPool.execute.mockResolvedValueOnce([[
        { id: 10, serial_number: 'SN-001', status: 'Tersedia', remaining_quantity: 1, category: 'PerangkatAktif' },
      ], []]);

      const result = await assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'PerangkatAktif', quantity: 1 }],
        approved_by: 2,
      });

      expect(result.status).toBe('Approved');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].serial_number).toBe('SN-001');
      expect(result.items[0].quantity).toBe(1);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should approve outbound for Kabel deducting meters from remaining_quantity', async () => {
      // findAvailable for Kabel - one roll with 500 meters
      appPool.execute.mockResolvedValueOnce([[
        { id: 20, serial_number: 'UBG-20240101-000001', status: 'Tersedia', remaining_quantity: 500, category: 'Kabel' },
      ], []]);

      const result = await assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'Kabel', quantity: 100 }],
        approved_by: 2,
      });

      expect(result.status).toBe('Approved');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(100);
      // Should have called updateRemainingQuantity (partial deduction)
      expect(mockConnection.execute).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should consume entire asset when full quantity is deducted', async () => {
      // findAvailable for Aksesoris - one pack with exactly 50 pieces
      appPool.execute.mockResolvedValueOnce([[
        { id: 30, serial_number: 'UBG-20240101-000002', status: 'Tersedia', remaining_quantity: 50, category: 'Aksesoris' },
      ], []]);

      const result = await assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'Aksesoris', quantity: 50 }],
        approved_by: 2,
      });

      expect(result.status).toBe('Approved');
      expect(result.items[0].quantity).toBe(50);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should deduct from multiple assets when one is not enough', async () => {
      // findAvailable for Kabel - two rolls
      appPool.execute.mockResolvedValueOnce([[
        { id: 20, serial_number: 'SN-KABEL-1', status: 'Tersedia', remaining_quantity: 200, category: 'Kabel' },
        { id: 21, serial_number: 'SN-KABEL-2', status: 'Tersedia', remaining_quantity: 300, category: 'Kabel' },
      ], []]);

      const result = await assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'Kabel', quantity: 350 }],
        approved_by: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].quantity).toBe(200); // full first roll
      expect(result.items[1].quantity).toBe(150); // partial second roll
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw INSUFFICIENT_STOCK when not enough available', async () => {
      // findAvailable returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'PerangkatAktif', quantity: 1 }],
        approved_by: 2,
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_STOCK',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should throw when specific asset_id is not available', async () => {
      // findById for specific asset - not available
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, status: 'Rusak', branch_id: 1, category: 'PerangkatAktif',
      }], []]);

      await expect(assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'PerangkatAktif', quantity: 1, asset_id: 10 }],
        approved_by: 2,
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_STOCK',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      // findAvailable throws
      appPool.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.approveOutbound({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'Kabel', quantity: 100 }],
        approved_by: 2,
      })).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('recordInstallation', () => {
    it('should record installation and update asset to Terpasang', async () => {
      // findById for asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'DibawaTeknisi',
        assigned_teknisi_id: 5, category: 'PerangkatAktif', quantity: 1,
      }], []]);

      const result = await assetService.recordInstallation({
        teknisi_id: 5,
        customer_id: 42,
        branch_id: 1,
        items: [{ asset_id: 10, quantity_used: 1 }],
      });

      expect(result.status).toBe('Installed');
      expect(result.customer_id).toBe(42);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].customer_id).toBe(42);
      expect(result.items[0].quantity_used).toBe(1);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should record cable meters used in installation', async () => {
      // findById for cable asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 20, serial_number: 'SN-KABEL-1', status: 'DibawaTeknisi',
        assigned_teknisi_id: 5, category: 'Kabel', quantity: 200,
      }], []]);

      const result = await assetService.recordInstallation({
        teknisi_id: 5,
        customer_id: 42,
        branch_id: 1,
        items: [{ asset_id: 20, quantity_used: 75 }],
      });

      expect(result.items[0].quantity_used).toBe(75);
      expect(result.items[0].category).toBe('Kabel');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw when asset is not in DibawaTeknisi status', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'Tersedia',
        assigned_teknisi_id: null, category: 'PerangkatAktif',
      }], []]);

      await expect(assetService.recordInstallation({
        teknisi_id: 5,
        customer_id: 42,
        branch_id: 1,
        items: [{ asset_id: 10, quantity_used: 1 }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should throw when asset is assigned to different teknisi', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'DibawaTeknisi',
        assigned_teknisi_id: 99, category: 'PerangkatAktif',
      }], []]);

      await expect(assetService.recordInstallation({
        teknisi_id: 5,
        customer_id: 42,
        branch_id: 1,
        items: [{ asset_id: 10, quantity_used: 1 }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should throw when customer_id is missing', async () => {
      await expect(assetService.recordInstallation({
        teknisi_id: 5,
        customer_id: null,
        branch_id: 1,
        items: [{ asset_id: 10, quantity_used: 1 }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw when items array is empty', async () => {
      await expect(assetService.recordInstallation({
        teknisi_id: 5,
        customer_id: 42,
        branch_id: 1,
        items: [],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('processReturn', () => {
    it('should process return with Tersedia condition (functional)', async () => {
      // findById for asset
      appPool.execute.mockResolvedValueOnce([[{
        id: 20, serial_number: 'SN-KABEL-1', status: 'DibawaTeknisi',
        assigned_teknisi_id: 5, category: 'Kabel', quantity: 200,
      }], []]);

      const result = await assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 20, condition: 'Tersedia', remaining_quantity: 125 }],
      });

      expect(result.status).toBe('Returned');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].condition).toBe('Tersedia');
      expect(result.items[0].remaining_quantity).toBe(125);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should process return with Rusak condition (damaged)', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'DibawaTeknisi',
        assigned_teknisi_id: 5, category: 'PerangkatAktif', quantity: 1,
      }], []]);

      const result = await assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 10, condition: 'Rusak' }],
      });

      expect(result.items[0].condition).toBe('Rusak');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should throw for invalid condition', async () => {
      await expect(assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 10, condition: 'InvalidCondition' }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should throw when asset is not in DibawaTeknisi status', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'Tersedia',
        assigned_teknisi_id: null, category: 'PerangkatAktif',
      }], []]);

      await expect(assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 10, condition: 'Tersedia' }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should throw when asset is assigned to different teknisi', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'DibawaTeknisi',
        assigned_teknisi_id: 99, category: 'PerangkatAktif',
      }], []]);

      await expect(assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 10, condition: 'Tersedia' }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should use asset.quantity as default remaining_quantity when not specified', async () => {
      appPool.execute.mockResolvedValueOnce([[{
        id: 10, serial_number: 'SN-001', status: 'DibawaTeknisi',
        assigned_teknisi_id: 5, category: 'PerangkatAktif', quantity: 1,
      }], []]);

      const result = await assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 10, condition: 'Tersedia' }],
      });

      expect(result.items[0].remaining_quantity).toBe(1);
    });

    it('should throw when items array is empty', async () => {
      await expect(assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should rollback on error', async () => {
      appPool.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(assetService.processReturn({
        teknisi_id: 5,
        branch_id: 1,
        items: [{ asset_id: 10, condition: 'Tersedia' }],
      })).rejects.toThrow('DB error');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});
