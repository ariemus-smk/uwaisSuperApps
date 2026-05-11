/**
 * Standardized API response formatting utilities.
 * All controllers should use these helpers to ensure consistent response structure.
 */

/**
 * Send a success response.
 * @param {import('express').Response} res - Express response object
 * @param {*} data - Response payload
 * @param {string} [message='Success'] - Human-readable message
 * @param {number} [statusCode=200] - HTTP status code
 */
function success(res, data = null, message = 'Success', statusCode = 200) {
  const response = {
    status: 'success',
    message,
  };

  if (data !== null && data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send an error response.
 * @param {import('express').Response} res - Express response object
 * @param {string} [message='Internal Server Error'] - Error message
 * @param {number} [statusCode=500] - HTTP status code
 * @param {Array|null} [errors=null] - Detailed error list (e.g. validation errors)
 * @param {string|null} [code=null] - Application error code from ERROR_CODE constants
 */
function error(res, message = 'Internal Server Error', statusCode = 500, errors = null, code = null) {
  const response = {
    status: 'error',
    message,
  };

  if (code) {
    response.code = code;
  }

  if (errors && Array.isArray(errors) && errors.length > 0) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send a paginated success response.
 * @param {import('express').Response} res - Express response object
 * @param {Array} data - Array of items for the current page
 * @param {object} pagination - Pagination metadata
 * @param {number} pagination.page - Current page number
 * @param {number} pagination.limit - Items per page
 * @param {number} pagination.totalItems - Total number of items
 * @param {number} pagination.totalPages - Total number of pages
 * @param {string} [message='Success'] - Human-readable message
 */
function paginated(res, data, pagination, message = 'Success') {
  return res.status(200).json({
    status: 'success',
    message,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalItems: pagination.totalItems,
      totalPages: pagination.totalPages,
    },
  });
}

/**
 * Send a created response (HTTP 201).
 * @param {import('express').Response} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} [message='Resource created successfully'] - Human-readable message
 */
function created(res, data = null, message = 'Resource created successfully') {
  return success(res, data, message, 201);
}

/**
 * Send a no-content response (HTTP 204).
 * @param {import('express').Response} res - Express response object
 */
function noContent(res) {
  return res.status(204).send();
}

module.exports = {
  success,
  error,
  paginated,
  created,
  noContent,
};
