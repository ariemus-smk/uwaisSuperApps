/**
 * Unit tests for RADIUS provisioning service.
 * Tests PPPoE account creation, user group management,
 * isolir profile, FUP profile, and account deletion.
 */

jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

const { radiusPool, resetMocks } = require('../helpers/dbMock');
const radiusService = require('../../src/services/radius.service');

describe('RADIUS Service', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('createPPPoEAccount', () => {
    it('should create a PPPoE account with Cleartext-Password in radcheck', async () => {
      // findByUsernameAndAttribute - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);
      // create radcheck entry
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await radiusService.createPPPoEAccount('pppoe-user1', 'secret123');

      expect(result.id).toBe(1);
      expect(result.username).toBe('pppoe-user1');
      expect(result.attribute).toBe('Cleartext-Password');
      expect(result.op).toBe(':=');
      expect(result.value).toBe('secret123');
    });

    it('should throw 409 if PPPoE account already exists', async () => {
      // findByUsernameAndAttribute - found existing
      radiusPool.execute.mockResolvedValueOnce([
        [{ id: 1, username: 'pppoe-user1', attribute: 'Cleartext-Password', op: ':=', value: 'oldpass' }],
        [],
      ]);

      await expect(
        radiusService.createPPPoEAccount('pppoe-user1', 'newpass')
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RESOURCE_ALREADY_EXISTS',
      });
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.createPPPoEAccount('', 'password')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 if password is missing', async () => {
      await expect(
        radiusService.createPPPoEAccount('user1', '')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 if username is null', async () => {
      await expect(
        radiusService.createPPPoEAccount(null, 'password')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('updateUserGroup', () => {
    it('should remove existing groups and assign user to new group', async () => {
      // deleteByUsername
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // create new group mapping
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 5 }, []]);

      const result = await radiusService.updateUserGroup('pppoe-user1', 'pkg-10mbps');

      expect(result.id).toBe(5);
      expect(result.username).toBe('pppoe-user1');
      expect(result.groupname).toBe('pkg-10mbps');
      expect(result.priority).toBe(1);
    });

    it('should support custom priority', async () => {
      // deleteByUsername
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
      // create new group mapping
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 6 }, []]);

      const result = await radiusService.updateUserGroup('pppoe-user1', 'pkg-20mbps', 2);

      expect(result.priority).toBe(2);
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.updateUserGroup('', 'pkg-10mbps')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 if groupname is missing', async () => {
      await expect(
        radiusService.updateUserGroup('pppoe-user1', '')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('setIsolirProfile', () => {
    it('should create isolir rate limit and add to isolir group when no existing attributes', async () => {
      // findByUsernameAndAttribute for radreply (Mikrotik-Rate-Limit) - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);
      // create radreply
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 10 }, []]);
      // findByUsernameAndGroup for isolir group - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);
      // create radusergroup
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 20 }, []]);

      const result = await radiusService.setIsolirProfile('pppoe-user1');

      expect(result.replyRecord.id).toBe(10);
      expect(result.replyRecord.attribute).toBe('Mikrotik-Rate-Limit');
      expect(result.replyRecord.value).toBe('256k/256k');
      expect(result.groupRecord.id).toBe(20);
      expect(result.groupRecord.groupname).toBe('isolir');
      expect(result.groupRecord.priority).toBe(0);
    });

    it('should update existing rate limit and skip group creation if already in isolir group', async () => {
      // findByUsernameAndAttribute for radreply - found
      const existingReply = { id: 10, username: 'pppoe-user1', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '5M/10M' };
      radiusPool.execute.mockResolvedValueOnce([[existingReply], []]);
      // update radreply
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findByUsernameAndGroup for isolir group - found
      const existingGroup = { id: 20, username: 'pppoe-user1', groupname: 'isolir', priority: 0 };
      radiusPool.execute.mockResolvedValueOnce([[existingGroup], []]);

      const result = await radiusService.setIsolirProfile('pppoe-user1');

      expect(result.replyRecord.value).toBe('256k/256k');
      expect(result.groupRecord).toEqual(existingGroup);
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.setIsolirProfile('')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('removeIsolirProfile', () => {
    it('should remove isolir rate limit and isolir group assignment', async () => {
      // findByUsernameAndAttribute for radreply - found
      const existingReply = { id: 10, username: 'pppoe-user1', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '256k/256k' };
      radiusPool.execute.mockResolvedValueOnce([[existingReply], []]);
      // deleteById radreply
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // findByUsernameAndGroup for isolir group - found
      const existingGroup = { id: 20, username: 'pppoe-user1', groupname: 'isolir', priority: 0 };
      radiusPool.execute.mockResolvedValueOnce([[existingGroup], []]);
      // deleteById radusergroup
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await radiusService.removeIsolirProfile('pppoe-user1');

      expect(result.replyRemoved).toBe(true);
      expect(result.groupRemoved).toBe(true);
    });

    it('should handle case when no isolir attributes exist', async () => {
      // findByUsernameAndAttribute for radreply - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);
      // findByUsernameAndGroup for isolir group - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);

      const result = await radiusService.removeIsolirProfile('pppoe-user1');

      expect(result.replyRemoved).toBe(false);
      expect(result.groupRemoved).toBe(false);
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.removeIsolirProfile('')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('setFUPProfile', () => {
    it('should create FUP rate limit when no existing attribute', async () => {
      // findByUsernameAndAttribute - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);
      // create radreply
      radiusPool.execute.mockResolvedValueOnce([{ insertId: 15 }, []]);

      const result = await radiusService.setFUPProfile('pppoe-user1', 2048, 4096);

      expect(result.id).toBe(15);
      expect(result.attribute).toBe('Mikrotik-Rate-Limit');
      expect(result.value).toBe('2048k/4096k');
    });

    it('should update existing rate limit when attribute exists', async () => {
      // findByUsernameAndAttribute - found
      const existingAttr = { id: 15, username: 'pppoe-user1', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '10M/20M' };
      radiusPool.execute.mockResolvedValueOnce([[existingAttr], []]);
      // update radreply
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await radiusService.setFUPProfile('pppoe-user1', 1024, 2048);

      expect(result.value).toBe('1024k/2048k');
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.setFUPProfile('', 1024, 2048)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 if upload speed is invalid (zero)', async () => {
      await expect(
        radiusService.setFUPProfile('pppoe-user1', 0, 2048)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 if download speed is invalid (negative)', async () => {
      await expect(
        radiusService.setFUPProfile('pppoe-user1', 1024, -1)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 if download speed is zero', async () => {
      await expect(
        radiusService.setFUPProfile('pppoe-user1', 1024, 0)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('resetFUPProfile', () => {
    it('should remove FUP rate limit attribute from radreply', async () => {
      // findByUsernameAndAttribute - found
      const existingAttr = { id: 15, username: 'pppoe-user1', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '1024k/2048k' };
      radiusPool.execute.mockResolvedValueOnce([[existingAttr], []]);
      // deleteById
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await radiusService.resetFUPProfile('pppoe-user1');

      expect(result.removed).toBe(true);
    });

    it('should handle case when no FUP attribute exists', async () => {
      // findByUsernameAndAttribute - not found
      radiusPool.execute.mockResolvedValueOnce([[], []]);

      const result = await radiusService.resetFUPProfile('pppoe-user1');

      expect(result.removed).toBe(false);
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.resetFUPProfile('')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('deletePPPoEAccount', () => {
    it('should delete all radcheck, radreply, and radusergroup entries', async () => {
      // deleteByUsername radcheck
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // deleteByUsername radreply
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 2 }, []]);
      // deleteByUsername radusergroup
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await radiusService.deletePPPoEAccount('pppoe-user1');

      expect(result.radcheckDeleted).toBe(1);
      expect(result.radreplyDeleted).toBe(2);
      expect(result.radusergroupDeleted).toBe(1);
    });

    it('should handle case when no entries exist for username', async () => {
      // deleteByUsername radcheck
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
      // deleteByUsername radreply
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
      // deleteByUsername radusergroup
      radiusPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

      const result = await radiusService.deletePPPoEAccount('nonexistent-user');

      expect(result.radcheckDeleted).toBe(0);
      expect(result.radreplyDeleted).toBe(0);
      expect(result.radusergroupDeleted).toBe(0);
    });

    it('should throw 400 if username is missing', async () => {
      await expect(
        radiusService.deletePPPoEAccount('')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });
});
