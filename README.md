# UwaisSuperApps - ISP Billing & Management System

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.x-green.svg)
![License](https://img.shields.io/badge/license-ISC-orange.svg)

UwaisSuperApps is a comprehensive ISP Management system designed for local ISPs and network operators. It integrates billing, customer management, and automated network provisioning via FreeRADIUS and MikroTik.

## 🚀 Key Features

- **Billing & Invoicing**: Automated monthly invoice generation with support for prorated billing, PPN, and installation fees.
- **Payment Gateway**: Seamless integration with **Tripay** for automated VA, QRIS, and Retail Outlet payments.
- **Multi-Role Cash Payment**: Support for direct cash settlement by Superadmin, Admin, Merchant, and Mitra with automated balance management.
- **RADIUS Integration**: Full control over FreeRADIUS users, groups, and accounting for PPPoE and Hotspot services.
- **Network Automation (CoA)**: Instant service restoration (Unisolir) and bandwidth adjustment (Speed Change) via Change of Authorization (CoA) to MikroTik NAS.
- **Infrastructure Management**: Real-time tracking of OLT, ODP (Splitters), and NAS devices.
- **VPN CHR Management**: Centralized management for remote NAS access via MikroTik CHR.
- **Region Hierarchy**: Structured management of coverage areas from Provinsi down to Desa level.

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js, MySQL
- **Frontend**: React.js, Vite, Vanilla CSS (Aesthetic Design)
- **RADIUS**: FreeRADIUS 3.x
- **Network Protocol**: RADIUS, SSH (for radclient), MikroTik REST API

## 📋 Prerequisites

- Node.js >= 18.x
- MySQL / MariaDB Server
- FreeRADIUS 3.x Server
- MikroTik RouterOS (with CoA support enabled)

## ⚙️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/ariemus-smk/uwaisSuperApps.git
cd UwaisApps
```

### 2. Backend Setup
```bash
npm install
cp .env.example .env
# Edit .env with your database credentials and API keys
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env to point to your backend API URL
```

### 4. Database Migration & Seeding
```bash
# In the root directory
npm run migrate      # Create tables for App DB and RADIUS DB
npm run seed         # Create default branch and superadmin
npm run seed:regions # Populate region data
npm run seed:infrastructure # Populate initial OLT/ODP data
```

## 🚀 Deployment Guide

### Production Build (Frontend)
```bash
cd frontend
npm run build
```
Copy the `frontend/dist` folder to your web server (e.g., Nginx).

### Backend Process (PM2)
We recommend using [PM2](https://pm2.keymetrics.io/) to manage the backend process.
```bash
npm install -g pm2
pm2 start src/server.js --name "uwais-backend"
pm2 save
```

### Nginx Configuration
Example configuration for reverse proxy using Nginx Proxy Manager or raw Nginx:

```nginx
server {
    listen 80;
    server_name portal.uwais.id;

    # Frontend Static Files
    location / {
        root /var/www/uwais/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api {
        proxy_pass http://localhost:3500;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🛡 Security Note
- Ensure `.env` is never committed to Git.
- Use SSH keys for RADIUS CoA execution instead of passwords where possible.
- Always change the default `superadmin` password after the first login.

## 📄 License
This project is licensed under the ISC License.
