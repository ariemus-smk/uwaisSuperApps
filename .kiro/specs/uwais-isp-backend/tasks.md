# Implementation Plan: UwaisSuperApps ISP Backend

## Overview

This implementation plan breaks down the UwaisSuperApps ISP Backend into incremental coding tasks. The system is a monolithic Express.js REST API with dual MySQL databases (App DB + RADIUS DB), FreeRADIUS integration, JWT authentication with RBAC, scheduled jobs (node-cron), CoA/POD engine, Tripay payment gateway, ACS/TR-069 proxy, and WhatsApp notification queue. Each task builds on previous steps and references specific requirements for traceability.

## Tasks

- [x] 1. Project setup and core infrastructure
  - [x] 1.1 Initialize Node.js project and install dependencies
    - Create `package.json` with scripts (start, dev, test, lint)
    - Install core dependencies: express, mysql2, jsonwebtoken, bcryptjs, joi, node-cron, dotenv, cors, helmet, morgan, uuid
    - Install dev dependencies: jest, supertest, fast-check, nodemon, eslint
    - Create `.env.example` with all required environment variables (see task 1.1b)
    - Create `.gitignore` excluding `node_modules/`, `.env`, `logs/`, `uploads/`
    - Create `src/server.js` entry point and `src/app.js` Express app setup
    - _Requirements: 31.1, 42.1_

  - [x] 1.1b Create `.env` configuration file
    - Create `.env.example` (committed to repo) and `.env` (gitignored) with the following variables:
    - **Server:**
      - `NODE_ENV=development`
      - `PORT=3000`
      - `API_PREFIX=/api`
    - **Application Database (App DB):**
      - `APP_DB_HOST=localhost`
      - `APP_DB_PORT=3306`
      - `APP_DB_USER=uwais_app`
      - `APP_DB_PASSWORD=`
      - `APP_DB_NAME=uwais_app`
      - `APP_DB_CONNECTION_LIMIT=20`
    - **RADIUS Database (FreeRADIUS DB):**
      - `RADIUS_DB_HOST=localhost`
      - `RADIUS_DB_PORT=3306`
      - `RADIUS_DB_USER=radius`
      - `RADIUS_DB_PASSWORD=`
      - `RADIUS_DB_NAME=radius`
      - `RADIUS_DB_CONNECTION_LIMIT=10`
    - **JWT Authentication:**
      - `JWT_SECRET=`
      - `JWT_EXPIRES_IN=24h`
      - `JWT_REFRESH_SECRET=`
      - `JWT_REFRESH_EXPIRES_IN=7d`
    - **Tripay Payment Gateway:**
      - `TRIPAY_API_URL=https://tripay.co.id/api`
      - `TRIPAY_API_KEY=`
      - `TRIPAY_PRIVATE_KEY=`
      - `TRIPAY_MERCHANT_CODE=`
      - `TRIPAY_CALLBACK_URL=`
    - **WhatsApp Gateway:**
      - `WHATSAPP_API_URL=`
      - `WHATSAPP_API_KEY=`
      - `WHATSAPP_SENDER_NUMBER=`
    - **ACS / TR-069:**
      - `ACS_API_URL=`
      - `ACS_API_USERNAME=`
      - `ACS_API_PASSWORD=`
    - **FreeRADIUS CoA/POD:**
      - `COA_TIMEOUT_MS=5000`
      - `COA_MAX_RETRIES=3`
    - **VPN Server (for NAS failover):**
      - `VPN_SERVER_HOST=`
      - `VPN_PPTP_PORT=1723`
      - `VPN_L2TP_PORT=1701`
      - `VPN_SSTP_PORT=443`
      - `VPN_OVPN_PORT=1194`
    - **File Upload:**
      - `UPLOAD_DIR=./uploads`
      - `MAX_FILE_SIZE_MB=5`
    - **Scheduled Jobs:**
      - `BILLING_CRON=0 0 1 * *`
      - `ISOLIR_CRON=59 23 10 * *`
      - `NAS_POLL_CRON=*/5 * * * *`
      - `FUP_CHECK_CRON=0 * * * *`
      - `KPI_CRON=0 0 1 * *`
      - `NOTIF_BROADCAST_CRON=*/10 * * * * *`
    - **Coverage Check:**
      - `COVERAGE_RADIUS_METERS=500`
    - **Logging:**
      - `LOG_LEVEL=info`
      - `LOG_DIR=./logs`
    - _Requirements: 12.1, 31.1, 8.1, 30.1, 15.1, 42.1, 47.4_

  - [x] 1.2 Set up dual MySQL database connection pools
    - Create `src/config/database.js` with `appPool` and `radiusPool` connection pools
    - Configure connection limits, timeouts, and error handling
    - Create `src/config/index.js` aggregating all config modules
    - _Requirements: 12.1, 3.2_

  - [x] 1.3 Create database migration scripts for App DB
    - Create `migrations/` directory with numbered SQL migration files
    - Define all App DB tables: branches, users, customers, customer_audit_log, packages, subscriptions, invoices, payments, saldo_transactions, nas_devices, coa_logs, olts, odps, assets, asset_inbounds, asset_transfers, tool_lendings, direct_sales, stock_opnames, tickets, ticket_journals, overtime_requests, notifications, package_change_requests, capex_projects, kpi_scores, payroll_reports, fup_usage, job_logs, down_payments, work_journals, system_settings, auth_logs
    - Include indexes, foreign keys, and constraints
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.4, 12.1, 18.5, 24.5, 28.1, 29.1, 32.1, 33.1, 38.5, 42.2_

  - [x] 1.4 Create database migration scripts for RADIUS DB
    - Create migration for FreeRADIUS standard tables: radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radacct, nas
    - Follow FreeRADIUS standard schema with appropriate indexes
    - _Requirements: 3.2, 12.1_

  - [x] 1.5 Implement global error handler and response utilities
    - Create `src/middleware/errorHandler.js` with consistent error response format
    - Create `src/utils/constants.js` with enums, status values, error codes
    - Create `src/utils/responseHelper.js` for success/error response formatting
    - _Requirements: 1.5, 31.3_

  - [x] 1.6 Set up testing framework configuration
    - Create `jest.config.js` with test paths for unit, integration, and property tests
    - Create test helper utilities for database mocking and request factories
    - Create `tests/` directory structure (unit/, integration/, property/)
    - _Requirements: 42.2_

