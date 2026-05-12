# Tech Stack

## Runtime & Language
- Node.js with CommonJS modules (`require`/`module.exports`)
- JavaScript (no TypeScript)

## Framework & Core Libraries
| Package | Version | Fungsi |
|---------|---------|--------|
| express | ^4.21.2 | HTTP framework |
| mysql2 | ^3.12.0 | MySQL connection pools (App DB + RADIUS DB) |
| jsonwebtoken | ^9.0.2 | JWT authentication (Bearer tokens) |
| bcryptjs | ^2.4.3 | Password hashing |
| joi | ^17.13.3 | Request validation schemas |
| helmet | ^8.0.0 | Security headers |
| cors | ^2.8.5 | Cross-origin resource sharing |
| morgan | ^1.10.0 | HTTP request logging |
| axios | ^1.16.0 | External HTTP calls (Tripay, Mikrotik CHR REST API) |
| node-cron | ^3.0.3 | Scheduled tasks (billing, auto-isolir, NAS polling) |
| ssh2 | ^1.17.0 | SSH connections (FreeRADIUS radclient execution) |
| uuid | ^11.1.0 | Unique ID generation |
| dotenv | ^16.4.7 | Environment variable loading |

## Dev Dependencies
| Package | Version | Fungsi |
|---------|---------|--------|
| jest | ^29.7.0 | Test runner |
| supertest | ^7.0.0 | HTTP integration testing |
| fast-check | ^3.23.2 | Property-based testing |
| eslint | ^8.57.1 | Linting |
| nodemon | ^3.1.9 | Dev auto-reload |

## Databases
- **App DB** (MySQL): Business data — customers, invoices, users, branches, assets, tickets, dll.
- **RADIUS DB** (MySQL): FreeRADIUS tables — radcheck, radreply, radacct, radusergroup, nas

## External Integrations
- **Tripay**: Payment gateway (VA, QRIS, Minimarket) — via REST API + HMAC callback verification
- **FreeRADIUS**: AAA server — CoA/POD via SSH + radclient
- **Mikrotik CHR**: VPN concentrator — RouterOS 7 REST API (HTTPS + basic auth)
- **ACS Server**: TR-069 device management — REST API proxy
- **WhatsApp Gateway**: Notification delivery — REST API

## Common Commands

```bash
# Start production server
npm start

# Start development server (with auto-reload)
npm run dev

# Run all tests with coverage
npm test

# Run specific test file
npm test -- --testPathPattern="customer.service"

# Run property tests only
npm test -- --testPathPattern="property"

# Run linter
npm run lint
```

## Environment Configuration

Semua config via `.env` file (lihat `.env.example`). Key groups:

| Group | Env Vars | Deskripsi |
|-------|----------|-----------|
| Server | `PORT`, `NODE_ENV`, `API_PREFIX` | Server config |
| App DB | `APP_DB_HOST`, `APP_DB_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_DB_NAME`, `APP_DB_CONNECTION_LIMIT` | Application database |
| RADIUS DB | `RADIUS_DB_HOST`, `RADIUS_DB_PORT`, `RADIUS_DB_USER`, `RADIUS_DB_PASSWORD`, `RADIUS_DB_NAME`, `RADIUS_DB_CONNECTION_LIMIT` | FreeRADIUS database |
| JWT | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Authentication |
| Tripay | `TRIPAY_API_URL`, `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE`, `TRIPAY_CALLBACK_URL` | Payment gateway |
| WhatsApp | `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_SENDER_NUMBER` | Notification |
| ACS | `ACS_API_URL`, `ACS_API_USERNAME`, `ACS_API_PASSWORD` | TR-069 |
| FreeRADIUS | `FREERADIUS_SSH_HOST`, `FREERADIUS_SSH_PORT`, `FREERADIUS_SSH_USERNAME`, `FREERADIUS_SSH_PRIVATE_KEY_PATH` | CoA/POD execution |
| VPN CHR | `VPN_CHR_HOST`, `VPN_CHR_PORT`, `VPN_CHR_USERNAME`, `VPN_CHR_PASSWORD`, `VPN_CHR_USE_SSL` | Mikrotik CHR REST API |
| VPN Ports | `VPN_PPTP_PORT`, `VPN_L2TP_PORT`, `VPN_SSTP_PORT`, `VPN_OVPN_PORT` | VPN service ports |
| Cron | `BILLING_CRON`, `ISOLIR_CRON`, `NAS_POLL_CRON`, `FUP_CHECK_CRON`, `KPI_CRON`, `NOTIF_BROADCAST_CRON` | Job schedules |
| CoA | `COA_TIMEOUT_MS`, `COA_MAX_RETRIES` | CoA retry config |
| Coverage | `COVERAGE_RADIUS_METERS` | ODP coverage radius |

## Testing Strategy

- **Unit tests** (`tests/unit/`): Mock database pools via `tests/helpers/dbMock.js`, test service logic in isolation
- **Property tests** (`tests/property/`): fast-check generators, test invariants (lifecycle transitions, billing calculations, RBAC enforcement)
- **Integration tests** (`tests/integration/`): supertest against Express app with mocked DB
- **DB mocking pattern**: `jest.mock('../../src/config/database')` → import `{ appPool, radiusPool, resetMocks }` from helpers
- **Coverage**: Jest with `--coverage` flag, output di `coverage/` directory
