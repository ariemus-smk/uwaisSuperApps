/**
 * Authentication controller.
 * Handles login, token refresh, and password reset endpoints.
 */

const authService = require('../services/auth.service');
const { success, error } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * POST /api/auth/login
 * Authenticate user with username and password.
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return error(res, 'Username and password are required.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const result = await authService.login(username, password, ipAddress);

    return success(res, {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    }, 'Login successful.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = statusCode === 401 ? ERROR_CODE.AUTH_INVALID_CREDENTIALS : ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/auth/refresh
 * Refresh access token using a valid refresh token.
 */
async function refreshToken(req, res) {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return error(res, 'Refresh token is required.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const result = await authService.refresh(token, ipAddress);

    return success(res, {
      accessToken: result.accessToken,
    }, 'Token refreshed successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = statusCode === 401 ? ERROR_CODE.AUTH_TOKEN_INVALID : ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/auth/password-reset/request
 * Request a password reset token.
 */
async function passwordResetRequest(req, res) {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return error(res, 'Username or email is required.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const result = await authService.requestPasswordReset(identifier, ipAddress);

    return success(res, null, result.message);
  } catch (err) {
    // Always return success to not reveal user existence
    return success(res, null, 'If the account exists, a password reset link has been sent.');
  }
}

/**
 * POST /api/auth/password-reset/confirm
 * Confirm password reset with token and new password.
 */
async function passwordResetConfirm(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return error(res, 'Reset token and new password are required.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    if (newPassword.length < 6) {
      return error(res, 'Password must be at least 6 characters.', 400, null, ERROR_CODE.VALIDATION_ERROR);
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const result = await authService.confirmPasswordReset(token, newPassword, ipAddress);

    return success(res, null, result.message);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return error(res, err.message, statusCode, null, ERROR_CODE.INTERNAL_ERROR);
  }
}

module.exports = {
  login,
  refreshToken,
  passwordResetRequest,
  passwordResetConfirm,
};
