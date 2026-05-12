/**
 * Unit tests for user management service.
 * Tests CRUD operations, role-specific field validation, and status management.
 */

const bcrypt = require('bcryptjs');

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

const { appPool } = require('../../src/config/database');
const userService = require('../../src/services/user.service');

describe('User Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listUsers', () => {
    it('should return paginated user list', async () => {
      const mockUsers = [
        { id: 1, username: 'admin1', full_name: 'Admin One', role: 'Admin', status: 'Active' },
        { id: 2, username: 'mitra1', full_name: 'Mitra One', role: 'Mitra', status: 'Active' },
      ];

      appPool.execute
        .mockResolvedValueOnce([[{ total: 2 }], []])  // COUNT query
        .mockResolvedValueOnce([mockUsers, []]);       // SELECT query

      const result = await userService.listUsers({ page: 1, limit: 20 });

      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should apply role filter', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([[{ id: 1, username: 'mitra1', role: 'Mitra' }], []]);

      const result = await userService.listUsers({ role: 'Mitra' });

      expect(result.users).toHaveLength(1);
      // Verify the role filter was passed in the query params
      const countCall = appPool.execute.mock.calls[0];
      expect(countCall[1]).toContain('Mitra');
    });

    it('should apply status filter', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([[{ id: 1, username: 'admin1', status: 'Active' }], []]);

      const result = await userService.listUsers({ status: 'Active' });

      expect(result.users).toHaveLength(1);
      const countCall = appPool.execute.mock.calls[0];
      expect(countCall[1]).toContain('Active');
    });

    it('should calculate totalPages correctly', async () => {
      appPool.execute
        .mockResolvedValueOnce([[{ total: 45 }], []])
        .mockResolvedValueOnce([[], []]);

      const result = await userService.listUsers({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(3);
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, username: 'admin1', full_name: 'Admin One', role: 'Admin', status: 'Active' };
      appPool.execute.mockResolvedValueOnce([[mockUser], []]);

      const result = await userService.getUserById(1);

      expect(result).toEqual(mockUser);
    });

    it('should throw 404 when user not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(userService.getUserById(999)).rejects.toMatchObject({
        message: 'User not found.',
        statusCode: 404,
      });
    });
  });

  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      // Mock findByUsername (no existing user)
      appPool.execute
        .mockResolvedValueOnce([[], []])  // findByUsername - no duplicate
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // INSERT

      const result = await userService.createUser({
        username: 'newuser',
        password: 'password123',
        full_name: 'New User',
        role: 'Admin',
        branch_id: 1,
      });

      expect(result.username).toBe('newuser');
      expect(result.full_name).toBe('New User');
      expect(result.role).toBe('Admin');
      expect(result.password_hash).toBeUndefined();
      // Verify password was hashed in the INSERT call
      const insertCall = appPool.execute.mock.calls[1];
      expect(insertCall[1][1]).not.toBe('password123'); // password_hash should be bcrypt hash
    });

    it('should throw 409 when username already exists', async () => {
      appPool.execute.mockResolvedValueOnce([[{ id: 1, username: 'existing' }], []]);

      await expect(
        userService.createUser({
          username: 'existing',
          password: 'password123',
          full_name: 'Test',
          role: 'Admin',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        message: 'Username already exists.',
        statusCode: 409,
      });
    });

    it('should throw 400 for invalid role', async () => {
      await expect(
        userService.createUser({
          username: 'newuser',
          password: 'password123',
          full_name: 'Test',
          role: 'InvalidRole',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should require profit_sharing_pct for Mitra role', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]); // findByUsername - no duplicate

      await expect(
        userService.createUser({
          username: 'mitra1',
          password: 'password123',
          full_name: 'Mitra User',
          role: 'Mitra',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        message: 'profit_sharing_pct is required for Mitra accounts.',
        statusCode: 400,
      });
    });

    it('should create Mitra with profit_sharing_pct', async () => {
      appPool.execute
        .mockResolvedValueOnce([[], []])  // findByUsername
        .mockResolvedValueOnce([{ insertId: 2 }, []]); // INSERT

      const result = await userService.createUser({
        username: 'mitra1',
        password: 'password123',
        full_name: 'Mitra User',
        role: 'Mitra',
        branch_id: 1,
        profit_sharing_pct: 15.5,
      });

      expect(result.role).toBe('Mitra');
      expect(result.profit_sharing_pct).toBe(15.5);
      expect(result.saldo).toBe(0);
    });

    it('should require commission_amount for Merchant role', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]); // findByUsername

      await expect(
        userService.createUser({
          username: 'merchant1',
          password: 'password123',
          full_name: 'Merchant User',
          role: 'Merchant',
          branch_id: 1,
        })
      ).rejects.toMatchObject({
        message: 'commission_amount is required for Merchant accounts.',
        statusCode: 400,
      });
    });

    it('should create Merchant with commission_amount', async () => {
      appPool.execute
        .mockResolvedValueOnce([[], []])  // findByUsername
        .mockResolvedValueOnce([{ insertId: 3 }, []]); // INSERT

      const result = await userService.createUser({
        username: 'merchant1',
        password: 'password123',
        full_name: 'Merchant User',
        role: 'Merchant',
        branch_id: 1,
        commission_amount: 5000,
      });

      expect(result.role).toBe('Merchant');
      expect(result.commission_amount).toBe(5000);
      expect(result.saldo).toBe(0);
    });

    it('should set saldo to null for non-Mitra/Merchant roles', async () => {
      appPool.execute
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ insertId: 4 }, []]);

      const result = await userService.createUser({
        username: 'teknisi1',
        password: 'password123',
        full_name: 'Teknisi User',
        role: 'Teknisi',
        branch_id: 1,
      });

      expect(result.saldo).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      const existingUser = { id: 1, username: 'admin1', full_name: 'Old Name', role: 'Admin', status: 'Active' };
      const updatedUser = { ...existingUser, full_name: 'New Name' };

      appPool.execute
        .mockResolvedValueOnce([[existingUser], []])  // findById (check exists)
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // UPDATE
        .mockResolvedValueOnce([[updatedUser], []]);  // findById (return updated)

      const result = await userService.updateUser(1, { full_name: 'New Name' });

      expect(result.full_name).toBe('New Name');
    });

    it('should throw 404 when user not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        userService.updateUser(999, { full_name: 'Test' })
      ).rejects.toMatchObject({
        message: 'User not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 for invalid role on update', async () => {
      const existingUser = { id: 1, username: 'admin1', role: 'Admin', status: 'Active' };
      appPool.execute.mockResolvedValueOnce([[existingUser], []]);

      await expect(
        userService.updateUser(1, { role: 'InvalidRole' })
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('updateUserStatus', () => {
    it('should activate a user', async () => {
      const existingUser = { id: 1, username: 'admin1', status: 'Inactive' };
      const updatedUser = { ...existingUser, status: 'Active' };

      appPool.execute
        .mockResolvedValueOnce([[existingUser], []])  // findById
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // UPDATE status
        .mockResolvedValueOnce([[updatedUser], []]);  // findById (return updated)

      const result = await userService.updateUserStatus(1, 'Active');

      expect(result.status).toBe('Active');
    });

    it('should deactivate a user', async () => {
      const existingUser = { id: 1, username: 'admin1', status: 'Active' };
      const updatedUser = { ...existingUser, status: 'Inactive' };

      appPool.execute
        .mockResolvedValueOnce([[existingUser], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[updatedUser], []]);

      const result = await userService.updateUserStatus(1, 'Inactive');

      expect(result.status).toBe('Inactive');
    });

    it('should throw 400 for invalid status', async () => {
      await expect(
        userService.updateUserStatus(1, 'Suspended')
      ).rejects.toMatchObject({
        message: expect.stringContaining('Invalid status'),
        statusCode: 400,
      });
    });

    it('should throw 404 when user not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        userService.updateUserStatus(999, 'Active')
      ).rejects.toMatchObject({
        message: 'User not found.',
        statusCode: 404,
      });
    });
  });
});
