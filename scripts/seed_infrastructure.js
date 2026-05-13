/**
 * Infrastructure Seeding Script for West Kalimantan (Kalimantan Barat)
 *
 * Usage: node scripts/seed_infrastructure.js
 */

require('dotenv').config();
const { appPool, closePools } = require('../src/config/database');

const PTK_OLT = {
  name: 'OLT PONTIANAK CENTRAL (CORE)',
  ip_address: '10.100.1.1',
  total_pon_ports: 8,
  branch_id: 1,
  status: 'Active'
};

const PTK_ODPS = [
  { name: 'ODP-PTK-A01', latitude: -0.0180, longitude: 109.3320, total_ports: 8, used_ports: 3, olt_pon_port: 1, branch_id: 1, status: 'Active' },
  { name: 'ODP-PTK-A02', latitude: -0.0220, longitude: 109.3450, total_ports: 8, used_ports: 6, olt_pon_port: 1, branch_id: 1, status: 'Active' },
  { name: 'ODP-PTK-B05', latitude: -0.0310, longitude: 109.3380, total_ports: 16, used_ports: 12, olt_pon_port: 2, branch_id: 1, status: 'Active' },
  { name: 'ODP-PTK-C03', latitude: -0.0210, longitude: 109.3520, total_ports: 8, used_ports: 2, olt_pon_port: 3, branch_id: 1, status: 'Active' }
];

async function main() {
  console.log('='.repeat(60));
  console.log(' Seed Infrastructure - Kalimantan Barat (West Kalimantan)');
  console.log('='.repeat(60));

  try {
    // 1. Delete existing records from ODP and OLT tables to prevent key clashes
    console.log('[1/4] Cleaning existing ODP and OLT records...');
    await appPool.execute('DELETE FROM odps');
    await appPool.execute('DELETE FROM olts');
    console.log('  [OK] Cleaned database tables.');

    // 2. Seed OLT device
    console.log('[2/4] Seeding OLT Central Pontianak...');
    const [oltResult] = await appPool.execute(
      `INSERT INTO olts (name, ip_address, total_pon_ports, branch_id, status)
       VALUES (?, ?, ?, ?, ?)`,
      [PTK_OLT.name, PTK_OLT.ip_address, PTK_OLT.total_pon_ports, PTK_OLT.branch_id, PTK_OLT.status]
    );
    const oltId = oltResult.insertId;
    console.log(`  [OK] Created OLT "${PTK_OLT.name}" (id: ${oltId}).`);

    // 3. Seed ODP Splitters linked to newly created OLT
    console.log('[3/4] Seeding ODP Splitters linked to OLT...');
    for (const odp of PTK_ODPS) {
      await appPool.execute(
        `INSERT INTO odps (name, latitude, longitude, total_ports, used_ports, olt_id, olt_pon_port, branch_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          odp.name,
          odp.latitude,
          odp.longitude,
          odp.total_ports,
          odp.used_ports,
          oltId,
          odp.olt_pon_port,
          odp.branch_id,
          odp.status
        ]
      );
      console.log(`  [OK] Created ODP "${odp.name}" connected to PON ${odp.olt_pon_port}.`);
    }

    console.log('[4/4] Completed all infrastructure seeding successfully.');
  } catch (err) {
    console.error('[FAIL] Seeding failed:', err.message);
  } finally {
    await closePools();
    console.log('[INFO] Database pools closed.');
  }
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
