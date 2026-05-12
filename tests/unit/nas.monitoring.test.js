/**
 * Unit tests for NAS Monitoring Service.
 * Tests pollAllNas, handleStatusTransition, getMonitoringStatus,
 * and calculateDowntime functions.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 */

jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

// Mock net module for TCP connection testing
jest.mock('net', () => {
  const mockSocket = {
    setTimeout: jest.fn(),
    on: jest.fn(),
    connect: jest.fn(),
    destroy: jest.fn(),
  };
  return {
    Socket: jest.fn(() => mockSocket),
    _mockSocket: mockSocket,
  };
});

const { appPool, radiusPool, resetMocks } = require('../helpers/dbMock');
const net = require('net');

// We need to require the service after mocks are set up
const nasService = require('../../src/services/nas.service');

describe('NAS Monitoring Service', () => {
  beforeEach(() => {
    resetMocks();
    jest.clearAllMocks();

    // Clear in-memory stores between tests
    nasService._activeOutages.clear();
    nasService._alertEvents.length = 0;
  });

  describe('handleStatusTransition', () => {
    it('should record outage start when NAS goes Down', async () => {
      const result = await nasService.handleStatusTransition(1, 'Up', 'Down');

      expect(result.type).toBe('NAS_DOWN');
      expect(result.nasId).toBe(1);
      expect(result.previousStatus).toBe('Up');
      expect(result.timestamp).toBeDefined();
      expect(nasService._activeOutages.has(1)).toBe(true);
    });

    it('should generate alert event when NAS goes Down', async () => {
      await nasService.handleStatusTransition(1, 'Up', 'Down');

      expect(nasService._alertEvents.length).toBe(1);
      expect(nasService._alertEvents[0].type).toBe('NAS_DOWN');
      expect(nasService._alertEvents[0].nasId).toBe(1);
    });

    it('should calculate downtime when NAS recovers (Down -> Up)', async () => {
      // Simulate an outage that started 5 minutes ago
      const outageStart = new Date(Date.now() - 5 * 60 * 1000);
      nasService._activeOutages.set(1, outageStart);

      const result = await nasService.handleStatusTransition(1, 'Down', 'Up');

      expect(result.type).toBe('NAS_RECOVERED');
      expect(result.nasId).toBe(1);
      expect(result.outageStartedAt).toBe(outageStart.toISOString());
      expect(result.outageEndedAt).toBeDefined();
      expect(result.downtimeMs).toBeGreaterThan(0);
      expect(result.downtimeDuration).toContain('m');
      expect(nasService._activeOutages.has(1)).toBe(false);
    });

    it('should handle first poll Down (null -> Down)', async () => {
      const result = await nasService.handleStatusTransition(1, null, 'Down');

      expect(result.type).toBe('NAS_DOWN');
      expect(result.previousStatus).toBe('Unknown');
      expect(nasService._activeOutages.has(1)).toBe(true);
    });

    it('should handle recovery without prior outage record', async () => {
      const result = await nasService.handleStatusTransition(1, 'Down', 'Up');

      expect(result.type).toBe('NAS_RECOVERED');
      expect(result.downtimeMs).toBe(0);
      expect(result.outageStartedAt).toBeNull();
    });
  });

  describe('calculateDowntime', () => {
    it('should return zero downtime for NAS that is up', async () => {
      // Mock findById
      appPool.execute.mockResolvedValueOnce([[{
        id: 1, name: 'NAS-1', ip_address: '10.0.0.1', poll_status: 'Up',
      }]]);

      const result = await nasService.calculateDowntime(1);

      expect(result.isDown).toBe(false);
      expect(result.downtimeMs).toBe(0);
      expect(result.downtimeDuration).toBe('0s');
    });

    it('should calculate ongoing downtime for NAS that is down', async () => {
      // Set up an active outage
      const outageStart = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      nasService._activeOutages.set(2, outageStart);

      // Mock findById
      appPool.execute.mockResolvedValueOnce([[{
        id: 2, name: 'NAS-2', ip_address: '10.0.0.2', poll_status: 'Down',
      }]]);

      const result = await nasService.calculateDowntime(2);

      expect(result.isDown).toBe(true);
      expect(result.downtimeMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 100); // Allow small timing variance
      expect(result.downtimeDuration).toContain('m');
      expect(result.outageStartedAt).toBe(outageStart.toISOString());
    });

    it('should throw error for non-existent NAS', async () => {
      appPool.execute.mockResolvedValueOnce([[]]);

      await expect(nasService.calculateDowntime(999)).rejects.toThrow('NAS device not found.');
    });
  });

  describe('getMonitoringStatus', () => {
    it('should return monitoring status for all NAS devices', async () => {
      const mockDevices = [
        { id: 1, name: 'NAS-1', ip_address: '10.0.0.1', branch_id: 1, status: 'Active', poll_status: 'Up', last_poll_at: new Date(), active_sessions: 15 },
        { id: 2, name: 'NAS-2', ip_address: '10.0.0.2', branch_id: 1, status: 'Active', poll_status: 'Down', last_poll_at: new Date(), active_sessions: 0 },
        { id: 3, name: 'NAS-3', ip_address: '10.0.0.3', branch_id: 2, status: 'Active', poll_status: null, last_poll_at: null, active_sessions: 0 },
      ];

      // Mock findAll - count query then data query
      appPool.execute
        .mockResolvedValueOnce([[{ total: 3 }]])
        .mockResolvedValueOnce([mockDevices]);

      // Set up an active outage for NAS-2
      nasService._activeOutages.set(2, new Date());

      const result = await nasService.getMonitoringStatus();

      expect(result.devices).toHaveLength(3);
      expect(result.summary.total).toBe(3);
      expect(result.summary.up).toBe(1);
      expect(result.summary.down).toBe(1);
      expect(result.summary.unknown).toBe(1);

      // Check NAS-2 has active outage
      const nas2 = result.devices.find((d) => d.id === 2);
      expect(nas2.has_active_outage).toBe(true);
      expect(nas2.outage_started_at).toBeDefined();

      // Check NAS-1 has no active outage
      const nas1 = result.devices.find((d) => d.id === 1);
      expect(nas1.has_active_outage).toBe(false);
      expect(nas1.active_sessions).toBe(15);
    });
  });

  describe('pollAllNas', () => {
    it('should poll all active NAS devices and update status', async () => {
      const mockDevices = [
        { id: 1, name: 'NAS-1', ip_address: '10.0.0.1', api_port: 8728, branch_id: 1, poll_status: 'Up', active_sessions: 10 },
        { id: 2, name: 'NAS-2', ip_address: '10.0.0.2', api_port: 8728, branch_id: 1, poll_status: 'Up', active_sessions: 5 },
      ];

      // Mock findAll for pollAllNas (count + data)
      appPool.execute
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([mockDevices]);

      // Mock TCP connection - make both succeed
      const mockSocket = net._mockSocket;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'connect') {
          process.nextTick(() => handler());
        }
        return mockSocket;
      });

      // Mock getActiveSessionCount (radiusPool)
      radiusPool.execute.mockResolvedValue([[{ count: 12 }]]);

      // Mock updatePollStatus calls
      appPool.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // updatePollStatus NAS-1
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // updatePollStatus NAS-2

      const result = await nasService.pollAllNas();

      expect(result.total).toBe(2);
      expect(result.up).toBe(2);
      expect(result.down).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect Down transition and generate alert', async () => {
      const mockDevices = [
        { id: 1, name: 'NAS-1', ip_address: '10.0.0.1', api_port: 8728, branch_id: 1, poll_status: 'Up', active_sessions: 10 },
      ];

      // Mock findAll
      appPool.execute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([mockDevices]);

      // Mock TCP connection - make it fail (timeout)
      const mockSocket = net._mockSocket;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'timeout') {
          process.nextTick(() => handler());
        }
        return mockSocket;
      });

      // Mock updatePollStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await nasService.pollAllNas();

      expect(result.total).toBe(1);
      expect(result.down).toBe(1);
      expect(result.transitioned).toBe(1);
      expect(nasService._alertEvents.length).toBe(1);
      expect(nasService._alertEvents[0].type).toBe('NAS_DOWN');
    });
  });

  describe('getAlertEvents', () => {
    it('should return recent alert events', async () => {
      // Generate some events
      await nasService.handleStatusTransition(1, 'Up', 'Down');
      await nasService.handleStatusTransition(2, 'Up', 'Down');
      await nasService.handleStatusTransition(1, 'Down', 'Up');

      const events = nasService.getAlertEvents();

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('NAS_DOWN');
      expect(events[2].type).toBe('NAS_RECOVERED');
    });

    it('should respect limit parameter', async () => {
      await nasService.handleStatusTransition(1, 'Up', 'Down');
      await nasService.handleStatusTransition(2, 'Up', 'Down');
      await nasService.handleStatusTransition(3, 'Up', 'Down');

      const events = nasService.getAlertEvents(2);

      expect(events).toHaveLength(2);
    });
  });

  describe('_formatDuration', () => {
    it('should format zero duration', () => {
      expect(nasService._formatDuration(0)).toBe('0s');
    });

    it('should format seconds only', () => {
      expect(nasService._formatDuration(45000)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(nasService._formatDuration(125000)).toBe('2m 5s');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(nasService._formatDuration(3725000)).toBe('1h 2m 5s');
    });

    it('should format days', () => {
      const oneDayMs = 24 * 60 * 60 * 1000 + 3600000; // 1 day + 1 hour
      expect(nasService._formatDuration(oneDayMs)).toBe('1d 1h');
    });
  });
});
