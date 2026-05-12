/**
 * Unit tests for Customer model with lifecycle state machine.
 * Tests CRUD operations and status transition validation.
 */

jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

const { appPool } = require('../helpers/dbMock');
const { resetMocks } = require('../helpers/dbMock');
const customerModel = require('../../src/models/customer.model');
const { CUSTOMER_STATUS } = require('../../src/utils/constants');

describe('Customer Model', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('isValidTransition', () => {
    it('should allow Prospek -> Instalasi', () => {
      expect(customerModel.isValidTransition('Prospek', 'Instalasi')).toBe(true);
    });

    it('should allow Instalasi -> Aktif', () => {
      expect(customerModel.isValidTransition('Instalasi', 'Aktif')).toBe(true);
    });

    it('should allow Aktif -> Isolir', () => {
      expect(customerModel.isValidTransition('Aktif', 'Isolir')).toBe(true);
    });

    it('should allow Isolir -> Aktif', () => {
      expect(customerModel.isValidTransition('Isolir', 'Aktif')).toBe(true);
    });

    it('should allow Aktif -> Terminated', () => {
      expect(customerModel.isValidTransition('Aktif', 'Terminated')).toBe(true);
    });

    it('should allow Isolir -> Terminated', () => {
      expect(customerModel.isValidTransition('Isolir', 'Terminated')).toBe(true);
    });

    it('should reject Prospek -> Aktif (skip Instalasi)', () => {
      expect(customerModel.isValidTransition('Prospek', 'Aktif')).toBe(false);
    });

    it('should reject Terminated -> any status', () => {
      expect(customerModel.isValidTransition('Terminated', 'Prospek')).toBe(false);
      expect(customerModel.isValidTransition('Terminated', 'Aktif')).toBe(false);
      expect(customerModel.isValidTransition('Terminated', 'Isolir')).toBe(false);
    });

    it('should reject Instalasi -> Isolir (must go through Aktif)', () => {
      expect(customerModel.isValidTransition('Instalasi', 'Isolir')).toBe(false);
    });

    it('should reject Prospek -> Terminated', () => {
      expect(customerModel.isValidTransition('Prospek', 'Terminated')).toBe(false);
    });

    it('should reject unknown status', () => {
      expect(customerModel.isValidTransition('Unknown', 'Aktif')).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return [Instalasi] for Prospek', () => {
      expect(customerModel.getAllowedTransitions('Prospek')).toEqual(['Instalasi']);
    });

    it('should return [Aktif] for Instalasi', () => {
      expect(customerModel.getAllowedTransitions('Instalasi')).toEqual(['Aktif']);
    });

    it('should return [Isolir, Terminated] for Aktif', () => {
      expect(customerModel.getAllowedTransitions('Aktif')).toEqual(['Isolir', 'Terminated']);
    });

    it('should return [Aktif, Terminated] for Isolir', () => {
      expect(customerModel.getAllowedTransitions('Isolir')).toEqual(['Aktif', 'Terminated']);
    });

    it('should return [] for Terminated', () => {
      expect(customerModel.getAllowedTransitions('Terminated')).toEqual([]);
    });

    it('should return [] for unknown status', () => {
      expect(customerModel.getAllowedTransitions('Unknown')).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return customer when found', async () => {
      const mockCustomer = { id: 1, full_name: 'John Doe', lifecycle_status: 'Prospek' };
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      const result = await customerModel.findById(1);
      expect(result).toEqual(mockCustomer);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM customers WHERE id = ? LIMIT 1',
        [1]
      );
    });

    it('should return null when not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await customerModel.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findByKtp', () => {
    it('should return customer when KTP matches', async () => {
      const mockCustomer = { id: 1, ktp_number: '3201010101010001' };
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      const result = await customerModel.findByKtp('3201010101010001');
      expect(result).toEqual(mockCustomer);
    });

    it('should return null when KTP not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await customerModel.findByKtp('0000000000000000');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create customer with initial status Prospek', async () => {
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const data = {
        full_name: 'John Doe',
        ktp_number: '3201010101010001',
        whatsapp_number: '081234567890',
        address: 'Jl. Test No. 1',
        branch_id: 1,
        registered_by: 2,
      };

      const result = await customerModel.create(data);

      expect(result.id).toBe(1);
      expect(result.lifecycle_status).toBe(CUSTOMER_STATUS.PROSPEK);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO customers'),
        expect.arrayContaining(['John Doe', '3201010101010001'])
      );
    });

    it('should handle optional fields as null', async () => {
      appPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);

      const data = {
        full_name: 'Jane Doe',
        ktp_number: '3201010101010002',
        whatsapp_number: '081234567891',
        address: 'Jl. Test No. 2',
        branch_id: 1,
      };

      const result = await customerModel.create(data);

      expect(result.id).toBe(2);
      expect(result.lifecycle_status).toBe('Prospek');
    });
  });

  describe('update', () => {
    it('should update allowed fields', async () => {
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await customerModel.update(1, { full_name: 'Updated Name' });
      expect(result.affectedRows).toBe(1);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers SET'),
        expect.arrayContaining(['Updated Name', 1])
      );
    });

    it('should return affectedRows 0 when no valid fields provided', async () => {
      const result = await customerModel.update(1, { ktp_number: 'should-not-update' });
      expect(result.affectedRows).toBe(0);
      expect(appPool.execute).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update status for valid transition and create audit log', async () => {
      const mockCustomer = { id: 1, lifecycle_status: 'Prospek' };
      // First call: findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      const mockConnection = appPool._mockConnection;
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);

      const result = await customerModel.updateStatus(1, 'Instalasi', 5);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('Prospek');
      expect(result.new_status).toBe('Instalasi');
      expect(result.actor_id).toBe(5);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should throw error for invalid transition', async () => {
      const mockCustomer = { id: 1, lifecycle_status: 'Prospek' };
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      await expect(
        customerModel.updateStatus(1, 'Aktif', 5)
      ).rejects.toThrow("Invalid status transition from 'Prospek' to 'Aktif'");
    });

    it('should throw error with INVALID_STATUS_TRANSITION code', async () => {
      const mockCustomer = { id: 1, lifecycle_status: 'Terminated' };
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      try {
        await customerModel.updateStatus(1, 'Aktif', 5);
        fail('Should have thrown');
      } catch (err) {
        expect(err.code).toBe('INVALID_STATUS_TRANSITION');
        expect(err.details.current_status).toBe('Terminated');
        expect(err.details.allowed_transitions).toEqual([]);
      }
    });

    it('should throw error when customer not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        customerModel.updateStatus(999, 'Instalasi', 5)
      ).rejects.toThrow('Customer not found');
    });

    it('should rollback on database error during transaction', async () => {
      const mockCustomer = { id: 1, lifecycle_status: 'Prospek' };
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      const mockConnection = appPool._mockConnection;
      mockConnection.execute.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        customerModel.updateStatus(1, 'Instalasi', 5)
      ).rejects.toThrow('DB error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated customers', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 2 }], []])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }], []]);

      const result = await customerModel.findAll({ page: 1, limit: 20 });

      expect(result.customers).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by branch_id', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([[{ id: 1, branch_id: 3 }], []]);

      const result = await customerModel.findAll({ branch_id: 3 });

      expect(result.total).toBe(1);
      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('branch_id = ?'),
        expect.arrayContaining([3])
      );
    });

    it('should filter by lifecycle_status', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 5 }], []])
        .mockResolvedValueOnce([[{ id: 1 }], []]);

      await customerModel.findAll({ lifecycle_status: 'Aktif' });

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('lifecycle_status = ?'),
        expect.arrayContaining(['Aktif'])
      );
    });

    it('should support search by name or KTP', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([[{ id: 1 }], []]);

      await customerModel.findAll({ search: 'John' });

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('full_name LIKE ?'),
        expect.arrayContaining(['%John%', '%John%'])
      );
    });
  });
});
