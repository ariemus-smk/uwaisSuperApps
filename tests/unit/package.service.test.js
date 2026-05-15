/**
 * Unit tests for package service.
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/radiusModels/radgroupreply.model', () => ({
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({ affectedRows: 1 }),
  findByGroupname: jest.fn().mockResolvedValue([]),
  findByGroupnameAndAttribute: jest.fn().mockResolvedValue(null),
  deleteByGroupname: jest.fn().mockResolvedValue({ affectedRows: 1 })
}));

const { appPool } = require('../../src/config/database');
const packageService = require('../../src/services/package.service');

describe('Package Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPackageData = {
    name: 'Paket 10 Mbps',
    upload_rate_limit: 5000,
    download_rate_limit: 10000,
    upload_burst_limit: 7000,
    download_burst_limit: 15000,
    upload_burst_threshold: 4000,
    download_burst_threshold: 8000,
    monthly_price: 150000,
    ppn_enabled: true,
    fup_enabled: false,
  };

  describe('getAllPackages', () => {
    it('should return all packages without filters', async () => {
      const mockPackages = [
        { id: 1, name: 'Paket 10 Mbps', status: 'Active' },
        { id: 2, name: 'Paket 20 Mbps', status: 'Inactive' },
      ];
      appPool.execute.mockResolvedValueOnce([mockPackages, []]);

      const result = await packageService.getAllPackages();

      expect(result).toEqual(mockPackages);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM packages ORDER BY name ASC',
        []
      );
    });

    it('should filter packages by status', async () => {
      const mockPackages = [{ id: 1, name: 'Paket 10 Mbps', status: 'Active' }];
      appPool.execute.mockResolvedValueOnce([mockPackages, []]);

      const result = await packageService.getAllPackages({ status: 'Active' });

      expect(result).toEqual(mockPackages);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM packages WHERE status = ? ORDER BY name ASC',
        ['Active']
      );
    });
  });

  describe('getPackageById', () => {
    it('should return a package when found', async () => {
      const mockPackage = { id: 1, name: 'Paket 10 Mbps', status: 'Active' };
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);

      const result = await packageService.getPackageById(1);

      expect(result).toEqual(mockPackage);
    });

    it('should throw 404 when package not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(packageService.getPackageById(999)).rejects.toMatchObject({
        message: 'Package not found.',
        statusCode: 404,
      });
    });
  });

  describe('createPackage', () => {
    it('should create a package successfully with valid QoS parameters', async () => {
      // findByName returns empty (no duplicate)
      appPool.execute.mockResolvedValueOnce([[], []]);
      // create returns insertId
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await packageService.createPackage(validPackageData);

      expect(result).toMatchObject({
        id: 1,
        name: 'Paket 10 Mbps',
      });
    });

    it('should throw 409 when package name already exists', async () => {
      const existing = { id: 1, name: 'Paket 10 Mbps' };
      appPool.execute.mockResolvedValueOnce([[existing], []]);

      await expect(packageService.createPackage(validPackageData)).rejects.toMatchObject({
        message: 'Package with this name already exists.',
        statusCode: 409,
      });
    });

    it('should throw 400 when upload_burst_limit < upload_rate_limit', async () => {
      const invalidData = {
        ...validPackageData,
        upload_burst_limit: 3000, // less than upload_rate_limit (5000)
      };

      await expect(packageService.createPackage(invalidData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when download_burst_limit < download_rate_limit', async () => {
      const invalidData = {
        ...validPackageData,
        download_burst_limit: 5000, // less than download_rate_limit (10000)
      };

      await expect(packageService.createPackage(invalidData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when upload_burst_threshold > upload_rate_limit', async () => {
      const invalidData = {
        ...validPackageData,
        upload_burst_threshold: 6000, // greater than upload_rate_limit (5000)
      };

      await expect(packageService.createPackage(invalidData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when download_burst_threshold > download_rate_limit', async () => {
      const invalidData = {
        ...validPackageData,
        download_burst_threshold: 12000, // greater than download_rate_limit (10000)
      };

      await expect(packageService.createPackage(invalidData)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should accept burst_limit equal to rate_limit', async () => {
      const edgeData = {
        ...validPackageData,
        upload_burst_limit: 5000, // equal to upload_rate_limit
        download_burst_limit: 10000, // equal to download_rate_limit
      };

      // findByName returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);
      // create returns insertId
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await packageService.createPackage(edgeData);
      expect(result.id).toBe(1);
    });

    it('should accept burst_threshold equal to rate_limit', async () => {
      const edgeData = {
        ...validPackageData,
        upload_burst_threshold: 5000, // equal to upload_rate_limit
        download_burst_threshold: 10000, // equal to download_rate_limit
      };

      // findByName returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);
      // create returns insertId
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await packageService.createPackage(edgeData);
      expect(result.id).toBe(1);
    });
  });

  describe('updatePackage', () => {
    const mockPackage = {
      id: 1,
      name: 'Paket 10 Mbps',
      upload_rate_limit: 5000,
      download_rate_limit: 10000,
      upload_burst_limit: 7000,
      download_burst_limit: 15000,
      upload_burst_threshold: 4000,
      download_burst_threshold: 8000,
      monthly_price: 150000,
      status: 'Active',
    };

    it('should update a package successfully', async () => {
      // findById (check exists)
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // update query
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      const updatedPackage = { ...mockPackage, monthly_price: 200000 };
      appPool.execute.mockResolvedValueOnce([[updatedPackage], []]);

      const result = await packageService.updatePackage(1, { monthly_price: 200000 });

      expect(result.monthly_price).toBe(200000);
    });

    it('should throw 404 when package not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        packageService.updatePackage(999, { monthly_price: 200000 })
      ).rejects.toMatchObject({
        message: 'Package not found.',
        statusCode: 404,
      });
    });

    it('should throw 409 when updating to a duplicate name', async () => {
      // findById (check exists)
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // findByName (check duplicate)
      const existing = { id: 2, name: 'Duplicate Name' };
      appPool.execute.mockResolvedValueOnce([[existing], []]);

      await expect(
        packageService.updatePackage(1, { name: 'Duplicate Name' })
      ).rejects.toMatchObject({
        message: 'Package with this name already exists.',
        statusCode: 409,
      });
    });

    it('should validate QoS with merged values on partial update', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);

      // Try to set upload_rate_limit higher than existing upload_burst_limit
      await expect(
        packageService.updatePackage(1, { upload_rate_limit: 8000 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should allow valid partial QoS update', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      const updatedPackage = { ...mockPackage, upload_burst_limit: 10000 };
      appPool.execute.mockResolvedValueOnce([[updatedPackage], []]);

      const result = await packageService.updatePackage(1, { upload_burst_limit: 10000 });

      expect(result.upload_burst_limit).toBe(10000);
    });
  });

  describe('deletePackage', () => {
    const mockPackage = { id: 1, name: 'Paket 10 Mbps', status: 'Active' };

    it('should delete a package with no active subscriptions', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // countActiveSubscriptions returns 0
      appPool.execute.mockResolvedValueOnce([[{ count: 0 }], []]);
      // deleteById
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      await expect(packageService.deletePackage(1)).resolves.toBeUndefined();
    });

    it('should throw 404 when package not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(packageService.deletePackage(999)).rejects.toMatchObject({
        message: 'Package not found.',
        statusCode: 404,
      });
    });

    it('should throw 409 when package has active subscriptions', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // countActiveSubscriptions returns > 0
      appPool.execute.mockResolvedValueOnce([[{ count: 5 }], []]);

      await expect(packageService.deletePackage(1)).rejects.toMatchObject({
        message: 'Cannot delete package with active subscriptions.',
        statusCode: 409,
        code: 'PACKAGE_HAS_ACTIVE_SUBS',
      });
    });
  });

  describe('validateQoSParameters', () => {
    it('should not throw for valid parameters', () => {
      expect(() => packageService.validateQoSParameters(validPackageData)).not.toThrow();
    });

    it('should throw with multiple errors for multiple violations', () => {
      const invalidData = {
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 3000, // violation
        download_burst_limit: 8000, // violation
        upload_burst_threshold: 6000, // violation
        download_burst_threshold: 12000, // violation
      };

      try {
        packageService.validateQoSParameters(invalidData);
        fail('Should have thrown');
      } catch (err) {
        expect(err.errors).toHaveLength(4);
        expect(err.statusCode).toBe(400);
      }
    });

    it('should report correct field names in multiple violation errors', () => {
      const invalidData = {
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 4999, // just below rate_limit
        download_burst_limit: 9999, // just below rate_limit
        upload_burst_threshold: 5001, // just above rate_limit
        download_burst_threshold: 10001, // just above rate_limit
      };

      try {
        packageService.validateQoSParameters(invalidData);
        fail('Should have thrown');
      } catch (err) {
        const fields = err.errors.map((e) => e.field);
        expect(fields).toContain('upload_burst_limit');
        expect(fields).toContain('download_burst_limit');
        expect(fields).toContain('upload_burst_threshold');
        expect(fields).toContain('download_burst_threshold');
      }
    });

    it('should accept burst_threshold of 0 (valid since 0 <= rate_limit)', () => {
      const data = {
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 5000,
        download_burst_limit: 10000,
        upload_burst_threshold: 0,
        download_burst_threshold: 0,
      };

      expect(() => packageService.validateQoSParameters(data)).not.toThrow();
    });

    it('should reject burst_limit of 0 when rate_limit > 0', () => {
      const data = {
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 0,
        download_burst_limit: 0,
        upload_burst_threshold: 1000,
        download_burst_threshold: 5000,
      };

      try {
        packageService.validateQoSParameters(data);
        fail('Should have thrown');
      } catch (err) {
        expect(err.errors.length).toBeGreaterThanOrEqual(2);
        expect(err.errors.some((e) => e.field === 'upload_burst_limit')).toBe(true);
        expect(err.errors.some((e) => e.field === 'download_burst_limit')).toBe(true);
      }
    });

    it('should fail when burst_limit is exactly 1 less than rate_limit', () => {
      const data = {
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 4999,
        download_burst_limit: 10000,
        upload_burst_threshold: 4000,
        download_burst_threshold: 8000,
      };

      try {
        packageService.validateQoSParameters(data);
        fail('Should have thrown');
      } catch (err) {
        expect(err.errors).toHaveLength(1);
        expect(err.errors[0].field).toBe('upload_burst_limit');
      }
    });

    it('should fail when burst_threshold is exactly 1 more than rate_limit', () => {
      const data = {
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 7000,
        download_burst_limit: 15000,
        upload_burst_threshold: 5001,
        download_burst_threshold: 8000,
      };

      try {
        packageService.validateQoSParameters(data);
        fail('Should have thrown');
      } catch (err) {
        expect(err.errors).toHaveLength(1);
        expect(err.errors[0].field).toBe('upload_burst_threshold');
      }
    });
  });

  describe('deletePackage - active subscription edge cases', () => {
    const mockPackage = { id: 1, name: 'Paket 10 Mbps', status: 'Active' };

    it('should prevent deletion with exactly 1 active subscription', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // countActiveSubscriptions returns 1
      appPool.execute.mockResolvedValueOnce([[{ count: 1 }], []]);

      await expect(packageService.deletePackage(1)).rejects.toMatchObject({
        message: 'Cannot delete package with active subscriptions.',
        statusCode: 409,
        code: 'PACKAGE_HAS_ACTIVE_SUBS',
      });
    });

    it('should prevent deletion with many active subscriptions', async () => {
      // findById
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // countActiveSubscriptions returns large number
      appPool.execute.mockResolvedValueOnce([[{ count: 100 }], []]);

      await expect(packageService.deletePackage(1)).rejects.toMatchObject({
        statusCode: 409,
        code: 'PACKAGE_HAS_ACTIVE_SUBS',
      });
    });
  });

  describe('FUP configuration per package', () => {
    it('should create a package with FUP enabled and all FUP fields', async () => {
      const fupPackageData = {
        ...validPackageData,
        fup_enabled: true,
        fup_quota_gb: 100,
        fup_upload_speed: 2000,
        fup_download_speed: 5000,
      };

      // findByName returns empty (no duplicate)
      appPool.execute.mockResolvedValueOnce([[], []]);
      // create returns insertId
      appPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);

      const result = await packageService.createPackage(fupPackageData);

      expect(result.id).toBe(2);
      expect(result.fup_enabled).toBe(true);
      expect(result.fup_quota_gb).toBe(100);
      expect(result.fup_upload_speed).toBe(2000);
      expect(result.fup_download_speed).toBe(5000);
    });

    it('should create a package with FUP disabled and null FUP fields', async () => {
      const noFupData = {
        ...validPackageData,
        fup_enabled: false,
        fup_quota_gb: null,
        fup_upload_speed: null,
        fup_download_speed: null,
      };

      // findByName returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);
      // create returns insertId
      appPool.execute.mockResolvedValueOnce([{ insertId: 3 }, []]);

      const result = await packageService.createPackage(noFupData);

      expect(result.id).toBe(3);
      expect(result.fup_enabled).toBe(false);
      expect(result.fup_quota_gb).toBeNull();
      expect(result.fup_upload_speed).toBeNull();
      expect(result.fup_download_speed).toBeNull();
    });

    it('should update FUP configuration on an existing package', async () => {
      const mockPackage = {
        id: 1,
        name: 'Paket 10 Mbps',
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 7000,
        download_burst_limit: 15000,
        upload_burst_threshold: 4000,
        download_burst_threshold: 8000,
        monthly_price: 150000,
        fup_enabled: false,
        fup_quota_gb: null,
        fup_upload_speed: null,
        fup_download_speed: null,
        status: 'Active',
      };

      // findById (check exists)
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // update query
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      const updatedPackage = {
        ...mockPackage,
        fup_enabled: true,
        fup_quota_gb: 50,
        fup_upload_speed: 1000,
        fup_download_speed: 3000,
      };
      appPool.execute.mockResolvedValueOnce([[updatedPackage], []]);

      const result = await packageService.updatePackage(1, {
        fup_enabled: true,
        fup_quota_gb: 50,
        fup_upload_speed: 1000,
        fup_download_speed: 3000,
      });

      expect(result.fup_enabled).toBe(true);
      expect(result.fup_quota_gb).toBe(50);
      expect(result.fup_upload_speed).toBe(1000);
      expect(result.fup_download_speed).toBe(3000);
    });

    it('should allow disabling FUP on an existing package', async () => {
      const mockPackage = {
        id: 1,
        name: 'Paket 10 Mbps',
        upload_rate_limit: 5000,
        download_rate_limit: 10000,
        upload_burst_limit: 7000,
        download_burst_limit: 15000,
        upload_burst_threshold: 4000,
        download_burst_threshold: 8000,
        monthly_price: 150000,
        fup_enabled: true,
        fup_quota_gb: 100,
        fup_upload_speed: 2000,
        fup_download_speed: 5000,
        status: 'Active',
      };

      // findById (check exists)
      appPool.execute.mockResolvedValueOnce([[mockPackage], []]);
      // update query
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findById (return updated)
      const updatedPackage = {
        ...mockPackage,
        fup_enabled: false,
        fup_quota_gb: null,
        fup_upload_speed: null,
        fup_download_speed: null,
      };
      appPool.execute.mockResolvedValueOnce([[updatedPackage], []]);

      const result = await packageService.updatePackage(1, {
        fup_enabled: false,
        fup_quota_gb: null,
        fup_upload_speed: null,
        fup_download_speed: null,
      });

      expect(result.fup_enabled).toBe(false);
      expect(result.fup_quota_gb).toBeNull();
      expect(result.fup_upload_speed).toBeNull();
      expect(result.fup_download_speed).toBeNull();
    });
  });
});
