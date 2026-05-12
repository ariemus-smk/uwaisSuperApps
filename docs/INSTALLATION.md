# UwaisSuperApps ISP Backend - Panduan Instalasi

## Prasyarat

Pastikan sistem sudah terinstall:

| Software | Versi Minimum | Keterangan |
|----------|---------------|------------|
| Node.js | v18.x | Runtime JavaScript |
| npm | v9.x | Package manager (bundled with Node.js) |
| MySQL | v8.0 | Database server |

### Opsional (untuk fitur lengkap)
| Software | Keterangan |
|----------|------------|
| FreeRADIUS | AAA server untuk autentikasi PPPoE |
| Mikrotik CHR | VPN concentrator (RouterOS 7) |
| ACS Server | TR-069 device management |

---

## Langkah Instalasi

### 1. Clone Repository

```bash
git clone git@github.com:ariemus-smk/uwaisSuperApps.git UwaisApps
cd UwaisApps
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Konfigurasi Environment

Copy file environment example dan sesuaikan:

```bash
cp .env.example .env
```

Edit file `.env` dan isi konfigurasi yang diperlukan:

```bash
# Buka dengan editor favorit
nano .env
# atau
code .env
```

#### Konfigurasi Wajib (Minimum)

```env
# Server
NODE_ENV=development
PORT=3000
API_PREFIX=/api

# Application Database
APP_DB_HOST=localhost
APP_DB_PORT=3306
APP_DB_USER=uwais_app
APP_DB_PASSWORD=password_anda
APP_DB_NAME=uwais_app

# RADIUS Database
RADIUS_DB_HOST=localhost
RADIUS_DB_PORT=3306
RADIUS_DB_USER=radius
RADIUS_DB_PASSWORD=password_radius
RADIUS_DB_NAME=radius

# JWT (generate random string untuk secret)
JWT_SECRET=random-secret-string-minimal-32-karakter
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=random-refresh-secret-string-berbeda
JWT_REFRESH_EXPIRES_IN=7d
```

#### Konfigurasi Opsional

| Group | Kapan Diperlukan |
|-------|-----------------|
| Tripay | Saat mengaktifkan payment gateway |
| WhatsApp | Saat mengaktifkan notifikasi WA |
| ACS | Saat menggunakan remote device management (TR-069) |
| FreeRADIUS SSH | Saat menggunakan CoA/POD |
| VPN CHR | Saat menggunakan VPN management |

### 4. Buat Database

Login ke MySQL dan buat 2 database:

```sql
CREATE DATABASE uwais_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE radius CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Buat user untuk App DB
CREATE USER 'uwais_app'@'localhost' IDENTIFIED BY 'password_anda';
GRANT ALL PRIVILEGES ON uwais_app.* TO 'uwais_app'@'localhost';

-- Buat user untuk RADIUS DB
CREATE USER 'radius'@'localhost' IDENTIFIED BY 'password_radius';
GRANT ALL PRIVILEGES ON radius.* TO 'radius'@'localhost';

FLUSH PRIVILEGES;
```

### 5. Jalankan Migrasi Database

```bash
npm run migrate
```

Output yang diharapkan:
```
============================================================
 UwaisSuperApps - Database Migration Runner
============================================================

[INFO] Found 3 migration file(s):
  - 001_create_app_db_tables.sql
  - 002_create_radius_db_tables.sql
  - 010_create_teknisi_resolution_metrics.sql

[INFO] Testing database connections...
  [OK] App DB connected.
  [OK] RADIUS DB connected.

[MIGRATE] Running 001_create_app_db_tables.sql against App DB...
  [OK] 37 statements executed successfully.
[MIGRATE] Running 002_create_radius_db_tables.sql against RADIUS DB...
  [OK] 7 statements executed successfully.
[MIGRATE] Running 010_create_teknisi_resolution_metrics.sql against App DB...
  [OK] 2 statements executed successfully.

