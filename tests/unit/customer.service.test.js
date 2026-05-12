/**
 * Unit tests for customer service.
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
    getConnection: jest.fn(),
  },
  radiusPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/customer.model');
jest.mock('../../src/models/customerAuditLog.model');
jest.mock('../../src/models/subscription.model');
jest.mock('../../src/models/downPayment.model');
jest.mock('../../src/models/odp.model');
jest.mock('../../src/services/branch.service');
jest.mock('../../src/services/coverage.service');
jest.mock('../../src/services/billing.service');
jest.mock('../../src/services/radius.service');
jest.mock('../../src/services/coa.service');
jest.mock('../../src/utils/pppoeGenerator');

const customerModel = require('../../src/models/customer.model');
const customerAuditLog = require('../../src/models/customerAuditLog.model');
const subscriptionModel = require('../../src/models/subscription.model');
const downPaymentModel = require('../../src/models/downPayment.model');
const odpModel = require('../../src/models/odp.model');
const branchService = require('../../src/services/branch.service');
const coverageService = require('../../src/services/coverage.service');
const billingService = require('../../src/services/billing.service');
const radiusService = require('../../src/services/radius.service');
const coaService = require('../../src/services/coa.service');
const { generatePPPoECredentials, createRadcheckUniquenessChecker } = require('../../src/utils/pppoeGenerator');
const customerService = require('../../src/services/customer.service');

describe('Customer Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listCustomers', () => {
    it('should return paginated customers', async () => {
      const mockCustomers = [
        { id: 1, full_name: 'John Doe', branch_id: 1 },
        { id: 2, full_name: 'Jane Doe', branch_id: 1 },
      ];
      customerModel.findAll.mockResolvedValueOnce({ customers: mockCustomers, total: 2 });

      const result = await customerService.listCustomers({}, { branch_id: null });

      expect(result.customers).toEqual(mockCustomers);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should apply branch scoping when user has branch_id', async () => {
      customerModel.findAll.mockResolvedValueOnce({ customers: [], total: 0 });

      await customerService.listCustomers({}, { branch_id: 5 });

      expect(customerModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ branch_id: 5 })
      );
    });

    it('should not apply branch filter when user has no branch_id (Superadmin)', async () => {
      customerModel.findAll.mockResolvedValueOnce({ customers: [], total: 0 });

      await customerService.listCustomers({}, { branch_id: null });

      expect(customerModel.findAll).toHaveBeenCalledWith(
        expect.not.objectContaining({ branch_id: expect.anything() })
      );
    });

    it('should pass lifecycle_status and search filters', async () => {
      customerModel.findAll.mockResolvedValueOnce({ customers: [], total: 0 });

      await customerService.listCustomers(
        { lifecycle_status: 'Aktif', search: 'John' },
        { branch_id: null }
      );

      expect(customerModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle_status: 'Aktif', search: 'John' })
      );
    });
  });

  describe('getCustomerById', () => {
    it('should return customer when found', async () => {
      const mockCustomer = { id: 1, full_name: 'John Doe' };
      customerModel.findById.mockResolvedValueOnce(mockCustomer);

      const result = await customerService.getCustomerById(1);

      expect(result).toEqual(mockCustomer);
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(customerService.getCustomerById(999)).rejects.toMatchObject({
        message: 'Customer not found.',
        statusCode: 404,
      });
    });
  });

  describe('createCustomer', () => {
    const validData = {
      full_name: 'John Doe',
      ktp_number: '3201234567890001',
      whatsapp_number: '081234567890',
      email: 'john@example.com',
      address: 'Jl. Merdeka No. 1',
      latitude: -6.2,
      longitude: 106.8,
      branch_id: 1,
    };

    const adminUser = { id: 10, role: 'Admin', branch_id: 1 };
    const salesUser = { id: 11, role: 'Sales', branch_id: 1 };
    const mitraUser = { id: 12, role: 'Mitra', branch_id: 1 };

    it('should create a customer successfully with Admin user', async () => {
      customerModel.findByKtp.mockResolvedValueOnce(null);
      branchService.isBranchActive.mockResolvedValueOnce(true);
      customerModel.create.mockResolvedValueOnce({
        id: 1,
        ...validData,
        lifecycle_status: 'Prospek',
        registered_by: adminUser.id,
      });

      const result = await customerService.createCustomer(validData, adminUser);

      expect(result.id).toBe(1);
      expect(result.lifecycle_status).toBe('Prospek');
      expect(result.registered_by).toBe(adminUser.id);
      expect(customerModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registered_by: adminUser.id,
          branch_id: 1,
        })
      );
    });

    it('should create a customer successfully with Sales user', async () => {
      customerModel.findByKtp.mockResolvedValueOnce(null);
      branchService.isBranchActive.mockResolvedValueOnce(true);
      customerModel.create.mockResolvedValueOnce({
        id: 2,
        ...validData,
        lifecycle_status: 'Prospek',
        registered_by: salesUser.id,
      });

      const result = await customerService.createCustomer(validData, salesUser);

      expect(result.registered_by).toBe(salesUser.id);
    });

    it('should create a customer successfully with Mitra user', async () => {
      customerModel.findByKtp.mockResolvedValueOnce(null);
      branchService.isBranchActive.mockResolvedValueOnce(true);
      customerModel.create.mockResolvedValueOnce({
        id: 3,
        ...validData,
        lifecycle_status: 'Prospek',
        registered_by: mitraUser.id,
      });

      const result = await customerService.createCustomer(validData, mitraUser);

      expect(result.registered_by).toBe(mitraUser.id);
    });

    it('should throw 403 when user role is not allowed to register', async () => {
      const teknisiUser = { id: 20, role: 'Teknisi', branch_id: 1 };

      await expect(
        customerService.createCustomer(validData, teknisiUser)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('should throw 400 for invalid WhatsApp number format', async () => {
      const invalidData = { ...validData, whatsapp_number: '12345' };

      await expect(
        customerService.createCustomer(invalidData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('WhatsApp'),
      });
    });

    it('should throw 400 for WhatsApp number with wrong prefix', async () => {
      const invalidData = { ...validData, whatsapp_number: '0912345678' };

      await expect(
        customerService.createCustomer(invalidData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('WhatsApp'),
      });
    });

    it('should throw 400 for WhatsApp number that is too short', async () => {
      const invalidData = { ...validData, whatsapp_number: '08123' };

      await expect(
        customerService.createCustomer(invalidData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should accept valid +62 prefix WhatsApp number', async () => {
      const dataWith62 = { ...validData, whatsapp_number: '+6281234567890' };
      customerModel.findByKtp.mockResolvedValueOnce(null);
      branchService.isBranchActive.mockResolvedValueOnce(true);
      customerModel.create.mockResolvedValueOnce({
        id: 5,
        ...dataWith62,
        lifecycle_status: 'Prospek',
        registered_by: adminUser.id,
      });

      const result = await customerService.createCustomer(dataWith62, adminUser);

      expect(result.id).toBe(5);
    });

    it('should throw 409 when KTP number already exists', async () => {
      customerModel.findByKtp.mockResolvedValueOnce({ id: 99, ktp_number: validData.ktp_number });

      await expect(
        customerService.createCustomer(validData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RESOURCE_ALREADY_EXISTS',
      });
    });

    it('should reject duplicate KTP even when other data differs', async () => {
      const differentData = {
        ...validData,
        full_name: 'Different Person',
        whatsapp_number: '082111222333',
        branch_id: 2,
      };
      customerModel.findByKtp.mockResolvedValueOnce({ id: 50, ktp_number: validData.ktp_number });

      await expect(
        customerService.createCustomer(differentData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RESOURCE_ALREADY_EXISTS',
        message: expect.stringContaining('KTP'),
      });
    });

    it('should throw 400 when branch is inactive', async () => {
      customerModel.findByKtp.mockResolvedValueOnce(null);
      branchService.isBranchActive.mockResolvedValueOnce(false);

      await expect(
        customerService.createCustomer(validData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('inactive'),
      });
    });

    it('should throw 400 when branch_id is missing and user has no branch', async () => {
      const noBranchUser = { id: 10, role: 'Admin', branch_id: null };
      const dataWithoutBranch = { ...validData, branch_id: undefined };

      await expect(
        customerService.createCustomer(dataWithoutBranch, noBranchUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Branch ID'),
      });
    });

    it('should use user branch_id when data.branch_id is not provided', async () => {
      const dataWithoutBranch = { ...validData, branch_id: undefined };
      customerModel.findByKtp.mockResolvedValueOnce(null);
      branchService.isBranchActive.mockResolvedValueOnce(true);
      customerModel.create.mockResolvedValueOnce({
        id: 4,
        ...dataWithoutBranch,
        branch_id: adminUser.branch_id,
        lifecycle_status: 'Prospek',
        registered_by: adminUser.id,
      });

      await customerService.createCustomer(dataWithoutBranch, adminUser);

      expect(branchService.isBranchActive).toHaveBeenCalledWith(adminUser.branch_id);
      expect(customerModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ branch_id: adminUser.branch_id })
      );
    });

    it('should throw 400 for invalid latitude', async () => {
      const invalidData = { ...validData, latitude: 100 };

      await expect(
        customerService.createCustomer(invalidData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('latitude'),
      });
    });

    it('should throw 400 for invalid longitude', async () => {
      const invalidData = { ...validData, longitude: 200 };

      await expect(
        customerService.createCustomer(invalidData, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('longitude'),
      });
    });
  });

  describe('updateCustomer', () => {
    const existingCustomer = {
      id: 1,
      full_name: 'John Doe',
      ktp_number: '3201234567890001',
      whatsapp_number: '081234567890',
      branch_id: 1,
    };

    it('should update customer successfully', async () => {
      customerModel.findById.mockResolvedValueOnce(existingCustomer);
      customerModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      customerModel.findById.mockResolvedValueOnce({
        ...existingCustomer,
        full_name: 'John Updated',
      });

      const result = await customerService.updateCustomer(1, { full_name: 'John Updated' });

      expect(result.full_name).toBe('John Updated');
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(
        customerService.updateCustomer(999, { full_name: 'Test' })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when attempting to change KTP number', async () => {
      customerModel.findById.mockResolvedValueOnce(existingCustomer);

      await expect(
        customerService.updateCustomer(1, { ktp_number: '9999999999999999' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('KTP'),
      });
    });

    it('should throw 400 for invalid WhatsApp number on update', async () => {
      customerModel.findById.mockResolvedValueOnce(existingCustomer);

      await expect(
        customerService.updateCustomer(1, { whatsapp_number: 'invalid' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('WhatsApp'),
      });
    });

    it('should allow updating WhatsApp with valid format', async () => {
      customerModel.findById.mockResolvedValueOnce(existingCustomer);
      customerModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      customerModel.findById.mockResolvedValueOnce({
        ...existingCustomer,
        whatsapp_number: '+6281999888777',
      });

      const result = await customerService.updateCustomer(1, { whatsapp_number: '+6281999888777' });

      expect(result.whatsapp_number).toBe('+6281999888777');
    });

    it('should throw 400 for invalid latitude on update', async () => {
      customerModel.findById.mockResolvedValueOnce(existingCustomer);

      await expect(
        customerService.updateCustomer(1, { latitude: -91 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('latitude'),
      });
    });

    it('should throw 400 for invalid longitude on update', async () => {
      customerModel.findById.mockResolvedValueOnce(existingCustomer);

      await expect(
        customerService.updateCustomer(1, { longitude: 181 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('longitude'),
      });
    });
  });

  describe('changeStatus', () => {
    it('should change status successfully', async () => {
      const statusResult = {
        success: true,
        previous_status: 'Prospek',
        new_status: 'Instalasi',
        customer_id: 1,
        actor_id: 10,
      };
      customerModel.updateStatus.mockResolvedValueOnce(statusResult);

      const result = await customerService.changeStatus(1, 'Instalasi', { id: 10 });

      expect(result.success).toBe(true);
      expect(result.new_status).toBe('Instalasi');
      expect(customerModel.updateStatus).toHaveBeenCalledWith(1, 'Instalasi', 10);
    });

    it('should throw 404 when customer not found', async () => {
      const error = new Error('Customer not found');
      error.code = 'RESOURCE_NOT_FOUND';
      customerModel.updateStatus.mockRejectedValueOnce(error);

      await expect(
        customerService.changeStatus(999, 'Instalasi', { id: 10 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 for invalid status transition', async () => {
      const error = new Error("Invalid status transition from 'Prospek' to 'Aktif'.");
      error.code = 'INVALID_STATUS_TRANSITION';
      error.details = {
        current_status: 'Prospek',
        requested_status: 'Aktif',
        allowed_transitions: ['Instalasi'],
      };
      customerModel.updateStatus.mockRejectedValueOnce(error);

      await expect(
        customerService.changeStatus(1, 'Aktif', { id: 10 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    // Additional valid transition tests
    it('should allow Instalasi -> Aktif transition', async () => {
      const statusResult = {
        success: true,
        previous_status: 'Instalasi',
        new_status: 'Aktif',
        customer_id: 1,
        actor_id: 10,
      };
      customerModel.updateStatus.mockResolvedValueOnce(statusResult);

      const result = await customerService.changeStatus(1, 'Aktif', { id: 10 });

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('Instalasi');
      expect(result.new_status).toBe('Aktif');
    });

    it('should allow Aktif -> Isolir transition', async () => {
      const statusResult = {
        success: true,
        previous_status: 'Aktif',
        new_status: 'Isolir',
        customer_id: 1,
        actor_id: 10,
      };
      customerModel.updateStatus.mockResolvedValueOnce(statusResult);

      const result = await customerService.changeStatus(1, 'Isolir', { id: 10 });

      expect(result.success).toBe(true);
      expect(result.new_status).toBe('Isolir');
    });

    it('should allow Isolir -> Aktif transition (reactivation)', async () => {
      const statusResult = {
        success: true,
        previous_status: 'Isolir',
        new_status: 'Aktif',
        customer_id: 1,
        actor_id: 10,
      };
      customerModel.updateStatus.mockResolvedValueOnce(statusResult);

      const result = await customerService.changeStatus(1, 'Aktif', { id: 10 });

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('Isolir');
      expect(result.new_status).toBe('Aktif');
    });

    it('should allow Aktif -> Terminated transition', async () => {
      const statusResult = {
        success: true,
        previous_status: 'Aktif',
        new_status: 'Terminated',
        customer_id: 1,
        actor_id: 10,
      };
      customerModel.updateStatus.mockResolvedValueOnce(statusResult);

      const result = await customerService.changeStatus(1, 'Terminated', { id: 10 });

      expect(result.success).toBe(true);
      expect(result.new_status).toBe('Terminated');
    });

    it('should allow Isolir -> Terminated transition', async () => {
      const statusResult = {
        success: true,
        previous_status: 'Isolir',
        new_status: 'Terminated',
        customer_id: 1,
        actor_id: 10,
      };
      customerModel.updateStatus.mockResolvedValueOnce(statusResult);

      const result = await customerService.changeStatus(1, 'Terminated', { id: 10 });

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('Isolir');
      expect(result.new_status).toBe('Terminated');
    });

    // Invalid transition tests
    it('should reject Prospek -> Terminated (skipping states)', async () => {
      const error = new Error("Invalid status transition from 'Prospek' to 'Terminated'.");
      error.code = 'INVALID_STATUS_TRANSITION';
      error.details = {
        current_status: 'Prospek',
        requested_status: 'Terminated',
        allowed_transitions: ['Instalasi'],
      };
      customerModel.updateStatus.mockRejectedValueOnce(error);

      await expect(
        customerService.changeStatus(1, 'Terminated', { id: 10 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
        details: expect.objectContaining({
          allowed_transitions: ['Instalasi'],
        }),
      });
    });

    it('should reject Terminated -> any status (terminal state)', async () => {
      const error = new Error("Invalid status transition from 'Terminated' to 'Aktif'.");
      error.code = 'INVALID_STATUS_TRANSITION';
      error.details = {
        current_status: 'Terminated',
        requested_status: 'Aktif',
        allowed_transitions: [],
      };
      customerModel.updateStatus.mockRejectedValueOnce(error);

      await expect(
        customerService.changeStatus(1, 'Aktif', { id: 10 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
        details: expect.objectContaining({
          allowed_transitions: [],
        }),
      });
    });

    it('should reject Instalasi -> Isolir (must go through Aktif)', async () => {
      const error = new Error("Invalid status transition from 'Instalasi' to 'Isolir'.");
      error.code = 'INVALID_STATUS_TRANSITION';
      error.details = {
        current_status: 'Instalasi',
        requested_status: 'Isolir',
        allowed_transitions: ['Aktif'],
      };
      customerModel.updateStatus.mockRejectedValueOnce(error);

      await expect(
        customerService.changeStatus(1, 'Isolir', { id: 10 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should re-throw unexpected errors from model', async () => {
      const unexpectedError = new Error('Database connection lost');
      customerModel.updateStatus.mockRejectedValueOnce(unexpectedError);

      await expect(
        customerService.changeStatus(1, 'Instalasi', { id: 10 })
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('getAuditLog', () => {
    it('should return paginated audit logs', async () => {
      const mockCustomer = { id: 1, full_name: 'John Doe' };
      const mockLogs = [
        { id: 1, customer_id: 1, previous_status: 'Prospek', new_status: 'Instalasi', actor_id: 10 },
      ];
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      customerAuditLog.findByCustomerId.mockResolvedValueOnce({ logs: mockLogs, total: 1 });

      const result = await customerService.getAuditLog(1);

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(customerService.getAuditLog(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should pass pagination options', async () => {
      customerModel.findById.mockResolvedValueOnce({ id: 1 });
      customerAuditLog.findByCustomerId.mockResolvedValueOnce({ logs: [], total: 0 });

      await customerService.getAuditLog(1, { page: 2, limit: 10 });

      expect(customerAuditLog.findByCustomerId).toHaveBeenCalledWith(1, { page: 2, limit: 10 });
    });
  });

  describe('checkActivationCoverage', () => {
    const mockCustomer = {
      id: 1,
      full_name: 'John Doe',
      latitude: -6.2,
      longitude: 106.8,
      branch_id: 1,
    };

    it('should return coverage result when ODPs are available', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      coverageService.checkCoverage.mockResolvedValueOnce({
        covered: true,
        odps: [
          { id: 10, name: 'ODP-001', branch_id: 1, distance_meters: 100, total_ports: 8, used_ports: 2 },
          { id: 11, name: 'ODP-002', branch_id: 1, distance_meters: 250, total_ports: 8, used_ports: 5 },
        ],
        radius_meters: 500,
      });

      const result = await customerService.checkActivationCoverage(1);

      expect(result.covered).toBe(true);
      expect(result.nearest_odp.id).toBe(10);
      expect(result.available_odps).toHaveLength(2);
      expect(coverageService.checkCoverage).toHaveBeenCalledWith(
        -6.2, 106.8, undefined, { branch_id: 1 }
      );
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(customerService.checkActivationCoverage(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when customer has no GPS coordinates', async () => {
      customerModel.findById.mockResolvedValueOnce({ ...mockCustomer, latitude: null, longitude: null });

      await expect(customerService.checkActivationCoverage(1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('GPS'),
      });
    });

    it('should throw 400 when no coverage is available', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      coverageService.checkCoverage.mockResolvedValueOnce({
        covered: false,
        odps: [],
        radius_meters: 500,
      });

      await expect(customerService.checkActivationCoverage(1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('No active ODP'),
      });
    });

    it('should auto-map customer to nearest ODP branch if different', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      coverageService.checkCoverage.mockResolvedValueOnce({
        covered: true,
        odps: [
          { id: 10, name: 'ODP-001', branch_id: 2, distance_meters: 100, total_ports: 8, used_ports: 2 },
        ],
        radius_meters: 500,
      });
      customerModel.update.mockResolvedValueOnce({ affectedRows: 1 });

      await customerService.checkActivationCoverage(1);

      expect(customerModel.update).toHaveBeenCalledWith(1, { branch_id: 2 });
    });
  });

  describe('recordDownPayment', () => {
    const mockCustomer = { id: 1, full_name: 'John Doe' };
    const adminUser = { id: 10, role: 'Admin', branch_id: 1 };

    it('should record a down payment successfully', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      downPaymentModel.create.mockResolvedValueOnce({
        id: 1,
        customer_id: 1,
        amount: 500000,
        payment_date: '2024-01-15',
        received_by: 10,
        applied: 0,
      });

      const result = await customerService.recordDownPayment(1, {
        amount: 500000,
        payment_date: '2024-01-15',
      }, adminUser);

      expect(result.id).toBe(1);
      expect(result.amount).toBe(500000);
      expect(downPaymentModel.create).toHaveBeenCalledWith({
        customer_id: 1,
        amount: 500000,
        payment_date: '2024-01-15',
        received_by: 10,
      });
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(
        customerService.recordDownPayment(999, { amount: 100000, payment_date: '2024-01-15' }, adminUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when amount is zero or negative', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);

      await expect(
        customerService.recordDownPayment(1, { amount: 0, payment_date: '2024-01-15' }, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('positive'),
      });
    });

    it('should throw 400 when payment_date is missing', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);

      await expect(
        customerService.recordDownPayment(1, { amount: 100000 }, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('date'),
      });
    });
  });

  describe('generatePPPoEAccount', () => {
    const mockCustomer = { id: 1, full_name: 'John Doe', lifecycle_status: 'Prospek' };

    it('should generate PPPoE credentials and create subscription', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      createRadcheckUniquenessChecker.mockReturnValueOnce(jest.fn());
      generatePPPoECredentials.mockResolvedValueOnce({
        username: 'uwais-abc123',
        password: 'SecurePass123',
      });
      subscriptionModel.create.mockResolvedValueOnce({
        id: 5,
        customer_id: 1,
        package_id: 2,
        pppoe_username: 'uwais-abc123',
        pppoe_password: 'SecurePass123',
        nas_id: 3,
        status: 'Pending',
      });
      radiusService.createPPPoEAccount.mockResolvedValueOnce({});
      customerModel.updateStatus.mockResolvedValueOnce({ success: true });

      const result = await customerService.generatePPPoEAccount(1, {
        package_id: 2,
        nas_id: 3,
      });

      expect(result.subscription_id).toBe(5);
      expect(result.pppoe_username).toBe('uwais-abc123');
      expect(result.pppoe_password).toBe('SecurePass123');
      expect(result.status).toBe('Pending');
      expect(radiusService.createPPPoEAccount).toHaveBeenCalledWith('uwais-abc123', 'SecurePass123');
      expect(customerModel.updateStatus).toHaveBeenCalledWith(1, 'Instalasi', null);
    });

    it('should not transition status if customer is not in Prospek', async () => {
      const installingCustomer = { ...mockCustomer, lifecycle_status: 'Instalasi' };
      customerModel.findById.mockResolvedValueOnce(installingCustomer);
      createRadcheckUniquenessChecker.mockReturnValueOnce(jest.fn());
      generatePPPoECredentials.mockResolvedValueOnce({
        username: 'uwais-xyz789',
        password: 'Pass456',
      });
      subscriptionModel.create.mockResolvedValueOnce({
        id: 6,
        customer_id: 1,
        status: 'Pending',
      });
      radiusService.createPPPoEAccount.mockResolvedValueOnce({});

      await customerService.generatePPPoEAccount(1, { package_id: 2, nas_id: 3 });

      expect(customerModel.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(
        customerService.generatePPPoEAccount(999, { package_id: 2, nas_id: 3 })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when package_id is missing', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);

      await expect(
        customerService.generatePPPoEAccount(1, { nas_id: 3 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Package ID'),
      });
    });

    it('should throw 400 when nas_id is missing', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);

      await expect(
        customerService.generatePPPoEAccount(1, { package_id: 2 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('NAS ID'),
      });
    });
  });

  describe('submitInstallationData', () => {
    const mockSubscription = { id: 5, customer_id: 1, status: 'Pending' };
    const mockOdp = { id: 10, total_ports: 8, used_ports: 3 };

    it('should submit installation data and increment ODP ports', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      odpModel.findById.mockResolvedValueOnce(mockOdp);
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      odpModel.incrementUsedPorts.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findById.mockResolvedValueOnce({
        ...mockSubscription,
        odp_id: 10,
        odp_port: 4,
        onu_serial_number: 'ONU-SN-001',
      });

      const result = await customerService.submitInstallationData(5, {
        odp_id: 10,
        odp_port: 4,
        onu_serial_number: 'ONU-SN-001',
        onu_mac_address: 'AA:BB:CC:DD:EE:FF',
      });

      expect(result.odp_id).toBe(10);
      expect(subscriptionModel.update).toHaveBeenCalledWith(5, expect.objectContaining({
        odp_id: 10,
        odp_port: 4,
        onu_serial_number: 'ONU-SN-001',
        onu_mac_address: 'AA:BB:CC:DD:EE:FF',
      }));
      expect(odpModel.incrementUsedPorts).toHaveBeenCalledWith(10);
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(null);

      await expect(
        customerService.submitInstallationData(999, { odp_id: 10, odp_port: 1, onu_serial_number: 'SN' })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when ODP has no available ports', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      odpModel.findById.mockResolvedValueOnce({ id: 10, total_ports: 8, used_ports: 8 });

      await expect(
        customerService.submitInstallationData(5, { odp_id: 10, odp_port: 1, onu_serial_number: 'SN' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('no available ports'),
      });
    });

    it('should throw 400 when odp_id is missing', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        customerService.submitInstallationData(5, { odp_port: 1, onu_serial_number: 'SN' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('ODP ID'),
      });
    });

    it('should throw 400 when onu_serial_number is missing', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        customerService.submitInstallationData(5, { odp_id: 10, odp_port: 1 })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('ONU serial'),
      });
    });
  });

  describe('calculateFirstInvoice', () => {
    const mockSubscription = { id: 5, customer_id: 1, package_id: 2 };

    it('should generate first invoice with prorata and DP deduction', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      billingService.generateInvoice.mockResolvedValueOnce({
        id: 100,
        invoice_number: 'INV-2024-01-0001',
        base_amount: 150000,
        ppn_amount: 16500,
        installation_fee: 200000,
        addon_charges: 50000,
        dp_deduction: 100000,
        total_amount: 316500,
        status: 'UNPAID',
      });

      const result = await customerService.calculateFirstInvoice(5, {
        installationFee: 200000,
        addonCharges: 50000,
        activationDate: '2024-01-15',
      });

      expect(result.id).toBe(100);
      expect(result.total_amount).toBe(316500);
      expect(billingService.generateInvoice).toHaveBeenCalledWith(5, {
        isFirstInvoice: true,
        activationDate: '2024-01-15',
        installationFee: 200000,
        addonCharges: 50000,
        applyDp: true,
      });
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(null);

      await expect(
        customerService.calculateFirstInvoice(999)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should default installationFee and addonCharges to 0', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      billingService.generateInvoice.mockResolvedValueOnce({
        id: 101,
        total_amount: 166500,
        status: 'UNPAID',
      });

      await customerService.calculateFirstInvoice(5);

      expect(billingService.generateInvoice).toHaveBeenCalledWith(5, expect.objectContaining({
        installationFee: 0,
        addonCharges: 0,
      }));
    });
  });

  describe('activateCustomer', () => {
    const mockSubscription = {
      id: 5,
      customer_id: 1,
      package_id: 2,
      pppoe_username: 'uwais-abc123',
      nas_id: 3,
      upload_rate_limit: 10000,
      download_rate_limit: 20000,
      status: 'Pending',
    };
    const adminUser = { id: 10, role: 'Admin' };

    it('should activate subscription via CoA and transition customer to Aktif', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(mockSubscription);
      radiusService.updateUserGroup.mockResolvedValueOnce({});
      coaService.sendCoA.mockResolvedValueOnce({
        success: true,
        responseStatus: 'ACK',
        retryCount: 0,
      });
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      customerModel.findById.mockResolvedValueOnce({
        id: 1,
        lifecycle_status: 'Instalasi',
      });
      customerModel.updateStatus.mockResolvedValueOnce({ success: true });

      const result = await customerService.activateCustomer(5, adminUser);

      expect(result.status).toBe('Active');
      expect(result.coa_result.success).toBe(true);
      expect(radiusService.updateUserGroup).toHaveBeenCalledWith('uwais-abc123', 'package-2');
      expect(coaService.sendCoA).toHaveBeenCalledWith(5, 3, 'SpeedChange', {
        username: 'uwais-abc123',
        rateLimit: '10000k/20000k',
      });
      expect(customerModel.updateStatus).toHaveBeenCalledWith(1, 'Aktif', 10);
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(null);

      await expect(
        customerService.activateCustomer(999, adminUser)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when subscription is already active', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce({
        ...mockSubscription,
        status: 'Active',
      });

      await expect(
        customerService.activateCustomer(5, adminUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('already active'),
      });
    });

    it('should not transition customer status if not in Instalasi', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(mockSubscription);
      radiusService.updateUserGroup.mockResolvedValueOnce({});
      coaService.sendCoA.mockResolvedValueOnce({
        success: true,
        responseStatus: 'ACK',
        retryCount: 0,
      });
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      customerModel.findById.mockResolvedValueOnce({
        id: 1,
        lifecycle_status: 'Aktif',
      });

      const result = await customerService.activateCustomer(5, adminUser);

      expect(result.status).toBe('Active');
      expect(customerModel.updateStatus).not.toHaveBeenCalled();
    });
  });
});