- [x] 2. Authentication and authorization middleware
  - [x] 2.1 Implement JWT authentication middleware
    - Create `src/middleware/auth.js` with JWT verification, token extraction, and expiry check
    - Create `src/config/auth.js` with JWT secret, expiry, and refresh token config
    - Attach decoded user payload (id, role, branch_id) to `req.user`
    - Return 401 for missing/invalid/expired tokens
    - _Requirements: 31.1, 32.4_

  - [x] 2.2 Implement RBAC middleware with permission matrix
    - Create `src/middleware/rbac.js` with role-permission mapping for all 8 roles
    - Implement `authorize(...allowedRoles)` middleware factory
    - Return 403 Forbidden for unauthorized role access
    - _Requirements: 31.2, 31.3_

  - [x] 2.3 Write property test for RBAC permission enforcement
    - **Property 11: RBAC Permission Enforcement**
    - **Validates: Requirements 31.3**

  - [x] 2.4 Implement Branch scoping middleware
    - Create `src/middleware/branchScope.js` that injects `req.branchFilter` for scoped roles (Admin, Accounting, Teknisi)
    - Ensure Superadmin bypasses branch scoping
    - _Requirements: 31.4, 33.2_

  - [x] 2.5 Implement auth controller and routes
    - Create `src/controllers/auth.controller.js` with login, refresh, password-reset request/confirm
    - Create `src/routes/auth.routes.js` with POST /api/auth/login, /refresh, /password-reset/*
    - Create `src/services/auth.service.js` with credential verification, token generation, password hashing
    - Create `src/models/user.model.js` and `src/models/authLog.model.js`
    - Log all auth events (login success/failure, token refresh)
    - _Requirements: 31.1, 32.4, 32.5_

  - [x] 2.6 Write unit tests for auth middleware and service
    - Test JWT verification (valid, expired, malformed tokens)
    - Test RBAC for each role against allowed/denied endpoints
    - Test branch scoping injection
    - _Requirements: 31.1, 31.2, 31.3, 31.4_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Core utility modules
  - [x] 4.1 Implement Indonesian phone number validator
    - Create `src/utils/phoneValidator.js` accepting +62 or 08 prefix with 9-12 digits
    - Return boolean for valid/invalid format
    - _Requirements: 2.3_

  - [x] 4.2 Write property test for phone number validation
    - **Property 2: Indonesian Phone Number Validation**
    - **Validates: Requirements 2.3**

  - [x] 4.3 Implement prorata billing calculator
    - Create `src/utils/prorataCalc.js` calculating (monthly_price / total_days_in_month) * remaining_days
    - Handle edge cases: Feb 28/29, month boundaries, day-1 activation
    - _Requirements: 5.1_

  - [x] 4.4 Write property test for prorata calculation
    - **Property 4: Prorata Billing Calculation**
    - **Validates: Requirements 5.1**

  - [x] 4.5 Implement PPPoE credential generator
    - Create `src/utils/pppoeGenerator.js` generating unique PPPoE username/password pairs
    - Ensure uniqueness check against existing radcheck entries
    - _Requirements: 3.2, 16.4_

  - [x] 4.6 Implement serial number auto-generator
    - Create `src/utils/snGenerator.js` with format UBG-YYYYMMDD-XXXXXX
    - Ensure sequential numbering within a batch and uniqueness
    - _Requirements: 18.3_

  - [x] 4.7 Write property test for serial number format
    - **Property 9: Serial Number Format Generation**
    - **Validates: Requirements 18.3**

  - [x] 4.8 Implement GPS distance calculator (Haversine)
    - Create `src/utils/gpsDistance.js` with Haversine formula for distance between two GPS coordinates
    - Return distance in meters
    - _Requirements: 47.1_

  - [x] 4.9 Write property test for coverage check distance filtering
    - **Property 12: Coverage Check Distance Filtering**
    - **Validates: Requirements 47.1**

  - [x] 4.10 Implement request validation middleware (Joi)
    - Create `src/middleware/validator.js` with Joi schema validation wrapper
    - Support body, params, and query validation
    - Return 400 with field-level error details on validation failure
    - _Requirements: 1.5, 2.3, 4.2, 4.3_

- [x] 5. Branch and user management modules
  - [x] 5.1 Implement Branch model, service, controller, and routes
    - Create `src/models/branch.model.js` with CRUD operations
    - Create `src/services/branch.service.js` with business logic (deactivation prevents new registrations)
    - Create `src/controllers/branch.controller.js` and `src/routes/branch.routes.js`
    - Endpoints: GET/POST/PUT /api/branches, PATCH /api/branches/:id/status
    - _Requirements: 33.1, 33.2, 33.3, 33.4_

  - [x] 5.2 Implement User management model, service, controller, and routes
    - Create `src/models/user.model.js` (extend from auth task) with full CRUD
    - Create `src/services/user.service.js` with role-specific fields (profit_sharing_pct for Mitra, commission for Merchant)
    - Create `src/controllers/user.controller.js` and `src/routes/user.routes.js`
    - Endpoints: GET/POST/PUT /api/users, PATCH /api/users/:id/status
    - _Requirements: 32.1, 32.2, 32.3, 32.4_

  - [x] 5.3 Write unit tests for branch and user services
    - Test branch deactivation logic
    - Test Mitra/Merchant account creation with specific fields
    - _Requirements: 33.3, 32.2, 32.3_

- [x] 6. Customer lifecycle and database module
  - [x] 6.1 Implement Customer model with lifecycle state machine
    - Create `src/models/customer.model.js` with CRUD and status transition validation
    - Create `src/models/customerAuditLog.model.js` for status change history
    - Implement allowed transitions: Prospek->Instalasi->Aktif->Isolir<->Aktif, Aktif->Terminated, Isolir->Terminated
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 6.2 Write property test for customer lifecycle state machine
    - **Property 1: Customer Lifecycle State Machine**
    - **Validates: Requirements 1.3, 1.5**

  - [x] 6.3 Implement Customer service with validation and branch scoping
    - Create `src/services/customer.service.js` with create, update, status change, audit log
    - Validate KTP uniqueness, WhatsApp format, GPS coordinates
    - Associate customer with Branch and registering user (Sales/Mitra/Admin)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 6.4 Implement Customer controller and routes
    - Create `src/controllers/customer.controller.js` and `src/routes/customer.routes.js`
    - Endpoints: GET/POST/PUT /api/customers, PATCH /api/customers/:id/status, GET /api/customers/:id/audit-log
    - Apply RBAC: Admin, Accounting, Sales, Mitra for list; Admin for update/status change
    - _Requirements: 1.3, 1.4, 2.1, 31.2_

  - [x] 6.5 Write unit tests for customer service
    - Test valid/invalid state transitions
    - Test KTP uniqueness enforcement
    - Test phone number validation integration
    - _Requirements: 1.3, 1.5, 2.2, 2.3_

- [x] 7. Service package management module
  - [x] 7.1 Implement Package model, service, controller, and routes
    - Create `src/models/package.model.js` with QoS parameter storage
    - Create `src/services/package.service.js` with validation (burst_limit >= rate_limit, burst_threshold <= rate_limit)
    - Create `src/controllers/package.controller.js` and `src/routes/package.routes.js`
    - Prevent deletion of packages with active subscriptions
    - Endpoints: GET/POST/PUT/DELETE /api/packages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Write property test for QoS parameter constraints
    - **Property 3: QoS Parameter Constraints**
    - **Validates: Requirements 4.2, 4.3**

  - [x] 7.3 Write unit tests for package service
    - Test burst/threshold validation edge cases
    - Test deletion prevention with active subscriptions
    - Test FUP configuration per package
    - _Requirements: 4.2, 4.3, 4.5_

- [x] 8. Subscription and RADIUS provisioning module
  - [x] 8.1 Implement RADIUS models for RADIUS DB
    - Create `src/radiusModels/index.js` with RADIUS DB pool reference
    - Create `src/radiusModels/radcheck.model.js` for PPPoE credentials
    - Create `src/radiusModels/radreply.model.js` for per-user reply attributes
    - Create `src/radiusModels/radusergroup.model.js` for user-to-group mapping
    - Create `src/radiusModels/radacct.model.js` for accounting records
    - Create `src/radiusModels/radgroupcheck.model.js` and `src/radiusModels/radgroupreply.model.js`
    - Create `src/radiusModels/nas.model.js` for FreeRADIUS NAS registry
    - _Requirements: 3.2, 12.1_

  - [x] 8.2 Implement RADIUS service for provisioning
    - Create `src/services/radius.service.js` with functions: createPPPoEAccount, updateUserGroup, setIsolirProfile, setFUPProfile, removeIsolirProfile, resetFUPProfile
    - Write to radcheck (credentials), radusergroup (package mapping), radreply (speed/isolir attributes)
    - _Requirements: 3.2, 7.2, 8.4, 13.1, 41.2_

  - [x] 8.3 Implement Subscription model, service, controller, and routes
    - Create `src/models/subscription.model.js` with one-to-many customer relationship
    - Create `src/services/subscription.service.js` with create (generates PPPoE), activate (writes RADIUS), install (accepts technician data)
    - Create `src/controllers/subscription.controller.js` and `src/routes/subscription.routes.js`
    - Endpoints: GET/POST/PUT /api/subscriptions, POST /api/subscriptions/:id/activate, POST /api/subscriptions/:id/installation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 16.4, 16.5_

  - [x] 8.4 Write unit tests for subscription and RADIUS service
    - Test PPPoE account generation uniqueness
    - Test RADIUS provisioning writes
    - Test subscription activation flow
    - _Requirements: 3.2, 16.4, 16.5_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Billing and invoice module
  - [x] 10.1 Implement Invoice model and billing service
    - Create `src/models/invoice.model.js` with status tracking (UNPAID, LUNAS, WAIVED, CANCELLED)
    - Create `src/services/billing.service.js` with generateInvoice (base + PPN + installation fee + addons - DP), waiveInvoice, getInvoices
    - Implement PPN calculation (11% when enabled)
    - Implement prorata integration for first invoice
    - _Requirements: 5.1, 5.2, 5.3, 6.2, 6.3, 6.4, 11.1, 11.2, 45.2, 45.4, 46.2_

  - [x] 10.2 Write property test for invoice total with PPN
    - **Property 5: Invoice Total with PPN**
    - **Validates: Requirements 6.2**

  - [x] 10.3 Write property test for down payment deduction
    - **Property 13: Down Payment Deduction**
    - **Validates: Requirements 46.2, 46.3**

  - [x] 10.4 Implement Billing controller and routes
    - Create `src/controllers/billing.controller.js` and `src/routes/billing.routes.js`
    - Endpoints: GET /api/billing/invoices, GET /api/billing/invoices/:id, POST /api/billing/invoices/:id/waive, GET/POST /api/billing/dp
    - _Requirements: 6.4, 11.1, 11.2, 46.1_

  - [x] 10.5 Implement Down Payment model and service
    - Create `src/models/downPayment.model.js`
    - Integrate DP deduction into first invoice generation
    - Handle carry-over when DP exceeds invoice total
    - _Requirements: 46.1, 46.2, 46.3, 46.4_

  - [x] 10.6 Write unit tests for billing service
    - Test invoice generation with/without PPN
    - Test prorata edge cases (Feb 28/29, day-1)
    - Test DP deduction and carry-over
    - Test waiver logic for extended isolir
    - _Requirements: 5.1, 6.2, 11.1, 46.2, 46.3_

- [x] 11. Payment processing module
  - [x] 11.1 Implement Tripay integration service
    - Create `src/config/tripay.js` with API credentials and endpoint URLs
    - Create `src/services/tripay.service.js` with createTransaction, verifyCallback (HMAC signature)
    - Support VA, QRIS, and minimarket payment methods
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 11.2 Implement Payment model and payment service
    - Create `src/models/payment.model.js` with status tracking
    - Create `src/services/payment.service.js` with processPayment (updates invoice to LUNAS, triggers unisolir if needed)
    - Create `src/models/saldoTransaction.model.js` for Mitra/Merchant balance tracking
    - _Requirements: 8.3, 8.4_

  - [x] 11.3 Implement Mitra payment service
    - Create `src/services/mitra.service.js` with topup, processPayment (deduct saldo), getBalance, getReport
    - Validate sufficient saldo before payment processing
    - Calculate profit sharing percentage
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 11.4 Write property test for balance sufficiency enforcement
    - **Property 6: Balance Sufficiency Enforcement**
    - **Validates: Requirements 9.3, 9.6, 10.5**

  - [x] 11.5 Implement Merchant payment service
    - Create `src/services/merchant.service.js` with topup, processPayment (deduct saldo + commission), getBalance
    - Validate sufficient saldo before payment processing
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 11.6 Implement Payment controller and routes
    - Create `src/controllers/payment.controller.js` and `src/routes/payment.routes.js`
    - Endpoints: POST /api/payments/tripay/create, POST /api/payments/tripay/callback, POST /api/payments/mitra, POST /api/payments/merchant, POST /api/payments/mitra/topup, POST /api/payments/merchant/topup, GET /api/payments/mitra/balance, GET /api/payments/merchant/balance
    - Tripay callback: verify signature, update invoice, trigger unisolir if isolir
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.3, 10.3_

  - [x] 11.7 Write unit tests for payment services
    - Test Tripay signature verification
    - Test callback idempotency (duplicate callbacks)
    - Test saldo deduction race conditions
    - Test Mitra profit sharing calculation
    - _Requirements: 8.3, 8.5, 9.4, 9.6, 10.5_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. CoA/POD engine module
  - [x] 13.1 Implement CoA packet builder utility
    - Create `src/utils/coaPacket.js` with CoA/POD command builder for `radclient` CLI
    - Build radclient-compatible attribute strings (User-Name, Mikrotik-Rate-Limit, etc.)
    - Generate the full SSH command string for executing CoA/POD via radclient on FreeRADIUS server
    - _Requirements: 13.1, 13.2_

  - [x] 13.2 Implement CoA service with retry logic
    - Create `src/services/coa.service.js` with sendCoA, sendPOD functions
    - Implement SSH execution to FreeRADIUS server using `ssh2` library
    - Execute `radclient` commands on the FreeRADIUS server targeting NAS port 3799
    - Parse radclient output for ACK/NAK/Timeout responses
    - Implement retry logic: 3 retries with exponential backoff (1s, 2s, 4s)
    - Log all operations to coa_logs table
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 13.3 Write property test for retry logic
    - **Property 7: Retry Logic with Maximum Attempts**
    - **Validates: Requirements 7.5, 13.4, 30.4**

  - [x] 13.4 Implement CoA controller and routes
    - Create `src/controllers/coa.controller.js` and `src/routes/coa.routes.js`
    - Endpoints: POST /api/coa/kick, /api/coa/speed-change, /api/coa/isolir, /api/coa/unisolir, GET /api/coa/logs
    - _Requirements: 13.1, 13.2, 13.5_

  - [x] 13.5 Write unit tests for CoA service
    - Test radclient command construction
    - Test SSH execution and response parsing (ACK, NAK, Timeout)
    - Test retry state machine
    - _Requirements: 13.3, 13.4, 13.5_

- [x] 14. NAS management module
  - [x] 14.1 Implement NAS model and service
    - Create `src/models/nas.model.js` with CRUD and status tracking
    - Create `src/services/nas.service.js` with register (auto-create 4 VPN accounts on CHR), generateScript, testConnectivity
    - Create `src/utils/mikrotikScript.js` for generating Mikrotik config scripts (VPN failover, RADIUS, PPPoE server, Hotspot, isolir Address_List)
    - Write NAS to RADIUS DB `nas` table on registration
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 14.1b Implement Mikrotik CHR REST API client
    - Create `src/services/mikrotikChr.service.js` with RouterOS 7 REST API client (HTTPS)
    - Implement CRUD operations via REST: GET/PUT/POST/DELETE to `/rest/{resource}`
    - Implement VPN account management: createPPTPSecret, createL2TPSecret, createSSTPSecret, createOVPNSecret, deleteSecret
    - Implement PPP profile management for VPN accounts
    - Implement IP pool management for VPN clients
    - Implement firewall/NAT rules for VPN traffic
    - Create `src/config/mikrotikChr.js` with CHR connection config from env vars
    - _Requirements: 12.2, 12.3_

  - [x] 14.2 Implement NAS monitoring service
    - Add NAS health polling logic to `src/services/nas.service.js`
    - Track Up/Down status transitions with timestamps
    - Calculate downtime duration on recovery
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 14.3 Implement NAS controller and routes
    - Create `src/controllers/nas.controller.js` and `src/routes/nas.routes.js`
    - Endpoints: GET/POST/PUT /api/nas, GET /api/nas/:id/script, POST /api/nas/:id/test, GET /api/nas/monitoring
    - Create `src/controllers/vpnChr.controller.js` and `src/routes/vpnChr.routes.js`
    - CHR endpoints: GET /api/vpn-chr/status, GET/POST/DELETE /api/vpn-chr/secrets, GET /api/vpn-chr/active-connections, POST /api/vpn-chr/profiles, GET /api/vpn-chr/ip-pools
    - _Requirements: 12.4, 12.5, 14.2_

  - [x] 14.4 Write unit tests for NAS service
    - Test VPN account generation via CHR REST API
    - Test Mikrotik script generation
    - Test CHR REST API client (mock HTTP calls)
    - Test connectivity test logic
    - _Requirements: 12.2, 12.3, 12.5_

- [x] 15. Infrastructure module (OLT, ODP, Coverage)
  - [x] 15.1 Implement OLT model, service, and routes
    - Create `src/models/olt.model.js` with CRUD
    - Create `src/services/infrastructure.service.js` with OLT registration and connectivity test
    - Endpoints: GET/POST/PUT /api/infrastructure/olts, POST /api/infrastructure/olts/:id/test
    - _Requirements: 28.1, 28.2, 28.3, 28.4_

  - [x] 15.2 Implement ODP model, service, and coverage check
    - Create `src/models/odp.model.js` with port tracking
    - Create `src/services/coverage.service.js` with checkCoverage (GPS + radius + available ports)
    - Update ODP used_ports on customer installation
    - Exclude full-capacity ODPs from coverage results
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 47.1, 47.2, 47.3, 47.4_

  - [x] 15.3 Write property test for ODP capacity exclusion
    - **Property 10: ODP Capacity Exclusion**
    - **Validates: Requirements 29.5**

  - [x] 15.4 Implement Infrastructure controller and routes
    - Create `src/controllers/infrastructure.controller.js` and `src/routes/infrastructure.routes.js`
    - Endpoints: GET /api/infrastructure/odps, POST /api/infrastructure/odps, PUT /api/infrastructure/odps/:id, GET /api/infrastructure/coverage
    - _Requirements: 29.1, 47.1_

  - [x] 15.5 Write unit tests for coverage service
    - Test distance filtering with boundary cases
    - Test empty ODP sets
    - Test all-full ODPs scenario
    - _Requirements: 47.1, 47.2, 47.3_

- [x] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Customer activation and package change flows
  - [x] 17.1 Implement customer activation flow service
    - Extend `src/services/customer.service.js` with full activation flow: coverage check -> DP recording -> PPPoE generation -> installation data -> first invoice calculation -> activation via CoA
    - Integrate prorata, installation fee, add-on charges, and DP deduction into first invoice
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 45.1, 45.2, 45.3, 45.4_

  - [x] 17.2 Implement package change request service
    - Create `src/services/packageChange.service.js` with request, approve, reject
    - Validate 1 change per month limit
    - On approval: update subscription, calculate billing adjustment, trigger CoA speed change
    - Create `src/models/packageChangeRequest.model.js`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 17.3 Write property test for package change rate limiting
    - **Property 8: Package Change Rate Limiting**
    - **Validates: Requirements 17.2**

  - [x] 17.4 Implement package change controller and routes
    - Create `src/controllers/packageChange.controller.js` and `src/routes/packageChange.routes.js`
    - Endpoints: POST /api/package-change/request, GET /api/package-change, PATCH /api/package-change/:id/approve, PATCH /api/package-change/:id/reject
    - _Requirements: 17.3, 17.4, 17.5_

  - [x] 17.5 Write unit tests for activation and package change
    - Test full activation flow
    - Test package change monthly limit enforcement
    - Test billing adjustment calculation
    - _Requirements: 16.6, 16.8, 17.2, 17.4_

- [x] 18. Asset and inventory management module
  - [x] 18.1 Implement Asset inbound model and service
    - Create `src/models/asset.model.js` with status tracking and category handling
    - Create `src/models/assetInbound.model.js`
    - Create `src/services/asset.service.js` with recordInbound (categorize: PerangkatAktif/Kabel/Aksesoris, auto-generate SN if needed)
    - Update branch stock counts on inbound
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 18.2 Implement Asset outbound and installation tracking
    - Extend `src/services/asset.service.js` with requestOutbound, approveOutbound, recordInstallation, processReturn
    - Validate stock availability before approval
    - Track actual usage (cable meters, accessories count)
    - Handle return inspection (Tersedia or Rusak)
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 18.3 Implement Tool lending service
    - Create `src/models/toolLending.model.js`
    - Extend `src/services/asset.service.js` with borrowTool, approveBorrow, returnTool
    - Track borrow duration and condition on return
    - Handle damaged/lost tools with accountability
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 18.4 Implement Inter-branch transfer service
    - Create `src/models/assetTransfer.model.js`
    - Extend `src/services/asset.service.js` with initiateTransfer, confirmReceipt, returnTransfer
    - Manage stock deduction/addition between branches
    - Maintain transfer history with timestamps
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [x] 18.5 Implement Direct sales and stock opname
    - Create `src/models/directSale.model.js` and `src/models/stockOpname.model.js`
    - Implement direct sale recording (Cash/Hutang), stock deduction
    - Implement stock opname: initiate, submit counts, compare, generate adjustments, finalize
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 23.1, 23.2, 23.3, 23.4_

  - [x] 18.6 Implement Asset controller and routes
    - Create `src/controllers/asset.controller.js` and `src/routes/asset.routes.js`
    - All asset endpoints: inbound, outbound, return, transfer, tools, direct-sale, stock-opname
    - _Requirements: 18.1, 19.1, 20.5, 21.1, 22.1, 23.1_

  - [x] 18.7 Write unit tests for asset service
    - Test stock deduction by category (meters, pieces, units)
    - Test transfer stock movement
    - Test stock opname adjustment generation
    - _Requirements: 19.2, 21.2, 21.3, 23.3_

- [x] 19. Helpdesk ticketing module
  - [x] 19.1 Implement Ticket model and service
    - Create `src/models/ticket.model.js` with status tracking (Open, InProgress, Pending, Resolved, Closed)
    - Create `src/models/ticketJournal.model.js` for progress entries
    - Create `src/services/ticket.service.js` with create (auto-classify priority), assign, updateProgress, resolve, close
    - Implement priority classification based on configurable rules
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [x] 19.2 Implement Technician dispatch and multi-ticket assignment
    - Extend `src/services/ticket.service.js` with dispatch (group tickets by area), overtime request/approval
    - Handle overtime workflow: request -> approve/reject -> notify
    - Queue pending tickets for next shift when overtime rejected
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_

  - [x] 19.3 Implement Remote troubleshooting integration
    - Extend `src/services/ticket.service.js` with triggerRemoteFix (ACS commands or NAS CoA/POD)
    - Record remote actions in ticket journal
    - Support "Remote Fix" resolution type
    - _Requirements: 25.1, 25.2, 25.3_

  - [x] 19.4 Implement Ticket resolution and KPI tracking
    - Calculate resolution time (creation to resolution)
    - Store resolution metrics per Teknisi
    - Record closing Admin, timestamp, and resolution category
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

  - [x] 19.5 Implement Overtime model and service
    - Create `src/models/overtime.model.js`
    - Implement overtime request, approval, compensation calculation
    - _Requirements: 39.1, 39.2, 39.3, 39.4_

  - [x] 19.6 Implement Ticket controller and routes
    - Create `src/controllers/ticket.controller.js` and `src/routes/ticket.routes.js`
    - All ticket endpoints: CRUD, assign, progress, resolve, close, journal, overtime
    - _Requirements: 24.1, 26.1, 27.4_

  - [x] 19.7 Write unit tests for ticket service
    - Test priority classification logic
    - Test resolution time calculation
    - Test overtime workflow
    - _Requirements: 24.2, 27.1, 39.3_

- [x] 20. Notification module (WhatsApp queue)
  - [x] 20.1 Implement Notification model and queue service
    - Create `src/models/notification.model.js` with queue status tracking
    - Create `src/services/notification.service.js` with queueNotification, processQueue
    - Create `src/services/whatsapp.service.js` with sendMessage (REST call to WA gateway)
    - Create `src/config/whatsapp.js` with gateway URL and credentials
    - Implement retry logic: 3 retries, mark as Failed after max retries
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

  - [x] 20.2 Implement Notification controller and routes
    - Create `src/controllers/notification.controller.js` and `src/routes/notification.routes.js`
    - Endpoints: GET /api/notifications/queue, POST /api/notifications/broadcast
    - _Requirements: 30.5_

  - [x] 20.3 Integrate notifications into billing and payment flows
    - Queue WhatsApp notification on invoice generation
    - Queue payment confirmation notification
    - Queue isolir warning notification
    - Queue service activation notification
    - Implement channel logic: WA+email for new customers (<=2 months), push notification for older customers
    - _Requirements: 6.5, 6.6, 7.4, 8.4, 16.7, 30.2_

  - [x] 20.4 Write unit tests for notification service
    - Test queue processing
    - Test retry logic
    - Test channel selection based on subscription age
    - _Requirements: 30.4, 6.6_

- [x] 21. ACS/TR-069 integration module
  - [x] 21.1 Implement ACS service and routes
    - Create `src/config/acs.js` with ACS server URL and credentials
    - Create `src/services/acs.service.js` with rebootDevice, changeWifi, triggerFirmwareUpdate, getDeviceStatus
    - Create `src/controllers/acs.controller.js` and `src/routes/acs.routes.js`
    - Endpoints: POST /api/acs/:subscriptionId/reboot, /wifi, /firmware, GET /api/acs/:subscriptionId/status
    - Link subscriptions to ACS using PPPoE username as identifier
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 3.4_

  - [x] 21.2 Write unit tests for ACS service
    - Test ACS command construction
    - Test device lookup by PPPoE username
    - _Requirements: 15.2, 15.3_

- [x] 22. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Scheduled jobs module
  - [x] 23.1 Implement job scheduler infrastructure
    - Create `src/jobs/index.js` with node-cron job registry and initialization
    - Create `src/models/jobLog.model.js` for execution logging
    - Implement job execution wrapper with start/end time, records processed/failed, status logging
    - _Requirements: 42.1, 42.2, 42.3_

  - [x] 23.2 Implement billing generation job
    - Create `src/jobs/billingGeneration.job.js` running at 00:00 on 1st of month
    - Generate invoices for all active subscriptions (base + PPN)
    - Queue WhatsApp notifications for each generated invoice
    - Handle partial failures (continue processing, log failed records)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 42.3_

  - [x] 23.3 Implement auto-isolir job
    - Create `src/jobs/autoIsolir.job.js` running at 23:59 on 10th of month
    - Identify subscriptions with UNPAID invoices past due date
    - Send CoA to NAS for isolir (add to Address_List)
    - Update customer status to Isolir
    - Send notification to customer
    - Implement 2-month arrears logic: send termination notice, create device withdrawal ticket
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 11.3, 11.4_

  - [x] 23.4 Implement NAS health polling job
    - Create `src/jobs/nasHealthPoll.job.js` running every 5 minutes
    - Ping all active NAS devices
    - Track Up/Down transitions with timestamps
    - Generate alert events on status change
    - _Requirements: 14.1, 14.3, 14.4_

  - [x] 23.5 Implement FUP enforcement job
    - Create `src/jobs/fupEnforcement.job.js` running every hour
    - Check cumulative data usage from radacct (RADIUS DB)
    - Trigger CoA speed reduction when quota exceeded
    - Create `src/models/fupUsage.model.js` for tracking
    - Create `src/utils/fupCalc.js` for threshold calculation
    - _Requirements: 41.1, 41.2, 41.4_

  - [x] 23.6 Write property test for FUP threshold enforcement
    - **Property 14: FUP Threshold Enforcement**
    - **Validates: Requirements 41.2**

  - [x] 23.7 Implement FUP reset job
    - Create `src/jobs/fupReset.job.js` running at 00:00 on 1st of month
    - Reset FUP usage counters for all subscriptions
    - Restore original speed profiles via CoA for throttled subscriptions
    - _Requirements: 41.3_

  - [x] 23.8 Implement KPI calculation job
    - Create `src/jobs/kpiCalculation.job.js` running at 00:00 on 1st of month
    - Calculate Sales KPI: target vs actual new activations
    - Calculate Teknisi KPI: SLA compliance rate, installation quality
    - Store scores in kpi_scores table
    - Flag reward-eligible employees
    - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5_

  - [x] 23.9 Implement notification broadcast job
    - Create `src/jobs/notificationBroadcast.job.js` running every 10 seconds
    - Process queued notifications (SELECT WHERE status=Queued LIMIT 10)
    - Send via WhatsApp API, update status
    - Handle retries and failures
    - _Requirements: 30.1, 30.4_

  - [x] 23.10 Implement Scheduler controller and routes
    - Create `src/controllers/scheduler.controller.js` and `src/routes/scheduler.routes.js`
    - Endpoints: GET /api/scheduler/jobs, GET /api/scheduler/logs, POST /api/scheduler/jobs/:name/run
    - Allow Superadmin to view history and manually trigger jobs
    - _Requirements: 42.4_

  - [x] 23.11 Write unit tests for scheduled jobs
    - Test billing generation logic
    - Test auto-isolir identification and CoA trigger
    - Test FUP threshold detection
    - Test KPI calculation formulas
    - _Requirements: 6.1, 7.1, 41.2, 38.1_

- [x] 24. Bill waiver and extended isolir logic
  - [x] 24.1 Implement bill waiver service
    - Extend `src/services/billing.service.js` with waiveExtendedIsolir
    - When customer in Isolir > 1 month pays: waive all invoices during isolir period
    - Record waiver with reason "Extended Isolir" and waived amount
    - _Requirements: 11.1, 11.2_

  - [x] 24.2 Write unit tests for bill waiver
    - Test waiver calculation for multi-month isolir
    - Test audit trail recording
    - _Requirements: 11.1, 11.2_

- [x] 25. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 26. KPI, payroll, and overtime module
  - [x] 26.1 Implement KPI model, service, and routes
    - Create `src/models/kpi.model.js` with score history
    - Create `src/services/kpi.service.js` with getScores, getHistory
    - Create `src/controllers/kpi.controller.js` and `src/routes/kpi.routes.js`
    - Endpoints: GET /api/kpi/scores, GET /api/kpi/history/:userId
    - _Requirements: 38.4, 38.5_

  - [x] 26.2 Implement Payroll model, service, and routes
    - Create `src/models/payroll.model.js` with approval workflow
    - Create `src/services/payroll.service.js` with generateReport (consolidate KPI + overtime), approve, revise
    - Create `src/controllers/payroll.controller.js` and `src/routes/payroll.routes.js`
    - Endpoints: GET /api/payroll/reports, PATCH /api/payroll/reports/:id/approve, GET /api/payroll/slips/:userId
    - _Requirements: 40.1, 40.2, 40.3, 40.4, 40.5_

  - [x] 26.3 Write unit tests for KPI and payroll services
    - Test KPI score calculation
    - Test payroll consolidation
    - Test approval workflow
    - _Requirements: 38.1, 40.1, 40.2_

- [x] 27. CAPEX and expansion budgeting module
  - [x] 27.1 Implement CAPEX model, service, and routes
    - Create `src/models/capexProject.model.js` with status workflow
    - Create `src/services/capex.service.js` with createProposal, calculateRAB (reference master asset prices), approve, reject, generatePO, reserveStock
    - Create `src/controllers/capex.controller.js` and `src/routes/capex.routes.js`
    - Endpoints: GET/POST/PUT /api/capex/projects, PATCH /api/capex/projects/:id/approve, PATCH /api/capex/projects/:id/reject
    - _Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6_

  - [x] 27.2 Write unit tests for CAPEX service
    - Test RAB calculation from master prices
    - Test stock reservation logic
    - Test PO generation for insufficient stock
    - _Requirements: 37.2, 37.4, 37.5_

- [x] 28. Reporting and export module
  - [x] 28.1 Implement Komdigi regulatory reports
    - Create `src/services/report.service.js` with generateKomdigiPackages, generateKomdigiCustomers, generateKomdigiRevenue
    - Create `src/utils/excelExport.js` using exceljs library for Excel generation
    - _Requirements: 34.1, 34.2, 34.3, 34.4_

  - [x] 28.2 Implement financial reports
    - Extend `src/services/report.service.js` with generateFinancialReport (income, receivables, cash advances, reconciliation)
    - Support filtering by date range, Branch, payment method, handler
    - Include PPN breakdown
    - _Requirements: 35.1, 35.2, 35.3, 35.4_

  - [x] 28.3 Implement customer growth reports
    - Extend `src/services/report.service.js` with calculateGrowth (net = activations - churned)
    - Support MoM and YoY periods
    - Map by Mitra, Branch, Sales agent
    - Create `src/utils/pdfExport.js` for PDF generation
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5_

  - [x] 28.4 Write property test for net growth calculation
    - **Property 15: Net Growth Calculation**
    - **Validates: Requirements 36.1**

  - [x] 28.5 Implement Report controller and routes
    - Create `src/controllers/report.controller.js` and `src/routes/report.routes.js`
    - Endpoints: GET /api/reports/komdigi/*, GET /api/reports/financial, GET /api/reports/growth, GET /api/reports/export/:type
    - _Requirements: 34.1, 35.1, 36.4_

  - [x] 28.6 Write unit tests for report services
    - Test growth calculation (net = activations - churned)
    - Test financial report filtering
    - Test Excel export generation
    - _Requirements: 36.1, 35.2, 34.4_

- [x] 29. Customer self-service module
  - [x] 29.1 Implement Self-service controller and routes
    - Create `src/controllers/selfservice.controller.js` and `src/routes/selfservice.routes.js`
    - Endpoints for Pelanggan: view profile, subscriptions, billing history, payment history, ticket history
    - WiFi password/SSID change (triggers ACS command)
    - Submit trouble tickets
    - Request package change
    - Restrict access to own data only (403 for other customers)
    - _Requirements: 43.1, 43.2, 43.3, 43.4, 43.5_

  - [x] 29.2 Write unit tests for self-service
    - Test data isolation (own data only)
    - Test WiFi change triggers ACS
    - _Requirements: 43.5, 43.2_

- [x] 30. Technician work journal module
  - [x] 30.1 Implement Work journal model, service, and routes
    - Create `src/models/workJournal.model.js`
    - Extend ticket service or create standalone journal service
    - Create journal entries linked to tickets or standalone
    - Store: Teknisi ID, date, description, photos, GPS, ticket link
    - Endpoints integrated into ticket routes or separate
    - _Requirements: 44.1, 44.2, 44.3_

  - [x] 30.2 Write unit tests for work journal
    - Test journal creation with/without ticket link
    - Test filtering by date, Teknisi, Branch
    - _Requirements: 44.1, 44.3_

- [x] 31. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 32. Route aggregation and final wiring
  - [x] 32.1 Wire all routes into Express app
    - Create `src/routes/index.js` aggregating all route modules
    - Register all middleware in correct order in `src/app.js`: cors, helmet, morgan, json parser, auth, rbac, branchScope, routes, errorHandler
    - Ensure all routes are properly prefixed under /api
    - _Requirements: 31.1, 31.2, 31.4_

  - [x] 32.2 Implement system settings model and service
    - Create `src/models/systemSettings.model.js`
    - Store configurable settings: prorata enabled/disabled, installation fee enabled/disabled, coverage radius, notification intervals
    - _Requirements: 5.3, 45.1, 47.4_

  - [x] 32.3 Create seed data and initial migration runner
    - Create `scripts/migrate.js` to run all migrations in order
    - Create `scripts/seed.js` with initial data: default Branch, Superadmin user, system settings
    - _Requirements: 33.1, 32.1_

  - [x] 32.4 Write integration tests for critical flows
    - Test full customer activation flow (register -> install -> pay -> activate)
    - Test billing cycle (generate -> notify -> isolir -> pay -> unisolir)
    - Test Tripay callback processing with signature verification
    - Test NAS registration with script generation
    - Test asset lifecycle (inbound -> outbound -> install -> return)
    - _Requirements: 16.1-16.8, 6.1-6.5, 8.1-8.5, 12.1-12.4, 18.1-19.5_

- [x] 33. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses JavaScript (Express.js) as specified in the design document
- Dual database connections (appPool for App DB, radiusPool for RADIUS DB) must be used consistently
- RADIUS models are in `src/radiusModels/` separate from `src/models/` (App DB)
- All data queries for scoped roles must include branch_id filtering via branchScope middleware

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "1.6"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "4.1", "4.3", "4.5", "4.6", "4.8"] },
    { "id": 4, "tasks": ["2.2", "2.4", "4.2", "4.4", "4.7", "4.9", "4.10"] },
    { "id": 5, "tasks": ["2.3", "2.5", "5.1", "5.2"] },
    { "id": 6, "tasks": ["2.6", "5.3", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 8, "tasks": ["6.4", "6.5", "7.2", "7.3", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3"] },
    { "id": 10, "tasks": ["8.4", "10.1", "10.5"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4", "10.6"] },
    { "id": 12, "tasks": ["11.1", "13.1"] },
    { "id": 13, "tasks": ["11.2", "11.3", "11.5", "13.2"] },
    { "id": 14, "tasks": ["11.4", "11.6", "11.7", "13.3", "13.4"] },
    { "id": 15, "tasks": ["13.5", "14.1"] },
    { "id": 16, "tasks": ["14.2", "14.3", "14.4", "15.1"] },
    { "id": 17, "tasks": ["15.2", "15.4"] },
    { "id": 18, "tasks": ["15.3", "15.5", "17.1"] },
    { "id": 19, "tasks": ["17.2", "17.4", "18.1"] },
    { "id": 20, "tasks": ["17.3", "17.5", "18.2", "18.3"] },
    { "id": 21, "tasks": ["18.4", "18.5", "18.6"] },
    { "id": 22, "tasks": ["18.7", "19.1"] },
    { "id": 23, "tasks": ["19.2", "19.3", "19.4", "19.5"] },
    { "id": 24, "tasks": ["19.6", "19.7", "20.1"] },
    { "id": 25, "tasks": ["20.2", "20.3", "20.4", "21.1"] },
    { "id": 26, "tasks": ["21.2", "23.1"] },
    { "id": 27, "tasks": ["23.2", "23.3", "23.4", "23.5", "23.7", "23.8", "23.9"] },
    { "id": 28, "tasks": ["23.6", "23.10", "23.11", "24.1"] },
    { "id": 29, "tasks": ["24.2", "26.1", "26.2"] },
    { "id": 30, "tasks": ["26.3", "27.1"] },
    { "id": 31, "tasks": ["27.2", "28.1", "28.2", "28.3"] },
    { "id": 32, "tasks": ["28.4", "28.5", "28.6", "29.1"] },
    { "id": 33, "tasks": ["29.2", "30.1"] },
    { "id": 34, "tasks": ["30.2", "32.1", "32.2"] },
    { "id": 35, "tasks": ["32.3", "32.4"] }
  ]
}
```