------------------------------------------------------------
[RESULT] Migrations complete: 3 succeeded, 0 failed.
```

### 6. Jalankan Seeder (Data Awal)

```bash
npm run seed
```

Seeder akan membuat:
- **Branch default**: "Pusat"
- **User Superadmin**:
  - Username: `superadmin`
  - Password: `SuperAdmin@123`
- **System settings** default

> **PENTING**: Segera ganti password Superadmin setelah login pertama!

### 7. Jalankan Server

#### Development (auto-reload)
```bash
npm run dev
```

#### Production
```bash
npm start
```

### 8. Verifikasi Instalasi

Buka browser atau gunakan curl:

```bash
curl http://localhost:3000/api/health
```

Response yang diharapkan:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "environment": "development"
}
```

### 9. Test Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "SuperAdmin@123"}'
```

Response yang diharapkan:
```json
{
  "status": "success",
  "message": "Login successful.",
  "data": {
    "user": { "id": 1, "username": "superadmin", "role": "Superadmin" },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

---

## Ringkasan Perintah

| Perintah | Fungsi |
|----------|--------|
| `npm install` | Install dependencies |
| `npm run migrate` | Jalankan migrasi database |
| `npm run seed` | Insert data awal (Superadmin, branch, settings) |
| `npm run dev` | Jalankan server development (auto-reload) |
| `npm start` | Jalankan server production |
| `npm test` | Jalankan test suite dengan coverage |
| `npm run lint` | Jalankan linter |

---

## Troubleshooting

### Error: "App DB connection failed"
- Pastikan MySQL sudah running
- Cek kredensial di .env (APP_DB_HOST, APP_DB_USER, APP_DB_PASSWORD)
- Pastikan database sudah dibuat

### Error: "RADIUS DB connection failed"
- Pastikan database radius sudah dibuat
- Cek kredensial RADIUS_DB_* di .env

### Error: "0 statements executed" saat migrasi
- Pastikan menggunakan versi terbaru dari scripts/migrate.js
- File SQL harus menggunakan semicolon (;) sebagai delimiter

### Error: "Table already exists" saat migrasi
- Ini normal jika migrasi dijalankan ulang (idempotent)
- Error ini otomatis di-skip oleh migration runner

### Port sudah digunakan
- Ganti PORT di .env ke port lain (misal 3001)
- Atau matikan proses yang menggunakan port tersebut:
  ```bash
  lsof -i :3000
  kill -9 <PID>
  ```

---

## Struktur Folder

```
UwaisApps/
├── src/                  # Source code aplikasi
│   ├── app.js            # Express app setup
│   ├── server.js         # Server bootstrap
│   ├── config/           # Konfigurasi (DB, auth, integrations)
│   ├── controllers/      # HTTP request handlers
│   ├── services/         # Business logic
│   ├── models/           # Data access (App DB)
│   ├── radiusModels/     # Data access (RADIUS DB)
│   ├── middleware/       # Auth, RBAC, validation, error handler
│   ├── routes/           # Route definitions
│   ├── jobs/             # Scheduled tasks (cron)
│   └── utils/            # Helpers dan constants
├── migrations/           # SQL migration files
├── scripts/              # CLI scripts (migrate, seed)
├── tests/                # Test suite
├── docs/                 # Dokumentasi
├── .env.example          # Template environment variables
├── package.json          # Dependencies dan scripts
└── README.md
```

---

## Langkah Selanjutnya

1. **Buat user tambahan** via API (login sebagai Superadmin)
2. **Buat branch** untuk setiap cabang ISP
3. **Daftarkan NAS** (router Mikrotik) untuk setiap branch
4. **Buat paket internet** yang akan dijual
5. **Konfigurasi integrasi** (Tripay, WhatsApp, FreeRADIUS) sesuai kebutuhan
6. **Setup frontend** menggunakan dokumentasi API di `docs/API_DOCUMENTATION.md`
