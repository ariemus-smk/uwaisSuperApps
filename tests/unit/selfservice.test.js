/**
 * Unit tests for self-service controller.
 * Tests data isolation (own data only) and WiFi change triggers ACS.
 *
 * Requirements: 43.5, 43.2
 */

// Mock database before requiring controller
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

// Mock subscription model
jest.mock('../../src/models/subscription.model', () => ({
  findById: jest.fn(),
  findByCustomerId: jest.fn(),
}));

// Mock ACS service
jest.mock('../../src/services/acs.service', () => ({
  changeWifi: jest.fn(),
}));

// Mock ticket service
jest.mock('../../src/services/ticket.service', () => ({
  createTicket: jest.fn(),
}));

// Mock package change service
jest.mock('../../src/services/packageChange.service', () => ({
  requestPackageChange: jest.fn(),
}));

// Mock billing service
jest.mock('../../src/services/billing.service', () => ({
  getInvoices: jest.fn(),
}));

// Mock customer service
jest.mock('../../src/services/customer.service', () => ({}));

// Mock customer model
jest.mock('../../src/models/customer.model', () => ({
  findById: jest.fn(),
}));

const { appPool } = require('../../src/config/database');
const subscriptionModel = require('../../src/models/subscription.model');
const acsService = require('../../src/services/acs.service');
const ticketService = require('../../src/services/ticket.service');
const packageChangeService = require('../../src/services/packageChange.service');
const selfserviceController = require('../../src/controllers/selfservice.controller');

