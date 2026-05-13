-- Create Regions Table
--
-- Requirements: CRUD for Regions with provincial/district/sub-district/village hierarchy.
-- region_type can be 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa'.
-- region_ref points to the parent region.

CREATE TABLE IF NOT EXISTS `regions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `region_name` VARCHAR(255) NOT NULL,
  `region_type` ENUM('Provinsi', 'Kabupaten', 'Kecamatan', 'Desa') NOT NULL,
  `region_ref` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_regions_parent` FOREIGN KEY (`region_ref`) REFERENCES `regions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
