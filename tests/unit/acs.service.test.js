/**
 * Unit tests for ACS (Auto Configuration Server) service.
 * Tests device reboot, WiFi change, firmware update, and device status retrieval.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 3.4
 */

// Mock axios before requiring the service
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

// Mock ACS config
jest.mock('../../src/config/acs', () => ({
  apiUrl: 'http://localhost:7547',
  username: 'acs_admin',
  password: 'acs_secret',
}));

// Mock subscription model
jest.mock('../../src/models/subscription.model', () => ({
  findById: jest.fn(),
}));

const axios = require('axios');
const subscriptionModel = require('../../src/models/subscription.model');
const acsService = require('../../src/services/acs.service');

describe('ACS Service', () => {
  let mockClient;

  const mockSubscription = {
    id: 1,
    customer_id: 10,
    package_id: 5,
    pppoe_username: 'uwais-pppoe-001',
    pppoe_password: 'secret123',
    nas_id: 2,
    status: 'Active',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      post: jest.fn(),
      get: jest.fn(),
    };
    axios.create.mockReturnValue(mockClient);
  });

  describe('rebootDevice', () => {
    it('should reboot device successfully', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockResolvedValue({
        data: { status: 'success', message: 'Device rebooting' },
      });

      const result = await acsService.rebootDevice(1);

      expect(subscriptionModel.findById).toHaveBeenCalledWith(1);
      expect(mockClient.post).toHaveBeenCalledWith('/devices/uwais-pppoe-001/reboot');
      expect(result.subscriptionId).toBe(1);
      expect(result.deviceId).toBe('uwais-pppoe-001');
      expect(result.operation).toBe('reboot');
      expect(result.status).toBe('success');
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findById.mockResolvedValue(null);

      await expect(acsService.rebootDevice(999)).rejects.toMatchObject({
        message: 'Subscription not found',
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when subscription has no PPPoE username', async () => {
      subscriptionModel.findById.mockResolvedValue({
        ...mockSubscription,
        pppoe_username: null,
      });

      await expect(acsService.rebootDevice(1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
    });

    it('should throw ACS_ERROR when ACS request fails', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockRejectedValue({
        response: { status: 502, data: { message: 'ACS server unavailable' } },
      });

      await expect(acsService.rebootDevice(1)).rejects.toMatchObject({
        statusCode: 502,
        code: 'ACS_ERROR',
      });
    });
  });

  describe('changeWifi', () => {
    it('should change WiFi SSID and password successfully', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockResolvedValue({
        data: { status: 'success', message: 'WiFi updated' },
      });

      const result = await acsService.changeWifi(1, { ssid: 'MyWiFi', password: 'newpass123' });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/devices/uwais-pppoe-001/wifi',
        { ssid: 'MyWiFi', password: 'newpass123' }
      );
      expect(result.subscriptionId).toBe(1);
      expect(result.operation).toBe('wifi_change');
      expect(result.changes).toEqual({ ssid: 'MyWiFi', password: 'newpass123' });
    });

    it('should change only SSID when password not provided', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockResolvedValue({
        data: { status: 'success' },
      });

      const result = await acsService.changeWifi(1, { ssid: 'NewSSID' });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/devices/uwais-pppoe-001/wifi',
        { ssid: 'NewSSID' }
      );
      expect(result.changes).toEqual({ ssid: 'NewSSID' });
    });

    it('should change only password when SSID not provided', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockResolvedValue({
        data: { status: 'success' },
      });

      const result = await acsService.changeWifi(1, { password: 'securepass' });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/devices/uwais-pppoe-001/wifi',
        { password: 'securepass' }
      );
      expect(result.changes).toEqual({ password: 'securepass' });
    });

    it('should throw 400 when neither ssid nor password provided', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);

      await expect(acsService.changeWifi(1, {})).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
    });

    it('should throw ACS_ERROR when ACS request fails', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal ACS error' } },
      });

      await expect(acsService.changeWifi(1, { ssid: 'Test' })).rejects.toMatchObject({
        statusCode: 500,
        code: 'ACS_ERROR',
      });
    });
  });

  describe('triggerFirmwareUpdate', () => {
    it('should trigger firmware update successfully', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockResolvedValue({
        data: { status: 'success', message: 'Firmware update initiated' },
      });

      const result = await acsService.triggerFirmwareUpdate(1, {
        firmware_url: 'http://firmware.example.com/v2.0.bin',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/devices/uwais-pppoe-001/firmware',
        { firmware_url: 'http://firmware.example.com/v2.0.bin' }
      );
      expect(result.subscriptionId).toBe(1);
      expect(result.operation).toBe('firmware_update');
      expect(result.status).toBe('success');
    });

    it('should trigger firmware update without URL (use default)', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockResolvedValue({
        data: { status: 'success' },
      });

      const result = await acsService.triggerFirmwareUpdate(1);

      expect(mockClient.post).toHaveBeenCalledWith('/devices/uwais-pppoe-001/firmware', {});
      expect(result.operation).toBe('firmware_update');
    });

    it('should throw ACS_ERROR when ACS request fails', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.post.mockRejectedValue({
        response: { status: 503, data: { message: 'Service unavailable' } },
      });

      await expect(acsService.triggerFirmwareUpdate(1)).rejects.toMatchObject({
        statusCode: 503,
        code: 'ACS_ERROR',
      });
    });
  });

  describe('getDeviceStatus', () => {
    it('should retrieve device status successfully', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.get.mockResolvedValue({
        data: {
          device_model: 'ZTE F660',
          firmware_version: '2.1.0',
          last_contact: '2024-01-15T10:30:00Z',
          connection_status: 'online',
        },
      });

      const result = await acsService.getDeviceStatus(1);

      expect(mockClient.get).toHaveBeenCalledWith('/devices/uwais-pppoe-001/status');
      expect(result.subscriptionId).toBe(1);
      expect(result.deviceId).toBe('uwais-pppoe-001');
      expect(result.device_model).toBe('ZTE F660');
      expect(result.firmware_version).toBe('2.1.0');
      expect(result.last_contact).toBe('2024-01-15T10:30:00Z');
      expect(result.connection_status).toBe('online');
    });

    it('should return unknown connection_status when not provided by ACS', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.get.mockResolvedValue({
        data: {
          device_model: 'Huawei HG8245H',
        },
      });

      const result = await acsService.getDeviceStatus(1);

      expect(result.device_model).toBe('Huawei HG8245H');
      expect(result.connection_status).toBe('unknown');
    });

    it('should throw 404 when device not found in ACS', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.get.mockRejectedValue({
        response: { status: 404, data: { message: 'Device not found' } },
      });

      await expect(acsService.getDeviceStatus(1)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw ACS_ERROR when ACS request fails', async () => {
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      mockClient.get.mockRejectedValue({
        response: { status: 500, data: { message: 'ACS internal error' } },
      });

      await expect(acsService.getDeviceStatus(1)).rejects.toMatchObject({
        statusCode: 500,
        code: 'ACS_ERROR',
      });
    });
  });

  describe('PPPoE username as device identifier (Requirement 3.4, 15.1)', () => {
    it('should use pppoe_username as the ACS device identifier', async () => {
      const subscription = {
        ...mockSubscription,
        pppoe_username: 'custom-pppoe-user',
      };
      subscriptionModel.findById.mockResolvedValue(subscription);
      mockClient.post.mockResolvedValue({ data: { status: 'success' } });

      await acsService.rebootDevice(1);

      expect(mockClient.post).toHaveBeenCalledWith('/devices/custom-pppoe-user/reboot');
    });

    it('should URL-encode special characters in PPPoE username', async () => {
      const subscription = {
        ...mockSubscription,
        pppoe_username: 'user@domain.com',
      };
      subscriptionModel.findById.mockResolvedValue(subscription);
      mockClient.post.mockResolvedValue({ data: { status: 'success' } });

      await acsService.rebootDevice(1);

      expect(mockClient.post).toHaveBeenCalledWith(
        `/devices/${encodeURIComponent('user@domain.com')}/reboot`
      );
    });
  });
});
