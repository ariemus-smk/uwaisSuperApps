/**
 * Request validation middleware using Joi.
 * Validates request body, params, or query against a Joi schema.
 * Returns 400 with field-level error details on validation failure.
 */

const { ERROR_CODE } = require('../utils/constants');
const responseHelper = require('../utils/responseHelper');

/**
 * Creates a validation middleware for the given Joi schema and request source.
 *
 * @param {import('joi').ObjectSchema} schema - Joi validation schema
 * @param {'body'|'params'|'query'} [source='body'] - Request property to validate
 * @returns {import('express').RequestHandler} Express middleware function
 *
 * @example
 * const Joi = require('joi');
 * const { validate } = require('../middleware/validator');
 *
 * const createCustomerSchema = Joi.object({
 *   full_name: Joi.string().required(),
 *   email: Joi.string().email().required(),
 * });
 *
 * router.post('/customers', validate(createCustomerSchema, 'body'), controller.create);
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
      }));

      return responseHelper.error(
        res,
        'Validation error',
        400,
        errors,
        ERROR_CODE.VALIDATION_ERROR
      );
    }

    // Attach sanitized/validated data back to the request
    req[source] = value;
    return next();
  };
}

module.exports = { validate };
