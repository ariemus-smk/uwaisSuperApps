/**
 * Unit tests for auth service.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/config/auth', () => ({
  jwt: {
    secret: 'test-jwt-secret',
    expiresIn: '24h',
  },
  refreshToken: {
    secret: 'test-refresh-secret',
    expiresIn: '7d',
  },
}));

const { appPool } = require('../../src/config/database');
const authService = require('../../src/services/auth.service');

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const mockUser = {
      id: 1,
      username: 'admin1',
      password_hash: bcrypt.hashSync('password123', 10),
      full_name: 'Admin User',
      role: 'Admin',
      branch_id: 1,
      status: 'Active',
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should return tokens and user info on successful login', async () => {
      // Mock findByUsername
      appPool.execute
        .mockResolvedValueOnce([[mockUser], []])  // findByUsername
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      const result = await authService.login('admin1', 'password123', '127.0.0.1');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('admin1');
      expect(result.user.password_hash).toBeUndefined();
    });

    it('should throw 401 when user is not found', async () => {
      appPool.execute
        .mockResolvedValueOnce([[], []])  // findByUsername returns empty
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      await expect(
        authService.login('nonexistent', 'password123', '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Invalid username or password.',
        statusCode: 401,
      });
    });

    it('should throw 401 when password is incorrect', async () => {
      appPool.execute
        .mockResolvedValueOnce([[mockUser], []])  // findByUsername
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      await expect(
        authService.login('admin1', 'wrongpassword', '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Invalid username or password.',
        statusCode: 401,
      });
    });

    it('should throw 403 when user account is inactive', async () => {
      const inactiveUser = { ...mockUser, status: 'Inactive' };
      appPool.execute
        .mockResolvedValueOnce([[inactiveUser], []])  // findByUsername
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      await expect(
        authService.login('admin1', 'password123', '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Account is inactive. Please contact administrator.',
        statusCode: 403,
      });
    });

    it('should log failed login attempt when user not found', async () => {
      appPool.execute
        .mockResolvedValueOnce([[], []])  // findByUsername
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      await expect(
        authService.login('unknown', 'pass', '192.168.1.1')
      ).rejects.toThrow();

      // Second call should be the auth log insert
      expect(appPool.execute).toHaveBeenCalledTimes(2);
      const logCall = appPool.execute.mock.calls[1];
      expect(logCall[0]).toContain('INSERT INTO auth_logs');
      expect(logCall[1]).toContain('LoginFailed');
    });

    it('should generate valid JWT access token with correct payload', async () => {
      appPool.execute
        .mockResolvedValueOnce([[mockUser], []])
        .mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await authService.login('admin1', 'password123', '127.0.0.1');

      const decoded = jwt.verify(result.accessToken, 'test-jwt-secret');
      expect(decoded.id).toBe(1);
      expect(decoded.role).toBe('Admin');
      expect(decoded.branch_id).toBe(1);
    });
  });

  describe('refresh', () => {
    it('should return a new access token for a valid refresh token', async () => {
      const refreshToken = jwt.sign(
        { id: 1, role: 'Admin', branch_id: 1 },
        'test-refresh-secret',
        { expiresIn: '7d' }
      );

      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      const result = await authService.refresh(refreshToken, '127.0.0.1');

      expect(result).toHaveProperty('accessToken');
      const decoded = jwt.verify(result.accessToken, 'test-jwt-secret');
      expect(decoded.id).toBe(1);
      expect(decoded.role).toBe('Admin');
    });

    it('should throw 401 for an expired refresh token', async () => {
      const expiredToken = jwt.sign(
        { id: 1, role: 'Admin', branch_id: 1 },
        'test-refresh-secret',
        { expiresIn: '0s' }
      );

      await expect(
        authService.refresh(expiredToken, '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Refresh token has expired.',
        statusCode: 401,
      });
    });

    it('should throw 401 for an invalid refresh token', async () => {
      await expect(
        authService.refresh('invalid-token', '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Invalid refresh token.',
        statusCode: 401,
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should set reset token when user exists', async () => {
      const mockUser = { id: 1, username: 'admin1' };
      appPool.execute
        .mockResolvedValueOnce([[mockUser], []])  // findByUsername
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // setResetToken
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      const result = await authService.requestPasswordReset('admin1', '127.0.0.1');

      expect(result.message).toContain('If the account exists');
      // Verify setResetToken was called
      expect(appPool.execute).toHaveBeenCalledTimes(3);
    });

    it('should return success even when user does not exist', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]); // findByUsername returns empty

      const result = await authService.requestPasswordReset('nonexistent', '127.0.0.1');

      expect(result.message).toContain('If the account exists');
    });
  });

  describe('confirmPasswordReset', () => {
    it('should reset password with valid token', async () => {
      const mockUser = {
        id: 1,
        username: 'admin1',
        reset_token: 'valid-token',
        reset_token_expires: new Date(Date.now() + 3600000), // 1 hour from now
      };

      appPool.execute
        .mockResolvedValueOnce([[mockUser], []])  // findByResetToken
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // updatePassword
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // clearResetToken
        .mockResolvedValueOnce([{ insertId: 1 }, []]); // authLog.create

      const result = await authService.confirmPasswordReset('valid-token', 'newpass123', '127.0.0.1');

      expect(result.message).toBe('Password has been reset successfully.');
    });

    it('should throw 400 for invalid reset token', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]); // findByResetToken returns empty

      await expect(
        authService.confirmPasswordReset('invalid-token', 'newpass123', '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Invalid or expired reset token.',
        statusCode: 400,
      });
    });

    it('should throw 400 for expired reset token', async () => {
      const mockUser = {
        id: 1,
        username: 'admin1',
        reset_token: 'expired-token',
        reset_token_expires: new Date(Date.now() - 3600000), // 1 hour ago
      };

      appPool.execute.mockResolvedValueOnce([[mockUser], []]); // findByResetToken

      await expect(
        authService.confirmPasswordReset('expired-token', 'newpass123', '127.0.0.1')
      ).rejects.toMatchObject({
        message: 'Reset token has expired.',
        statusCode: 400,
      });
    });
  });

  describe('hashPassword', () => {
    it('should return a bcrypt hash', async () => {
      const hash = await authService.hashPassword('mypassword');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('mypassword');
      const isValid = await bcrypt.compare('mypassword', hash);
      expect(isValid).toBe(true);
    });
  });
});
