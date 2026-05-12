/**
 * Unit tests for systemSettings model and service.
 */

jest.mock('../../src/config/database');

const { appPool, resetMocks } = require('../helpers/dbMock');
const { appPool: mockAppPool } = require('../../src/config/database');

// Wire up the mock
Object.assign(mockAppPool, appPool);

const systemSettingsModel = require('../../src/models/systemSettings.model');
const systemSettingsService = require('../../src/services/systemSettings.service');

beforeEach(() => {
  resetMocks();
});

describe('SystemSettings Model', () => {
  describe('findAll', () => {
    it('should return all settings ordered by key', async () => {
      const mockSettings = [
        { id: 1, setting_key: 'coverage_radius', setting_value: '500', description: 'Coverage radius in meters', updated_at: '2024-01-01' },
        { id: 2, setting_key: 'prorata_enabled', setting_value: 'true', description: 'Enable prorata billing', updated_at: '2024-01-01' },
      ];
      appPool.execute.mockResolvedValueOnce([mockSettings, []]);

      const result = await systemSettingsModel.findAll();

      expect(result).toEqual(mockSettings);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT id, setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key ASC'
      );
    });
  });

  describe('findByKey', () => {
    it('should return setting when found', async () => {
      const mockSetting = { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: 'Enable prorata', updated_at: '2024-01-01' };
      appPool.execute.mockResolvedValueOnce([[mockSetting], []]);

      const result = await systemSettingsModel.findByKey('prorata_enabled');

      expect(result).toEqual(mockSetting);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT id, setting_key, setting_value, description, updated_at FROM system_settings WHERE setting_key = ? LIMIT 1',
        ['prorata_enabled']
      );
    });

    it('should return null when not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await systemSettingsModel.findByKey('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByKeys', () => {
    it('should return settings matching the given keys', async () => {
      const mockSettings = [
        { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: null, updated_at: '2024-01-01' },
        { id: 2, setting_key: 'coverage_radius', setting_value: '500', description: null, updated_at: '2024-01-01' },
      ];
      appPool.execute.mockResolvedValueOnce([mockSettings, []]);

      const result = await systemSettingsModel.findByKeys(['prorata_enabled', 'coverage_radius']);

      expect(result).toEqual(mockSettings);
      expect(appPool.execute).toHaveBeenCalledWith(
        'SELECT id, setting_key, setting_value, description, updated_at FROM system_settings WHERE setting_key IN (?, ?) ORDER BY setting_key ASC',
        ['prorata_enabled', 'coverage_radius']
      );
    });

    it('should return empty array for empty keys', async () => {
      const result = await systemSettingsModel.findByKeys([]);
      expect(result).toEqual([]);
    });
  });

  describe('getValue', () => {
    it('should return the setting value', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: '750' }], []]);

      const result = await systemSettingsModel.getValue('coverage_radius');

      expect(result).toBe('750');
    });

    it('should return null when not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await systemSettingsModel.getValue('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should insert or update a setting with description', async () => {
      const mockSetting = { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: 'Enable prorata', updated_at: '2024-01-01' };
      appPool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // upsert
        .mockResolvedValueOnce([[mockSetting], []]);        // findByKey

      const result = await systemSettingsModel.upsert('prorata_enabled', 'true', 'Enable prorata');

      expect(result).toEqual(mockSetting);
    });

    it('should insert or update a setting without description', async () => {
      const mockSetting = { id: 1, setting_key: 'prorata_enabled', setting_value: 'false', description: null, updated_at: '2024-01-01' };
      appPool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[mockSetting], []]);

      const result = await systemSettingsModel.upsert('prorata_enabled', 'false');

      expect(result).toEqual(mockSetting);
    });
  });

  describe('updateValue', () => {
    it('should update the setting value', async () => {
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await systemSettingsModel.updateValue('prorata_enabled', 'false');

      expect(result.affectedRows).toBe(1);
      expect(appPool.execute).toHaveBeenCalledWith(
        'UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
        ['false', 'prorata_enabled']
      );
    });
  });

  describe('deleteByKey', () => {
    it('should delete the setting', async () => {
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await systemSettingsModel.deleteByKey('some_key');

      expect(result.affectedRows).toBe(1);
      expect(appPool.execute).toHaveBeenCalledWith(
        'DELETE FROM system_settings WHERE setting_key = ?',
        ['some_key']
      );
    });
  });
});

