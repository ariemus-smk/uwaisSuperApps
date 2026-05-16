# UwaisSuperApps ISP Backend - Dokumentasi API untuk Frontend

## Informasi Umum

| Item | Nilai |
|------|-------|
| Base URL | `http://localhost:{PORT}/api` |
| Port Default | Sesuai .env (PORT) |
| API Prefix | /api (konfigurasi via API_PREFIX) |
| Content-Type | application/json |
| Authentication | JWT Bearer Token |

---

## Format Response

### Success Response
```json
{
  "status": "success",
  "message": "Deskripsi operasi",
  "data": { }
}
```

### Created Response (HTTP 201)
```json
{
  "status": "success",
  "message": "Resource created successfully",
  "data": { }
}
```

### Paginated Response
```json
{
  "status": "success",
  "message": "Success",
  "data": [ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 150,
    "totalPages": 8
  }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Deskripsi error",
  "code": "ERROR_CODE",
  "errors": [
    { "field": "nama_field", "message": "pesan validasi" }
  ]
}
```

---

## Authentication

Semua endpoint (kecuali /api/auth/* dan /api/health) memerlukan header:
```
Authorization: Bearer <accessToken>
```

### POST /api/auth/login
Login dan dapatkan token.

**Request Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Login successful.",
  "data": {
    "user": { "id": 1, "username": "admin", "role": "Admin", "branch_id": 1 },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

### POST /api/auth/refresh
Refresh access token.

**Request Body:**
```json
{ "refreshToken": "string (required)" }
```

**Response:**
```json
{ "status": "success", "data": { "accessToken": "eyJhbG..." } }
```

### POST /api/auth/password-reset/request
Request password reset.

**Request Body:**
```json
{ "identifier": "username atau email (required)" }
```

### POST /api/auth/password-reset/confirm
Confirm password reset.

**Request Body:**
```json
{ "token": "string (required)", "newPassword": "string min 6 chars (required)" }
```

---

## User Roles & RBAC

| Role | Deskripsi |
|------|-----------|
| Superadmin | Akses penuh, bypass branch scoping |
| Admin | Manajemen operasional per Branch |
| Accounting | Keuangan, invoice, waiver |
| Mitra | Partner lokal, pembayaran, profit sharing |
| Sales | Input pelanggan baru, akuisisi |
| Merchant | Titik pembayaran, komisi |
| Teknisi | Instalasi, perbaikan, maintenance |
| Pelanggan | End-customer/subscriber |

### Branch Scoping
- Superadmin: bypass (melihat semua data)
- Role lain: hanya melihat data sesuai branch_id masing-masing

---

## Error Codes

| Code | HTTP | Deskripsi |
|------|------|-----------|
| AUTH_INVALID_CREDENTIALS | 401 | Username/password salah |
| AUTH_TOKEN_EXPIRED | 401 | Token expired |
| AUTH_TOKEN_INVALID | 401 | Token tidak valid |
| AUTH_UNAUTHORIZED | 401 | Tidak ada token |
| AUTH_FORBIDDEN | 403 | Role tidak punya akses |
| VALIDATION_ERROR | 400 | Input tidak valid |
| INVALID_INPUT | 400 | JSON body tidak valid |
| RESOURCE_NOT_FOUND | 404 | Resource tidak ditemukan |
| RESOURCE_ALREADY_EXISTS | 409 | Duplikat unique constraint |
| INVALID_STATUS_TRANSITION | 400 | Transisi status tidak valid |
| INSUFFICIENT_BALANCE | 400 | Saldo tidak cukup |
| INSUFFICIENT_STOCK | 400 | Stok tidak cukup |
| COA_FAILED | 500 | CoA/POD gagal |
| TRIPAY_ERROR | 500 | Payment gateway error |
| INTERNAL_ERROR | 500 | Server error |

---

## Health Check

### GET /api/health
```json
{ "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z", "environment": "development" }
```

---

## Pagination

Endpoint yang mendukung pagination menerima query params:
- `page` - Nomor halaman (default: 1)
- `limit` - Jumlah item per halaman (default: 20, max: 100)

---

## 1. User Management

> Role: **Superadmin**

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | /api/users | List users |
| GET | /api/users/:id | Get user by ID |
| POST | /api/users | Create user |
| PUT | /api/users/:id | Update user |
| PATCH | /api/users/:id/status | Activate/deactivate user |

### POST /api/users - Create User
```json
{
  "username": "string, min 3, max 50 (required)",
  "password": "string, min 6, max 100 (required)",
  "full_name": "string, min 1, max 100 (required)",
  "role": "Superadmin|Admin|Accounting|Mitra|Sales|Merchant|Teknisi|Pelanggan (required)",
  "branch_id": "number (optional, null for Superadmin)",
  "profit_sharing_pct": "number 0-100 (optional, Mitra only)",
  "commission_amount": "number (optional, Merchant only)"
}
```

### PUT /api/users/:id - Update User
```json
{
  "full_name": "string (optional)",
  "role": "string (optional)",
  "branch_id": "number|null (optional)",
  "profit_sharing_pct": "number (optional)",
  "commission_amount": "number (optional)"
}
```

### PATCH /api/users/:id/status
```json
{ "status": "Active|Inactive (required)" }
```

---

## 2. Branch Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/branches | Superadmin, Admin |
| GET | /api/branches/:id | Superadmin, Admin |
| POST | /api/branches | Superadmin |
| PUT | /api/branches/:id | Superadmin |
| PATCH | /api/branches/:id/status | Superadmin |

### POST /api/branches
```json
{
  "name": "string, min 2, max 100 (required)",
  "address": "string, min 5, max 500 (required)",
  "contact_phone": "string, min 8, max 20 (required)",
  "contact_email": "string email (required)"
}
```

### PUT /api/branches/:id
Semua field optional, minimal 1 field.

### PATCH /api/branches/:id/status
```json
{ "status": "Active|Inactive (required)" }
```

---

## 3. Package Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/packages | Semua authenticated |
| GET | /api/packages/:id | Semua authenticated |
| POST | /api/packages | Superadmin |
| PUT | /api/packages/:id | Superadmin |
| DELETE | /api/packages/:id | Superadmin |

### POST /api/packages
```json
{
  "name": "string, min 2, max 100 (required)",
  "upload_rate_limit": "number kbps (required)",
  "download_rate_limit": "number kbps (required)",
  "upload_burst_limit": "number kbps (required)",
  "download_burst_limit": "number kbps (required)",
  "upload_burst_threshold": "number kbps (required)",
  "download_burst_threshold": "number kbps (required)",
  "monthly_price": "number (required)",
  "ppn_enabled": "boolean (default: false)",
  "fup_enabled": "boolean (default: false)",
  "fup_quota_gb": "number|null (optional)",
  "fup_upload_speed": "number|null kbps (optional)",
  "fup_download_speed": "number|null kbps (optional)",
  "status": "Active|Inactive (default: Active)"
}
```

---

## 4. Customer Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/customers | Admin, Accounting, Sales, Mitra |
| GET | /api/customers/:id | Admin, Accounting, Sales, Mitra, Teknisi |
| POST | /api/customers | Admin, Sales, Mitra |
| PUT | /api/customers/:id | Admin |
| PATCH | /api/customers/:id/status | Admin |
| GET | /api/customers/:id/audit-log | Admin, Superadmin |

### Query Params (GET /api/customers)
- `lifecycle_status`: Prospek|Instalasi|Aktif|Isolir|Terminated
- `search`: string (cari nama/KTP)
- `page`, `limit`

### POST /api/customers
```json
{
  "full_name": "string, min 2, max 200 (required)",
  "ktp_number": "string, exactly 16 chars (required)",
  "npwp_number": "string, max 20 (optional)",
  "whatsapp_number": "string, min 10, max 15 (required)",
  "email": "string email (optional)",
  "address": "string, min 5, max 500 (required)",
  "latitude": "number -90 to 90 (optional)",
  "longitude": "number -180 to 180 (optional)",
  "branch_id": "number (optional)"
}
```

### PATCH /api/customers/:id/status
```json
{ "status": "Prospek|Instalasi|Aktif|Isolir|Terminated (required)" }
```

**Valid Transitions:**
- Prospek -> Instalasi
- Instalasi -> Aktif
- Aktif -> Isolir, Terminated
- Isolir -> Aktif, Terminated
- Terminated -> (tidak bisa berubah)

---

## 5. Subscription Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/subscriptions | Admin, Superadmin |
| GET | /api/subscriptions/:id | Admin, Superadmin, Teknisi |
| POST | /api/subscriptions | Admin, Superadmin |
| PUT | /api/subscriptions/:id | Admin, Superadmin |
| POST | /api/subscriptions/:id/activate | Admin, Superadmin |
| POST | /api/subscriptions/:id/installation | Teknisi, Admin, Superadmin |

### Query Params (GET /api/subscriptions)
- `customer_id`: number
- `status`: Pending|Active|Suspended|Terminated
- `search`: string
- `page`, `limit`

### POST /api/subscriptions
```json
{
  "customer_id": "number (required)",
  "package_id": "number (required)",
  "nas_id": "number (required)"
}
```

### POST /api/subscriptions/:id/installation (Teknisi)
```json
{
  "odp_id": "number|null",
  "odp_port": "number|null",
  "onu_serial_number": "string|null",
  "onu_mac_address": "string|null",
  "install_latitude": "number|null",
  "install_longitude": "number|null"
}
```

---

## 6. Billing & Invoice

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/billing/invoices | Admin, Accounting, Mitra |
| GET | /api/billing/invoices/:id | Admin, Accounting, Mitra, Pelanggan |
| POST | /api/billing/invoices/:id/waive | Accounting |
| GET | /api/billing/dp | Admin, Sales |
| POST | /api/billing/dp | Admin, Sales |

### Query Params (GET /api/billing/invoices)
- `customer_id`: number
- `subscription_id`: number
- `status`: UNPAID|LUNAS|WAIVED|CANCELLED
- `billing_period`: YYYY-MM
- `page`, `limit`

### POST /api/billing/invoices/:id/waive
```json
{ "reason": "string, min 3, max 500 (required)" }
```

### POST /api/billing/dp (Down Payment)
```json
{
  "customer_id": "number (required)",
  "amount": "number (required)",
  "payment_date": "YYYY-MM-DD (required)"
}
```

---

## 7. Payment

| Method | Endpoint | Role |
|--------|----------|------|
| POST | /api/payments/tripay/create | Pelanggan, Admin |
| POST | /api/payments/tripay/callback | Public (webhook) |
| POST | /api/payments/mitra | Mitra |
| POST | /api/payments/merchant | Merchant |
| POST | /api/payments/mitra/topup | Mitra |
| POST | /api/payments/merchant/topup | Merchant |
| GET | /api/payments/mitra/balance | Mitra |
| GET | /api/payments/merchant/balance | Merchant |

### POST /api/payments/tripay/create
```json
{
  "invoice_id": "number (required)",
  "payment_method": "string - VA|QRIS|Minimarket (required)"
}
```

### POST /api/payments/mitra
```json
{ "invoice_id": "number (required)" }
```

### POST /api/payments/mitra/topup
```json
{
  "amount": "number (required)",
  "reference": "string (required)"
}
```

---

## 8. CoA/POD Engine (Network Control)

| Method | Endpoint | Role |
|--------|----------|------|
| POST | /api/coa/kick | Admin |
| POST | /api/coa/speed-change | Admin |
| POST | /api/coa/isolir | Admin |
| POST | /api/coa/unisolir | Admin |
| GET | /api/coa/logs | Admin, Superadmin |

### POST /api/coa/kick
```json
{
  "subscription_id": "number (required)",
  "nas_id": "number (required)",
  "username": "string PPPoE username (required)"
}
```

### POST /api/coa/speed-change
```json
{
  "subscription_id": "number (required)",
  "nas_id": "number (required)",
  "username": "string (required)",
  "rateLimit": "string e.g. '10M/20M' (required)"
}
```

### POST /api/coa/isolir | /api/coa/unisolir
```json
{
  "subscription_id": "number (required)",
  "nas_id": "number (required)",
  "username": "string (required)"
}
```

### Query Params (GET /api/coa/logs)
- `subscription_id`: number
- `nas_id`: number
- `trigger_type`: SpeedChange|Isolir|Unisolir|FUP|Kick
- `response_status`: ACK|NAK|Timeout|Pending
- `from_date`, `to_date`: YYYY-MM-DD
- `page`, `limit`

---

## 9. NAS Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/nas | Superadmin, Admin |
| GET | /api/nas/monitoring | Admin, Superadmin |
| GET | /api/nas/:id | Superadmin, Admin |
| POST | /api/nas | Superadmin |
| PUT | /api/nas/:id | Superadmin |
| GET | /api/nas/:id/script | Superadmin |
| POST | /api/nas/:id/test | Superadmin |

### POST /api/nas
```json
{
  "name": "string (required)",
  "ip_address": "IPv4 (required)",
  "radius_secret": "string, min 6 (required)",
  "api_port": "number (default: 8728)",
  "branch_id": "number (required)"
}
```

### Query Params (GET /api/nas)
- `branch_id`: number
- `status`: Active|Inactive
- `poll_status`: Up|Down
- `page`, `limit`

---

## 10. VPN CHR Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/vpn-chr/status | Superadmin, Admin |
| GET | /api/vpn-chr/secrets | Superadmin, Admin |
| POST | /api/vpn-chr/secrets | Superadmin |
| DELETE | /api/vpn-chr/secrets/:id | Superadmin |
| GET | /api/vpn-chr/active-connections | Superadmin, Admin |
| POST | /api/vpn-chr/profiles | Superadmin |
| GET | /api/vpn-chr/profiles | Superadmin, Admin |
| GET | /api/vpn-chr/ip-pools | Superadmin, Admin |
| POST | /api/vpn-chr/ip-pools | Superadmin |
| POST | /api/vpn-chr/disconnect/:id | Superadmin, Admin |

### POST /api/vpn-chr/secrets
```json
{
  "name": "string (required)",
  "password": "string, min 6 (required)",
  "service": "pptp|l2tp|sstp|ovpn (required)",
  "profile": "string (default: 'default')"
}
```

### POST /api/vpn-chr/profiles
```json
{
  "name": "string (required)",
  "local_address": "IPv4 (optional)",
  "remote_address": "string (optional)",
  "rate_limit": "string (optional)"
}
```

### POST /api/vpn-chr/ip-pools
```json
{
  "name": "string (required)",
  "ranges": "string e.g. '10.0.0.2-10.0.0.254' (required)"
}
```

---

## 11. Infrastructure (OLT, ODP, Coverage)

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/infrastructure/olts | Admin, Superadmin, Teknisi, Sales |
| POST | /api/infrastructure/olts | Superadmin |
| PUT | /api/infrastructure/olts/:id | Superadmin |
| POST | /api/infrastructure/olts/:id/test | Superadmin |
| GET | /api/infrastructure/odps | Admin, Superadmin, Teknisi, Sales |
| POST | /api/infrastructure/odps | Admin, Superadmin, Teknisi |
| PUT | /api/infrastructure/odps/:id | Admin, Superadmin |
| GET | /api/infrastructure/coverage | Sales, Mitra, Teknisi, Admin, Superadmin |

### POST /api/infrastructure/olts
```json
{
  "name": "string (required)",
  "ip_address": "IPv4 (required)",
  "total_pon_ports": "number 1-128 (required)",
  "branch_id": "number (required)"
}
```

### POST /api/infrastructure/odps
```json
{
  "name": "string (required)",
  "latitude": "number (required)",
  "longitude": "number (required)",
  "total_ports": "number 1-256 (required)",
  "olt_id": "number (required)",
  "olt_pon_port": "number 1-128 (required)",
  "branch_id": "number (required)"
}
```

### GET /api/infrastructure/coverage
Query params:
- `latitude`: number (required)
- `longitude`: number (required)
- `radius_meters`: number (optional, max 50000)

---

## 12. Package Change (Upgrade/Downgrade)

| Method | Endpoint | Role |
|--------|----------|------|
| POST | /api/package-change/request | Pelanggan, Sales, Mitra |
| GET | /api/package-change | Admin |
| PATCH | /api/package-change/:id/approve | Admin |
| PATCH | /api/package-change/:id/reject | Admin |

### POST /api/package-change/request
```json
{
  "subscription_id": "number (required)",
  "requested_package_id": "number (required)"
}
```

### PATCH /api/package-change/:id/reject
```json
{ "reason": "string, min 3, max 500 (required)" }
```

### Query Params (GET /api/package-change)
- `status`: Pending|Approved|Rejected
- `subscription_id`: number
- `page`, `limit`

---

## 13. Asset & Inventory Management

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/assets | Admin, Teknisi |
| POST | /api/assets/inbound | Admin |
| POST | /api/assets/outbound | Admin |
| POST | /api/assets/outbound/request | Teknisi |
| POST | /api/assets/return | Teknisi |
| POST | /api/assets/transfer | Admin |
| POST | /api/assets/transfer/:id/confirm | Admin |
| POST | /api/assets/transfer/:id/return | Admin |
| POST | /api/assets/tools/borrow | Teknisi |
| POST | /api/assets/tools/:id/approve | Admin |
| POST | /api/assets/tools/:id/return | Teknisi |
| GET | /api/assets/tools/borrowed | Admin |
| POST | /api/assets/direct-sale | Admin, Sales |
| POST | /api/assets/stock-opname | Admin |
| PUT | /api/assets/stock-opname/:id | Admin |
| POST | /api/assets/stock-opname/:id/finalize | Admin |

### Query Params (GET /api/assets)
- `branch_id`: number
- `category`: PerangkatAktif|Kabel|Aksesoris
- `status`: Tersedia|Dipinjam|Terpasang|Rusak|DalamPengiriman|DibawaTeknisi
- `page`, `limit`

### POST /api/assets/inbound
```json
{
  "invoice_number": "string (required)",
  "purchase_date": "YYYY-MM-DD (required)",
  "invoice_file_url": "URL (optional)",
  "supplier_name": "string (required)",
  "branch_id": "number (required)",
  "items": [
    {
      "product_name": "string (required)",
      "brand_model": "string (optional)",
      "category": "PerangkatAktif|Kabel|Aksesoris (required)",
      "serial_number": "string (optional)",
      "mac_address": "string (optional)",
      "quantity": "number (optional)"
    }
  ]
}
```

### POST /api/assets/transfer
```json
{
  "source_branch_id": "number (required)",
  "destination_branch_id": "number (required)",
  "items": [
    { "asset_id": "number (required)", "serial_number": "string (optional)" }
  ]
}
```

### POST /api/assets/tools/borrow
```json
{
  "asset_id": "number (required)",
  "branch_id": "number (required)",
  "borrow_date": "YYYY-MM-DD (required)",
  "expected_return_date": "YYYY-MM-DD (required)"
}
```

### POST /api/assets/direct-sale
```json
{
  "customer_id": "number (required)",
  "branch_id": "number (required)",
  "payment_method": "Cash|Hutang (required)",
  "total_amount": "number (required)",
  "items": [
    { "asset_id": "number (required)", "serial_number": "string (optional)", "quantity": "number (optional)" }
  ]
}
```

---

## 14. Helpdesk Ticketing

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/tickets | Admin, Teknisi |
| GET | /api/tickets/reports | Admin, Superadmin |
| GET | /api/tickets/:id | Admin, Teknisi, Pelanggan |
| POST | /api/tickets | Admin, Teknisi, Pelanggan |
| PATCH | /api/tickets/:id/assign | Admin |
| PATCH | /api/tickets/:id/progress | Teknisi |
| PATCH | /api/tickets/:id/resolve | Admin |
| PATCH | /api/tickets/:id/close | Admin |
| POST | /api/tickets/:id/journal | Teknisi |
| POST | /api/tickets/:id/overtime | Admin |
| PATCH | /api/tickets/:id/overtime/approve | Superadmin, Admin |
| POST | /api/tickets/:id/remote-fix | Admin |

### Query Params (GET /api/tickets)
- `status`: Open|InProgress|Pending|Resolved|Closed
- `priority`: VIP|High|Normal|Low
- `assigned_teknisi_id`: number
- `customer_id`: number
- `search`: string
- `page`, `limit`

### POST /api/tickets
```json
{
  "customer_id": "number (required)",
  "subscription_id": "number|null (optional)",
  "issue_description": "string, max 2000 (required)",
  "source": "Pelanggan|Teknisi|Admin (required)"
}
```

### PATCH /api/tickets/:id/assign
```json
{ "teknisi_id": "number (required)" }
```

### PATCH /api/tickets/:id/progress (Teknisi)
```json
{
  "description": "string (required)",
  "photo_urls": ["URL array (optional)"],
  "progress_status": "Selesai|BelumSelesai|Progress (required)",
  "latitude": "number (optional)",
  "longitude": "number (optional)"
}
```

### PATCH /api/tickets/:id/resolve
```json
{
  "resolution_type": "RemoteFix|FieldFix (optional)",
  "damage_classification": "string (optional)"
}
```

### POST /api/tickets/:id/remote-fix
```json
{
  "action": "DeviceReboot|SSIDChange|WiFiPasswordChange|SessionKick|CoASpeedChange|CoAIsolir|CoAUnisolir (required)",
  "params": "object (optional)"
}
```

### POST /api/tickets/:id/overtime
```json
{
  "teknisi_id": "number (required)",
  "dispatch_time": "ISO date string (optional)"
}
```

### PATCH /api/tickets/:id/overtime/approve
```json
{
  "approved_hours": "number (optional)",
  "compensation_amount": "number (optional)"
}
```

---

## 15. ACS / TR-069 (Remote Device Management)

| Method | Endpoint | Role |
|--------|----------|------|
| POST | /api/acs/:subscriptionId/reboot | Admin, Superadmin |
| POST | /api/acs/:subscriptionId/wifi | Admin, Superadmin, Pelanggan |
| POST | /api/acs/:subscriptionId/firmware | Admin, Superadmin |
| GET | /api/acs/:subscriptionId/status | Admin, Superadmin |

### POST /api/acs/:subscriptionId/wifi
```json
{
  "ssid": "string, max 32 (optional, at least one required)",
  "password": "string, min 8, max 63 (optional, at least one required)"
}
```

### POST /api/acs/:subscriptionId/firmware
```json
{ "firmware_url": "URL (optional)" }
```

---

## 16. Notification

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/notifications/queue | Admin, Superadmin |
| POST | /api/notifications/broadcast | Admin, Superadmin |

### Query Params (GET /api/notifications/queue)
- `status`: Queued|Sent|Failed
- `channel`: WhatsApp|Email|PushNotification
- `related_entity_type`: string
- `related_entity_id`: number
- `page`, `limit`

### POST /api/notifications/broadcast
```json
{
  "recipients": ["08123456789", "08987654321"],
  "template_name": "string (required)",
  "parameters": "object (optional)",
  "channel": "WhatsApp|Email|PushNotification (optional)"
}
```

---

## 17. Scheduler (Job Management)

> Role: **Superadmin**

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | /api/scheduler/jobs | List registered jobs |
| GET | /api/scheduler/logs | Job execution history |
| POST | /api/scheduler/jobs/:name/run | Manually trigger job |

### Query Params (GET /api/scheduler/logs)
- `job_name`: string
- `status`: Running|Success|Partial|Failed
- `from_date`, `to_date`: YYYY-MM-DD
- `page`, `limit`

---

## 18. KPI

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/kpi/scores | Superadmin, Admin |
| GET | /api/kpi/history/:userId | Superadmin, Admin |

### Query Params (GET /api/kpi/scores)
- `period`: YYYY-MM
- `role_type`: Sales|Teknisi
- `user_id`: number
- `reward_eligible`: true|false
- `page`, `limit`

### Query Params (GET /api/kpi/history/:userId)
- `period_from`: YYYY-MM
- `period_to`: YYYY-MM
- `page`, `limit`

---

## 19. Payroll

> Role: **Superadmin** (kecuali slips: Superadmin, Admin)

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/payroll/reports | Superadmin |
| POST | /api/payroll/reports/generate | Superadmin |
| PATCH | /api/payroll/reports/:id/approve | Superadmin |
| PATCH | /api/payroll/reports/:id/revise | Superadmin |
| GET | /api/payroll/slips/:userId | Superadmin, Admin |

### Query Params (GET /api/payroll/reports)
- `period`: YYYY-MM
- `status`: Draft|PendingApproval|Approved|Revised
- `page`, `limit`

### POST /api/payroll/reports/generate
```json
{ "period": "YYYY-MM (required)" }
```

---

## 20. CAPEX (Expansion Projects)

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/capex/projects | Superadmin, Admin |
| GET | /api/capex/projects/:id | Superadmin, Admin |
| POST | /api/capex/projects | Admin |
| PUT | /api/capex/projects/:id | Admin |
| PATCH | /api/capex/projects/:id/submit | Admin |
| PATCH | /api/capex/projects/:id/approve | Superadmin |
| PATCH | /api/capex/projects/:id/reject | Superadmin |

### POST /api/capex/projects
```json
{
  "project_name": "string, min 3 (required)",
  "target_area": "string, min 3 (required)",
  "target_customer_count": "number (required)",
  "materials_list": [
    {
      "product_name": "string (required)",
      "category": "PerangkatAktif|Kabel|Aksesoris (optional)",
      "quantity": "number (required)",
      "unit_price": "number (optional)"
    }
  ]
}
```

### PATCH /api/capex/projects/:id/reject
```json
{ "revision_notes": "string (optional)" }
```

**Status Flow:** Draft -> PendingApproval -> Approved -> InProgress -> Completed
(Rejected bisa kembali ke Draft untuk revisi)

---

## 21. Reports

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/reports/komdigi/packages | Superadmin, Admin |
| GET | /api/reports/komdigi/customers | Superadmin, Admin |
| GET | /api/reports/komdigi/revenue | Superadmin, Admin |
| GET | /api/reports/financial | Accounting, Superadmin |
| GET | /api/reports/growth | Superadmin, Admin, Sales |
| GET | /api/reports/export/:type | Superadmin, Admin, Accounting, Sales |

Export type menghasilkan file Excel/PDF.

---

## 22. Self-Service Portal (Pelanggan)

> Role: **Pelanggan** only

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | /api/selfservice/profile | Lihat profil sendiri |
| GET | /api/selfservice/subscriptions | Lihat langganan sendiri |
| GET | /api/selfservice/billing | Lihat tagihan sendiri |
| GET | /api/selfservice/payments | Lihat riwayat pembayaran |
| GET | /api/selfservice/tickets | Lihat tiket sendiri |
| POST | /api/selfservice/tickets | Buat tiket baru |
| POST | /api/selfservice/wifi | Ubah WiFi SSID/password |
| POST | /api/selfservice/package-change | Request upgrade/downgrade |

### POST /api/selfservice/tickets
```json
{
  "subscription_id": "number|null (optional)",
  "issue_description": "string, max 2000 (required)"
}
```

### POST /api/selfservice/wifi
```json
{
  "subscription_id": "number (required)",
  "ssid": "string, max 32 (optional, at least one)",
  "password": "string, min 8, max 63 (optional, at least one)"
}
```

### POST /api/selfservice/package-change
```json
{
  "subscription_id": "number (required)",
  "requested_package_id": "number (required)"
}
```

---

## 23. Work Journal (Teknisi)

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/work-journals | Admin, Superadmin |
| GET | /api/work-journals/my | Teknisi |
| GET | /api/work-journals/:id | Admin, Superadmin, Teknisi |
| POST | /api/work-journals | Teknisi |
| PUT | /api/work-journals/:id | Teknisi (own only) |
| DELETE | /api/work-journals/:id | Teknisi (own only) |

### POST /api/work-journals
```json
{
  "ticket_id": "number|null (optional)",
  "journal_date": "YYYY-MM-DD (required)",
  "activity_description": "string, max 5000 (required)",
  "photo_urls": ["URL array (optional)"],
  "latitude": "number (optional)",
  "longitude": "number (optional)"
}
```

### Query Params (GET /api/work-journals)
- `teknisi_id`: number
- `start_date`, `end_date`: YYYY-MM-DD
- `ticket_id`: number
- `page`, `limit`

---

## 24. Administrative Regions

| Method | Endpoint | Role |
|--------|----------|------|
| GET | /api/regions | Admin, Superadmin, Teknisi, Sales, Pelanggan, Mitra |
| GET | /api/regions/:id | Admin, Superadmin, Teknisi, Sales, Pelanggan, Mitra |
| POST | /api/regions/import | **Superadmin** |
| POST | /api/regions | **Superadmin** |
| PUT | /api/regions/:id | **Superadmin** |
| DELETE | /api/regions/:id | **Superadmin** |

### GET /api/regions
Query params (optional):
- `region_type`: `Provinsi` \| `Kabupaten` \| `Kecamatan` \| `Desa`
- `region_ref`: number (ID of parent region)
- `page`, `limit`

### POST /api/regions/import
Bulk upload regions from a parsed CSV list. Resolves hierarchy dynamically based on `parent_name`.
Request body:
```json
{
  "regions": [
    {
      "region_name": "Kalimantan Barat",
      "region_type": "Provinsi",
      "parent_name": ""
    },
    {
      "region_name": "Kota Pontianak",
      "region_type": "Kabupaten",
      "parent_name": "Kalimantan Barat"
    }
  ]
}
```

### POST /api/regions
```json
{
  "region_name": "string (required, min 2, max 100)",
  "region_type": "Provinsi|Kabupaten|Kecamatan|Desa (required)",
  "region_ref": "number|null (optional - required for Kabupaten, Kecamatan, Desa)"
}
```

### PUT /api/regions/:id
```json
{
  "region_name": "string (optional, min 2, max 100)",
  "region_type": "Provinsi|Kabupaten|Kecamatan|Desa (optional)",
  "region_ref": "number|null (optional)"
}
```

#### Hierarchical Validation Rules:
- **Provinsi:** `region_ref` must be null or omitted.
- **Kabupaten:** `region_ref` must point to an existing region of type `Provinsi`.
- **Kecamatan:** `region_ref` must point to an existing region of type `Kabupaten`.
- **Desa:** `region_ref` must point to an existing region of type `Kecamatan`.
- **Self-Reference Protection:** A region cannot have its own ID as its parent reference.
- **Delete Protection:** A region cannot be deleted if other regions use it as its parent reference.

---

## Enums & Constants Reference

### Customer Lifecycle Status
`Prospek` | `Instalasi` | `Aktif` | `Isolir` | `Terminated`

### Subscription Status
`Pending` | `Active` | `Suspended` | `Terminated`

### Invoice Status
`UNPAID` | `LUNAS` | `WAIVED` | `CANCELLED`

### Payment Status
`Pending` | `Success` | `Failed` | `Expired`

### Ticket Status
`Open` | `InProgress` | `Pending` | `Resolved` | `Closed`

### Ticket Priority
`VIP` | `High` | `Normal` | `Low`

### Asset Status
`Tersedia` | `Dipinjam` | `Terpasang` | `Rusak` | `DalamPengiriman` | `DibawaTeknisi`

### Asset Category
`PerangkatAktif` | `Kabel` | `Aksesoris`

### CAPEX Project Status
`Draft` | `PendingApproval` | `Approved` | `Rejected` | `InProgress` | `Completed`

### Notification Channel
`WhatsApp` | `Email` | `PushNotification`

### CoA Trigger Type
`SpeedChange` | `Isolir` | `Unisolir` | `FUP` | `Kick`

---

## Tips untuk Frontend Developer

### 1. Token Management
- Simpan `accessToken` dan `refreshToken` di secure storage
- Gunakan interceptor untuk auto-refresh saat mendapat 401 (AUTH_TOKEN_EXPIRED)
- Jangan simpan token di localStorage untuk production

### 2. Error Handling
- Selalu cek `response.status` === 'error'
- Tampilkan `response.errors[]` untuk validation error (field-level)
- Handle 401 dengan redirect ke login
- Handle 403 dengan pesan "tidak punya akses"

### 3. Pagination
- Default limit: 20, max: 100
- Gunakan `pagination.totalPages` untuk navigasi halaman
- Kirim `page` dan `limit` sebagai query params

### 4. Branch Scoping
- Data otomatis difilter berdasarkan branch user yang login
- Superadmin melihat semua data
- Tidak perlu kirim branch_id untuk filtering (otomatis dari token)

### 5. Role-Based UI
- Tampilkan menu/fitur sesuai role user dari response login
- Gunakan `user.role` untuk conditional rendering
- Semua role tersedia di response login: `data.user.role`

### 6. Date Format
- Kirim tanggal dalam format: `YYYY-MM-DD`
- Billing period: `YYYY-MM`
- Timestamp dari server: ISO 8601 (`2025-01-01T00:00:00.000Z`)
