/**
 * Unit tests for subscription service.
 * Tests PPPoE account generation uniqueness, RADIUS provisioning writes,
 * subscription activation flow, subscription creation, and installation data recording.
 *
 * Requirements: 3.2, 16.4, 16.5
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
    query: jest.fn().mockResolvedValue([[], []]),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/models/subscription.model');
jest.mock('../../src/models/customer.model');
jest.mock('../../src/models/package.model');
jest.mock('../../src/services/radius.service');
jest.mock('../../src/utils/pppoeGenerator');

const subscriptionModel = require('../../src/models/subscription.model');
const customerModel = require('../../src/models/customer.model');
const packageModel = require('../../src/models/package.model');
const radiusService = require('../../src/services/radius.service');
const { generatePPPoECredentials, createRadcheckUniquenessChecker } = require('../../src/utils/pppoeGenerator');
const subscriptionService = require('../../src/services/subscription.service');

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for PPPoE generator
    generatePPPoECredentials.mockResolvedValue({
      username: 'uwais-abc123',
      password: 'SecurePass123',
    });
    createRadcheckUniquenessChecker.mockReturnValue(jest.fn());
  });

  describe('create', () => {
    const mockCustomer = { id: 1, full_name: 'John Doe', branch_id: 1 };
    const mockPackage = { id: 5, name: '10Mbps', status: 'Active', monthly_price: 150000 };

    it('should create a subscription with generated PPPoE credentials', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      subscriptionModel.create.mockResolvedValueOnce({
        id: 1,
        customer_id: 1,
        package_id: 5,
        pppoe_username: 'uwais-abc123',
        pppoe_password: 'SecurePass123',
        nas_id: 2,
        status: 'Pending',
      });

      const result = await subscriptionService.create(1, 5, 2);

      expect(result.id).toBe(1);
      expect(result.pppoe_username).toBe('uwais-abc123');
      expect(result.pppoe_password).toBe('SecurePass123');
      expect(result.status).toBe('Pending');
      expect(generatePPPoECredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'uwais-',
          passwordLength: 12,
          maxAttempts: 10,
        })
      );
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValueOnce(null);

      await expect(subscriptionService.create(999, 5, 2)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Customer not found.',
      });
    });

    it('should throw 404 when package not found', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(null);

      await expect(subscriptionService.create(1, 999, 2)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Package not found.',
      });
    });

    it('should throw 400 when package is inactive', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce({ ...mockPackage, status: 'Inactive' });

      await expect(subscriptionService.create(1, 5, 2)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('inactive'),
      });
    });

    it('should pass radcheck uniqueness checker to PPPoE generator', async () => {
      const mockChecker = jest.fn();
      createRadcheckUniquenessChecker.mockReturnValueOnce(mockChecker);
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      subscriptionModel.create.mockResolvedValueOnce({
        id: 1,
        customer_id: 1,
        package_id: 5,
        pppoe_username: 'uwais-abc123',
        pppoe_password: 'SecurePass123',
        nas_id: 2,
        status: 'Pending',
      });

      await subscriptionService.create(1, 5, 2);

      expect(generatePPPoECredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          isUsernameUnique: mockChecker,
        })
      );
    });

    it('should propagate error when PPPoE generation fails (uniqueness exhausted)', async () => {
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      generatePPPoECredentials.mockRejectedValueOnce(
        new Error('Failed to generate unique PPPoE username after 10 attempts')
      );

      await expect(subscriptionService.create(1, 5, 2)).rejects.toThrow(
        'Failed to generate unique PPPoE username after 10 attempts'
      );
    });
  });

  describe('PPPoE account generation uniqueness', () => {
    it('should use createRadcheckUniquenessChecker with radiusPool', async () => {
      const mockCustomer = { id: 1, full_name: 'John Doe', branch_id: 1 };
      const mockPackage = { id: 5, name: '10Mbps', status: 'Active' };
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      subscriptionModel.create.mockResolvedValueOnce({
        id: 1,
        customer_id: 1,
        package_id: 5,
        pppoe_username: 'uwais-xyz789',
        pppoe_password: 'Pass456',
        nas_id: 2,
        status: 'Pending',
      });

      await subscriptionService.create(1, 5, 2);

      expect(createRadcheckUniquenessChecker).toHaveBeenCalled();
    });

    it('should generate different credentials for multiple subscriptions', async () => {
      const mockCustomer = { id: 1, full_name: 'John Doe', branch_id: 1 };
      const mockPackage = { id: 5, name: '10Mbps', status: 'Active' };

      // First call
      generatePPPoECredentials.mockResolvedValueOnce({
        username: 'uwais-first1',
        password: 'PassFirst1',
      });
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      subscriptionModel.create.mockResolvedValueOnce({
        id: 1,
        pppoe_username: 'uwais-first1',
        pppoe_password: 'PassFirst1',
        status: 'Pending',
      });

      const result1 = await subscriptionService.create(1, 5, 2);

      // Second call
      generatePPPoECredentials.mockResolvedValueOnce({
        username: 'uwais-secnd2',
        password: 'PassSecnd2',
      });
      customerModel.findById.mockResolvedValueOnce(mockCustomer);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      subscriptionModel.create.mockResolvedValueOnce({
        id: 2,
        pppoe_username: 'uwais-secnd2',
        pppoe_password: 'PassSecnd2',
        status: 'Pending',
      });

      const result2 = await subscriptionService.create(1, 5, 2);

      expect(result1.pppoe_username).not.toBe(result2.pppoe_username);
      expect(result1.pppoe_password).not.toBe(result2.pppoe_password);
    });
  });

  describe('activate', () => {
    const mockSubscription = {
      id: 1,
      customer_id: 1,
      package_id: 5,
      pppoe_username: 'uwais-abc123',
      pppoe_password: 'SecurePass123',
      nas_id: 2,
      status: 'Pending',
    };
    const mockPackage = { id: 5, name: '10Mbps', status: 'Active' };
    const mockActivatedSubscription = {
      ...mockSubscription,
      status: 'Active',
      activated_at: '2024-01-15 10:00:00',
      customer_name: 'John Doe',
      package_name: '10Mbps',
    };

    it('should activate a Pending subscription and write to RADIUS', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      radiusService.createPPPoEAccount.mockResolvedValueOnce({ id: 1 });
      radiusService.updateUserGroup.mockResolvedValueOnce({ id: 1 });
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(mockActivatedSubscription);

      const result = await subscriptionService.activate(1);

      expect(result.status).toBe('Active');
      expect(radiusService.createPPPoEAccount).toHaveBeenCalledWith(
        'uwais-abc123',
        'SecurePass123'
      );
      expect(radiusService.updateUserGroup).toHaveBeenCalledWith(
        'uwais-abc123',
        'pkg-5'
      );
      expect(subscriptionModel.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: 'Active',
          activated_at: expect.any(String),
        })
      );
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(null);

      await expect(subscriptionService.activate(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Subscription not found.',
      });
    });

    it('should throw 400 when subscription is not in Pending status', async () => {
      subscriptionModel.findById.mockResolvedValueOnce({
        ...mockSubscription,
        status: 'Active',
      });

      await expect(subscriptionService.activate(1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('Active'),
      });
    });

    it('should throw 400 when subscription is Terminated', async () => {
      subscriptionModel.findById.mockResolvedValueOnce({
        ...mockSubscription,
        status: 'Terminated',
      });

      await expect(subscriptionService.activate(1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('Terminated'),
      });
    });

    it('should throw 400 when subscription is Suspended', async () => {
      subscriptionModel.findById.mockResolvedValueOnce({
        ...mockSubscription,
        status: 'Suspended',
      });

      await expect(subscriptionService.activate(1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw 404 when associated package not found during activation', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      packageModel.findById.mockResolvedValueOnce(null);

      await expect(subscriptionService.activate(1)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Associated package not found.',
      });
    });

    it('should call createPPPoEAccount before updateUserGroup', async () => {
      const callOrder = [];
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      packageModel.findById.mockResolvedValueOnce(mockPackage);
      radiusService.createPPPoEAccount.mockImplementationOnce(() => {
        callOrder.push('createPPPoEAccount');
        return Promise.resolve({ id: 1 });
      });
      radiusService.updateUserGroup.mockImplementationOnce(() => {
        callOrder.push('updateUserGroup');
        return Promise.resolve({ id: 1 });
      });
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(mockActivatedSubscription);

      await subscriptionService.activate(1);

      expect(callOrder).toEqual(['createPPPoEAccount', 'updateUserGroup']);
    });

    it('should use package ID to form the group name (pkg-{id})', async () => {
      const subWithPkg10 = { ...mockSubscription, package_id: 10 };
      subscriptionModel.findById.mockResolvedValueOnce(subWithPkg10);
      packageModel.findById.mockResolvedValueOnce({ id: 10, name: '20Mbps', status: 'Active' });
      radiusService.createPPPoEAccount.mockResolvedValueOnce({ id: 1 });
      radiusService.updateUserGroup.mockResolvedValueOnce({ id: 1 });
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce({
        ...subWithPkg10,
        status: 'Active',
      });

      await subscriptionService.activate(1);

      expect(radiusService.updateUserGroup).toHaveBeenCalledWith(
        subWithPkg10.pppoe_username,
        'pkg-10'
      );
    });
  });

  describe('install', () => {
    const mockSubscription = {
      id: 1,
      customer_id: 1,
      package_id: 5,
      pppoe_username: 'uwais-abc123',
      status: 'Pending',
    };

    const validInstallData = {
      odp_id: 10,
      odp_port: 3,
      onu_serial_number: 'ZTEG12345678',
      onu_mac_address: 'AA:BB:CC:DD:EE:FF',
      install_latitude: -6.2,
      install_longitude: 106.8,
    };

    it('should record installation data successfully', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce({
        ...mockSubscription,
        ...validInstallData,
      });

      const result = await subscriptionService.install(1, validInstallData);

      expect(result.odp_id).toBe(10);
      expect(result.odp_port).toBe(3);
      expect(result.onu_serial_number).toBe('ZTEG12345678');
      expect(result.onu_mac_address).toBe('AA:BB:CC:DD:EE:FF');
      expect(subscriptionModel.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          odp_id: 10,
          odp_port: 3,
          onu_serial_number: 'ZTEG12345678',
          onu_mac_address: 'AA:BB:CC:DD:EE:FF',
          install_latitude: -6.2,
          install_longitude: 106.8,
        })
      );
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(null);

      await expect(
        subscriptionService.install(999, validInstallData)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when no installation data provided', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        subscriptionService.install(1, {})
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('No installation data'),
      });
    });

    it('should throw 400 for invalid latitude (> 90)', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        subscriptionService.install(1, { install_latitude: 91 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('latitude'),
      });
    });

    it('should throw 400 for invalid latitude (< -90)', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        subscriptionService.install(1, { install_latitude: -91 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('latitude'),
      });
    });

    it('should throw 400 for invalid longitude (> 180)', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        subscriptionService.install(1, { install_longitude: 181 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('longitude'),
      });
    });

    it('should throw 400 for invalid longitude (< -180)', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        subscriptionService.install(1, { install_longitude: -181 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('longitude'),
      });
    });

    it('should accept partial installation data (only ODP info)', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce({
        ...mockSubscription,
        odp_id: 10,
        odp_port: 3,
      });

      const result = await subscriptionService.install(1, { odp_id: 10, odp_port: 3 });

      expect(result.odp_id).toBe(10);
      expect(subscriptionModel.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ odp_id: 10, odp_port: 3 })
      );
    });
  });

  describe('listSubscriptions', () => {
    it('should return paginated subscriptions', async () => {
      const mockSubs = [
        { id: 1, pppoe_username: 'uwais-abc123', status: 'Active' },
        { id: 2, pppoe_username: 'uwais-def456', status: 'Pending' },
      ];
      subscriptionModel.findAll.mockResolvedValueOnce({ subscriptions: mockSubs, total: 2 });

      const result = await subscriptionService.listSubscriptions({}, { branch_id: null });

      expect(result.subscriptions).toEqual(mockSubs);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should apply branch scoping when user has branch_id', async () => {
      subscriptionModel.findAll.mockResolvedValueOnce({ subscriptions: [], total: 0 });

      await subscriptionService.listSubscriptions({}, { branch_id: 3 });

      expect(subscriptionModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ branch_id: 3 })
      );
    });

    it('should not apply branch filter for Superadmin (null branch_id)', async () => {
      subscriptionModel.findAll.mockResolvedValueOnce({ subscriptions: [], total: 0 });

      await subscriptionService.listSubscriptions({}, { branch_id: null });

      const callArgs = subscriptionModel.findAll.mock.calls[0][0];
      expect(callArgs.branch_id).toBeUndefined();
    });
  });

  describe('getSubscriptionById', () => {
    it('should return subscription with details when found', async () => {
      const mockSub = {
        id: 1,
        pppoe_username: 'uwais-abc123',
        customer_name: 'John Doe',
        package_name: '10Mbps',
      };
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(mockSub);

      const result = await subscriptionService.getSubscriptionById(1);

      expect(result).toEqual(mockSub);
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce(null);

      await expect(subscriptionService.getSubscriptionById(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Subscription not found.',
      });
    });
  });

  describe('updateSubscription', () => {
    const mockSubscription = {
      id: 1,
      customer_id: 1,
      package_id: 5,
      status: 'Active',
    };

    it('should update package_id when valid', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      packageModel.findById.mockResolvedValueOnce({ id: 10, name: '20Mbps', status: 'Active' });
      subscriptionModel.update.mockResolvedValueOnce({ affectedRows: 1 });
      subscriptionModel.findByIdWithDetails.mockResolvedValueOnce({
        ...mockSubscription,
        package_id: 10,
        package_name: '20Mbps',
      });

      const result = await subscriptionService.updateSubscription(1, { package_id: 10 });

      expect(result.package_id).toBe(10);
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(null);

      await expect(
        subscriptionService.updateSubscription(999, { package_id: 10 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when no valid fields to update', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);

      await expect(
        subscriptionService.updateSubscription(1, { invalid_field: 'value' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('No valid fields'),
      });
    });

    it('should throw 400 when new package is inactive', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      packageModel.findById.mockResolvedValueOnce({ id: 10, name: '20Mbps', status: 'Inactive' });

      await expect(
        subscriptionService.updateSubscription(1, { package_id: 10 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('inactive'),
      });
    });

    it('should throw 404 when new package not found', async () => {
      subscriptionModel.findById.mockResolvedValueOnce(mockSubscription);
      packageModel.findById.mockResolvedValueOnce(null);

      await expect(
        subscriptionService.updateSubscription(1, { package_id: 999 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Package not found.',
      });
    });
  });
});
