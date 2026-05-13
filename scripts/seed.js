/**
 * Database Seed Script
 *
 * Inserts initial data required for the application to function:
 * 1. Default Branch ("Pusat")
 * 2. Superadmin user (with bcryptjs hashed password)
 * 3. Default system settings
 *
 * This script is idempotent — it checks for existing data before inserting.
 *
 * Usage: node scripts/seed.js
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { appPool, closePools } = require('../src/config/database');

// ============================================================================
// Seed Data Configuration
// ============================================================================

const DEFAULT_BRANCH = {
  name: 'Pusat',
  address: 'Kantor Pusat UwaisSuperApps',
  contact_phone: '081256490707',
  contact_email: 'admin@uwais.id',
  status: 'Active'
};

const SUPERADMIN_USER = {
  username: 'superadmin',
  password: 'SuperAdmin@123',
  full_name: 'Super Administrator',
  role: 'Superadmin',
  status: 'Active'
};

const SYSTEM_SETTINGS = [
  {
    setting_key: 'prorata_enabled',
    setting_value: 'true',
    description: 'Enable prorata billing calculation for mid-month activations'
  },
  {
    setting_key: 'installation_fee_enabled',
    setting_value: 'true',
    description: 'Enable installation fee on first invoice'
  },
  {
    setting_key: 'installation_fee_amount',
    setting_value: '250000',
    description: 'Default installation fee amount (IDR)'
  },
  {
    setting_key: 'coverage_radius',
    setting_value: '500',
    description: 'Coverage check radius in meters for ODP matching'
  },
  {
    setting_key: 'notification_intervals',
    setting_value: JSON.stringify({
      invoice_reminder: [1, 3, 7],
      isolir_warning: [1, 3],
      termination_notice: [7, 14]
    }),
    description: 'Notification interval days for various events (JSON)'
  }
];

// ============================================================================
// Seed Functions
// ============================================================================

/**
 * Seed the default Branch.
 * Returns the branch ID (existing or newly created).
 */
async function seedBranch() {
  console.log('[SEED] Seeding default branch...');

  // Check if branch already exists
  const [existing] = await appPool.execute(
    'SELECT id FROM branches WHERE name = ?',
    [DEFAULT_BRANCH.name]
  );

  if (existing.length > 0) {
    console.log(`  [SKIP] Branch "${DEFAULT_BRANCH.name}" already exists (id: ${existing[0].id}).`);
    return existing[0].id;
  }

  const [result] = await appPool.execute(
    'INSERT INTO branches (name, address, contact_phone, contact_email, status) VALUES (?, ?, ?, ?, ?)',
    [
      DEFAULT_BRANCH.name,
      DEFAULT_BRANCH.address,
      DEFAULT_BRANCH.contact_phone,
      DEFAULT_BRANCH.contact_email,
      DEFAULT_BRANCH.status
    ]
  );

  console.log(`  [OK] Branch "${DEFAULT_BRANCH.name}" created (id: ${result.insertId}).`);
  return result.insertId;
}

/**
 * Seed the Superadmin user.
 * Hashes the password with bcryptjs before storing.
 */
async function seedSuperadmin(branchId) {
  console.log('[SEED] Seeding Superadmin user...');

  // Check if superadmin already exists
  const [existing] = await appPool.execute(
    'SELECT id FROM users WHERE username = ?',
    [SUPERADMIN_USER.username]
  );

  if (existing.length > 0) {
    console.log(`  [SKIP] User "${SUPERADMIN_USER.username}" already exists (id: ${existing[0].id}).`);
    return existing[0].id;
  }

  // Hash password with bcryptjs (10 salt rounds)
  const passwordHash = await bcrypt.hash(SUPERADMIN_USER.password, 10);

  const [result] = await appPool.execute(
    'INSERT INTO users (username, password_hash, full_name, role, branch_id, status) VALUES (?, ?, ?, ?, ?, ?)',
    [
      SUPERADMIN_USER.username,
      passwordHash,
      SUPERADMIN_USER.full_name,
      SUPERADMIN_USER.role,
      branchId,
      SUPERADMIN_USER.status
    ]
  );

  console.log(`  [OK] User "${SUPERADMIN_USER.username}" created (id: ${result.insertId}).`);
  console.log(`  [INFO] Default password: ${SUPERADMIN_USER.password}`);
  console.log(`  [WARN] Please change the default password after first login!`);
  return result.insertId;
}

/**
 * Seed default system settings.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for idempotency.
 */
async function seedSystemSettings() {
  console.log('[SEED] Seeding system settings...');

  let inserted = 0;
  let skipped = 0;

  for (const setting of SYSTEM_SETTINGS) {
    // Check if setting already exists
    const [existing] = await appPool.execute(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [setting.setting_key]
    );

    if (existing.length > 0) {
      console.log(`  [SKIP] Setting "${setting.setting_key}" already exists.`);
      skipped++;
      continue;
    }

    await appPool.execute(
      'INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
      [setting.setting_key, setting.setting_value, setting.description]
    );

    console.log(`  [OK] Setting "${setting.setting_key}" = "${setting.setting_value}".`);
    inserted++;
  }

  console.log(`  [RESULT] ${inserted} inserted, ${skipped} skipped.`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log(' UwaisSuperApps - Database Seed Script');
  console.log('='.repeat(60));
  console.log('');

  // Test database connectivity
  console.log('[INFO] Testing App DB connection...');
  try {
    const conn = await appPool.getConnection();
    await conn.ping();
    conn.release();
    console.log('  [OK] App DB connected.');
  } catch (err) {
    console.error(`  [FAIL] App DB connection failed: ${err.message}`);
    console.error('  Make sure migrations have been run first: node scripts/migrate.js');
    process.exit(1);
  }

  console.log('');

  // Run seeds in order (branch first, then user with branch_id)
  const branchId = await seedBranch();
  console.log('');

  await seedSuperadmin(branchId);
  console.log('');

  await seedSystemSettings();

  console.log('');
  console.log('-'.repeat(60));
  console.log('[DONE] Seed completed successfully.');

  // Close pools
  await closePools();
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  closePools().finally(() => process.exit(1));
});