describe('Self-Service Controller', () => {
  let req;
  let res;

  const mockCustomer = {
    id: 10,
    full_name: 'Budi Santoso',
    user_id: 1,
    branch_id: 5,
    lifecycle_status: 'Aktif',
    whatsapp_number: '081234567890',
  };

  const mockSubscription = {
    id: 100,
    customer_id: 10,
    package_id: 3,
    pppoe_username: 'uwais-pppoe-budi',
    status: 'Active',
  };

  const otherCustomerSubscription = {
    id: 200,
    customer_id: 99, // belongs to a different customer
    package_id: 5,
    pppoe_username: 'uwais-pppoe-other',
    status: 'Active',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 1, role: 'Pelanggan', branch_id: 5 },
      body: {},
      query: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ============================================================================
  // Data Isolation Tests (Requirement 43.5)
  // ============================================================================

  describe('Data Isolation - Own Data Only (Req 43.5)', () => {
    describe('getProfile', () => {
      it('should return own profile when resolveCustomerForUser finds linked customer', async () => {
        // resolveCustomerForUser queries: SELECT * FROM customers WHERE user_id = ?
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

        await selfserviceController.getProfile(req, res);

        expect(appPool.execute).toHaveBeenCalledWith(
          'SELECT * FROM customers WHERE user_id = ? LIMIT 1',
          [1]
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'success',
            data: mockCustomer,
          })
        );
      });

      it('should return 404 when no customer is linked to the user', async () => {
        // No customer found for this user_id
        appPool.execute.mockResolvedValueOnce([[], []]);

        await selfserviceController.getProfile(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
            message: 'No customer profile linked to this account.',
          })
        );
      });
    });

    describe('changeWifi - subscription ownership check', () => {
      it('should return 403 when subscription does not belong to the user', async () => {
        // resolveCustomerForUser returns the customer
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
        // subscriptionModel.findById returns a subscription belonging to another customer
        subscriptionModel.findById.mockResolvedValue(otherCustomerSubscription);

        req.body = { subscription_id: 200, ssid: 'NewSSID' };

        await selfserviceController.changeWifi(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
            message: 'Subscription not found or does not belong to your account.',
          })
        );
      });

      it('should return 403 when subscription is not found', async () => {
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
        subscriptionModel.findById.mockResolvedValue(null);

        req.body = { subscription_id: 999, ssid: 'NewSSID' };

        await selfserviceController.changeWifi(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
          })
        );
      });
    });

    describe('submitTicket - subscription ownership check', () => {
      it('should return 403 when ticket subscription_id does not belong to the user', async () => {
        // resolveCustomerForUser
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
        // subscriptionModel.findById returns subscription of another customer
        subscriptionModel.findById.mockResolvedValue(otherCustomerSubscription);

        req.body = {
          subscription_id: 200,
          issue_description: 'Internet mati',
        };

        await selfserviceController.submitTicket(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
            message: 'Subscription not found or does not belong to your account.',
          })
        );
      });

      it('should return 403 when ticket subscription is not found', async () => {
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
        subscriptionModel.findById.mockResolvedValue(null);

        req.body = {
          subscription_id: 999,
          issue_description: 'Internet mati',
        };

        await selfserviceController.submitTicket(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
          })
        );
      });
    });

    describe('requestPackageChange - subscription ownership check', () => {
      it('should return 403 when package change subscription does not belong to the user', async () => {
        // resolveCustomerForUser
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
        // subscriptionModel.findById returns subscription of another customer
        subscriptionModel.findById.mockResolvedValue(otherCustomerSubscription);

        req.body = {
          subscription_id: 200,
          requested_package_id: 7,
        };

        await selfserviceController.requestPackageChange(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
            message: 'Subscription not found or does not belong to your account.',
          })
        );
      });

      it('should return 403 when package change subscription is not found', async () => {
        appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
        subscriptionModel.findById.mockResolvedValue(null);

        req.body = {
          subscription_id: 999,
          requested_package_id: 7,
        };

        await selfserviceController.requestPackageChange(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'error',
          })
        );
      });
    });
  });

  // ============================================================================
  // WiFi Change Triggers ACS (Requirement 43.2)
  // ============================================================================

  describe('WiFi Change Triggers ACS (Req 43.2)', () => {
    it('should call acsService.changeWifi with correct subscription_id and wifi data', async () => {
      // resolveCustomerForUser
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      // subscriptionModel.findById returns own subscription
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      // acsService.changeWifi returns success
      acsService.changeWifi.mockResolvedValue({
        subscriptionId: 100,
        deviceId: 'uwais-pppoe-budi',
        operation: 'wifi_change',
        status: 'success',
        message: 'WiFi configuration updated successfully',
        changes: { ssid: 'MyNewSSID', password: 'NewPass123' },
      });

      req.body = {
        subscription_id: 100,
        ssid: 'MyNewSSID',
        password: 'NewPass123',
      };

      await selfserviceController.changeWifi(req, res);

      expect(acsService.changeWifi).toHaveBeenCalledWith(100, {
        ssid: 'MyNewSSID',
        password: 'NewPass123',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: 'WiFi configuration updated successfully.',
        })
      );
    });

    it('should pass only ssid to ACS when only ssid is provided', async () => {
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      acsService.changeWifi.mockResolvedValue({
        subscriptionId: 100,
        deviceId: 'uwais-pppoe-budi',
        operation: 'wifi_change',
        status: 'success',
        changes: { ssid: 'OnlySSID' },
      });

      req.body = {
        subscription_id: 100,
        ssid: 'OnlySSID',
      };

      await selfserviceController.changeWifi(req, res);

      expect(acsService.changeWifi).toHaveBeenCalledWith(100, {
        ssid: 'OnlySSID',
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should pass only password to ACS when only password is provided', async () => {
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      acsService.changeWifi.mockResolvedValue({
        subscriptionId: 100,
        deviceId: 'uwais-pppoe-budi',
        operation: 'wifi_change',
        status: 'success',
        changes: { password: 'SecretPass456' },
      });

      req.body = {
        subscription_id: 100,
        password: 'SecretPass456',
      };

      await selfserviceController.changeWifi(req, res);

      expect(acsService.changeWifi).toHaveBeenCalledWith(100, {
        password: 'SecretPass456',
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
