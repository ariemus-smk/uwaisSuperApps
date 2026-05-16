/**
 * Unit tests for NAS service.
 * Tests NAS registration (VPN account generation, RADIUS DB write, script generation),
 * script generation, connectivity testing, and update operations.
 *
 * Requirements: 12.2, 12.3, 12.5
 */

jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

// Mock net.Socket for connectivity tests
const mockSocket = {
  setTimeout: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('net', () => ({
  Socket: jest.fn(() => mockSocket),
}));

const { appPool, radiusPool, resetMocks } = require('../helpers/dbMock');
const nasService = require('../../src/services/nas.service');

describe('NAS Service', () => {
  beforeEach(() => {
    resetMocks();
    jest.clearAllMocks();

    // Reset socket mock handlers
    mockSocket.setTimeout.mockReset();
    mockSocket.on.mockReset();
    mockSocket.connect.mockReset();
    mockSocket.destroy.mockReset();

    // Set env vars for VPN config
    process.env.VPN_CHR_HOST = '10.0.0.1';
    process.env.VPN_SSTP_PORT = '443';
    process.env.VPN_OVPN_PORT = '1194';
  });

  describe('register()', () => {
    it('should create NAS in App DB, write to RADIUS DB, generate 4 VPN accounts, and generate script', async () => {
      // Mock: no existing NAS with same IP
      appPool.execute.mockResolvedValueOnce([[], []]); // findByIpAddress
      // Mock: App DB create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]); // nasModel.create
      // Mock: RADIUS DB create
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 10 }, []]); // radiusNasModel.create

      const result = await nasService.register({
        name: 'NAS-Test-01',
        ip_address: '192.168.1.100',
        radius_secret: 'secret123',
        api_port: 8728,
        branch_id: 1,
      });

      // Verify NAS record created
      expect(result.id).toBe(1);
      expect(result.name).toBe('NAS-Test-01');
      expect(result.ip_address).toBe('192.168.1.100');
      expect(result.radius_secret).toBe('secret123');
      expect(result.status).toBe('Active');

      // Verify 4 VPN accounts generated
      expect(result.vpn_accounts).toBeDefined();
      expect(result.vpn_accounts.pptp).toBeDefined();
      expect(result.vpn_accounts.l2tp).toBeDefined();
      expect(result.vpn_accounts.sstp).toBeDefined();
      expect(result.vpn_accounts.ovpn).toBeDefined();

      // Verify each VPN account has username and password
      for (const type of ['pptp', 'l2tp', 'sstp', 'ovpn']) {
        expect(result.vpn_accounts[type].username).toBeDefined();
        expect(result.vpn_accounts[type].password).toBeDefined();
        expect(result.vpn_accounts[type].username.length).toBeGreaterThan(0);
        expect(result.vpn_accounts[type].password.length).toBe(16);
      }

      // Verify config script generated
      expect(result.config_script).toBeDefined();
      expect(result.config_script.length).toBeGreaterThan(0);

      // Verify App DB was called
      expect(appPool.execute).toHaveBeenCalled();
      // Verify RADIUS DB was called
      expect(radiusPool.execute).toHaveBeenCalled();

      // Verify RADIUS DB insert contains correct data
      const radiusCall = radiusPool.execute.mock.calls[0];
      expect(radiusCall[0]).toContain('INSERT INTO nas');
      expect(radiusCall[1]).toContain('192.168.1.100'); // nasname = ip_address
      expect(radiusCall[1]).toContain('NAS-Test-01'); // shortname
      expect(radiusCall[1]).toContain('mikrotik'); // type
      expect(radiusCall[1]).toContain('secret123'); // secret
    });

    it('should reject duplicate IP address', async () => {
      // Mock: existing NAS with same IP found
      appPool.execute.mockResolvedValueOnce([[{
        id: 5,
        name: 'Existing-NAS',
        ip_address: '192.168.1.100',
      }], []]);

      await expect(
        nasService.register({
          name: 'NAS-Duplicate',
          ip_address: '192.168.1.100',
          radius_secret: 'secret456',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RESOURCE_ALREADY_EXISTS',
      });

      // Verify no create calls were made
      expect(radiusPool.execute).not.toHaveBeenCalled();
    });

    it('should validate required fields - missing name', async () => {
      await expect(
        nasService.register({
          ip_address: '192.168.1.100',
          radius_secret: 'secret123',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should validate required fields - missing ip_address', async () => {
      await expect(
        nasService.register({
          name: 'NAS-Test',
          radius_secret: 'secret123',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should validate required fields - missing radius_secret', async () => {
      await expect(
        nasService.register({
          name: 'NAS-Test',
          ip_address: '192.168.1.100',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should validate required fields - missing branch_id', async () => {
      await expect(
        nasService.register({
          name: 'NAS-Test',
          ip_address: '192.168.1.100',
          radius_secret: 'secret123',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('generateScript()', () => {
    it('should generate valid Mikrotik script with all sections', async () => {
      const mockNas = {
        id: 1,
        name: 'NAS-Script-Test',
        ip_address: '10.0.0.50',
        radius_secret: 'radiusSecret',
        api_port: 8728,
        branch_id: 1,
        vpn_accounts: {
          pptp: { username: 'pptp-test-abc123', password: 'pass1234567890ab' },
          l2tp: { username: 'l2tp-test-abc123', password: 'pass1234567890cd' },
          sstp: { username: 'sstp-test-abc123', password: 'pass1234567890ef' },
          ovpn: { username: 'ovpn-test-abc123', password: 'pass1234567890gh' },
        },
      };

      // Mock findById
      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      // Mock update (stores the new script)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const script = await nasService.generateScript(1);

      expect(script).toBeDefined();
      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);

      // Verify all required sections are present
      expect(script).toContain('VPN Failover');
      expect(script).toContain('RADIUS');
      expect(script).toContain('PPPoE');
      expect(script).toContain('Hotspot');
      expect(script).toContain('Isolir');

      // Verify VPN accounts are in the script
      expect(script).toContain('pptp-test-abc123');
      expect(script).toContain('l2tp-test-abc123');
      expect(script).toContain('sstp-test-abc123');
      expect(script).toContain('ovpn-test-abc123');

      // Verify RADIUS secret is in the script
      expect(script).toContain('radiusSecret');
    });

    it('should throw 404 for non-existent NAS', async () => {
      // Mock findById returns null
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        nasService.generateScript(999)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw error when NAS has no VPN accounts configured', async () => {
      const mockNas = {
        id: 2,
        name: 'NAS-No-VPN',
        ip_address: '10.0.0.51',
        radius_secret: 'secret',
        vpn_accounts: null,
      };

      appPool.execute.mockResolvedValueOnce([[mockNas], []]);

      await expect(
        nasService.generateScript(2)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('testConnectivity()', () => {
    it('should set Active when reachable (both API and RADIUS ports)', async () => {
      const mockNas = {
        id: 1,
        name: 'NAS-Reachable',
        ip_address: '192.168.1.1',
        api_port: 8728,
        vpn_accounts: { pptp: {}, l2tp: {}, sstp: {}, ovpn: {} },
      };

      // Mock findById
      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      // Mock updateStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // Mock updatePollStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // Simulate successful TCP connections
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'connect') {
          process.nextTick(() => handler());
        }
        return mockSocket;
      });

      const result = await nasService.testConnectivity(1);

      expect(result.status).toBe('Active');
      expect(result.apiReachable).toBe(true);
      expect(result.radiusReachable).toBe(true);
      expect(result.nasId).toBe(1);
      expect(result.nasName).toBe('NAS-Reachable');
    });

    it('should set Inactive when unreachable (timeout on both ports)', async () => {
      const mockNas = {
        id: 2,
        name: 'NAS-Unreachable',
        ip_address: '192.168.1.2',
        api_port: 8728,
        vpn_accounts: { pptp: {}, l2tp: {}, sstp: {}, ovpn: {} },
      };

      // Mock findById
      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      // Mock updateStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // Mock updatePollStatus
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      // Simulate timeout on TCP connections
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'timeout') {
          process.nextTick(() => handler());
        }
        return mockSocket;
      });

      const result = await nasService.testConnectivity(2);

      expect(result.status).toBe('Inactive');
      expect(result.apiReachable).toBe(false);
      expect(result.radiusReachable).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it('should throw 404 for non-existent NAS', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        nasService.testConnectivity(999)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('VPN account generation', () => {
    it('should generate unified shared credential for all accounts (PPTP, L2TP, SSTP, OVPN)', async () => {
      // Mock: no existing NAS with same IP
      appPool.execute.mockResolvedValueOnce([[], []]); // findByIpAddress
      // Mock: App DB create
      appPool.execute.mockResolvedValueOnce([{ insertId: 10 }, []]); // nasModel.create
      // Mock: RADIUS DB create
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 20 }, []]); // radiusNasModel.create

      const result = await nasService.register({
        name: 'NAS-VPN-Test',
        ip_address: '10.10.10.1',
        radius_secret: 'vpnSecret',
        branch_id: 2,
      });

      const vpn = result.vpn_accounts;

      // Verify 4 distinct service types exist
      expect(Object.keys(vpn)).toHaveLength(4);
      expect(vpn.pptp).toBeDefined();
      expect(vpn.l2tp).toBeDefined();
      expect(vpn.sstp).toBeDefined();
      expect(vpn.ovpn).toBeDefined();

      // Verify usernames are uniform
      const usernames = [vpn.pptp.username, vpn.l2tp.username, vpn.sstp.username, vpn.ovpn.username];
      const uniqueUsernames = new Set(usernames);
      expect(uniqueUsernames.size).toBe(1);

      // Verify username uses the unified prefix
      expect(vpn.pptp.username).toMatch(/^vpn-nas-/);

      // Verify passwords are 16 characters alphanumeric
      for (const type of ['pptp', 'l2tp', 'sstp', 'ovpn']) {
        expect(vpn[type].password).toMatch(/^[A-Za-z0-9]{16}$/);
      }
    });

    it('should include NAS name in VPN usernames', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]); // findByIpAddress
      appPool.execute.mockResolvedValueOnce([{ insertId: 11 }, []]); // nasModel.create
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 21 }, []]); // radiusNasModel.create

      const result = await nasService.register({
        name: 'MyRouter-01',
        ip_address: '10.10.10.2',
        radius_secret: 'secret',
        branch_id: 1,
      });

      // NAS name is sanitized (lowercase, alphanumeric only, max 10 chars)
      expect(result.vpn_accounts.pptp.username).toContain('myrouter01');
      expect(result.vpn_accounts.l2tp.username).toContain('myrouter01');
    });
  });

  describe('Mikrotik script content', () => {
    it('should contain VPN failover, RADIUS, PPPoE, Hotspot, and isolir sections', async () => {
      const mockNas = {
        id: 3,
        name: 'NAS-Content-Test',
        ip_address: '10.0.0.100',
        radius_secret: 'contentSecret',
        api_port: 8728,
        branch_id: 1,
        vpn_accounts: {
          pptp: { username: 'pptp-content-12345678', password: 'ABCDEFGHabcdefgh' },
          l2tp: { username: 'l2tp-content-12345678', password: 'IJKLMNOPijklmnop' },
          sstp: { username: 'sstp-content-12345678', password: 'QRSTUVWXqrstuvwx' },
          ovpn: { username: 'ovpn-content-12345678', password: 'YZABCDEFyzabcdef' },
        },
      };

      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const script = await nasService.generateScript(3);

      // VPN Failover section
      expect(script).toContain('VPN Failover');
      expect(script).toContain('/interface pptp-client');
      expect(script).toContain('/interface l2tp-client');
      expect(script).toContain('/interface sstp-client');
      expect(script).toContain('/interface ovpn-client');
      expect(script).toContain('vpn-pptp');
      expect(script).toContain('vpn-l2tp');
      expect(script).toContain('vpn-sstp');
      expect(script).toContain('vpn-ovpn');

      // RADIUS section
      expect(script).toContain('RADIUS Client Configuration');
      expect(script).toContain('/radius');
      expect(script).toContain('contentSecret');
      expect(script).toContain('authentication-port=1812');
      expect(script).toContain('accounting-port=1813');
      expect(script).toContain('port=3799');

      // PPPoE section
      expect(script).toContain('PPPoE Server');
      expect(script).toContain('/ppp profile');
      expect(script).toContain('/interface pppoe-server server');

      // Hotspot section
      expect(script).toContain('Hotspot');
      expect(script).toContain('/ip hotspot');
      expect(script).toContain('/ip hotspot user profile');

      // Isolir section
      expect(script).toContain('Isolir');
      expect(script).toContain('address-list=isolir');
      expect(script).toContain('/ip firewall filter');
      expect(script).toContain('/ip firewall nat');
    });

    it('should contain VPN failover routing with distance priorities', async () => {
      const mockNas = {
        id: 4,
        name: 'NAS-Routing',
        ip_address: '10.0.0.101',
        radius_secret: 'routeSecret',
        vpn_accounts: {
          pptp: { username: 'pptp-route-abc', password: 'ABCDEFGHabcdefgh' },
          l2tp: { username: 'l2tp-route-abc', password: 'IJKLMNOPijklmnop' },
          sstp: { username: 'sstp-route-abc', password: 'QRSTUVWXqrstuvwx' },
          ovpn: { username: 'ovpn-route-abc', password: 'YZABCDEFyzabcdef' },
        },
      };

      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const script = await nasService.generateScript(4);

      // Verify failover routing with distance priorities
      expect(script).toContain('distance=1');
      expect(script).toContain('distance=2');
      expect(script).toContain('distance=3');
      expect(script).toContain('distance=4');
    });
  });

  describe('updateNas()', () => {
    it('should sync IP changes to RADIUS DB', async () => {
      const mockNas = {
        id: 5,
        name: 'NAS-Update',
        ip_address: '10.0.0.200',
        radius_secret: 'oldSecret',
        api_port: 8728,
        branch_id: 1,
      };

      const mockRadiusNas = {
        id: 50,
        nasname: '10.0.0.200',
        shortname: 'NAS-Update',
        secret: 'oldSecret',
      };

      // Mock findById (for updateNas)
      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      // Mock findByNasname (for getRadiusNasId)
      radiusPool.execute.mockResolvedValueOnce([[mockRadiusNas], []]);
      // Mock RADIUS update
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // Mock App DB update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // Mock findById (return updated record)
      appPool.execute.mockResolvedValueOnce([[{ ...mockNas, ip_address: '10.0.0.201' }], []]);

      const result = await nasService.updateNas(5, { ip_address: '10.0.0.201' });

      expect(result.ip_address).toBe('10.0.0.201');

      // Verify RADIUS DB was updated with new IP
      const radiusUpdateCall = radiusPool.execute.mock.calls[1];
      expect(radiusUpdateCall[0]).toContain('UPDATE nas');
      expect(radiusUpdateCall[1]).toContain('10.0.0.201');
    });

    it('should sync secret changes to RADIUS DB', async () => {
      const mockNas = {
        id: 6,
        name: 'NAS-Secret-Update',
        ip_address: '10.0.0.202',
        radius_secret: 'oldSecret',
        api_port: 8728,
        branch_id: 1,
      };

      const mockRadiusNas = {
        id: 60,
        nasname: '10.0.0.202',
        shortname: 'NAS-Secret-Update',
        secret: 'oldSecret',
      };

      // Mock findById
      appPool.execute.mockResolvedValueOnce([[mockNas], []]);
      // Mock findByNasname (for getRadiusNasId - called for secret change)
      radiusPool.execute.mockResolvedValueOnce([[mockRadiusNas], []]);
      // Mock RADIUS update (secret)
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // Mock App DB update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // Mock findById (return updated record)
      appPool.execute.mockResolvedValueOnce([[{ ...mockNas, radius_secret: 'newSecret' }], []]);

      const result = await nasService.updateNas(6, { radius_secret: 'newSecret' });

      expect(result.radius_secret).toBe('newSecret');

      // Verify RADIUS DB was updated with new secret
      const radiusUpdateCall = radiusPool.execute.mock.calls[1];
      expect(radiusUpdateCall[0]).toContain('UPDATE nas');
      expect(radiusUpdateCall[1]).toContain('newSecret');
    });

    it('should throw 404 for non-existent NAS', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        nasService.updateNas(999, { name: 'New Name' })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });
});
