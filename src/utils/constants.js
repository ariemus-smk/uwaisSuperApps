/**
 * Application-wide constants, enums, and status values.
 * All domain enums are defined here to ensure consistency across the codebase.
 */

// Customer lifecycle statuses
const CUSTOMER_STATUS = Object.freeze({
  PROSPEK: 'Prospek',
  INSTALASI: 'Instalasi',
  AKTIF: 'Aktif',
  ISOLIR: 'Isolir',
  TERMINATED: 'Terminated',
});

// Valid customer status transitions
const CUSTOMER_STATUS_TRANSITIONS = Object.freeze({
  [CUSTOMER_STATUS.PROSPEK]: [CUSTOMER_STATUS.INSTALASI],
  [CUSTOMER_STATUS.INSTALASI]: [CUSTOMER_STATUS.AKTIF],
  [CUSTOMER_STATUS.AKTIF]: [CUSTOMER_STATUS.ISOLIR, CUSTOMER_STATUS.TERMINATED],
  [CUSTOMER_STATUS.ISOLIR]: [CUSTOMER_STATUS.AKTIF, CUSTOMER_STATUS.TERMINATED],
  [CUSTOMER_STATUS.TERMINATED]: [],
});

// Invoice statuses
const INVOICE_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  LUNAS: 'LUNAS',
  WAIVED: 'WAIVED',
  CANCELLED: 'CANCELLED',
});

// Payment methods
const PAYMENT_METHOD = Object.freeze({
  VA: 'VA',
  QRIS: 'QRIS',
  MINIMARKET: 'Minimarket',
  MITRA: 'Mitra',
  MERCHANT: 'Merchant',
  CASH: 'Cash',
});

// Asset statuses
const ASSET_STATUS = Object.freeze({
  TERSEDIA: 'Tersedia',
  DIPINJAM: 'Dipinjam',
  TERPASANG: 'Terpasang',
  RUSAK: 'Rusak',
  DALAM_PENGIRIMAN: 'DalamPengiriman',
  DIBAWA_TEKNISI: 'DibawaTeknisi',
});

// Asset categories
const ASSET_CATEGORY = Object.freeze({
  PERANGKAT_AKTIF: 'PerangkatAktif',
  KABEL: 'Kabel',
  AKSESORIS: 'Aksesoris',
});

// Ticket statuses
const TICKET_STATUS = Object.freeze({
  OPEN: 'Open',
  IN_PROGRESS: 'InProgress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
});

// Ticket priorities
const TICKET_PRIORITY = Object.freeze({
  VIP: 'VIP',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
});

// Ticket sources
const TICKET_SOURCE = Object.freeze({
  PELANGGAN: 'Pelanggan',
  TEKNISI: 'Teknisi',
  ADMIN: 'Admin',
});

// Ticket journal progress statuses
const TICKET_JOURNAL_STATUS = Object.freeze({
  SELESAI: 'Selesai',
  BELUM_SELESAI: 'BelumSelesai',
  PROGRESS: 'Progress',
});

// User roles
const USER_ROLE = Object.freeze({
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Admin',
  ACCOUNTING: 'Accounting',
  MITRA: 'Mitra',
  SALES: 'Sales',
  MERCHANT: 'Merchant',
  TEKNISI: 'Teknisi',
  PELANGGAN: 'Pelanggan',
});

// NAS poll statuses
const NAS_POLL_STATUS = Object.freeze({
  UP: 'Up',
  DOWN: 'Down',
});

// CoA trigger types
const COA_TRIGGER_TYPE = Object.freeze({
  SPEED_CHANGE: 'SpeedChange',
  ISOLIR: 'Isolir',
  UNISOLIR: 'Unisolir',
  FUP: 'FUP',
  KICK: 'Kick',
});

// CoA response statuses
const COA_RESPONSE_STATUS = Object.freeze({
  ACK: 'ACK',
  NAK: 'NAK',
  TIMEOUT: 'Timeout',
  PENDING: 'Pending',
});

// Subscription statuses
const SUBSCRIPTION_STATUS = Object.freeze({
  PENDING: 'Pending',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
});

// Payment statuses
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'Pending',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
});

// Package statuses
const PACKAGE_STATUS = Object.freeze({
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
});

// Branch statuses
const BRANCH_STATUS = Object.freeze({
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
});

// Down Payment statuses (logical status derived from applied field)
const DOWN_PAYMENT_STATUS = Object.freeze({
  RECORDED: 'Recorded',
  APPLIED: 'Applied',
  EXHAUSTED: 'Exhausted',
});

// Package change request statuses
const PACKAGE_CHANGE_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

// Tool lending statuses
const TOOL_LENDING_STATUS = Object.freeze({
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  RETURNED: 'Returned',
  LOST: 'Lost',
});

// Direct sale payment methods
const DIRECT_SALE_PAYMENT_METHOD = Object.freeze({
  CASH: 'Cash',
  HUTANG: 'Hutang',
});

// Direct sale payment statuses
const DIRECT_SALE_PAYMENT_STATUS = Object.freeze({
  LUNAS: 'Lunas',
  PIUTANG: 'Piutang',
});

// Stock opname statuses
const STOCK_OPNAME_STATUS = Object.freeze({
  IN_PROGRESS: 'InProgress',
  COMPLETED: 'Completed',
});

// Asset transfer statuses
const ASSET_TRANSFER_STATUS = Object.freeze({
  PENDING: 'Pending',
  IN_TRANSIT: 'InTransit',
  RECEIVED: 'Received',
  RETURNED: 'Returned',
});

