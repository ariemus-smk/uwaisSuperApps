/**
 * Supertest request factory with JWT token generation for different roles.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

/**
 * Available roles in the system.
 */
const ROLES = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Admin',
  ACCOUNTING: 'Accounting',
  MITRA: 'Mitra',
  SALES: 'Sales',
  MERCHANT: 'Merchant',
  TEKNISI: 'Teknisi',
  PELANGGAN: 'Pelanggan'
};

/**
 * Generate a JWT token for a given user payload.
 * @param {object} payload - User data to encode in the token
 * @param {object} [options] - JWT sign options
 * @returns {string} Signed JWT token
 */
const generateToken = (payload, options = {}) => {
  const defaults = {
    id: 1,
    username: 'testuser',
    role: ROLES.ADMIN,
    branch_id: 1
  };

  return jwt.sign(
    { ...defaults, ...payload },
    JWT_SECRET,
    { expiresIn: '1h', ...options }
  );
};

/**
 * Create an authenticated supertest agent for a specific role.
 * @param {string} role - One of the ROLES values
 * @param {object} [userOverrides] - Additional user payload fields
 * @returns {object} Object with token and request methods (get, post, put, patch, delete)
 */
const createAuthenticatedRequest = (role, userOverrides = {}) => {
  const token = generateToken({ role, ...userOverrides });

  const agent = request(app);

  const withAuth = (method) => (url) => {
    return agent[method](url).set('Authorization', `Bearer ${token}`);
  };

  return {
    token,
    get: withAuth('get'),
    post: withAuth('post'),
    put: withAuth('put'),
    patch: withAuth('patch'),
    delete: withAuth('delete')
  };
};

/**
 * Create an unauthenticated supertest agent (no JWT token).
 * @returns {object} Supertest agent
 */
const createUnauthenticatedRequest = () => {
  return request(app);
};

module.exports = {
  ROLES,
  generateToken,
  createAuthenticatedRequest,
  createUnauthenticatedRequest
};
