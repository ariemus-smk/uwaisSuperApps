/**
 * CAPEX controller.
 * Handles HTTP requests for CAPEX project proposal endpoints.
 *
 * Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6
 */

const capexService = require('../services/capex.service');
const { success, created, error, paginated } = require('../utils/responseHelper');
const { ERROR_CODE } = require('../utils/constants');

/**
 * GET /api/capex/projects
 * List CAPEX projects with optional filters and pagination.
 */
async function listProjects(req, res) {
  try {
    const filters = {
      status: req.query.status,
      created_by: req.query.created_by,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await capexService.getProjects(filters, req.user);

    return paginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    }, 'CAPEX projects retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * GET /api/capex/projects/:id
 * Get a single CAPEX project by ID.
 */
async function getProject(req, res) {
  try {
    const { id } = req.params;

    const project = await capexService.getProjectById(Number(id));

    return success(res, project, 'CAPEX project retrieved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * POST /api/capex/projects
 * Create a new CAPEX project proposal.
 */
async function createProject(req, res) {
  try {
    const { project_name, target_area, target_customer_count, materials_list } = req.body;

    const project = await capexService.createProposal({
      project_name,
      target_area,
      target_customer_count: Number(target_customer_count),
      materials_list,
      branch_id: req.user.branch_id,
      created_by: req.user.id,
    });

    return created(res, project, 'CAPEX project proposal created successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PUT /api/capex/projects/:id
 * Update a CAPEX project proposal (only Draft or Rejected).
 */
async function updateProject(req, res) {
  try {
    const { id } = req.params;
    const { project_name, target_area, target_customer_count, materials_list } = req.body;

    const updateData = {};
    if (project_name !== undefined) updateData.project_name = project_name;
    if (target_area !== undefined) updateData.target_area = target_area;
    if (target_customer_count !== undefined) updateData.target_customer_count = Number(target_customer_count);
    if (materials_list !== undefined) updateData.materials_list = materials_list;

    const project = await capexService.updateProposal(Number(id), updateData, req.user.id);

    return success(res, project, 'CAPEX project updated successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/capex/projects/:id/submit
 * Submit a Draft project for approval.
 */
async function submitProject(req, res) {
  try {
    const { id } = req.params;

    const project = await capexService.submitForApproval(Number(id), req.user.id);

    return success(res, project, 'CAPEX project submitted for approval.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/capex/projects/:id/approve
 * Approve a CAPEX project (Superadmin only).
 */
async function approveProject(req, res) {
  try {
    const { id } = req.params;

    const result = await capexService.approve(Number(id), req.user.id);

    return success(res, result, 'CAPEX project approved successfully.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

/**
 * PATCH /api/capex/projects/:id/reject
 * Reject a CAPEX project with revision notes (Superadmin only).
 */
async function rejectProject(req, res) {
  try {
    const { id } = req.params;
    const { revision_notes } = req.body;

    const result = await capexService.reject(Number(id), req.user.id, revision_notes);

    return success(res, result, 'CAPEX project rejected.');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || ERROR_CODE.INTERNAL_ERROR;
    return error(res, err.message, statusCode, null, code);
  }
}

module.exports = {
  listProjects,
  getProject,
  createProject,
  updateProject,
  submitProject,
  approveProject,
  rejectProject,
};