describe('SystemSettings Service', () => {
  describe('getAllSettings', () => {
    it('should return all settings from model', async () => {
      const mockSettings = [
        { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: null, updated_at: '2024-01-01' },
      ];
      appPool.execute.mockResolvedValueOnce([mockSettings, []]);

      const result = await systemSettingsService.getAllSettings();

      expect(result).toEqual(mockSettings);
    });
  });

  describe('getSettingByKey', () => {
    it('should return setting when found', async () => {
      const mockSetting = { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: null, updated_at: '2024-01-01' };
      appPool.execute.mockResolvedValueOnce([[mockSetting], []]);

      const result = await systemSettingsService.getSettingByKey('prorata_enabled');

      expect(result).toEqual(mockSetting);
    });

    it('should throw 404 when setting not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(systemSettingsService.getSettingByKey('nonexistent'))
        .rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
    });
  });

  describe('getSettingValue', () => {
    it('should return value when setting exists', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

      const result = await systemSettingsService.getSettingValue('prorata_enabled');

      expect(result).toBe('true');
    });

    it('should return default when setting not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await systemSettingsService.getSettingValue('nonexistent', 'default_val');

      expect(result).toBe('default_val');
    });

    it('should return null when setting not found and no default', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await systemSettingsService.getSettingValue('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSettingsMap', () => {
    it('should return a key-value map of settings', async () => {
      const mockSettings = [
        { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: null, updated_at: '2024-01-01' },
        { id: 2, setting_key: 'coverage_radius', setting_value: '500', description: null, updated_at: '2024-01-01' },
      ];
      appPool.execute.mockResolvedValueOnce([mockSettings, []]);

      const result = await systemSettingsService.getSettingsMap(['prorata_enabled', 'coverage_radius']);

      expect(result).toEqual({
        prorata_enabled: 'true',
        coverage_radius: '500',
      });
    });
  });

  describe('updateSetting', () => {
    it('should upsert a setting with valid key and value', async () => {
      const mockSetting = { id: 1, setting_key: 'prorata_enabled', setting_value: 'false', description: 'Prorata toggle', updated_at: '2024-01-01' };
      appPool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[mockSetting], []]);

      const result = await systemSettingsService.updateSetting('prorata_enabled', 'false', 'Prorata toggle');

      expect(result).toEqual(mockSetting);
    });

    it('should throw validation error for empty key', async () => {
      await expect(systemSettingsService.updateSetting('', 'value'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw validation error for null value', async () => {
      await expect(systemSettingsService.updateSetting('key', null))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should convert numeric value to string', async () => {
      const mockSetting = { id: 1, setting_key: 'coverage_radius', setting_value: '750', description: null, updated_at: '2024-01-01' };
      appPool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[mockSetting], []]);

      const result = await systemSettingsService.updateSetting('coverage_radius', 750);

      expect(result.setting_value).toBe('750');
    });
  });

  describe('updateMultipleSettings', () => {
    it('should update multiple settings', async () => {
      const mockSetting1 = { id: 1, setting_key: 'prorata_enabled', setting_value: 'true', description: null, updated_at: '2024-01-01' };
      const mockSetting2 = { id: 2, setting_key: 'coverage_radius', setting_value: '600', description: null, updated_at: '2024-01-01' };

      appPool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[mockSetting1], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[mockSetting2], []]);

      const result = await systemSettingsService.updateMultipleSettings([
        { key: 'prorata_enabled', value: 'true' },
        { key: 'coverage_radius', value: '600' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].setting_key).toBe('prorata_enabled');
      expect(result[1].setting_key).toBe('coverage_radius');
    });

    it('should throw validation error for empty array', async () => {
      await expect(systemSettingsService.updateMultipleSettings([]))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });

    it('should throw validation error for non-array input', async () => {
      await expect(systemSettingsService.updateMultipleSettings('invalid'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    });
  });

  describe('isProrataEnabled', () => {
    it('should return true when value is "true"', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

      const result = await systemSettingsService.isProrataEnabled();

      expect(result).toBe(true);
    });

    it('should return true when value is "1"', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: '1' }], []]);

      const result = await systemSettingsService.isProrataEnabled();

      expect(result).toBe(true);
    });

    it('should return false when value is "false"', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'false' }], []]);

      const result = await systemSettingsService.isProrataEnabled();

      expect(result).toBe(false);
    });

    it('should return false when setting not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await systemSettingsService.isProrataEnabled();

      expect(result).toBe(false);
    });
  });

  describe('isInstallationFeeEnabled', () => {
    it('should return true when value is "true"', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

      const result = await systemSettingsService.isInstallationFeeEnabled();

      expect(result).toBe(true);
    });

    it('should return false when value is "0"', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: '0' }], []]);

      const result = await systemSettingsService.isInstallationFeeEnabled();

      expect(result).toBe(false);
    });
  });

  describe('getCoverageRadius', () => {
    it('should return value from database when valid', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: '750' }], []]);

      const result = await systemSettingsService.getCoverageRadius();

      expect(result).toBe(750);
    });

    it('should return env fallback when setting not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);
      const originalEnv = process.env.COVERAGE_RADIUS_METERS;
      process.env.COVERAGE_RADIUS_METERS = '1000';

      const result = await systemSettingsService.getCoverageRadius();

      expect(result).toBe(1000);
      process.env.COVERAGE_RADIUS_METERS = originalEnv;
    });

    it('should return 500 default when no setting and no env', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);
      const originalEnv = process.env.COVERAGE_RADIUS_METERS;
      delete process.env.COVERAGE_RADIUS_METERS;

      const result = await systemSettingsService.getCoverageRadius();

      expect(result).toBe(500);
      process.env.COVERAGE_RADIUS_METERS = originalEnv;
    });

    it('should fallback when stored value is invalid', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'invalid' }], []]);
      const originalEnv = process.env.COVERAGE_RADIUS_METERS;
      delete process.env.COVERAGE_RADIUS_METERS;

      const result = await systemSettingsService.getCoverageRadius();

      expect(result).toBe(500);
      process.env.COVERAGE_RADIUS_METERS = originalEnv;
    });

    it('should fallback when stored value is zero or negative', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: '0' }], []]);
      const originalEnv = process.env.COVERAGE_RADIUS_METERS;
      delete process.env.COVERAGE_RADIUS_METERS;

      const result = await systemSettingsService.getCoverageRadius();

      expect(result).toBe(500);
      process.env.COVERAGE_RADIUS_METERS = originalEnv;
    });
  });

  describe('getNotificationIntervals', () => {
    it('should return parsed JSON when valid', async () => {
      const intervals = { invoice_reminder_days: [2, 5], isolir_warning_days: [1], payment_confirmation_delay_minutes: 10 };
      appPool.execute.mockResolvedValueOnce([[{ setting_value: JSON.stringify(intervals) }], []]);

      const result = await systemSettingsService.getNotificationIntervals();

      expect(result).toEqual(intervals);
    });

    it('should return defaults when setting not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await systemSettingsService.getNotificationIntervals();

      expect(result).toEqual({
        invoice_reminder_days: [1, 3, 7],
        isolir_warning_days: [1, 3],
        payment_confirmation_delay_minutes: 5,
      });
    });

    it('should return defaults when stored value is invalid JSON', async () => {
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'not-json' }], []]);

      const result = await systemSettingsService.getNotificationIntervals();

      expect(result).toEqual({
        invoice_reminder_days: [1, 3, 7],
        isolir_warning_days: [1, 3],
        payment_confirmation_delay_minutes: 5,
      });
    });
  });

  describe('deleteSetting', () => {
    it('should delete an existing setting', async () => {
      const mockSetting = { id: 1, setting_key: 'some_key', setting_value: 'val', description: null, updated_at: '2024-01-01' };
      appPool.execute
        .mockResolvedValueOnce([[mockSetting], []])  // findByKey
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]);  // deleteByKey

      await expect(systemSettingsService.deleteSetting('some_key')).resolves.toBeUndefined();
    });

    it('should throw 404 when setting not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(systemSettingsService.deleteSetting('nonexistent'))
        .rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
    });
  });
});
