/**
 * Regions Seeding Script
 * 
 * Seeds the regions table with hierarchical data:
 * Provinsi -> Kabupaten -> Kecamatan -> Desa
 * 
 * Usage: node scripts/seed_regions.js
 */

require('dotenv').config();
const { appPool, closePools } = require('../src/config/database');

const REGIONS_DATA = [
  // Provinsi
  { id: 1, name: 'Kalimantan Barat', type: 'Provinsi', ref: null },
  
  // Kabupaten
  { id: 2, name: 'Mempawah', type: 'Kabupaten', ref: 1 },
  { id: 3, name: 'Sambas', type: 'Kabupaten', ref: 1 },
  
  // Kecamatan
  { id: 4, name: 'Jawai', type: 'Kecamatan', ref: 3 },
  { id: 5, name: 'Jawai Selatan', type: 'Kecamatan', ref: 3 },
  { id: 6, name: 'Jongkat', type: 'Kecamatan', ref: 2 },
  { id: 7, name: 'Salatiga', type: 'Kecamatan', ref: 3 },
  { id: 8, name: 'Selakau', type: 'Kecamatan', ref: 3 },
  { id: 9, name: 'Selakau Timur', type: 'Kecamatan', ref: 3 },
  { id: 10, name: 'Semparuk', type: 'Kecamatan', ref: 3 },
  { id: 11, name: 'Tebas', type: 'Kecamatan', ref: 3 },
  { id: 12, name: 'Tekarang', type: 'Kecamatan', ref: 3 },
  
  // Desa
  { id: 13, name: 'Bentunai', type: 'Desa', ref: 8 },
  { id: 14, name: 'Gelik', type: 'Desa', ref: 9 },
  { id: 15, name: 'Jawai Laut', type: 'Desa', ref: 5 },
  { id: 16, name: 'Jungkat', type: 'Desa', ref: 6 },
  { id: 17, name: 'Lambau', type: 'Desa', ref: 4 },
  { id: 18, name: 'Makrampai', type: 'Desa', ref: 11 },
  { id: 19, name: 'Matang Terap', type: 'Desa', ref: 5 },
  { id: 20, name: 'Mekar Sekuntum', type: 'Desa', ref: 11 },
  { id: 21, name: 'Mensere', type: 'Desa', ref: 11 },
  { id: 22, name: 'Parit Setia', type: 'Desa', ref: 4 },
  { id: 23, name: 'Pelimpaan', type: 'Desa', ref: 4 },
  { id: 24, name: 'Rambayan', type: 'Desa', ref: 12 },
  { id: 25, name: 'Sarang Burung Kuala', type: 'Desa', ref: 4 },
  { id: 26, name: 'Sarang Burung Usrat', type: 'Desa', ref: 4 },
  { id: 27, name: 'Sarilaba', type: 'Desa', ref: 5 },
  { id: 28, name: 'Segedong', type: 'Desa', ref: 11 },
  { id: 29, name: 'Sejiram', type: 'Desa', ref: 11 },
  { id: 30, name: 'Selakau Tua', type: 'Desa', ref: 9 },
  { id: 31, name: 'Semparuk', type: 'Desa', ref: 10 },
  { id: 32, name: 'Sentebang', type: 'Desa', ref: 4 },
  { id: 33, name: 'Seranggam', type: 'Desa', ref: 9 },
  { id: 34, name: 'Serumpun', type: 'Desa', ref: 7 },
  { id: 35, name: 'Suah Api', type: 'Desa', ref: 5 },
  { id: 36, name: 'Sungai Kelambu', type: 'Desa', ref: 11 },
  { id: 37, name: 'Sungai Nipah', type: 'Desa', ref: 6 },
  { id: 38, name: 'Tebas Kuala', type: 'Desa', ref: 11 },
  { id: 39, name: 'Tebas Sungai', type: 'Desa', ref: 11 },
  { id: 40, name: 'Wajok Hilir', type: 'Desa', ref: 6 },
  { id: 41, name: 'Wajok Hulu', type: 'Desa', ref: 6 },
];

async function main() {
  console.log('='.repeat(60));
  console.log(' Seeding Regions Data (Kalimantan Barat)');
  console.log('='.repeat(60));

  try {
    // Disable foreign key checks to allow explicit ID insertion if needed, 
    // although we insert in order.
    await appPool.execute('SET FOREIGN_KEY_CHECKS = 0');

    for (const region of REGIONS_DATA) {
      const [existing] = await appPool.execute(
        'SELECT id FROM regions WHERE id = ?',
        [region.id]
      );

      if (existing.length > 0) {
        await appPool.execute(
          'UPDATE regions SET region_name = ?, region_type = ?, region_ref = ? WHERE id = ?',
          [region.name, region.type, region.ref, region.id]
        );
        console.log(`  [UPDATE] Region ${region.id}: ${region.name} (${region.type})`);
      } else {
        await appPool.execute(
          'INSERT INTO regions (id, region_name, region_type, region_ref) VALUES (?, ?, ?, ?)',
          [region.id, region.name, region.type, region.ref]
        );
        console.log(`  [INSERT] Region ${region.id}: ${region.name} (${region.type})`);
      }
    }

    await appPool.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n[DONE] Regions seeding completed.');
  } catch (err) {
    console.error('\n[FAIL] Seeding failed:', err.message);
  } finally {
    await closePools();
  }
}

main();
