/**
 * Unit tests for the Joi validation middleware.
 */

const Joi = require('joi');
const { validate } = require('../../src/middleware/validator');
const { ERROR_CODE } = require('../../src/utils/constants');

// Helper to create mock req/res/next
function createMocks(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    ...overrides,
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

describe('Validator Middleware', () => {
  describe('body validation', () => {
    const schema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      email: Joi.string().email().required(),
      age: Joi.number().integer().min(0).optional(),
    });

    it('should call next() when body is valid', () => {
      const { req, res, next } = createMocks({
        body: { name: 'John Doe', email: 'john@example.com', age: 25 },
      });

      validate(schema, 'body')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });

    it('should attach sanitized data to req.body (strip unknown fields)', () => {
      const { req, res, next } = createMocks({
        body: { name: 'Jane', email: 'jane@test.com', unknownField: 'should be removed' },
      });

      validate(schema, 'body')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'Jane', email: 'jane@test.com' });
      expect(req.body.unknownField).toBeUndefined();
    });

    it('should return 400 with field-level errors when validation fails', () => {
      const { req, res, next } = createMocks({
        body: { name: '', email: 'not-an-email' },
      });

      validate(schema, 'body')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Validation error');
      expect(res.body.code).toBe(ERROR_CODE.VALIDATION_ERROR);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should return all validation errors (abortEarly: false)', () => {
      const { req, res, next } = createMocks({
        body: {},
      });

      validate(schema, 'body')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      // Both name and email are required, so at least 2 errors
      expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should include field name and message in each error', () => {
      const { req, res, next } = createMocks({
        body: { name: 'A', email: 'bad' },
      });

      validate(schema, 'body')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      res.body.errors.forEach((err) => {
        expect(err).toHaveProperty('field');
        expect(err).toHaveProperty('message');
        expect(typeof err.field).toBe('string');
        expect(typeof err.message).toBe('string');
      });
    });

    it('should handle nested field paths', () => {
      const nestedSchema = Joi.object({
        address: Joi.object({
          city: Joi.string().required(),
          zip: Joi.string().required(),
        }).required(),
      });

      const { req, res, next } = createMocks({
        body: { address: { city: '' } },
      });

      validate(nestedSchema, 'body')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      const zipError = res.body.errors.find((e) => e.field === 'address.zip');
      expect(zipError).toBeDefined();
    });
  });

  describe('params validation', () => {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });

    it('should validate params and call next() on success', () => {
      const { req, res, next } = createMocks({
        params: { id: 42 },
      });

      validate(schema, 'params')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.params).toEqual({ id: 42 });
    });

    it('should return 400 when params are invalid', () => {
      const { req, res, next } = createMocks({
        params: { id: 'abc' },
      });

      validate(schema, 'params')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.body.errors[0].field).toBe('id');
    });
  });

  describe('query validation', () => {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().optional(),
    });

    it('should validate query and apply defaults', () => {
      const { req, res, next } = createMocks({
        query: {},
      });

      validate(schema, 'query')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query.page).toBe(1);
      expect(req.query.limit).toBe(20);
    });

    it('should pass valid query parameters through', () => {
      const { req, res, next } = createMocks({
        query: { page: 3, limit: 50, search: 'test' },
      });

      validate(schema, 'query')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query).toEqual({ page: 3, limit: 50, search: 'test' });
    });

    it('should return 400 when query params are invalid', () => {
      const { req, res, next } = createMocks({
        query: { page: -1, limit: 200 },
      });

      validate(schema, 'query')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('default source', () => {
    it('should default to body validation when source is not specified', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      const { req, res, next } = createMocks({
        body: { name: 'Test' },
      });

      validate(schema)(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
