/**
 * Authentication service.
 * Handles credential verification, token generation, and password management.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const authConfig = require('../config/auth');
const userModel = require('../models/user.model');
const authLogModel = require('../models/authLog.model');

const SALT_ROUNDS = 10;

/**
 * Verify user credentials and generate tokens.
 * @param {string} username
 * @param {string} password
 * @param {string} ipAddress - Client IP for logging
 * @returns {Promise<object>} { user, accessToken, refreshToken }
 * @throws {Error} If credentials are invalid or user is inactive
 */
async function login(username, password, ipAddress) {
  const user = await userModel.findByUsername(username);

  if (!user) {
    // Log failed attempt - user not found
    await authLogModel.create({
      userId: null,
      username,
      eventType: 'LoginFailed',
      ipAddress,
    });
    throw Object.assign(new Error('Invalid username or password.'), { statusCode: 401 });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    // Log failed attempt - wrong password
    await authLogModel.create({
      userId: user.id,
      username,
      eventType: 'LoginFailed',
      ipAddress,
    });
    throw Object.assign(new Error('Invalid username or password.'), { statusCode: 401 });
  }

  if (user.status !== 'Active') {
    await authLogModel.create({
      userId: user.id,
      username,
      eventType: 'LoginFailed',
      ipAddress,
    });
    throw Object.assign(new Error('Account is inactive. Please contact administrator.'), { statusCode: 403 });
  }

  // Generate tokens
  const tokenPayload = { id: user.id, role: user.role, branch_id: user.branch_id };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Log successful login
  await authLogModel.create({
    userId: user.id,
    username,
    eventType: 'LoginSuccess',
    ipAddress,
  });

  // Return user info without sensitive fields
  const { password_hash, reset_token, reset_token_expires, ...safeUser } = user;

  return {
    user: safeUser,
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * @param {string} refreshToken
 * @param {string} ipAddress - Client IP for logging
 * @returns {Promise<object>} { accessToken }
 * @throws {Error} If refresh token is invalid or expired
 */
async function refresh(refreshToken, ipAddress) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, authConfig.refreshToken.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw Object.assign(new Error('Refresh token has expired.'), { statusCode: 401 });
    }
    throw Object.assign(new Error('Invalid refresh token.'), { statusCode: 401 });
  }

  // Generate new access token
  const tokenPayload = { id: decoded.id, role: decoded.role, branch_id: decoded.branch_id };
  const accessToken = generateAccessToken(tokenPayload);

  // Log token refresh
  await authLogModel.create({
    userId: decoded.id,
    username: decoded.id.toString(),
    eventType: 'TokenRefresh',
    ipAddress,
  });

  return { accessToken };
}

/**
 * Request a password reset. Generates a reset token and stores it.
 * Does not reveal whether the user exists (always returns success).
 * @param {string} identifier - Username or email
 * @param {string} ipAddress - Client IP for logging
 * @returns {Promise<object>} { message } (always success for security)
 */
async function requestPasswordReset(identifier, ipAddress) {
  const user = await userModel.findByUsername(identifier);

  if (user) {
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await userModel.setResetToken(user.id, resetToken, expiresAt);

    // Log password reset request
    await authLogModel.create({
      userId: user.id,
      username: identifier,
      eventType: 'PasswordReset',
      ipAddress,
    });
  }

  // Always return success to not reveal user existence
  return { message: 'If the account exists, a password reset link has been sent.' };
}

/**
 * Confirm a password reset with a valid token and new password.
 * @param {string} resetToken - The UUID reset token
 * @param {string} newPassword - The new password to set
 * @param {string} ipAddress - Client IP for logging
 * @returns {Promise<object>} { message }
 * @throws {Error} If token is invalid or expired
 */
async function confirmPasswordReset(resetToken, newPassword, ipAddress) {
  const user = await userModel.findByResetToken(resetToken);

  if (!user) {
    throw Object.assign(new Error('Invalid or expired reset token.'), { statusCode: 400 });
  }

  // Check token expiry
  if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
    throw Object.assign(new Error('Reset token has expired.'), { statusCode: 400 });
  }

  // Hash new password and update
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userModel.updatePassword(user.id, passwordHash);
  await userModel.clearResetToken(user.id);

  // Log password change
  await authLogModel.create({
    userId: user.id,
    username: user.username,
    eventType: 'PasswordReset',
    ipAddress,
  });

  return { message: 'Password has been reset successfully.' };
}

/**
 * Generate a JWT access token.
 * @param {object} payload - { id, role, branch_id }
 * @returns {string} Signed JWT
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, authConfig.jwt.secret, {
    expiresIn: authConfig.jwt.expiresIn,
  });
}

/**
 * Generate a JWT refresh token.
 * @param {object} payload - { id, role, branch_id }
 * @returns {string} Signed JWT
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, authConfig.refreshToken.secret, {
    expiresIn: authConfig.refreshToken.expiresIn,
  });
}

/**
 * Hash a plain-text password.
 * @param {string} password
 * @returns {Promise<string>} Bcrypt hash
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

module.exports = {
  login,
  refresh,
  requestPasswordReset,
  confirmPasswordReset,
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
};
