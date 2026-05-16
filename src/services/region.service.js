/**
 * Region service.
 * Handles business logic, validation, and database orchestration for regions.
 */

const regionModel = require('../models/region.model');
const { ERROR_CODE } = require('../utils/constants');

/**
 * Validate region hierarchical rules:
 * - Provinsi must have no parent (region_ref = null).
 * - Kabupaten must have parent of type 'Provinsi'.
 * - Kecamatan must have parent of type 'Kabupaten'.
 * - Desa must have parent of type 'Kecamatan'.
 *
 * @param {string} type - 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'
 * @param {number|null} refId - Parent ID reference
 * @returns {Promise<void>}
 */
async function validateRegionHierarchy(type, refId) {
  const validTypes = ['Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'];
  if (!validTypes.includes(type)) {
    throw Object.assign(new Error(`Region type "${type}" is invalid. Must be one of: Provinsi, Kabupaten, Kecamatan, Desa.`), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  if (type === 'Provinsi') {
    if (refId !== null && refId !== undefined && refId !== '') {
      throw Object.assign(new Error('A Provinsi region must not have any parent region (region_ref must be null).'), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  } else {
    if (!refId) {
      throw Object.assign(new Error(`A parent region (region_ref) is required for type "${type}".`), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    const parent = await regionModel.findById(Number(refId));
    if (!parent) {
      throw Object.assign(new Error(`The parent region with ID ${refId} does not exist.`), {
        statusCode: 404,
        code: ERROR_CODE.RESOURCE_NOT_FOUND,
      });
    }

    if (type === 'Kabupaten' && parent.region_type !== 'Provinsi') {
      throw Object.assign(new Error(`Kabupaten must have a parent of type "Provinsi". The selected parent has type "${parent.region_type}".`), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    if (type === 'Kecamatan' && parent.region_type !== 'Kabupaten') {
      throw Object.assign(new Error(`Kecamatan must have a parent of type "Kabupaten". The selected parent has type "${parent.region_type}".`), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }

    if (type === 'Desa' && parent.region_type !== 'Kecamatan') {
      throw Object.assign(new Error(`Desa must have a parent of type "Kecamatan". The selected parent has type "${parent.region_type}".`), {
        statusCode: 400,
        code: ERROR_CODE.VALIDATION_ERROR,
      });
    }
  }
}

/**
 * Create a new region.
 */
async function createRegion(regionData) {
  const { region_name, region_type, region_ref = null } = regionData;

  if (!region_name || !region_type) {
    throw Object.assign(new Error('region_name and region_type are required.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Enforce hierarchy validation rules
  await validateRegionHierarchy(region_type, region_ref);

  return await regionModel.create({
    region_name: region_name.trim(),
    region_type,
    region_ref: region_ref ? Number(region_ref) : null,
  });
}

/**
 * Get region by ID.
 */
async function getRegion(id) {
  const region = await regionModel.findById(Number(id));
  if (!region) {
    throw Object.assign(new Error(`Region with ID ${id} not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }
  return region;
}

/**
 * List all regions with filters and hierarchical depth-first traversal sort.
 */
async function listRegions(filters = {}) {
  const { region_type, region_ref, page = 1, limit = 100 } = filters;

  // Retrieve all elements from the database
  const allRegions = await regionModel.findAllNoLimit();

  // Construct hierarchy Map
  const map = {};
  const roots = [];

  allRegions.forEach(item => {
    map[item.id] = { ...item, children: [] };
  });

  allRegions.forEach(item => {
    const mapped = map[item.id];
    if (item.region_ref && map[item.region_ref]) {
      map[item.region_ref].children.push(mapped);
    } else {
      roots.push(mapped);
    }
  });

  // Sort roots alphabetically by name
  roots.sort((a, b) => a.region_name.localeCompare(b.region_name));

  // Recursively traverse tree depth-first to build a perfectly ordered flat list
  const orderedList = [];
  function traverse(node) {
    const { children, ...cleanNode } = node;
    orderedList.push(cleanNode);

    // Sort children alphabetically before traversing
    node.children.sort((a, b) => a.region_name.localeCompare(b.region_name));
    node.children.forEach(traverse);
  }

  roots.forEach(traverse);

  // Apply filtering (region_type, region_ref) to the ordered list
  let filteredList = orderedList;
  if (region_type) {
    filteredList = filteredList.filter(r => r.region_type === region_type);
  }
  if (region_ref !== undefined && region_ref !== null && region_ref !== '') {
    filteredList = filteredList.filter(r => Number(r.region_ref) === Number(region_ref));
  }

  // Apply pagination
  const total = filteredList.length;
  const offset = (page - 1) * limit;
  const paginatedList = filteredList.slice(offset, offset + limit);

  return { regions: paginatedList, total };
}

/**
 * Update an existing region.
 */
async function updateRegion(id, updateData) {
  const region = await regionModel.findById(Number(id));
  if (!region) {
    throw Object.assign(new Error(`Region with ID ${id} not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  const updatedType = updateData.region_type || region.region_type;
  const updatedRef = updateData.region_ref !== undefined ? updateData.region_ref : region.region_ref;

  // Protect from self-reference cycles
  if (updatedRef && Number(updatedRef) === Number(id)) {
    throw Object.assign(new Error('A region cannot reference itself as its parent.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  // Validate hierarchy on updated parameters
  await validateRegionHierarchy(updatedType, updatedRef ? Number(updatedRef) : null);

  const payload = {};
  if (updateData.region_name !== undefined) payload.region_name = updateData.region_name.trim();
  if (updateData.region_type !== undefined) payload.region_type = updateData.region_type;
  payload.region_ref = updatedRef ? Number(updatedRef) : null;

  await regionModel.update(Number(id), payload);
  return await regionModel.findById(Number(id));
}

/**
 * Delete a region by ID.
 */
async function deleteRegion(id) {
  const region = await regionModel.findById(Number(id));
  if (!region) {
    throw Object.assign(new Error(`Region with ID ${id} not found.`), {
      statusCode: 404,
      code: ERROR_CODE.RESOURCE_NOT_FOUND,
    });
  }

  // Prevent deleting if other regions use this region as parent reference
  const children = await regionModel.findAll({ region_ref: Number(id) });
  if (children.total > 0) {
    throw Object.assign(new Error('Cannot delete region because it is referenced as a parent by other sub-regions. Delete sub-regions first.'), {
      statusCode: 400,
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  }

  await regionModel.deleteById(Number(id));
  return true;
}

/**
 * Bulk import regions from a list of objects parsed from CSV.
 * @param {Array<object>} regionsList - List of { region_name, region_type, parent_name }
 * @returns {Promise<{successCount: number, errors: Array}>} Import stats
 */
async function importRegions(regionsList) {
  let successCount = 0;
  const errors = [];

  for (let i = 0; i < regionsList.length; i++) {
    const row = regionsList[i];
    const lineNum = i + 1;
    const name = row.region_name ? row.region_name.trim() : '';
    const type = row.region_type ? row.region_type.trim() : '';
    const parentName = row.parent_name ? row.parent_name.trim() : '';

    if (!name || !type) {
      errors.push(`Baris ${lineNum}: Nama dan tipe wilayah wajib diisi.`);
      continue;
    }

    try {
      // Check if region already exists
      const existing = await regionModel.findByNameAndType(name, type);
      if (existing) {
        errors.push(`Baris ${lineNum}: Wilayah "${name}" dengan tipe "${type}" sudah terdaftar.`);
        continue;
      }

      let parentId = null;
      if (type !== 'Provinsi') {
        if (!parentName) {
          errors.push(`Baris ${lineNum}: Wilayah tipe "${type}" membutuhkan induk wilayah.`);
          continue;
        }

        // Determine parent type
        let expectedParentType = '';
        if (type === 'Kabupaten') expectedParentType = 'Provinsi';
        else if (type === 'Kecamatan') expectedParentType = 'Kabupaten';
        else if (type === 'Desa') expectedParentType = 'Kecamatan';

        const parent = await regionModel.findByNameAndType(parentName, expectedParentType);
        if (!parent) {
          errors.push(`Baris ${lineNum}: Induk "${parentName}" dengan tipe "${expectedParentType}" tidak ditemukan.`);
          continue;
        }
        parentId = parent.id;
      }

      await regionModel.create({
        region_name: name,
        region_type: type,
        region_ref: parentId
      });

      successCount++;
    } catch (err) {
      errors.push(`Baris ${lineNum}: ${err.message}`);
    }
  }

  return { successCount, errors };
}

module.exports = {
  createRegion,
  getRegion,
  listRegions,
  updateRegion,
  deleteRegion,
  importRegions,
};
