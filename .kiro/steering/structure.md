# Project Structure

```
src/
├── app.js                    # Express app setup, middleware registration, route mounting
├── server.js                 # Server bootstrap, DB connection test, graceful shutdown
├── config/
│   ├── index.js              # Aggregated config exports
│   ├── database.js           # Dual MySQL connection pools (appPool + radiusPool)
│   ├── auth.js               # JWT secret, expiry, refresh token config
│   ├── tripay.js             # Tripay API credentials and endpoints
│   ├── whatsapp.js           # WhatsApp gateway config
│   ├── acs.js                # ACS/TR-069 config
│   └── mikrotikChr.js        # Mikrotik CHR REST API connection config
├── controllers/              # HTTP request handlers — parse input, call service, format response
├── services/                 # Business logic layer — validation, orchestration, error throwing
├── models/                   # Data access layer — raw SQL queries via appPool (App DB)
├── radiusModels/             # RADIUS DB models — raw SQL queries via radiusPool
├── middleware/
│   ├── auth.js               # JWT verification → req.user = { id, role, branch_id }
│   ├── rbac.js               # authorize(...roles) middleware factory
│   ├── branchScope.js        # Injects req.branchFilter; Superadmin bypasses
│   ├── validator.js          # Joi schema validation wrapper (body, params, query)
│   └── errorHandler.js       # Global error handler, consistent error response
├── routes/                   # Route definitions — maps HTTP verbs to controller methods
├── jobs/
│   ├── index.js              # Job registry and scheduler init (node-cron)
│   ├── billingGeneration.job.js
│   └── autoIsolir.job.js
├── utils/
│   ├── constants.js          # All enums/status values (Object.freeze)
│   ├── responseHelper.js     # success(), error(), paginated(), created(), noContent()
│   ├── phoneValidator.js     # Indonesian phone number validation (+62/08)
│   ├── prorataCalc.js        # Prorata billing calculation
│   ├── pppoeGenerator.js     # PPPoE credential generation
│   ├── snGenerator.js        # Serial number auto-generation (UBG-YYYYMMDD-XXXXXX)
│   ├── gpsDistance.js        # Haversine distance calculation
│   ├── coaPacket.js          # CoA/POD radclient command builder
│   └── mikrotikScript.js     # NAS config script generator
└── tests/                    # (actually at project root: tests/)

tests/
├── helpers/
│   ├── dbMock.js             # Mock appPool and radiusPool for unit tests
│   ├── requestFactory.js     # HTTP request factories for integration tests
│   └── index.js              # Test helper aggregator
├── unit/                     # Unit tests (*.test.js)
├── integration/              # Integration tests (supertest)
└── property/                 # Property-based tests (fast-check, *.property.test.js)

migrations/                   # SQL migration files for App DB and RADIUS DB
```

## Architecture Pattern

**Layered architecture**: Routes → Controllers → Services → Models

```
HTTP Request
    ↓
Routes (middleware: authenticate → authorize → branchScope → validate)
    ↓
Controllers (thin HTTP layer: extract params, call service, format response)
    ↓
Services (business logic: validate rules, orchestrate, throw errors)
    ↓
Models (data access: raw SQL via mysql2 pools, return plain objects)
```

## Key Conventions

### File Naming
- `{domain}.{layer}.js` — e.g., `customer.controller.js`, `customer.service.js`, `customer.model.js`
- Routes: `{domain}.routes.js`
- Jobs: `{domain}.job.js`
- Tests: `{domain}.test.js` atau `{domain}.property.test.js`

### API Response Format
```javascript
// Success
{ status: 'success', message: '...', data: {...} }

// Error
{ status: 'error', message: '...', code: 'ERROR_CODE', errors: [...] }

// Paginated
{ status: 'success', message: '...', data: [...], pagination: { page, limit, totalItems, totalPages } }
```

### Error Handling Pattern
```javascript
// Di service layer — throw error dengan statusCode dan code
throw Object.assign(new Error('Descriptive message'), {
  statusCode: 400,
  code: ERROR_CODE.VALIDATION_ERROR,
});

// Di controller layer — catch dan format via responseHelper
try {
  const result = await someService.doSomething(data);
  return success(res, result, 'Operation successful.');
} catch (err) {
  const statusCode = err.statusCode || 500;
  const code = err.code || ERROR_CODE.INTERNAL_ERROR;
  return error(res, err.message, statusCode, null, code);
}
```

### Database Access
- Dua pool terpisah: `appPool` (bisnis data) dan `radiusPool` (FreeRADIUS)
- Models menggunakan `appPool.execute(sql, params)` — parameterized queries
- RADIUS models menggunakan `radiusPool.execute(sql, params)`
- Return plain objects, bukan ORM instances

### Authentication & Authorization
- JWT Bearer token → decoded ke `req.user = { id, role, branch_id }`
- RBAC: `authorize(USER_ROLE.ADMIN, USER_ROLE.SUPERADMIN)` middleware
- Branch scoping: `req.branchFilter` di-set oleh `branchScope` middleware; Superadmin bypass

### Pagination
- Query params: `?page=1&limit=20`
- Response shape: `{ data: [...], pagination: { page, limit, totalItems, totalPages } }`

### Constants & Enums
- Semua didefinisikan di `src/utils/constants.js` menggunakan `Object.freeze()`
- Import: `const { USER_ROLE, ERROR_CODE, CUSTOMER_STATUS } = require('../utils/constants')`

### Route Prefix
- Semua API routes di-prefix dengan `API_PREFIX` env var (default `/api`)
- Contoh: `GET /api/customers`, `POST /api/auth/login`
