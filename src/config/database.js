const mysql = require('mysql2/promise');

/**
 * Application Database Pool (App DB)
 * Stores all business data: customers, invoices, assets, tickets, users, etc.
 */
const appPool = mysql.createPool({
  host: process.env.APP_DB_HOST || 'localhost',
  port: parseInt(process.env.APP_DB_PORT, 10) || 3306,
  user: process.env.APP_DB_USER || 'uwais_app',
  password: process.env.APP_DB_PASSWORD || '',
  database: process.env.APP_DB_NAME || 'uwais_app',
  connectionLimit: parseInt(process.env.APP_DB_CONNECTION_LIMIT, 10) || 20,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000
});

/**
 * RADIUS Database Pool (RADIUS DB)
 * Stores FreeRADIUS tables: radcheck, radreply, radacct, radusergroup, nas
 */
const radiusPool = mysql.createPool({
  host: process.env.RADIUS_DB_HOST || 'localhost',
  port: parseInt(process.env.RADIUS_DB_PORT, 10) || 3306,
  user: process.env.RADIUS_DB_USER || 'radius',
  password: process.env.RADIUS_DB_PASSWORD || '',
  database: process.env.RADIUS_DB_NAME || 'radius',
  connectionLimit: parseInt(process.env.RADIUS_DB_CONNECTION_LIMIT, 10) || 10,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000
});

/**
 * Test database connectivity for both pools.
 * Returns an object with connection status for each pool.
 */
async function testConnections() {
  const results = { appDb: false, radiusDb: false };

  try {
    const appConn = await appPool.getConnection();
    await appConn.ping();
    appConn.release();
    results.appDb = true;
  } catch (err) {
    console.error('[DB] App DB connection failed:', err.message);
  }

  try {
    const radiusConn = await radiusPool.getConnection();
    await radiusConn.ping();
    radiusConn.release();
    results.radiusDb = true;
  } catch (err) {
    console.error('[DB] RADIUS DB connection failed:', err.message);
  }

  return results;
}

/**
 * Gracefully close all database connections.
 */
async function closePools() {
  try {
    await appPool.end();
    console.log('[DB] App DB pool closed.');
  } catch (err) {
    console.error('[DB] Error closing App DB pool:', err.message);
  }

  try {
    await radiusPool.end();
    console.log('[DB] RADIUS DB pool closed.');
  } catch (err) {
    console.error('[DB] Error closing RADIUS DB pool:', err.message);
  }
}

module.exports = {
  appPool,
  radiusPool,
  testConnections,
  closePools
};
