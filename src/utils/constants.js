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

// Branch statuses
const BRANCH_STATUS = Object.freeze({
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
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
  USER_ROLE,
  NAS_POLL_STATUS,
  COA_TRIGGER_TYPE,
  COA_RESPONSE_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  BRANCH_STATUS,
  ERROR_CODE,
};
