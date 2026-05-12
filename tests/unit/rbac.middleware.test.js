/**
 * Unit tests for RBAC middleware.
 */

const { authorize, PERMISSION_MATRIX } = require('../../src/middleware/rbac');
const { USER_ROLE, ERROR_CODE } = require('../../src/utils/constants');

// Helper to create mock req/res/next
function createMocks(userRole) {
  const req = {
    user: userRole ? { id: 1, role: userRole, branch_id: 1 } : undefined,
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('RBAC Middleware - authorize()', () => {
  describe('authorized access', () => {
    it('should call next() when user role is in allowed roles', () => {
      const middleware = authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN);
      const { req, res, next } = createMocks(USER_ROLE.SUPERADMIN);

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should call next() for Admin when Admin is allowed', () => {
      const middleware = authorize(USER_ROLE.ADMIN, USER_ROLE.ACCOUNTING);
      const { req, res, next } = createMocks(USER_ROLE.ADMIN);

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should call next() when single role matches', () => {
      const middleware = authorize(USER_ROLE.PELANGGAN);
      const { req, res, next } = createMocks(USER_ROLE.PELANGGAN);

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should call next() for each role when all roles are allowed', () => {
      const allRoles = Object.values(USER_ROLE);
      const middleware = authorize(...allRoles);

      allRoles.forEach((role) => {
        const { req, res, next } = createMocks(role);
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('unauthorized access (403 Forbidden)', () => {
    it('should return 403 when user role is not in allowed roles', () => {
      const middleware = authorize(USER_ROLE.SUPERADMIN);
      const { req, res, next } = createMocks(USER_ROLE.PELANGGAN);

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe(ERROR_CODE.AUTH_FORBIDDEN);
    });

    it('should return 403 for Teknisi accessing Superadmin-only route', () => {
      const middleware = authorize(USER_ROLE.SUPERADMIN);
      const { req, res, next } = createMocks(USER_ROLE.TEKNISI);

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe(ERROR_CODE.AUTH_FORBIDDEN);
    });

    it('should return 403 for Merchant accessing Admin-only route', () => {
      const middleware = authorize(USER_ROLE.ADMIN);
      const { req, res, next } = createMocks(USER_ROLE.MERCHANT);

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for Mitra accessing Accounting-only route', () => {
      const middleware = authorize(USER_ROLE.ACCOUNTING);
      const { req, res, next } = createMocks(USER_ROLE.MITRA);

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('missing authentication', () => {
    it('should return 401 when req.user is undefined', () => {
      const middleware = authorize(USER_ROLE.ADMIN);
      const { req, res, next } = createMocks(null);

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe(ERROR_CODE.AUTH_UNAUTHORIZED);
    });

    it('should return 401 when req.user.role is missing', () => {
      const middleware = authorize(USER_ROLE.ADMIN);
      const req = { user: { id: 1 } };
      const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe(ERROR_CODE.AUTH_UNAUTHORIZED);
    });
  });

  describe('response format', () => {
    it('should return proper error response structure on 403', () => {
      const middleware = authorize(USER_ROLE.SUPERADMIN);
      const { req, res, next } = createMocks(USER_ROLE.PELANGGAN);

      middleware(req, res, next);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('code', ERROR_CODE.AUTH_FORBIDDEN);
      expect(res.body.message).toContain('Forbidden');
    });
  });
});

describe('PERMISSION_MATRIX', () => {
  it('should define permissions for all 8 roles', () => {
    const roles = Object.values(USER_ROLE);
    roles.forEach((role) => {
      expect(PERMISSION_MATRIX).toHaveProperty(role);
      expect(Array.isArray(PERMISSION_MATRIX[role])).toBe(true);
      expect(PERMISSION_MATRIX[role].length).toBeGreaterThan(0);
    });
  });

  it('should grant Superadmin wildcard access to all resource categories', () => {
    const superadminPerms = PERMISSION_MATRIX[USER_ROLE.SUPERADMIN];
    // Superadmin should have wildcard (*) permissions for all major resources
    const wildcardPerms = superadminPerms.filter((p) => p.endsWith(':*'));
    expect(wildcardPerms.length).toBeGreaterThan(0);
    expect(superadminPerms).toContain('system:*');
    expect(superadminPerms).toContain('users:*');
    expect(superadminPerms).toContain('branches:*');
  });

  it('should be frozen (immutable)', () => {
    expect(Object.isFrozen(PERMISSION_MATRIX)).toBe(true);
  });
});
