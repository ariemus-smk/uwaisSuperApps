/**
 * Unit tests for RADIUS DB models.
 * Tests CRUD operations for radcheck, radreply, radusergroup, radacct,
 * radgroupcheck, radgroupreply, and nas models.
 */

jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

const { radiusPool } = require('../helpers/dbMock');
const { resetMocks } = require('../helpers/dbMock');

const radcheckModel = require('../../src/radiusModels/radcheck.model');
const radreplyModel = require('../../src/radiusModels/radreply.model');
const raduserGroupModel = require('../../src/radiusModels/radusergroup.model');
const radacctModel = require('../../src/radiusModels/radacct.model');
const radgroupcheckModel = require('../../src/radiusModels/radgroupcheck.model');
const radgroupreplyModel = require('../../src/radiusModels/radgroupreply.model');
const nasModel = require('../../src/radiusModels/nas.model');

describe('RADIUS Models', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('radcheck model', () => {
    describe('findByUsername', () => {
      it('should return all check attributes for a username', async () => {
        const mockRecords = [
          { id: 1, username: 'pppoe-user1', attribute: 'Cleartext-Password', op: ':=', value: 'pass123' },
        ];
        radiusPool.execute.mockResolvedValueOnce([mockRecords, []]);

        const result = await radcheckModel.findByUsername('pppoe-user1');
        expect(result).toEqual(mockRecords);
        expect(radiusPool.execute).toHaveBeenCalledWith(
          'SELECT * FROM radcheck WHERE username = ?',
          ['pppoe-user1']
        );
      });

      it('should return empty array when no records found', async () => {
        radiusPool.execute.mockResolvedValueOnce([[], []]);

        const result = await radcheckModel.findByUsername('nonexistent');
        expect(result).toEqual([]);
      });
    });

    describe('findByUsernameAndAttribute', () => {
      it('should return specific attribute for a username', async () => {
        const mockRecord = { id: 1, username: 'pppoe-user1', attribute: 'Cleartext-Password', op: ':=', value: 'pass123' };
        radiusPool.execute.mockResolvedValueOnce([[mockRecord], []]);

        const result = await radcheckModel.findByUsernameAndAttribute('pppoe-user1', 'Cleartext-Password');
        expect(result).toEqual(mockRecord);
      });

      it('should return null when not found', async () => {
        radiusPool.execute.mockResolvedValueOnce([[], []]);

        const result = await radcheckModel.findByUsernameAndAttribute('pppoe-user1', 'NonExistent');
        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a new radcheck entry with default op', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await radcheckModel.create({
          username: 'pppoe-user1',
          attribute: 'Cleartext-Password',
          value: 'secret123',
        });

        expect(result.id).toBe(1);
        expect(result.username).toBe('pppoe-user1');
        expect(result.op).toBe(':=');
        expect(radiusPool.execute).toHaveBeenCalledWith(
          'INSERT INTO radcheck (username, attribute, op, value) VALUES (?, ?, ?, ?)',
          ['pppoe-user1', 'Cleartext-Password', ':=', 'secret123']
        );
      });

      it('should create with custom op', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);

        const result = await radcheckModel.create({
          username: 'pppoe-user2',
          attribute: 'Cleartext-Password',
          op: '==',
          value: 'pass456',
        });

        expect(result.op).toBe('==');
      });
    });

    describe('update', () => {
      it('should update allowed fields', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await radcheckModel.update(1, { value: 'newpass' });
        expect(result.affectedRows).toBe(1);
        expect(radiusPool.execute).toHaveBeenCalledWith(
          'UPDATE radcheck SET value = ? WHERE id = ?',
          ['newpass', 1]
        );
      });

      it('should return affectedRows 0 when no valid fields', async () => {
        const result = await radcheckModel.update(1, { invalid_field: 'test' });
        expect(result.affectedRows).toBe(0);
      });
    });

    describe('deleteById', () => {
      it('should delete a record by ID', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await radcheckModel.deleteById(1);
        expect(result.affectedRows).toBe(1);
        expect(radiusPool.execute).toHaveBeenCalledWith(
          'DELETE FROM radcheck WHERE id = ?',
          [1]
        );
      });
    });

    describe('deleteByUsername', () => {
      it('should delete all records for a username', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 2 }, []]);

        const result = await radcheckModel.deleteByUsername('pppoe-user1');
        expect(result.affectedRows).toBe(2);
      });
    });

    describe('findAll', () => {
      it('should return paginated records', async () => {
        radiusPool.execute
          .mockResolvedValueOnce([[{ total: 5 }], []])
          .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }], []]);

        const result = await radcheckModel.findAll({ page: 1, limit: 2 });
        expect(result.total).toBe(5);
        expect(result.records).toHaveLength(2);
      });

      it('should filter by username', async () => {
        radiusPool.execute
          .mockResolvedValueOnce([[{ total: 1 }], []])
          .mockResolvedValueOnce([[{ id: 1 }], []]);

        await radcheckModel.findAll({ username: 'pppoe-user1' });
        expect(radiusPool.execute).toHaveBeenCalledWith(
          expect.stringContaining('username = ?'),
          expect.arrayContaining(['pppoe-user1'])
        );
      });
    });
  });

  describe('radreply model', () => {
    describe('findByUsername', () => {
      it('should return all reply attributes for a username', async () => {
        const mockRecords = [
          { id: 1, username: 'pppoe-user1', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '10M/20M' },
        ];
        radiusPool.execute.mockResolvedValueOnce([mockRecords, []]);

        const result = await radreplyModel.findByUsername('pppoe-user1');
        expect(result).toEqual(mockRecords);
      });
    });

    describe('create', () => {
      it('should create with default op "="', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await radreplyModel.create({
          username: 'pppoe-user1',
          attribute: 'Mikrotik-Rate-Limit',
          value: '10M/20M',
        });

        expect(result.op).toBe('=');
        expect(result.id).toBe(1);
      });
    });

    describe('deleteByUsername', () => {
      it('should delete all reply attributes for a username', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 3 }, []]);

        const result = await radreplyModel.deleteByUsername('pppoe-user1');
        expect(result.affectedRows).toBe(3);
      });
    });
  });

  describe('radusergroup model', () => {
    describe('findByUsername', () => {
      it('should return group mappings ordered by priority', async () => {
        const mockRecords = [
          { id: 1, username: 'pppoe-user1', groupname: 'pkg-10mbps', priority: 1 },
        ];
        radiusPool.execute.mockResolvedValueOnce([mockRecords, []]);

        const result = await raduserGroupModel.findByUsername('pppoe-user1');
        expect(result).toEqual(mockRecords);
        expect(radiusPool.execute).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY priority ASC'),
          ['pppoe-user1']
        );
      });
    });

    describe('findByGroupname', () => {
      it('should return all users in a group', async () => {
        const mockRecords = [
          { id: 1, username: 'user1', groupname: 'pkg-10mbps', priority: 1 },
          { id: 2, username: 'user2', groupname: 'pkg-10mbps', priority: 1 },
        ];
        radiusPool.execute.mockResolvedValueOnce([mockRecords, []]);

        const result = await raduserGroupModel.findByGroupname('pkg-10mbps');
        expect(result).toHaveLength(2);
      });
    });

    describe('create', () => {
      it('should create with default priority 1', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await raduserGroupModel.create({
          username: 'pppoe-user1',
          groupname: 'pkg-10mbps',
        });

        expect(result.priority).toBe(1);
        expect(radiusPool.execute).toHaveBeenCalledWith(
          'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, ?)',
          ['pppoe-user1', 'pkg-10mbps', 1]
        );
      });

      it('should create with custom priority', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);

        const result = await raduserGroupModel.create({
          username: 'pppoe-user1',
          groupname: 'isolir-group',
          priority: 0,
        });

        expect(result.priority).toBe(0);
      });
    });

    describe('deleteByUsername', () => {
      it('should delete all group mappings for a username', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await raduserGroupModel.deleteByUsername('pppoe-user1');
        expect(result.affectedRows).toBe(1);
      });
    });
  });

  describe('radacct model', () => {
    describe('findActiveSession', () => {
      it('should return active session (no stop time)', async () => {
        const mockSession = {
          radacctid: 1,
          username: 'pppoe-user1',
          acctstarttime: '2024-01-15 10:00:00',
          acctstoptime: null,
        };
        radiusPool.execute.mockResolvedValueOnce([[mockSession], []]);

        const result = await radacctModel.findActiveSession('pppoe-user1');
        expect(result).toEqual(mockSession);
        expect(radiusPool.execute).toHaveBeenCalledWith(
          expect.stringContaining('acctstoptime IS NULL'),
          ['pppoe-user1']
        );
      });

      it('should return null when no active session', async () => {
        radiusPool.execute.mockResolvedValueOnce([[], []]);

        const result = await radacctModel.findActiveSession('pppoe-user1');
        expect(result).toBeNull();
      });
    });

    describe('getUsageSummary', () => {
      it('should return aggregated traffic data', async () => {
        const mockSummary = { inputOctets: 1073741824, outputOctets: 5368709120, sessionTime: 86400 };
        radiusPool.execute.mockResolvedValueOnce([[mockSummary], []]);

        const result = await radacctModel.getUsageSummary('pppoe-user1', '2024-01-01', '2024-01-31');
        expect(result.inputOctets).toBe(1073741824);
        expect(result.outputOctets).toBe(5368709120);
        expect(result.sessionTime).toBe(86400);
      });
    });

    describe('getActiveSessionCount', () => {
      it('should return count of active sessions for a NAS', async () => {
        radiusPool.execute.mockResolvedValueOnce([[{ count: 42 }], []]);

        const result = await radacctModel.getActiveSessionCount('192.168.1.1');
        expect(result).toBe(42);
      });
    });

    describe('findByUsername', () => {
      it('should return paginated accounting records', async () => {
        radiusPool.execute
          .mockResolvedValueOnce([[{ total: 10 }], []])
          .mockResolvedValueOnce([[{ radacctid: 1 }, { radacctid: 2 }], []]);

        const result = await radacctModel.findByUsername('pppoe-user1', { page: 1, limit: 2 });
        expect(result.total).toBe(10);
        expect(result.records).toHaveLength(2);
      });
    });
  });

  describe('radgroupcheck model', () => {
    describe('findByGroupname', () => {
      it('should return all check attributes for a group', async () => {
        const mockRecords = [
          { id: 1, groupname: 'pkg-10mbps', attribute: 'Auth-Type', op: ':=', value: 'Accept' },
        ];
        radiusPool.execute.mockResolvedValueOnce([mockRecords, []]);

        const result = await radgroupcheckModel.findByGroupname('pkg-10mbps');
        expect(result).toEqual(mockRecords);
      });
    });

    describe('create', () => {
      it('should create with default op ":="', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await radgroupcheckModel.create({
          groupname: 'pkg-10mbps',
          attribute: 'Auth-Type',
          value: 'Accept',
        });

        expect(result.op).toBe(':=');
        expect(result.id).toBe(1);
      });
    });

    describe('deleteByGroupname', () => {
      it('should delete all check attributes for a group', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 2 }, []]);

        const result = await radgroupcheckModel.deleteByGroupname('pkg-10mbps');
        expect(result.affectedRows).toBe(2);
      });
    });
  });

  describe('radgroupreply model', () => {
    describe('findByGroupname', () => {
      it('should return all reply attributes for a group', async () => {
        const mockRecords = [
          { id: 1, groupname: 'pkg-10mbps', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '10M/20M' },
        ];
        radiusPool.execute.mockResolvedValueOnce([mockRecords, []]);

        const result = await radgroupreplyModel.findByGroupname('pkg-10mbps');
        expect(result).toEqual(mockRecords);
      });
    });

    describe('create', () => {
      it('should create with default op "="', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await radgroupreplyModel.create({
          groupname: 'pkg-10mbps',
          attribute: 'Mikrotik-Rate-Limit',
          value: '10M/20M',
        });

        expect(result.op).toBe('=');
        expect(result.id).toBe(1);
      });
    });

    describe('deleteByGroupname', () => {
      it('should delete all reply attributes for a group', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await radgroupreplyModel.deleteByGroupname('pkg-10mbps');
        expect(result.affectedRows).toBe(1);
      });
    });
  });

  describe('nas model', () => {
    describe('findByNasname', () => {
      it('should return NAS by IP address', async () => {
        const mockNas = { id: 1, nasname: '192.168.1.1', shortname: 'router-1', secret: 'secret123' };
        radiusPool.execute.mockResolvedValueOnce([[mockNas], []]);

        const result = await nasModel.findByNasname('192.168.1.1');
        expect(result).toEqual(mockNas);
      });

      it('should return null when not found', async () => {
        radiusPool.execute.mockResolvedValueOnce([[], []]);

        const result = await nasModel.findByNasname('10.0.0.1');
        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create NAS with required fields and defaults', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await nasModel.create({
          nasname: '192.168.1.1',
          secret: 'radiussecret',
        });

        expect(result.id).toBe(1);
        expect(result.nasname).toBe('192.168.1.1');
        expect(result.type).toBe('other');
        expect(result.description).toBe('RADIUS Client');
        expect(radiusPool.execute).toHaveBeenCalledWith(
          'INSERT INTO nas (nasname, shortname, type, ports, secret, server, community, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ['192.168.1.1', null, 'other', null, 'radiussecret', null, null, 'RADIUS Client']
        );
      });

      it('should create NAS with all fields', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);

        const result = await nasModel.create({
          nasname: '10.0.0.1',
          shortname: 'branch-router',
          type: 'mikrotik',
          ports: 1812,
          secret: 'mysecret',
          server: 'default',
          community: 'public',
          description: 'Branch 1 Router',
        });

        expect(result.id).toBe(2);
        expect(result.type).toBe('mikrotik');
        expect(result.shortname).toBe('branch-router');
      });
    });

    describe('update', () => {
      it('should update allowed fields', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await nasModel.update(1, { secret: 'newsecret', description: 'Updated' });
        expect(result.affectedRows).toBe(1);
      });

      it('should return affectedRows 0 when no valid fields', async () => {
        const result = await nasModel.update(1, { invalid: 'field' });
        expect(result.affectedRows).toBe(0);
      });
    });

    describe('deleteById', () => {
      it('should delete NAS by ID', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await nasModel.deleteById(1);
        expect(result.affectedRows).toBe(1);
      });
    });

    describe('deleteByNasname', () => {
      it('should delete NAS by nasname', async () => {
        radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await nasModel.deleteByNasname('192.168.1.1');
        expect(result.affectedRows).toBe(1);
      });
    });

    describe('findAll', () => {
      it('should return paginated NAS records', async () => {
        radiusPool.execute
          .mockResolvedValueOnce([[{ total: 3 }], []])
          .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }], []]);

        const result = await nasModel.findAll({ page: 1, limit: 50 });
        expect(result.total).toBe(3);
        expect(result.records).toHaveLength(3);
      });
    });
  });

  describe('radiusModels index', () => {
    it('should export all models and radiusPool', () => {
      const radiusModels = require('../../src/radiusModels/index');

      expect(radiusModels.radiusPool).toBeDefined();
      expect(radiusModels.radcheckModel).toBeDefined();
      expect(radiusModels.radreplyModel).toBeDefined();
      expect(radiusModels.raduserGroupModel).toBeDefined();
      expect(radiusModels.radacctModel).toBeDefined();
      expect(radiusModels.radgroupcheckModel).toBeDefined();
      expect(radiusModels.radgroupreplyModel).toBeDefined();
      expect(radiusModels.nasModel).toBeDefined();
    });
  });
});