// Asset transfer types
const ASSET_TRANSFER_TYPE = Object.freeze({
  TRANSFER: 'Transfer',
  RETURN: 'Return',
});

// Overtime request statuses
const OVERTIME_STATUS = Object.freeze({
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

// Payroll report statuses
const PAYROLL_STATUS = Object.freeze({
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'PendingApproval',
  APPROVED: 'Approved',
  REVISED: 'Revised',
});

// CAPEX project statuses
const CAPEX_PROJECT_STATUS = Object.freeze({
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'PendingApproval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IN_PROGRESS: 'InProgress',
  COMPLETED: 'Completed',
});

// Valid CAPEX project status transitions
const CAPEX_PROJECT_STATUS_TRANSITIONS = Object.freeze({
  [CAPEX_PROJECT_STATUS.DRAFT]: [CAPEX_PROJECT_STATUS.PENDING_APPROVAL],
  [CAPEX_PROJECT_STATUS.PENDING_APPROVAL]: [
    CAPEX_PROJECT_STATUS.APPROVED,
    CAPEX_PROJECT_STATUS.REJECTED,
    CAPEX_PROJECT_STATUS.DRAFT, // revision workflow: send back to Draft
  ],
  [CAPEX_PROJECT_STATUS.APPROVED]: [CAPEX_PROJECT_STATUS.IN_PROGRESS],
  [CAPEX_PROJECT_STATUS.REJECTED]: [CAPEX_PROJECT_STATUS.DRAFT], // allow re-submission after revision
  [CAPEX_PROJECT_STATUS.IN_PROGRESS]: [CAPEX_PROJECT_STATUS.COMPLETED],
  [CAPEX_PROJECT_STATUS.COMPLETED]: [],
});

// Ticket resolution types
const TICKET_RESOLUTION_TYPE = Object.freeze({
  REMOTE_FIX: 'RemoteFix',
  FIELD_FIX: 'FieldFix',
});

// Remote fix action types (ACS and NAS commands)
const REMOTE_FIX_ACTION = Object.freeze({
  // ACS commands (TR-069)
  DEVICE_REBOOT: 'DeviceReboot',
  SSID_CHANGE: 'SSIDChange',
  WIFI_PASSWORD_CHANGE: 'WiFiPasswordChange',
  // NAS commands (CoA/POD)
  SESSION_KICK: 'SessionKick',
  COA_SPEED_CHANGE: 'CoASpeedChange',
  COA_ISOLIR: 'CoAIsolir',
  COA_UNISOLIR: 'CoAUnisolir',
});

// Default regular working hours (08:00 - 17:00)
const REGULAR_WORK_HOURS = Object.freeze({
  START_HOUR: 8,
  END_HOUR: 17,
});

// Notification channels
const NOTIFICATION_CHANNEL = Object.freeze({
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PUSH_NOTIFICATION: 'PushNotification',
});

// Notification statuses
const NOTIFICATION_STATUS = Object.freeze({
  QUEUED: 'Queued',
  SENT: 'Sent',
  FAILED: 'Failed',
});

// Notification related entity types
const NOTIFICATION_ENTITY_TYPE = Object.freeze({
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  SUBSCRIPTION: 'Subscription',
  TICKET: 'Ticket',
  CUSTOMER: 'Customer',
});

// System setting keys
const SYSTEM_SETTING_KEY = Object.freeze({
  PRORATA_ENABLED: 'prorata_enabled',
  INSTALLATION_FEE_ENABLED: 'installation_fee_enabled',
  COVERAGE_RADIUS: 'coverage_radius',
  NOTIFICATION_INTERVALS: 'notification_intervals',
});

// Common error codes
const ERROR_CODE = Object.freeze({
  // Authentication & Authorization
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resource
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // Business logic
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  PACKAGE_CHANGE_LIMIT: 'PACKAGE_CHANGE_LIMIT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PACKAGE_HAS_ACTIVE_SUBS: 'PACKAGE_HAS_ACTIVE_SUBS',

  // External services
  COA_FAILED: 'COA_FAILED',
  TRIPAY_ERROR: 'TRIPAY_ERROR',
  ACS_ERROR: 'ACS_ERROR',
  NAS_UNREACHABLE: 'NAS_UNREACHABLE',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
});

module.exports = {
  CUSTOMER_STATUS,
  CUSTOMER_STATUS_TRANSITIONS,
  INVOICE_STATUS,
  PAYMENT_METHOD,
  ASSET_STATUS,
  ASSET_CATEGORY,
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_SOURCE,
  TICKET_JOURNAL_STATUS,
  TICKET_RESOLUTION_TYPE,
  REMOTE_FIX_ACTION,
  USER_ROLE,
  NAS_POLL_STATUS,
  COA_TRIGGER_TYPE,
  COA_RESPONSE_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  PACKAGE_STATUS,
  BRANCH_STATUS,
  DOWN_PAYMENT_STATUS,
  PACKAGE_CHANGE_STATUS,
  TOOL_LENDING_STATUS,
  DIRECT_SALE_PAYMENT_METHOD,
  DIRECT_SALE_PAYMENT_STATUS,
  STOCK_OPNAME_STATUS,
  ASSET_TRANSFER_STATUS,
  ASSET_TRANSFER_TYPE,
  OVERTIME_STATUS,
  PAYROLL_STATUS,
  CAPEX_PROJECT_STATUS,
  CAPEX_PROJECT_STATUS_TRANSITIONS,
  REGULAR_WORK_HOURS,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  NOTIFICATION_ENTITY_TYPE,
  SYSTEM_SETTING_KEY,
  ERROR_CODE,
};
