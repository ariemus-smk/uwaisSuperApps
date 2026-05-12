/**
 * CAPEX routes.
 * GET    /api/capex/projects              - List CAPEX projects
 * GET    /api/capex/projects/:id          - Get project detail
 * POST   /api/capex/projects              - Create project proposal
 * PUT    /api/capex/projects/:id          - Update project proposal
 * PATCH  /api/capex/projects/:id/submit   - Submit for approval
 * PATCH  /api/capex/projects/:id/approve  - Approve project
 * PATCH  /api/capex/projects/:id/reject   - Reject project
 *
 * RBAC:
 * - GET list/detail: Superadmin, Admin
 * - POST create: Admin
 * - PUT update: Admin
 * - PATCH submit: Admin
 * - PATCH approve: Superadmin
 * - PATCH reject: Superadmin
 *
 * Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6
 */

const { Router } = require('express');
const Joi = require('joi');
const capexController = require('../controllers/capex.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { validate } = require('../middleware/validator');
const { USER_ROLE, CAPEX_PROJECT_STATUS } = require('../utils/constants');

const router = Router();

// Validation schemas
const materialItemSchema = Joi.object({
  product_name: Joi.string().trim().min(1).max(255).required(),
  category: Joi.string().valid('PerangkatAktif', 'Kabel', 'Aksesoris').optional(),
  quantity: Joi.number().positive().required(),
  unit_price: Joi.number().min(0).optional(),
});

const createProjectSchema = Joi.object({
  project_name: Joi.string().trim().min(3).max(255).required(),
  target_area: Joi.string().trim().min(3).max(1000).required(),
  target_customer_count: Joi.number().integer().positive().required(),
  materials_list: Joi.array().items(materialItemSchema).min(1).required(),
});

const updateProjectSchema = Joi.object({
  project_name: Joi.string().trim().min(3).max(255).optional(),
  target_area: Joi.string().trim().min(3).max(1000).optional(),
  target_customer_count: Joi.number().integer().positive().optional(),
  materials_list: Joi.array().items(materialItemSchema).min(1).optional(),
}).min(1);

const projectIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const rejectProjectSchema = Joi.object({
  revision_notes: Joi.string().trim().min(3).max(1000).optional(),
});

const listProjectsQuerySchema = Joi.object({
  status: Joi.string().valid(
    CAPEX_PROJECT_STATUS.DRAFT,
    CAPEX_PROJECT_STATUS.PENDING_APPROVAL,
    CAPEX_PROJECT_STATUS.APPROVED,
    CAPEX_PROJECT_STATUS.REJECTED,
    CAPEX_PROJECT_STATUS.IN_PROGRESS,
    CAPEX_PROJECT_STATUS.COMPLETED
  ).optional(),
  created_by: Joi.number().integer().positive().optional(),
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
});

// Routes

// GET /api/capex/projects - List CAPEX projects
router.get(
  '/projects',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  branchScope,
  validate(listProjectsQuerySchema, 'query'),
  capexController.listProjects
);

// GET /api/capex/projects/:id - Get project detail
router.get(
  '/projects/:id',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  validate(projectIdParamSchema, 'params'),
  capexController.getProject
);

// POST /api/capex/projects - Create project proposal
router.post(
  '/projects',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(createProjectSchema, 'body'),
  capexController.createProject
);

// PUT /api/capex/projects/:id - Update project proposal
router.put(
  '/projects/:id',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(projectIdParamSchema, 'params'),
  validate(updateProjectSchema, 'body'),
  capexController.updateProject
);

// PATCH /api/capex/projects/:id/submit - Submit for approval
router.patch(
  '/projects/:id/submit',
  authenticate,
  authorize(USER_ROLE.ADMIN),
  validate(projectIdParamSchema, 'params'),
  capexController.submitProject
);

// PATCH /api/capex/projects/:id/approve - Approve project
router.patch(
  '/projects/:id/approve',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(projectIdParamSchema, 'params'),
  capexController.approveProject
);

// PATCH /api/capex/projects/:id/reject - Reject project
router.patch(
  '/projects/:id/reject',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN),
  validate(projectIdParamSchema, 'params'),
  validate(rejectProjectSchema, 'body'),
  capexController.rejectProject
);

module.exports = router;
