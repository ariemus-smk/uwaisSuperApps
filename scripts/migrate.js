/**
 * Database Migration Runner
 *
 * Reads and executes all SQL migration files in the migrations/ directory
 * in alphabetical order against the appropriate database pool.
 *
 * Convention:
 * - Files starting with 001-009: App DB migrations
 * - Files starting with 002: RADIUS DB migrations (filename contains "radius")
 * - All other files: App DB migrations
 *
 * Usage: node scripts/migrate.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { appPool, radiusPool, closePools } = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Determine which pool to use based on migration filename.
 * Files containing "radius" in the name target the RADIUS DB.
 */
function getPoolForMigration(filename) {
  if (filename.toLowerCase().includes('radius')) {
    return { pool: radiusPool, dbName: 'RADIUS DB' };
  }
  return { pool: appPool, dbName: 'App DB' };
}

/**
 * Split SQL file content into individual statements.
 * Handles multi-line statements separated by semicolons.
 */
function splitStatements(sql) {
  return sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
}

/**
 * Run a single migration file against the appropriate database.
 */
async function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');
  const { pool, dbName } = getPoolForMigration(filename);

  console.log(`[MIGRATE] Running ${filename} against ${dbName}...`);

  const statements = splitStatements(sql);
  let executed = 0;

  for (const statement of statements) {
    try {
      await pool.execute(statement);
      executed++;
    } catch (err) {
      // Skip "already exists" errors for idempotent migrations
      if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_FIELDNAME') {
        console.log(`  [SKIP] ${err.message}`);
      } else {
        throw new Error(`Failed executing statement in ${filename}: ${err.message}\nStatement: ${statement.substring(0, 100)}...`);
      }
    }
  }

  console.log(`  [OK] ${executed} statements executed successfully.`);
}

/**
 * Main migration runner.
 * Reads all .sql files from migrations/ and executes them in sorted order.
 */
async function main() {
  console.log('='.repeat(60));
  console.log(' UwaisSuperApps - Database Migration Runner');
  console.log('='.repeat(60));
  console.log('');

  // Verify migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[ERROR] Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  // Get all .sql files sorted alphabetically
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[INFO] No migration files found.');
    process.exit(0);
  }

  console.log(`[INFO] Found ${files.length} migration file(s):`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log('');

  // Test database connectivity
  console.log('[INFO] Testing database connections...');
  try {
    const appConn = await appPool.getConnection();
    await appConn.ping();
    appConn.release();
    console.log('  [OK] App DB connected.');
  } catch (err) {
    console.error(`  [FAIL] App DB connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    const radiusConn = await radiusPool.getConnection();
    await radiusConn.ping();
    radiusConn.release();
    console.log('  [OK] RADIUS DB connected.');
  } catch (err) {
    console.error(`  [FAIL] RADIUS DB connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log('');

  // Execute migrations in order
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      await runMigration(file);
      successCount++;
    } catch (err) {
      console.error(`  [FAIL] ${err.message}`);
      failCount++;
      // Stop on first failure
      break;
    }
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log(`[RESULT] Migrations complete: ${successCount} succeeded, ${failCount} failed.`);

  // Close pools
  await closePools();

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  closePools().finally(() => process.exit(1));
});
