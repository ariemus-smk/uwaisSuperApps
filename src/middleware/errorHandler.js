/**
 * Global error handling middleware.
 * Provides consistent error response format with support for:
 * - Validation errors (Joi)
 * - Custom application errors with status codes
 * - Stack traces in development mode
 */

const { ERROR_CODE } = require('../utils/constants');

/**
 * Custom application error class.
 * Use this to throw errors with specific status codes and error codes.
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string|null} code - Application error code from ERROR_CODE
   * @param {Array|null} errors - Detailed error list
   */
  constructor(message, statusCode = 500, code = null, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle Joi validation errors and convert to standard format.
 * @param {object} err - Error object
 * @returns {object|null} Formatted validation error or null if not a Joi error
 */
function handleJoiError(err) {
  if (err.isJoi || (err.details && Array.isArray(err.details))) {
    const errors = err.details.map((detail) => ({
      field: detail.path ? detail.path.join('.') : undefined,
      message: detail.message,
    }));

    return {
      statusCode: 400,
      message: 'Validation error',
      code: ERROR_CODE.VALIDATION_ERROR,
      errors,
    };
  }
  return null;
}

/**
 * Handle MySQL duplicate entry errors.
 * @param {object} err - Error object
 * @returns {object|null} Formatted error or null
 */
function handleDuplicateKeyError(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return {
      statusCode: 409,
      message: 'Resource already exists',
      code: ERROR_CODE.RESOURCE_ALREADY_EXISTS,
      errors: null,
    };
  }
  return null;
}

/**
 * Global error handler middleware.
 * Must be registered after all routes in Express app.
 *
 * @param {Error} err - Error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} _next - Express next function
 */
function errorHandler(err, req, res, _next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || ERROR_CODE.INTERNAL_ERROR;
  let errors = err.errors || null;

  // Handle specific error types
  const joiError = handleJoiError(err);
  if (joiError) {
    statusCode = joiError.statusCode;
    message = joiError.message;
    code = joiError.code;
    errors = joiError.errors;
  }

  const duplicateError = handleDuplicateKeyError(err);
  if (duplicateError) {
    statusCode = duplicateError.statusCode;
    message = duplicateError.message;
    code = duplicateError.code;
    errors = duplicateError.errors;
  }

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
    code = ERROR_CODE.INVALID_INPUT;
  }

  // Build response
  const response = {
    status: 'error',
    message,
    code,
  };

  if (errors && Array.isArray(errors) && errors.length > 0) {
    response.errors = errors;
  }

  // Include stack trace in development mode only
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // Log server errors
  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  return res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler middleware.
 * Register before the global error handler.
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    code: ERROR_CODE.RESOURCE_NOT_FOUND,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
  AppError,
};
