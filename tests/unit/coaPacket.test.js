const {
  DEFAULT_COA_PORT,
  buildCoAAttributes,
  buildPODAttributes,
  buildRadclientCommand,
  buildIsolirCoA,
  buildUnisolirCoA,
  buildSpeedChangeCoA,
  buildKickPOD,
} = require('../../src/utils/coaPacket');

describe('CoA Packet Builder Utility', () => {
  describe('buildCoAAttributes', () => {
    it('should throw if username is not provided', () => {
      expect(() => buildCoAAttributes({})).toThrow('username is required');
      expect(() => buildCoAAttributes(null)).toThrow('username is required');
    });

    it('should build attribute string with only username', () => {
      const result = buildCoAAttributes({ username: 'uwais-abc123' });
      expect(result).toBe('User-Name = "uwais-abc123"');
    });

    it('should include Mikrotik-Rate-Limit when rateLimit is provided', () => {
      const result = buildCoAAttributes({
        username: 'uwais-abc123',
        rateLimit: '10M/20M',
      });
      expect(result).toContain('User-Name = "uwais-abc123"');
      expect(result).toContain('Mikrotik-Rate-Limit = "10M/20M"');
    });

    it('should include Framed-IP-Address when provided', () => {
      const result = buildCoAAttributes({
        username: 'uwais-abc123',
        framedIpAddress: '192.168.1.100',
      });
      expect(result).toContain('Framed-IP-Address = 192.168.1.100');
    });

    it('should include Filter-Id when provided', () => {
      const result = buildCoAAttributes({
        username: 'uwais-abc123',
        filterId: 'isolir-profile',
      });
      expect(result).toContain('Filter-Id = "isolir-profile"');
    });

    it('should include Mikrotik-Address-List when provided', () => {
      const result = buildCoAAttributes({
        username: 'uwais-abc123',
        mikrotikAddressList: 'isolir',
      });
      expect(result).toContain('Mikrotik-Address-List = "isolir"');
    });

    it('should include custom attributes', () => {
      const result = buildCoAAttributes({
        username: 'uwais-abc123',
        customAttributes: {
          'Reply-Message': 'Speed updated',
          'Session-Timeout': '3600',
        },
      });
      expect(result).toContain('Reply-Message = "Speed updated"');
      expect(result).toContain('Session-Timeout = "3600"');
    });

    it('should separate attributes with newlines', () => {
      const result = buildCoAAttributes({
        username: 'uwais-abc123',
        rateLimit: '5M/10M',
        mikrotikAddressList: 'isolir',
      });
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
    });
  });

  describe('buildPODAttributes', () => {
    it('should throw if username is not provided', () => {
      expect(() => buildPODAttributes({})).toThrow('username is required');
      expect(() => buildPODAttributes(null)).toThrow('username is required');
    });

    it('should build attribute string with only username', () => {
      const result = buildPODAttributes({ username: 'uwais-xyz789' });
      expect(result).toBe('User-Name = "uwais-xyz789"');
    });

    it('should include Framed-IP-Address when provided', () => {
      const result = buildPODAttributes({
        username: 'uwais-xyz789',
        framedIpAddress: '10.0.0.5',
      });
      expect(result).toContain('Framed-IP-Address = 10.0.0.5');
    });

    it('should include Acct-Session-Id when provided', () => {
      const result = buildPODAttributes({
        username: 'uwais-xyz789',
        acctSessionId: 'sess-001',
      });
      expect(result).toContain('Acct-Session-Id = "sess-001"');
    });
  });

  describe('buildRadclientCommand', () => {
    it('should throw if nasIp is not provided', () => {
      expect(() => buildRadclientCommand(null, 3799, 'secret', 'coa', 'attrs')).toThrow(
        'nasIp is required'
      );
    });

    it('should throw if secret is not provided', () => {
      expect(() => buildRadclientCommand('10.0.0.1', 3799, null, 'coa', 'attrs')).toThrow(
        'secret is required'
      );
    });

    it('should throw if packetType is invalid', () => {
      expect(() =>
        buildRadclientCommand('10.0.0.1', 3799, 'secret', 'invalid', 'attrs')
      ).toThrow('packetType must be "coa" or "disconnect"');
    });

    it('should throw if attributes is not provided', () => {
      expect(() =>
        buildRadclientCommand('10.0.0.1', 3799, 'secret', 'coa', null)
      ).toThrow('attributes string is required');
    });

    it('should build a valid radclient command for CoA', () => {
      const result = buildRadclientCommand(
        '192.168.1.1',
        3799,
        'testing123',
        'coa',
        'User-Name = "uwais-abc"'
      );
      expect(result).toBe(
        'echo "User-Name = \\"uwais-abc\\"" | radclient 192.168.1.1:3799 coa testing123'
      );
    });

    it('should build a valid radclient command for disconnect', () => {
      const result = buildRadclientCommand(
        '10.0.0.1',
        3799,
        'radiussecret',
        'disconnect',
        'User-Name = "uwais-xyz"'
      );
      expect(result).toBe(
        'echo "User-Name = \\"uwais-xyz\\"" | radclient 10.0.0.1:3799 disconnect radiussecret'
      );
    });

    it('should use default port 3799 when nasPort is not provided', () => {
      const result = buildRadclientCommand(
        '10.0.0.1',
        null,
        'secret',
        'coa',
        'User-Name = "test"'
      );
      expect(result).toContain('10.0.0.1:3799');
    });

    it('should use custom port when provided', () => {
      const result = buildRadclientCommand(
        '10.0.0.1',
        1812,
        'secret',
        'coa',
        'User-Name = "test"'
      );
      expect(result).toContain('10.0.0.1:1812');
    });
  });

  describe('buildIsolirCoA', () => {
    it('should build a CoA command with isolir Address_List', () => {
      const result = buildIsolirCoA('uwais-abc123', '192.168.1.1', 'secret123');
      expect(result).toContain('radclient 192.168.1.1:3799 coa secret123');
      expect(result).toContain('User-Name');
      expect(result).toContain('uwais-abc123');
      expect(result).toContain('Mikrotik-Address-List');
      expect(result).toContain('isolir');
    });

    it('should use default port 3799', () => {
      const result = buildIsolirCoA('uwais-abc123', '10.0.0.1', 'secret');
      expect(result).toContain('10.0.0.1:3799');
    });

    it('should accept custom port', () => {
      const result = buildIsolirCoA('uwais-abc123', '10.0.0.1', 'secret', 1700);
      expect(result).toContain('10.0.0.1:1700');
    });
  });

  describe('buildUnisolirCoA', () => {
    it('should build a CoA command with empty Address_List to remove isolir', () => {
      const result = buildUnisolirCoA('uwais-abc123', '192.168.1.1', 'secret123');
      expect(result).toContain('radclient 192.168.1.1:3799 coa secret123');
      expect(result).toContain('User-Name');
      expect(result).toContain('uwais-abc123');
      expect(result).toContain('Mikrotik-Address-List');
    });

    it('should use default port 3799', () => {
      const result = buildUnisolirCoA('uwais-abc123', '10.0.0.1', 'secret');
      expect(result).toContain('10.0.0.1:3799');
    });
  });

  describe('buildSpeedChangeCoA', () => {
    it('should throw if rateLimit is not provided', () => {
      expect(() =>
        buildSpeedChangeCoA('uwais-abc123', '10.0.0.1', 'secret', null)
      ).toThrow('rateLimit is required for speed change CoA');
    });

    it('should build a CoA command with Mikrotik-Rate-Limit', () => {
      const result = buildSpeedChangeCoA(
        'uwais-abc123',
        '192.168.1.1',
        'secret123',
        '10M/20M'
      );
      expect(result).toContain('radclient 192.168.1.1:3799 coa secret123');
      expect(result).toContain('User-Name');
      expect(result).toContain('uwais-abc123');
      expect(result).toContain('Mikrotik-Rate-Limit');
      expect(result).toContain('10M/20M');
    });

    it('should accept custom port', () => {
      const result = buildSpeedChangeCoA(
        'uwais-abc123',
        '10.0.0.1',
        'secret',
        '5M/10M',
        4000
      );
      expect(result).toContain('10.0.0.1:4000');
    });
  });

  describe('buildKickPOD', () => {
    it('should build a disconnect command with User-Name', () => {
      const result = buildKickPOD('uwais-abc123', '192.168.1.1', 'secret123');
      expect(result).toContain('radclient 192.168.1.1:3799 disconnect secret123');
      expect(result).toContain('User-Name');
      expect(result).toContain('uwais-abc123');
    });

    it('should use default port 3799', () => {
      const result = buildKickPOD('uwais-abc123', '10.0.0.1', 'secret');
      expect(result).toContain('10.0.0.1:3799');
    });

    it('should accept custom port', () => {
      const result = buildKickPOD('uwais-abc123', '10.0.0.1', 'secret', 1700);
      expect(result).toContain('10.0.0.1:1700');
    });
  });

  describe('DEFAULT_COA_PORT', () => {
    it('should be 3799', () => {
      expect(DEFAULT_COA_PORT).toBe(3799);
    });
  });
});
