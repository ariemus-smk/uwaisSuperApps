/**
 * Unit tests for JWT authentication middleware.
 */

const jwt = require('jsonwebtoken');
const { authenticate, extractToken } = require('../../src/middleware/auth');

const TEST_SECRET = 'test-secret-key';

// Mock the auth config
jest.mock('../../src/config/auth', () => ({
  jwt: {
    secret: 'test-secret-key',
    expiresIn: '24h',
  },
  refreshToken: {
    secret: 'test-refresh-secret',
    expiresIn: '7d',
  },
}));

/**
 * Helper to create a mock request object.
 */
function createMockReq(authHeader) {
  return {
    headers: {
      authorization: authHeader,
    },
  };
}

/**
 * Helper to create a mock response object.
 */
function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Auth Middleware - extractToken', () => {
  it('should return null when no Authorization header is present', () => {
    const req = { headers: {} };
    expect(extractToken(req)).toBeNull();
  });

  it('should return null when Authorization header does not start with Bearer', () => {
    const req = createMockReq('Basic abc123');
    expect(extractToken(req)).toBeNull();
  });

  it('should return null when Authorization header is just "Bearer "', () => {
    const req = createMockReq('Bearer ');
    expect(extractToken(req)).toBe('');
  });

  it('should extract the token from a valid Bearer header', () => {
    const req = createMockReq('Bearer my-jwt-token');
    expect(extractToken(req)).toBe('my-jwt-token');
  });

  it('should handle tokens with dots (real JWT format)', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.sig';
    const req = createMockReq(`Bearer ${token}`);
    expect(extractToken(req)).toBe(token);
  });
});

describe('Auth Middleware - authenticate', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    res = createMockRes();
    next = jest.fn();
  });

  it('should return 401 when no token is provided', () => {
    req = createMockReq(undefined);

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Access denied. No token provided.',
        code: 'AUTH_UNAUTHORIZED',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is not Bearer format', () => {
    req = createMockReq('Basic some-token');

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Access denied. No token provided.',
        code: 'AUTH_UNAUTHORIZED',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with TOKEN_INVALID for a malformed token', () => {
    req = createMockReq('Bearer not-a-valid-jwt');

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Invalid token.',
        code: 'AUTH_TOKEN_INVALID',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with TOKEN_EXPIRED for an expired token', () => {
    const token = jwt.sign(
      { id: 1, role: 'Admin', branch_id: 1 },
      TEST_SECRET,
      { expiresIn: '0s' }
    );
    req = createMockReq(`Bearer ${token}`);

    // Small delay to ensure token is expired
    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Token has expired.',
        code: 'AUTH_TOKEN_EXPIRED',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is signed with a different secret', () => {
    const token = jwt.sign(
      { id: 1, role: 'Admin', branch_id: 1 },
      'wrong-secret',
      { expiresIn: '1h' }
    );
    req = createMockReq(`Bearer ${token}`);

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Invalid token.',
        code: 'AUTH_TOKEN_INVALID',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach decoded user payload to req.user for a valid token', () => {
    const payload = { id: 42, role: 'Superadmin', branch_id: 3 };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
    req = createMockReq(`Bearer ${token}`);

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: 42,
      role: 'Superadmin',
      branch_id: 3,
    });
  });

  it('should only attach id, role, and branch_id to req.user (no extra fields)', () => {
    const payload = {
      id: 5,
      role: 'Teknisi',
      branch_id: 2,
      username: 'teknisi1',
      extra: 'data',
    };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
    req = createMockReq(`Bearer ${token}`);

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: 5,
      role: 'Teknisi',
      branch_id: 2,
    });
    expect(req.user.username).toBeUndefined();
    expect(req.user.extra).toBeUndefined();
  });

  it('should work for all 8 user roles', () => {
    const roles = [
      'Superadmin', 'Admin', 'Accounting', 'Mitra',
      'Sales', 'Merchant', 'Teknisi', 'Pelanggan',
    ];

    roles.forEach((role) => {
      const token = jwt.sign(
        { id: 1, role, branch_id: 1 },
        TEST_SECRET,
        { expiresIn: '1h' }
      );
      const mockReq = createMockReq(`Bearer ${token}`);
      const mockRes = createMockRes();
      const mockNext = jest.fn();

      authenticate(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user.role).toBe(role);
    });
  });
});
