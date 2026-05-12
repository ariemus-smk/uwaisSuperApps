/**
 * Unit tests for CoA/POD Engine Service.
 * Tests SSH execution, radclient response parsing, retry logic,
 * and convenience functions (isolir, unisolir, speedChange, sendPOD).
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

// Mock ssh2 Client with proper event emitter behavior
let sshReadyCallback = null;
let sshErrorCallback = null;

const mockStream = {
  on: jest.fn(),
  stderr: { on: jest.fn() },
};

const mockConn = {
  on: jest.fn((event, cb) => {
    if (event === 'ready') sshReadyCallback = cb;
    if (event === 'error') sshErrorCallback = cb;
    return mockConn;
  }),
  connect: jest.fn(() => {
    if (sshReadyCallback) {
      process.nextTick(() => sshReadyCallback());
    }
  }),
  exec: jest.fn((cmd, cb) => {
    cb(null, mockStream);
  }),
  end: jest.fn(),
};

jest.mock('ssh2', () => ({
  Client: jest.fn(() => mockConn),
}));

const { appPool, resetMocks } = require('../helpers/dbMock');
const coaService = require('../../src/services/coa.service');

// Helper to setup SSH mock to return specific output
function setupSSHSuccess(stdout, stderr = '') {
  mockStream.on.mockImplementation((event, handler) => {
    if (event === 'data' && stdout) {
      process.nextTick(() => handler(Buffer.from(stdout)));
    }
    if (event === 'close') {
      setTimeout(() => handler(0), 5);
    }
    return mockStream;
  });

  mockStream.stderr.on.mockImplementation((event, handler) => {
    if (event === 'data' && stderr) {
      process.nextTick(() => handler(Buffer.from(stderr)));
    }
    return mockStream.stderr;
  });
}

describe('CoA Service', () => {
  beforeEach(() => {
    resetMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    sshReadyCallback = null;
    sshErrorCallback = null;

    // Reset mock stream handlers
    mockStream.on.mockReset();
    mockStream.stderr.on.mockReset();
    mockConn.on.mockReset();
    mockConn.connect.mockReset();
    mockConn.exec.mockReset();
    mockConn.end.mockReset();

    // Default SSH behavior: connect triggers ready
    mockConn.on.mockImplementation((event, cb) => {
      if (event === 'ready') sshReadyCallback = cb;
      if (event === 'error') sshErrorCallback = cb;
      return mockConn;
    });

    mockConn.connect.mockImplementation(() => {
      if (sshReadyCallback) {
        process.nextTick(() => sshReadyCallback());
      }
    });

    mockConn.exec.mockImplementation((cmd, cb) => {
      cb(null, mockStream);
    });
  });

  describe('parseRadclientResponse', () => {
    it('should return ACK for CoA-ACK response', () => {
      const result = coaService.parseRadclientResponse(
        'Received CoA-ACK Id 1 from host 10.0.0.1:3799',
        '',
        0
      );
      expect(result).toBe('ACK');
    });

    it('should return ACK for Disconnect-ACK response', () => {
      const result = coaService.parseRadclientResponse(
        'Received Disconnect-ACK Id 2 from host 10.0.0.1:3799',
        '',
        0
      );
      expect(result).toBe('ACK');
    });

    it('should return NAK for CoA-NAK response', () => {
      const result = coaService.parseRadclientResponse(
        'Received CoA-NAK Id 1 from host 10.0.0.1:3799',
        '',
        0
      );
      expect(result).toBe('NAK');
    });

    it('should return NAK for Disconnect-NAK response', () => {
      const result = coaService.parseRadclientResponse(
        'Received Disconnect-NAK Id 2 from host 10.0.0.1:3799',
        '',
        0
      );
      expect(result).toBe('NAK');
    });

    it('should return Timeout when no response received', () => {
      const result = coaService.parseRadclientResponse(
        'radclient: no response from server',
        '',
        1
      );
      expect(result).toBe('Timeout');
    });

    it('should return Timeout for empty output', () => {
      const result = coaService.parseRadclientResponse('', '', 1);
      expect(result).toBe('Timeout');
    });

    it('should handle ACK in stderr', () => {
      const result = coaService.parseRadclientResponse(
        '',
        'Received CoA-ACK Id 1 from host 10.0.0.1:3799',
        0
      );
      expect(result).toBe('ACK');
    });
  });

  describe('sendCoA', () => {
    const mockNasDevice = {
      id: 1,
      name: 'NAS-01',
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
      status: 'Active',
    };

    const mockSubscription = {
      id: 10,
      pppoe_username: 'pppoe-user1',
      nas_id: 1,
    };

    it('should send CoA and return success on ACK', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 100 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.sendCoA(10, 1, 'SpeedChange', {
        rateLimit: '10M/20M',
      });

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
      expect(result.retryCount).toBe(0);
      expect(result.logId).toBe(100);
    });

    it('should throw if NAS device not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        coaService.sendCoA(10, 999, 'SpeedChange', { rateLimit: '10M/20M' })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw if subscription not found when username not provided', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        coaService.sendCoA(999, 1, 'SpeedChange', { rateLimit: '10M/20M' })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should use provided username instead of looking up subscription', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 105 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.sendCoA(10, 1, 'SpeedChange', {
        username: 'custom-user',
        rateLimit: '5M/10M',
      });

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
    });
  });

  describe('sendPOD', () => {
    const mockNasDevice = {
      id: 1,
      name: 'NAS-01',
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    it('should send POD with Kick trigger type', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 101 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received Disconnect-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.sendPOD(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
    });
  });

  describe('isolir', () => {
    const mockNasDevice = {
      id: 1,
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    it('should send isolir CoA with Isolir trigger type', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 102 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
    });
  });

  describe('unisolir', () => {
    const mockNasDevice = {
      id: 1,
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    it('should send unisolir CoA with Unisolir trigger type', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 103 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.unisolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
    });
  });

  describe('speedChange', () => {
    const mockNasDevice = {
      id: 1,
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    it('should send speed change CoA with SpeedChange trigger type', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 104 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.speedChange(10, 1, 'pppoe-user1', '10M/20M');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
    });

    it('should throw if rateLimit is not provided', async () => {
      await expect(
        coaService.speedChange(10, 1, 'pppoe-user1', '')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('Retry state machine', () => {
    const mockNasDevice = {
      id: 1,
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    beforeEach(() => {
      // Mock sleep to avoid real delays in tests
      jest.spyOn(coaService, 'sleep').mockResolvedValue(undefined);
    });

    it('should retry on NAK and succeed on subsequent ACK', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 200 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      let callCount = 0;
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          callCount++;
          if (callCount === 1) {
            process.nextTick(() => handler(Buffer.from('Received CoA-NAK Id 1 from host 192.168.1.1:3799')));
          } else {
            process.nextTick(() => handler(Buffer.from('Received CoA-ACK Id 2 from host 192.168.1.1:3799')));
          }
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
      expect(result.retryCount).toBe(1);
    });

    it('should retry on Timeout and succeed on subsequent ACK', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 201 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      let callCount = 0;
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          callCount++;
          if (callCount === 1) {
            process.nextTick(() => handler(Buffer.from('radclient: no response from server')));
          } else {
            process.nextTick(() => handler(Buffer.from('Received CoA-ACK Id 2 from host 192.168.1.1:3799')));
          }
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
      expect(result.retryCount).toBe(1);
    });

    it('should stop retrying on ACK (no further attempts)', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 202 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
      expect(result.retryCount).toBe(0);
      // sleep should not have been called since first attempt succeeded
      expect(coaService.sleep).not.toHaveBeenCalled();
    });

    it('should fail after max 3 retries with NAK', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 203 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // All attempts return NAK
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          process.nextTick(() => handler(Buffer.from('Received CoA-NAK Id 1 from host 192.168.1.1:3799')));
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(false);
      expect(result.responseStatus).toBe('NAK');
      // Initial attempt + 3 retries = 4 total, retryCount tracks attempts after first
      expect(result.retryCount).toBeGreaterThanOrEqual(3);
    });

    it('should fail after max 3 retries with Timeout', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 204 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // All attempts return Timeout
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          process.nextTick(() => handler(Buffer.from('radclient: no response from server')));
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(false);
      expect(result.responseStatus).toBe('Timeout');
      expect(result.retryCount).toBeGreaterThanOrEqual(3);
    });

    it('should use exponential backoff delays (1s, 2s, 4s)', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 205 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // All attempts return NAK to trigger all retries
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          process.nextTick(() => handler(Buffer.from('Received CoA-NAK Id 1 from host 192.168.1.1:3799')));
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      await coaService.isolir(10, 1, 'pppoe-user1');

      // Verify exponential backoff: 1000ms, 2000ms, 4000ms
      expect(coaService.sleep).toHaveBeenCalledWith(1000);
      expect(coaService.sleep).toHaveBeenCalledWith(2000);
      expect(coaService.sleep).toHaveBeenCalledWith(4000);
    });
  });

  describe('SSH connection failure handling', () => {
    const mockNasDevice = {
      id: 1,
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    beforeEach(() => {
      jest.spyOn(coaService, 'sleep').mockResolvedValue(undefined);
    });

    it('should treat SSH connection error as Timeout and retry', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 300 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // All SSH attempts fail with connection error
      mockConn.on.mockImplementation((event, cb) => {
        if (event === 'ready') sshReadyCallback = cb;
        if (event === 'error') sshErrorCallback = cb;
        return mockConn;
      });

      mockConn.connect.mockImplementation(() => {
        if (sshErrorCallback) {
          process.nextTick(() => sshErrorCallback(new Error('Connection refused')));
        }
      });

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(false);
      expect(result.responseStatus).toBe('Timeout');
      expect(result.retryCount).toBeGreaterThanOrEqual(3);
    });

    it('should recover from SSH error if subsequent attempt succeeds', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 301 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      let connectCallCount = 0;
      mockConn.on.mockImplementation((event, cb) => {
        if (event === 'ready') sshReadyCallback = cb;
        if (event === 'error') sshErrorCallback = cb;
        return mockConn;
      });

      mockConn.connect.mockImplementation(() => {
        connectCallCount++;
        if (connectCallCount === 1) {
          if (sshErrorCallback) {
            process.nextTick(() => sshErrorCallback(new Error('Connection refused')));
          }
        } else {
          if (sshReadyCallback) {
            process.nextTick(() => sshReadyCallback());
          }
        }
      });

      mockConn.exec.mockImplementation((cmd, cb) => {
        cb(null, mockStream);
      });

      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          process.nextTick(() => handler(Buffer.from('Received CoA-ACK Id 1 from host 192.168.1.1:3799')));
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe('ACK');
      expect(result.retryCount).toBe(1);
    });
  });

  describe('CoA log creation and update', () => {
    const mockNasDevice = {
      id: 1,
      ip_address: '192.168.1.1',
      radius_secret: 'testing123',
    };

    beforeEach(() => {
      jest.spyOn(coaService, 'sleep').mockResolvedValue(undefined);
    });

    it('should create a log entry with Pending status before execution', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 400 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      await coaService.isolir(10, 1, 'pppoe-user1');

      // Verify the create call (second execute call after getNasDevice)
      const createCall = appPool.execute.mock.calls[1];
      expect(createCall[0]).toContain('INSERT INTO coa_logs');
      // Verify Pending status is passed
      expect(createCall[1]).toContain('Pending');
      // Verify trigger_type is Isolir
      expect(createCall[1]).toContain('Isolir');
    });

    it('should update log with ACK status on success', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 401 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      setupSSHSuccess('Received CoA-ACK Id 1 from host 192.168.1.1:3799');

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(true);
      expect(result.logId).toBe(401);

      // Verify the update call (third execute call)
      const updateCall = appPool.execute.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE coa_logs');
      // Should contain ACK status
      expect(updateCall[1]).toContain('ACK');
    });

    it('should update log with final failure status after retries exhausted', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 402 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // All attempts return NAK
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          process.nextTick(() => handler(Buffer.from('Received CoA-NAK Id 1 from host 192.168.1.1:3799')));
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.success).toBe(false);
      expect(result.logId).toBe(402);

      // Verify the update call contains NAK status
      const updateCall = appPool.execute.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE coa_logs');
      expect(updateCall[1]).toContain('NAK');
    });

    it('should record retry_count in the log update', async () => {
      appPool.execute.mockResolvedValueOnce([[mockNasDevice], []]);
      appPool.execute.mockResolvedValueOnce([{ insertId: 403 }, []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // First attempt NAK, second attempt ACK
      let callCount = 0;
      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          callCount++;
          if (callCount === 1) {
            process.nextTick(() => handler(Buffer.from('Received CoA-NAK Id 1 from host 192.168.1.1:3799')));
          } else {
            process.nextTick(() => handler(Buffer.from('Received CoA-ACK Id 2 from host 192.168.1.1:3799')));
          }
        }
        if (event === 'close') {
          setTimeout(() => handler(0), 5);
        }
        return mockStream;
      });

      mockStream.stderr.on.mockImplementation(() => mockStream.stderr);

      const result = await coaService.isolir(10, 1, 'pppoe-user1');

      expect(result.retryCount).toBe(1);

      // Verify the update call includes retry_count = 1
      const updateCall = appPool.execute.mock.calls[2];
      expect(updateCall[1]).toContain(1); // retry_count
    });
  });

  describe('radclient command construction (coaPacket integration)', () => {
    it('should build correct isolir command with Address_List attribute', () => {
      const { buildIsolirCoA } = require('../../src/utils/coaPacket');
      const command = buildIsolirCoA('pppoe-user1', '192.168.1.1', 'secret123');

      expect(command).toContain('radclient');
      expect(command).toContain('192.168.1.1:3799');
      expect(command).toContain('coa');
      expect(command).toContain('secret123');
      expect(command).toContain('User-Name');
      expect(command).toContain('pppoe-user1');
      expect(command).toContain('Mikrotik-Address-List');
      expect(command).toContain('isolir');
    });

    it('should build correct unisolir command with empty Address_List', () => {
      const { buildUnisolirCoA } = require('../../src/utils/coaPacket');
      const command = buildUnisolirCoA('pppoe-user1', '192.168.1.1', 'secret123');

      expect(command).toContain('radclient');
      expect(command).toContain('192.168.1.1:3799');
      expect(command).toContain('coa');
      expect(command).toContain('secret123');
      expect(command).toContain('User-Name');
      expect(command).toContain('Mikrotik-Address-List');
    });

    it('should build correct speed change command with rate limit', () => {
      const { buildSpeedChangeCoA } = require('../../src/utils/coaPacket');
      const command = buildSpeedChangeCoA('pppoe-user1', '192.168.1.1', 'secret123', '10M/20M');

      expect(command).toContain('radclient');
      expect(command).toContain('192.168.1.1:3799');
      expect(command).toContain('coa');
      expect(command).toContain('secret123');
      expect(command).toContain('User-Name');
      expect(command).toContain('pppoe-user1');
      expect(command).toContain('Mikrotik-Rate-Limit');
      expect(command).toContain('10M/20M');
    });

    it('should build correct POD/kick command with disconnect type', () => {
      const { buildKickPOD } = require('../../src/utils/coaPacket');
      const command = buildKickPOD('pppoe-user1', '192.168.1.1', 'secret123');

      expect(command).toContain('radclient');
      expect(command).toContain('192.168.1.1:3799');
      expect(command).toContain('disconnect');
      expect(command).toContain('secret123');
      expect(command).toContain('User-Name');
      expect(command).toContain('pppoe-user1');
    });

    it('should use custom port when specified', () => {
      const { buildIsolirCoA } = require('../../src/utils/coaPacket');
      const command = buildIsolirCoA('pppoe-user1', '192.168.1.1', 'secret123', 1700);

      expect(command).toContain('192.168.1.1:1700');
    });

    it('should throw error when username is missing', () => {
      const { buildCoAAttributes } = require('../../src/utils/coaPacket');

      expect(() => buildCoAAttributes({})).toThrow('username is required');
      expect(() => buildCoAAttributes(null)).toThrow('username is required');
    });

    it('should throw error when nasIp is missing in buildRadclientCommand', () => {
      const { buildRadclientCommand } = require('../../src/utils/coaPacket');

      expect(() => buildRadclientCommand('', 3799, 'secret', 'coa', 'attrs')).toThrow('nasIp is required');
    });

    it('should throw error for invalid packet type', () => {
      const { buildRadclientCommand } = require('../../src/utils/coaPacket');

      expect(() => buildRadclientCommand('10.0.0.1', 3799, 'secret', 'invalid', 'attrs')).toThrow('packetType must be');
    });
  });

  describe('getCoALogs', () => {
    it('should retrieve CoA logs with filters', async () => {
      const mockLogs = [
        { id: 1, subscription_id: 10, trigger_type: 'Isolir', response_status: 'ACK' },
        { id: 2, subscription_id: 10, trigger_type: 'Unisolir', response_status: 'NAK' },
      ];

      // Mock count query
      appPool.execute.mockResolvedValueOnce([[{ total: 2 }], []]);
      // Mock data query
      appPool.execute.mockResolvedValueOnce([mockLogs, []]);

      const result = await coaService.getCoALogs({ subscription_id: 10 });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results when no logs found', async () => {
      // Mock count query
      appPool.execute.mockResolvedValueOnce([[{ total: 0 }], []]);
      // Mock data query
      appPool.execute.mockResolvedValueOnce([[], []]);

      const result = await coaService.getCoALogs({});

      expect(result.logs).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
