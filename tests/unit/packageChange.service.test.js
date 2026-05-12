/**
 * Unit tests for package change service.
 * Tests: request submission, monthly limit enforcement, approval flow, rejection flow.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/services/coa.service', () => ({
  speedChange: jest.fn(),
}));

const { appPool } = require('../../src/config/database');
const coaService = require('../../src/services/coa.service');
const packageChangeService = require('../../src/services/packageChange.service');

describe('Package Change Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSubscription = {
    id: 1,
    customer_id: 10,
    package_id: 100,
    pppoe_username: 'pppoe-user-001',
    nas_id: 5,
    status: 'Active',
  };

  const mockCurrentPackage = {
    id: 100,
    name: 'Paket 10 Mbps',
    monthly_price: 150000,
    upload_rate_limit: 5000,
    download_rate_limit: 10000,
    status: 'Active',
  };

  const mockRequestedPackage = {
    id: 200,
    name: 'Paket 20 Mbps',
    monthly_price: 250000,
    upload_rate_limit: 10000,
    download_rate_limit: 20000,
    status: 'Active',
  };

  describe('requestPackageChange', () => {
    it('should create a package change request successfully', async () => {
      // findById (subscription)
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // findById (requested package)
      appPool.execute.mockResolvedValueOnce([[mockRequestedPackage], []]);
      // countApprovedInMonth returns 0
      appPool.execute.mockResolvedValueOnce([[{ count: 0 }], []]);
      // create request
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await packageChangeService.requestPackageChange({
        subscription_id: 1,
        requested_package_id: 200,
        requested_by: 50,
      });

      expect(result).toMatchObject({
        id: 1,
        subscription_id: 1,
        current_package_id: 100,
        requested_package_id: 200,
        requested_by: 50,
        status: 'Pending',
      });
    });

    it('should throw 404 when subscription not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 999,
          requested_package_id: 200,
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        message: 'Subscription not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when subscription is not active', async () => {
      const suspendedSub = { ...mockSubscription, status: 'Suspended' };
      appPool.execute.mockResolvedValueOnce([[suspendedSub], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 1,
          requested_package_id: 200,
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 404 when requested package not found', async () => {
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 1,
          requested_package_id: 999,
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        message: 'Requested package not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when requested package is inactive', async () => {
      const inactivePkg = { ...mockRequestedPackage, status: 'Inactive' };
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      appPool.execute.mockResolvedValueOnce([[inactivePkg], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 1,
          requested_package_id: 200,
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when requested package is same as current', async () => {
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      appPool.execute.mockResolvedValueOnce([[mockCurrentPackage], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 1,
          requested_package_id: 100, // same as current
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 422 when monthly change limit is reached (Req 17.2)', async () => {
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      appPool.execute.mockResolvedValueOnce([[mockRequestedPackage], []]);
      // countApprovedInMonth returns 1 (limit reached)
      appPool.execute.mockResolvedValueOnce([[{ count: 1 }], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 1,
          requested_package_id: 200,
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'PACKAGE_CHANGE_LIMIT',
      });
    });

    it('should throw 422 when multiple changes already approved in month', async () => {
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      appPool.execute.mockResolvedValueOnce([[mockRequestedPackage], []]);
      // countApprovedInMonth returns 3
      appPool.execute.mockResolvedValueOnce([[{ count: 3 }], []]);

      await expect(
        packageChangeService.requestPackageChange({
          subscription_id: 1,
          requested_package_id: 200,
          requested_by: 50,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'PACKAGE_CHANGE_LIMIT',
      });
    });
  });

  describe('approvePackageChange', () => {
    const mockPendingRequest = {
      id: 1,
      subscription_id: 1,
      current_package_id: 100,
      requested_package_id: 200,
      requested_by: 50,
      status: 'Pending',
      customer_id: 10,
      nas_id: 5,
      pppoe_username: 'pppoe-user-001',
      current_package_price: '150000.00',
      requested_package_price: '250000.00',
    };

    it('should approve a package change request successfully', async () => {
      // findByIdWithDetails
      appPool.execute.mockResolvedValueOnce([[mockPendingRequest], []]);
      // countApprovedInMonth returns 0
      appPool.execute.mockResolvedValueOnce([[{ count: 0 }], []]);
      // findById (new package)
      appPool.execute.mockResolvedValueOnce([[mockRequestedPackage], []]);
      // update subscription (package_id)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // update subscription timestamp (billing adjustment)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // update request status
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (subscription for CoA)
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);

      // CoA speed change succeeds
      coaService.speedChange.mockResolvedValueOnce({
        success: true,
        responseStatus: 'ACK',
        retryCount: 0,
        logId: 1,
      });

      const result = await packageChangeService.approvePackageChange(1, 99);

      expect(result.status).toBe('Approved');
      expect(result.approved_by).toBe(99);
      expect(result.coa_result.success).toBe(true);
      expect(result.billing_adjustment).toBeDefined();
      expect(result.billing_adjustment.type).toBe('upgrade');
      expect(coaService.speedChange).toHaveBeenCalledWith(
        1, 5, 'pppoe-user-001', '10000k/20000k'
      );
    });

    it('should throw 404 when request not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        packageChangeService.approvePackageChange(999, 99)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when request is already approved', async () => {
      const approvedRequest = { ...mockPendingRequest, status: 'Approved' };
      appPool.execute.mockResolvedValueOnce([[approvedRequest], []]);

      await expect(
        packageChangeService.approvePackageChange(1, 99)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when request is already rejected', async () => {
      const rejectedRequest = { ...mockPendingRequest, status: 'Rejected' };
      appPool.execute.mockResolvedValueOnce([[rejectedRequest], []]);

      await expect(
        packageChangeService.approvePackageChange(1, 99)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 422 when monthly limit reached during approval (race condition)', async () => {
      appPool.execute.mockResolvedValueOnce([[mockPendingRequest], []]);
      // countApprovedInMonth returns 1 (another request was approved in between)
      appPool.execute.mockResolvedValueOnce([[{ count: 1 }], []]);

      await expect(
        packageChangeService.approvePackageChange(1, 99)
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'PACKAGE_CHANGE_LIMIT',
      });
    });

    it('should still approve even if CoA fails (logs error)', async () => {
      appPool.execute.mockResolvedValueOnce([[mockPendingRequest], []]);
      appPool.execute.mockResolvedValueOnce([[{ count: 0 }], []]);
      appPool.execute.mockResolvedValueOnce([[mockRequestedPackage], []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);

      // CoA fails
      coaService.speedChange.mockRejectedValueOnce(new Error('SSH connection failed'));

      const result = await packageChangeService.approvePackageChange(1, 99);

      expect(result.status).toBe('Approved');
      expect(result.coa_result.success).toBe(false);
      expect(result.coa_result.error).toBe('SSH connection failed');
    });
  });

  describe('rejectPackageChange', () => {
    const mockPendingRequest = {
      id: 1,
      subscription_id: 1,
      current_package_id: 100,
      requested_package_id: 200,
      requested_by: 50,
      status: 'Pending',
    };

    it('should reject a package change request with reason', async () => {
      appPool.execute.mockResolvedValueOnce([[mockPendingRequest], []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await packageChangeService.rejectPackageChange(
        1, 99, 'Paket yang diminta sedang tidak tersedia'
      );

      expect(result.status).toBe('Rejected');
      expect(result.rejection_reason).toBe('Paket yang diminta sedang tidak tersedia');
    });

    it('should throw 404 when request not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        packageChangeService.rejectPackageChange(999, 99, 'Some reason')
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when request is not pending', async () => {
      const approvedRequest = { ...mockPendingRequest, status: 'Approved' };
      appPool.execute.mockResolvedValueOnce([[approvedRequest], []]);

      await expect(
        packageChangeService.rejectPackageChange(1, 99, 'Some reason')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when rejection reason is empty', async () => {
      appPool.execute.mockResolvedValueOnce([[mockPendingRequest], []]);

      await expect(
        packageChangeService.rejectPackageChange(1, 99, '')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when rejection reason is only whitespace', async () => {
      appPool.execute.mockResolvedValueOnce([[mockPendingRequest], []]);

      await expect(
        packageChangeService.rejectPackageChange(1, 99, '   ')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('buildRateLimitString', () => {
    it('should build correct rate limit string for a package', () => {
      const result = packageChangeService.buildRateLimitString(mockRequestedPackage);
      expect(result).toBe('10000k/20000k');
    });

    it('should handle small rate limits', () => {
      const pkg = { upload_rate_limit: 512, download_rate_limit: 1024 };
      const result = packageChangeService.buildRateLimitString(pkg);
      expect(result).toBe('512k/1024k');
    });
  });

  describe('calculateBillingAdjustment', () => {
    it('should calculate upgrade adjustment correctly', async () => {
      const request = {
        subscription_id: 1,
        current_package_price: '150000.00',
      };
      const newPackage = { monthly_price: 250000 };

      // update subscription timestamp
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await packageChangeService.calculateBillingAdjustment(request, newPackage);

      expect(result.current_price).toBe(150000);
      expect(result.new_price).toBe(250000);
      expect(result.price_difference).toBe(100000);
      expect(result.type).toBe('upgrade');
    });

    it('should calculate downgrade adjustment correctly', async () => {
      const request = {
        subscription_id: 1,
        current_package_price: '250000.00',
      };
      const newPackage = { monthly_price: 150000 };

      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await packageChangeService.calculateBillingAdjustment(request, newPackage);

      expect(result.current_price).toBe(250000);
      expect(result.new_price).toBe(150000);
      expect(result.price_difference).toBe(-100000);
      expect(result.type).toBe('downgrade');
    });
  });
});
