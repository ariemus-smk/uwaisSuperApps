-- Migration: 002_create_radius_db_tables.sql
-- Description: Create standard FreeRADIUS tables for RADIUS Database
-- Requirements: 3.2, 12.1
-- Database: radius (separate from application DB)

-- ============================================================
-- Table: radcheck
-- Purpose: Per-user check attributes (PPPoE credentials)
-- Used for: Authentication (username + Cleartext-Password)
-- ============================================================
CREATE TABLE IF NOT EXISTS radcheck (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  INDEX idx_radcheck_username (username(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: radreply
-- Purpose: Per-user reply attributes (speed limits, etc.)
-- Used for: Returning rate-limit attributes after authentication
-- ============================================================
CREATE TABLE IF NOT EXISTS radreply (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT '=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  INDEX idx_radreply_username (username(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: radgroupcheck
-- Purpose: Per-group check attributes
-- Used for: Group-level authentication rules
-- ============================================================
CREATE TABLE IF NOT EXISTS radgroupcheck (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  INDEX idx_radgroupcheck_groupname (groupname(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: radgroupreply
-- Purpose: Per-group reply attributes (package speed profiles)
-- Used for: Returning group-level rate-limit attributes
-- ============================================================
CREATE TABLE IF NOT EXISTS radgroupreply (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT '=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  INDEX idx_radgroupreply_groupname (groupname(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: radusergroup
-- Purpose: User-to-group mapping (customer to package)
-- Used for: Linking PPPoE username to a package speed profile group
-- ============================================================
CREATE TABLE IF NOT EXISTS radusergroup (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  priority INT(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  INDEX idx_radusergroup_username (username(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: radacct
-- Purpose: Accounting records (session data, traffic)
-- Used for: Tracking PPPoE session start/stop, bytes in/out (FUP)
-- ============================================================
CREATE TABLE IF NOT EXISTS radacct (
  radacctid BIGINT(21) UNSIGNED NOT NULL AUTO_INCREMENT,
  acctsessionid VARCHAR(64) NOT NULL DEFAULT '',
  acctuniqueid VARCHAR(32) NOT NULL DEFAULT '',
  username VARCHAR(64) NOT NULL DEFAULT '',
  realm VARCHAR(64) DEFAULT '',
  nasipaddress VARCHAR(15) NOT NULL DEFAULT '',
  nasportid VARCHAR(32) DEFAULT NULL,
  nasporttype VARCHAR(32) DEFAULT NULL,
  acctstarttime DATETIME DEFAULT NULL,
  acctupdatetime DATETIME DEFAULT NULL,
  acctstoptime DATETIME DEFAULT NULL,
  acctinterval INT(12) DEFAULT NULL,
  acctsessiontime INT(12) UNSIGNED DEFAULT NULL,
  acctauthentic VARCHAR(32) DEFAULT NULL,
  connectinfo_start VARCHAR(128) DEFAULT NULL,
  connectinfo_stop VARCHAR(128) DEFAULT NULL,
  acctinputoctets BIGINT(20) DEFAULT NULL,
  acctoutputoctets BIGINT(20) DEFAULT NULL,
  calledstationid VARCHAR(50) NOT NULL DEFAULT '',
  callingstationid VARCHAR(50) NOT NULL DEFAULT '',
  acctterminatecause VARCHAR(32) NOT NULL DEFAULT '',
  servicetype VARCHAR(32) DEFAULT NULL,
  framedprotocol VARCHAR(32) DEFAULT NULL,
  framedipaddress VARCHAR(15) NOT NULL DEFAULT '',
  framedipv6address VARCHAR(45) NOT NULL DEFAULT '',
  framedipv6prefix VARCHAR(45) NOT NULL DEFAULT '',
  framedinterfaceid VARCHAR(44) NOT NULL DEFAULT '',
  delegatedipv6prefix VARCHAR(45) NOT NULL DEFAULT '',
  class VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (radacctid),
  UNIQUE INDEX idx_radacct_acctuniqueid (acctuniqueid),
  INDEX idx_radacct_username (username),
  INDEX idx_radacct_framedipaddress (framedipaddress),
  INDEX idx_radacct_framedipv6address (framedipv6address),
  INDEX idx_radacct_framedipv6prefix (framedipv6prefix),
  INDEX idx_radacct_framedinterfaceid (framedinterfaceid),
  INDEX idx_radacct_delegatedipv6prefix (delegatedipv6prefix),
  INDEX idx_radacct_acctsessionid (acctsessionid),
  INDEX idx_radacct_acctsessiontime (acctsessiontime),
  INDEX idx_radacct_acctstarttime (acctstarttime),
  INDEX idx_radacct_acctstoptime (acctstoptime),
  INDEX idx_radacct_nasipaddress (nasipaddress),
  INDEX idx_radacct_class (class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: nas
-- Purpose: NAS device registry for FreeRADIUS
-- Used for: FreeRADIUS client (NAS) authentication and routing
-- ============================================================
CREATE TABLE IF NOT EXISTS nas (
  id INT(10) NOT NULL AUTO_INCREMENT,
  nasname VARCHAR(128) NOT NULL,
  shortname VARCHAR(32) DEFAULT NULL,
  type VARCHAR(30) DEFAULT 'other',
  ports INT(5) DEFAULT NULL,
  secret VARCHAR(60) NOT NULL DEFAULT 'secret',
  server VARCHAR(64) DEFAULT NULL,
  community VARCHAR(50) DEFAULT NULL,
  description VARCHAR(200) DEFAULT 'RADIUS Client',
  PRIMARY KEY (id),
  INDEX idx_nas_nasname (nasname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
