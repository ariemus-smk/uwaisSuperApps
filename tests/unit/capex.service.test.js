/**
 * Unit tests for CAPEX service.
 * Tests RAB calculation, stock reservation, PO generation, and approval workflow.
 *
 * Validates: Requirements 37.2, 37.4, 37.5
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => {
  return {
    appPool: {
      execute: jest.fn().mockResolvedValue([[], []]),
      query: jest.fn().mockResolvedValue([[], []]),
      getConnection: jest.fn(),
    },
  };
});

jest.mock('../../src/models/capexProject.model');
jest.mock('../../src/models/asset.model');

const { appPool } = require('../../src/config/database');
const capexProjectModel = require('../../src/models/capexProject.model');
const assetModel = require('../../src/models/asset.model');
const capexService = require('../../src/services/capex.service');
const { ERROR_CODE, CAPEX_PROJECT_STATUS } = require('../../src/utils/constants');

describe('CAPEX Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRAB', () => {
    it('should calculate total RAB from materials with provided unit_price', async () => {
      const materials = [
        { product_name: 'Router Mikrotik', category: 'PerangkatAktif', quantity: 5, unit_price: 500000 },
        { product_name: 'Kabel FO 1km', category: 'Kabel', quantity: 10, unit_price: 200000 },
      ];

      const result = await capexService.calculateRAB(materials, 1);

      expect(result.total).toBe(5 * 500000 + 10 * 200000);
      expect(result.materials).toHaveLength(2);
      expect(result.materials[0].subtotal).toBe(2500000);
      expect(result.materials[1].subtotal).toBe(2000000);
    });

    it('should look up prices from DB when unit_price not provided (falls back to 0 if not found)', async () => {
      // First call: branch-scoped lookup returns no results
      appPool.execute.mockResolvedValueOnce([[{ avg_qty: null, count: 0 }], []]);
      // Second call: global lookup returns no results
      appPool.execute.mockResolvedValueOnce([[{ count: 0 }], []]);

      const materials = [
        { product_name: 'Unknown Product', category: 'Aksesoris', quantity: 3 },
      ];

      const result = await capexService.calculateRAB(materials, 1);

      expect(result.materials[0].unit_price).toBe(0);
      expect(result.materials[0].subtotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should validate material entries (require product_name and positive quantity)', async () => {
      const invalidMaterials = [
        { product_name: '', category: 'Aksesoris', quantity: 5, unit_price: 100 },
      ];

      await expect(capexService.calculateRAB(invalidMaterials, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });

      const zeroQtyMaterials = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity: 0, unit_price: 100 },
      ];

      await expect(capexService.calculateRAB(zeroQtyMaterials, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    });

    it('should default category to Aksesoris when not provided', async () => {
      const materials = [
        { product_name: 'Connector RJ45', quantity: 100, unit_price: 5000 },
      ];

      const result = await capexService.calculateRAB(materials, 1);

      expect(result.materials[0].category).toBe('Aksesoris');
    });

    it('should calculate correct subtotals per item', async () => {
      const materials = [
        { product_name: 'ODP 8 Port', category: 'Aksesoris', quantity: 4, unit_price: 350000 },
        { product_name: 'Splitter 1:8', category: 'Aksesoris', quantity: 8, unit_price: 75000 },
        { product_name: 'Patch Cord', category: 'Aksesoris', quantity: 20, unit_price: 15000 },
      ];

      const result = await capexService.calculateRAB(materials, 1);

      expect(result.materials[0].subtotal).toBe(4 * 350000);
      expect(result.materials[1].subtotal).toBe(8 * 75000);
      expect(result.materials[2].subtotal).toBe(20 * 15000);
      expect(result.total).toBe(1400000 + 600000 + 300000);
    });
  });

  describe('reserveStock', () => {
    it('should reserve available assets matching product_name using FIFO', async () => {
      assetModel.findAvailable.mockResolvedValue([
        { id: 10, product_name: 'Router Mikrotik', remaining_quantity: 3 },
        { id: 11, product_name: 'Router Mikrotik', remaining_quantity: 5 },
      ]);
      assetModel.updateStatus.mockResolvedValue({ affectedRows: 1 });
      assetModel.updateRemainingQuantity.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.reserveStock(1, 'Router Mikrotik', 'PerangkatAktif', 5, 100);

      expect(result.reserved).toBe(5);
      expect(result.assetIds).toContain(10);
      expect(result.assetIds).toContain(11);
      // First asset fully allocated (3 of 3)
      expect(assetModel.updateStatus).toHaveBeenCalledWith(10, 'DalamPengiriman');
      // Second asset partially allocated (2 of 5)
      expect(assetModel.updateRemainingQuantity).toHaveBeenCalledWith(11, 3);
    });

    it('should mark fully allocated assets as DalamPengiriman', async () => {
      assetModel.findAvailable.mockResolvedValue([
        { id: 20, product_name: 'Connector RJ45', remaining_quantity: 10 },
      ]);
      assetModel.updateStatus.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.reserveStock(1, 'Connector RJ45', 'Aksesoris', 10, 100);

      expect(result.reserved).toBe(10);
      expect(assetModel.updateStatus).toHaveBeenCalledWith(20, 'DalamPengiriman');
      expect(assetModel.updateRemainingQuantity).not.toHaveBeenCalled();
    });

    it('should reduce remaining_quantity for partially allocated assets', async () => {
      assetModel.findAvailable.mockResolvedValue([
        { id: 30, product_name: 'Kabel FO', remaining_quantity: 100 },
      ]);
      assetModel.updateRemainingQuantity.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.reserveStock(1, 'Kabel FO', 'Kabel', 40, 100);

      expect(result.reserved).toBe(40);
      expect(assetModel.updateRemainingQuantity).toHaveBeenCalledWith(30, 60);
      expect(assetModel.updateStatus).not.toHaveBeenCalled();
    });

    it('should return reserved count and asset IDs', async () => {
      assetModel.findAvailable.mockResolvedValue([
        { id: 40, product_name: 'Splitter', remaining_quantity: 2 },
        { id: 41, product_name: 'Splitter', remaining_quantity: 3 },
      ]);
      assetModel.updateStatus.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.reserveStock(1, 'Splitter', 'Aksesoris', 5, 100);

      expect(result.reserved).toBe(5);
      expect(result.assetIds).toEqual([40, 41]);
    });

    it('should handle case where no matching assets exist', async () => {
      assetModel.findAvailable.mockResolvedValue([
        { id: 50, product_name: 'Other Product', remaining_quantity: 10 },
      ]);

      const result = await capexService.reserveStock(1, 'Router Mikrotik', 'PerangkatAktif', 5, 100);

      expect(result.reserved).toBe(0);
      expect(result.assetIds).toEqual([]);
    });
  });

  describe('generatePO', () => {
    it('should generate a draft PO with correct total_amount', async () => {
      const missingItems = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity_needed: 3, unit_price: 500000, subtotal: 1500000 },
        { product_name: 'Kabel FO', category: 'Kabel', quantity_needed: 5, unit_price: 200000, subtotal: 1000000 },
      ];

      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        materials_list: JSON.stringify([
          { product_name: 'Router', category: 'PerangkatAktif', quantity: 5, unit_price: 500000, subtotal: 2500000 },
          { product_name: 'Kabel FO', category: 'Kabel', quantity: 10, unit_price: 200000, subtotal: 2000000 },
        ]),
      });
      capexProjectModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.generatePO(1, 1, missingItems);

      expect(result.total_amount).toBe(2500000);
      expect(result.status).toBe('Draft');
      expect(result.capex_project_id).toBe(1);
    });

    it('should update project materials_list with po_quantity and po_status', async () => {
      const missingItems = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity_needed: 2, unit_price: 500000, subtotal: 1000000 },
      ];

      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        materials_list: JSON.stringify([
          { product_name: 'Router', category: 'PerangkatAktif', quantity: 5, unit_price: 500000, subtotal: 2500000 },
          { product_name: 'Kabel FO', category: 'Kabel', quantity: 10, unit_price: 200000, subtotal: 2000000 },
        ]),
      });
      capexProjectModel.update.mockResolvedValue({ affectedRows: 1 });

      await capexService.generatePO(1, 1, missingItems);

      const updateCall = capexProjectModel.update.mock.calls[0];
      expect(updateCall[0]).toBe(1);
      const updatedMaterials = JSON.parse(updateCall[1].materials_list);
      const routerItem = updatedMaterials.find((m) => m.product_name === 'Router');
      expect(routerItem.po_quantity).toBe(2);
      expect(routerItem.po_status).toBe('Draft');
      // Kabel FO should not have PO fields
      const kabelItem = updatedMaterials.find((m) => m.product_name === 'Kabel FO');
      expect(kabelItem.po_quantity).toBeUndefined();
    });

    it('should include all missing items in the PO', async () => {
      const missingItems = [
        { product_name: 'Item A', category: 'Aksesoris', quantity_needed: 1, unit_price: 100, subtotal: 100 },
        { product_name: 'Item B', category: 'Aksesoris', quantity_needed: 2, unit_price: 200, subtotal: 400 },
        { product_name: 'Item C', category: 'Kabel', quantity_needed: 3, unit_price: 300, subtotal: 900 },
      ];

      capexProjectModel.findById.mockResolvedValue({
        id: 2,
        materials_list: JSON.stringify([
          { product_name: 'Item A', category: 'Aksesoris', quantity: 5, unit_price: 100, subtotal: 500 },
          { product_name: 'Item B', category: 'Aksesoris', quantity: 5, unit_price: 200, subtotal: 1000 },
          { product_name: 'Item C', category: 'Kabel', quantity: 5, unit_price: 300, subtotal: 1500 },
        ]),
      });
      capexProjectModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.generatePO(2, 1, missingItems);

      expect(result.items).toHaveLength(3);
      expect(result.items[0].product_name).toBe('Item A');
      expect(result.items[1].product_name).toBe('Item B');
      expect(result.items[2].product_name).toBe('Item C');
      expect(result.total_amount).toBe(100 + 400 + 900);
    });
  });

  describe('processStockForProject', () => {
    it('should reserve stock when sufficient quantity available', async () => {
      const materialsList = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity: 3, unit_price: 500000 },
      ];

      assetModel.getAvailableQuantity.mockResolvedValue(10);
      assetModel.findAvailable.mockResolvedValue([
        { id: 1, product_name: 'Router', remaining_quantity: 5 },
      ]);
      assetModel.updateRemainingQuantity.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.processStockForProject(1, 1, materialsList);

      expect(result.reserved).toHaveLength(1);
      expect(result.reserved[0].product_name).toBe('Router');
      expect(result.reserved[0].quantity_reserved).toBe(3);
      expect(result.purchaseOrder).toBeNull();
    });

    it('should generate PO for items with insufficient stock', async () => {
      const materialsList = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity: 10, unit_price: 500000 },
      ];

      // No stock available
      assetModel.getAvailableQuantity.mockResolvedValue(0);

      // For PO generation
      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        materials_list: JSON.stringify(materialsList),
      });
      capexProjectModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.processStockForProject(1, 1, materialsList);

      expect(result.reserved).toHaveLength(0);
      expect(result.purchaseOrder).not.toBeNull();
      expect(result.purchaseOrder.items[0].quantity_needed).toBe(10);
      expect(result.purchaseOrder.total_amount).toBe(5000000);
    });

    it('should partially reserve available stock and generate PO for deficit', async () => {
      const materialsList = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity: 10, unit_price: 500000 },
      ];

      // Only 4 available
      assetModel.getAvailableQuantity.mockResolvedValue(4);
      assetModel.findAvailable.mockResolvedValue([
        { id: 1, product_name: 'Router', remaining_quantity: 4 },
      ]);
      assetModel.updateStatus.mockResolvedValue({ affectedRows: 1 });

      // For PO generation
      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        materials_list: JSON.stringify(materialsList),
      });
      capexProjectModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.processStockForProject(1, 1, materialsList);

      // Should reserve 4
      expect(result.reserved).toHaveLength(1);
      expect(result.reserved[0].quantity_reserved).toBe(4);
      // Should generate PO for deficit of 6
      expect(result.purchaseOrder).not.toBeNull();
      expect(result.purchaseOrder.items[0].quantity_needed).toBe(6);
    });

    it('should handle mixed scenarios (some items fully available, some not)', async () => {
      const materialsList = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity: 3, unit_price: 500000 },
        { product_name: 'Kabel FO', category: 'Kabel', quantity: 100, unit_price: 10000 },
      ];

      // First item: sufficient stock
      assetModel.getAvailableQuantity
        .mockResolvedValueOnce(5) // Router: 5 available >= 3 needed
        .mockResolvedValueOnce(50); // Kabel: 50 available < 100 needed

      // Reserve Router
      assetModel.findAvailable
        .mockResolvedValueOnce([{ id: 1, product_name: 'Router', remaining_quantity: 5 }])
        .mockResolvedValueOnce([{ id: 2, product_name: 'Kabel FO', remaining_quantity: 50 }]);

      assetModel.updateRemainingQuantity.mockResolvedValue({ affectedRows: 1 });
      assetModel.updateStatus.mockResolvedValue({ affectedRows: 1 });

      // For PO generation
      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        materials_list: JSON.stringify(materialsList),
      });
      capexProjectModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.processStockForProject(1, 1, materialsList);

      // Router fully reserved
      expect(result.reserved.find((r) => r.product_name === 'Router')).toBeDefined();
      // Kabel partially reserved + PO for deficit
      expect(result.reserved.find((r) => r.product_name === 'Kabel FO')).toBeDefined();
      expect(result.purchaseOrder).not.toBeNull();
      expect(result.purchaseOrder.items[0].product_name).toBe('Kabel FO');
      expect(result.purchaseOrder.items[0].quantity_needed).toBe(50);
    });
  });

  describe('approve', () => {
    it('should reject approval if project not in PendingApproval status', async () => {
      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        status: CAPEX_PROJECT_STATUS.DRAFT,
        materials_list: '[]',
      });

      await expect(capexService.approve(1, 10)).rejects.toMatchObject({
        statusCode: 400,
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      });
    });

    it('should process stock and generate PO on approval', async () => {
      const materialsList = [
        { product_name: 'Router', category: 'PerangkatAktif', quantity: 2, unit_price: 500000, subtotal: 1000000 },
      ];

      capexProjectModel.findById.mockResolvedValue({
        id: 1,
        status: CAPEX_PROJECT_STATUS.PENDING_APPROVAL,
        branch_id: 1,
        materials_list: JSON.stringify(materialsList),
      });
      capexProjectModel.updateStatus.mockResolvedValue({ affectedRows: 1 });

      // Stock sufficient
      assetModel.getAvailableQuantity.mockResolvedValue(5);
      assetModel.findAvailable.mockResolvedValue([
        { id: 1, product_name: 'Router', remaining_quantity: 5 },
      ]);
      assetModel.updateRemainingQuantity.mockResolvedValue({ affectedRows: 1 });

      const result = await capexService.approve(1, 10);

      expect(result.status).toBe(CAPEX_PROJECT_STATUS.APPROVED);
      expect(result.approved_by).toBe(10);
      expect(result.stock_reservation).toBeDefined();
      expect(capexProjectModel.updateStatus).toHaveBeenCalledWith(
        1,
        CAPEX_PROJECT_STATUS.APPROVED,
        { approved_by: 10 }
      );
    });
  });
});
