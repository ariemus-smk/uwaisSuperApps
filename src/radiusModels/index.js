/**
 * RADIUS Database Model Registry.
 * Exports the radiusPool reference and all RADIUS DB models.
 * These models interact with the RADIUS DB (separate from the App DB).
 * The RADIUS DB uses the standard FreeRADIUS schema.
 */

const { radiusPool } = require('../config/database');
const radcheckModel = require('./radcheck.model');
const radreplyModel = require('./radreply.model');
const raduserGroupModel = require('./radusergroup.model');
const radacctModel = require('./radacct.model');
const radgroupcheckModel = require('./radgroupcheck.model');
const radgroupreplyModel = require('./radgroupreply.model');
const nasModel = require('./nas.model');

module.exports = {
  radiusPool,
  radcheckModel,
  radreplyModel,
  raduserGroupModel,
  radacctModel,
  radgroupcheckModel,
  radgroupreplyModel,
  nasModel,
};
