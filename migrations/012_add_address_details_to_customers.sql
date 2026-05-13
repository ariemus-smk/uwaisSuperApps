-- Migration: Add detailed address columns to customers table after the address column
-- Target: uwais_app Database (appPool)

ALTER TABLE `customers` 
  ADD COLUMN `rt` VARCHAR(10) NULL AFTER `address`,
  ADD COLUMN `rw` VARCHAR(10) NULL AFTER `rt`,
  ADD COLUMN `dusun` VARCHAR(100) NULL AFTER `rw`,
  ADD COLUMN `desa` VARCHAR(100) NULL AFTER `dusun`,
  ADD COLUMN `kecamatan` VARCHAR(100) NULL AFTER `desa`,
  ADD COLUMN `kabupaten` VARCHAR(100) NULL AFTER `kecamatan`,
  ADD COLUMN `provinsi` VARCHAR(100) NULL AFTER `kabupaten`;
