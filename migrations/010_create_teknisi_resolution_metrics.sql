-- ----------------------------------------------------------------------------
-- Migration: Create teknisi_resolution_metrics table
-- Stores per-Teknisi resolution metrics for KPI tracking.
-- Requirements: 27.1, 27.2, 27.3
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `teknisi_resolution_metrics` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `teknisi_id` INT UNSIGNED NOT NULL,
  `ticket_id` INT UNSIGNED NOT NULL,
  `resolution_time_minutes` INT NOT NULL COMMENT 'Time from ticket creation to resolution in minutes',
  `resolution_category` VARCHAR(50) NULL COMMENT 'RemoteFix, FieldFix, etc.',
  `sla_compliant` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 if resolved within SLA, 0 otherwise',
  `resolved_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_trm_teknisi_id` (`teknisi_id`),
  INDEX `idx_trm_ticket_id` (`ticket_id`),
  INDEX `idx_trm_resolved_at` (`resolved_at`),
  CONSTRAINT `fk_trm_teknisi` FOREIGN KEY (`teknisi_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_trm_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add resolution_category column to tickets table if not exists
-- (resolution_type already exists, resolution_category is stored separately for closure tracking)
ALTER TABLE `tickets`
  ADD COLUMN IF NOT EXISTS `resolution_category` VARCHAR(50) NULL COMMENT 'Category recorded at closure: RemoteFix, FieldFix, etc.' AFTER `damage_classification`;
