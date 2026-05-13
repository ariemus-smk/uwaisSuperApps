/**
 * Region routes.
 *
 * GET    /api/regions     - List regions
 * GET    /api/regions/:id - Get region details
 * POST   /api/regions     - Create a region (Superadmin only)
 * PUT    /api/regions/:id - Update a region (Superadmin only)
 * DELETE /api/regions/:id - Delete a region (Superadmin only)
 */

const { Router } = require('express');
const Joi = require('joi');
const regionController = require('../controllers/region.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validator');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const createRegionSchema = Joi.object({
  region_name: Joi.string().trim().min(2).max(100).required(),
  region_type: Joi.string().valid('Provinsi', 'Kabupaten', 'Kecamatan', 'Desa').required(),
  region_ref: Joi.number().integer().positive().allow(null).optional(),
});

const updateRegionSchema = Joi.object({
  region_name: Joi.string().trim().min(2).max(100),
  region_type: Joi.string().valid('Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'),
  region_ref: Joi.number().integer().positive().allow(null).optional(),
}).min(1);

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listRegionsQuerySchema = Joi.object({
  region_type: Joi.string().valid('Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'),
  region_ref: Joi.number().integer().positive(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(2000),
});

const importRegionsSchema = Joi.object({
  regions: Joi.array().items(
    Joi.object({
      region_name: Joi.string().trim().min(2).max(100).required(),
      region_type: Joi.string().valid('Provinsi', 'Kabupaten', 'Kecamatan', 'Desa').required(),
      parent_name: Joi.string().trim().min(2).max(100).allow('', null).optional(),
    })
  ).required(),
});

// ============================================================
// Routes definition
// ============================================================

// GET /api/regions - Available to all authenticated roles
router.get(
  '/',
  authenticate,
  validate(listRegionsQuerySchema, 'query'),
  regionController.listRegions
);

// GET /api/regions/:id - Available to all authenticated roles
router.get(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  regionController.getRegion
);

// POST /api/regions/import - Superadmin only
router.post(
  '/import',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(importRegionsSchema, 'body'),
  regionController.importRegions
);

// POST /api/regions - Superadmin only
router.post(
  '/',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(createRegionSchema, 'body'),
  regionController.createRegion
);

// PUT /api/regions/:id - Superadmin only
router.put(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  validate(updateRegionSchema, 'body'),
  regionController.updateRegion
);

// DELETE /api/regions/:id - Superadmin only
router.delete(
  '/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(idParamSchema, 'params'),
  regionController.deleteRegion
);

module.exports = router;
