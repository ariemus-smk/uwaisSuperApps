/**
 * JWT Authentication middleware.
 * Verifies Bearer tokens from the Authorization header and attaches
 * the decoded user payload (id, role, branch_id) to req.user.
 */

const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Extract Bearer token from the Authorization header.
 * @param {import('express').Request} req - Express request object
 * @returns {string|null} The token string or null if not found
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7);
}

/**
 * JWT authentication middleware.
 * Validates the token and attaches decoded payload to req.user.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Access denied. No token provided.',
      code: ERROR_CODE.AUTH_UNAUTHORIZED,
    });
  }

  try {
    const decoded = jwt.verify(token, authConfig.jwt.secret);

    req.user = {
      id: decoded.id,
      role: decoded.role,
      branch_id: decoded.branch_id,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired.',
        code: ERROR_CODE.AUTH_TOKEN_EXPIRED,
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Invalid token.',
      code: ERROR_CODE.AUTH_TOKEN_INVALID,
    });
  }
}

module.exports = {
  authenticate,
  extractToken,
};
