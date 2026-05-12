# Product Overview

UwaisSuperApps ISP Backend adalah REST API untuk mengelola bisnis Internet Service Provider (ISP) di Indonesia. Sistem ini menangani seluruh siklus operasional ISP:

## Modul Utama

- **Customer Management (CRM)**: Lifecycle pelanggan dari Prospek → Instalasi → Aktif → Isolir → Terminated. Menyimpan identitas (KTP/NPWP), kontak, koordinat GPS, dan scoping per Branch.
- **Package & Service Management**: Paket internet dengan rate-limit, burst, FUP (Fair Usage Policy), dan prorata billing untuk aktivasi tengah bulan.
- **Billing & Finance**: Invoice bulanan otomatis (generate tanggal 1), integrasi payment gateway Tripay (VA, QRIS, Minimarket), sistem saldo Mitra/Merchant, dan dukungan PPN 11%.
- **Network Control (RADIUS)**: Integrasi FreeRADIUS untuk autentikasi PPPoE, auto-isolir pada invoice overdue, CoA/PoD untuk manajemen sesi real-time.
- **Infrastructure**: Registrasi dan manajemen OLT, ODP, serta coverage area untuk perencanaan jaringan fiber.
- **NAS & VPN CHR Management**: Monitoring router, konfigurasi via SSH, dan manajemen VPN melalui Mikrotik CHR REST API.
- **Asset & Inventory**: Inbound, outbound, transfer antar-cabang, peminjaman alat, direct sale, dan stock opname.
- **Helpdesk Ticketing**: Pembuatan tiket, klasifikasi prioritas, dispatch teknisi, remote troubleshooting via ACS/NAS, dan tracking resolusi.
- **Notification**: Antrian WhatsApp, email, dan push notification dengan retry logic.
- **Scheduled Jobs**: Billing generation, auto-isolir, NAS health polling, FUP enforcement, KPI calculation.

## User Roles (8 roles dengan RBAC)

| Role | Deskripsi |
|------|-----------|
| Superadmin | Akses penuh, bypass branch scoping |
| Admin | Manajemen operasional per Branch |
| Accounting | Keuangan, invoice, waiver |
| Mitra | Partner lokal, terima pembayaran, profit sharing |
| Sales | Input pelanggan baru, akuisisi subscriber |
| Merchant | Titik pembayaran, komisi per transaksi |
| Teknisi | Instalasi, perbaikan, maintenance lapangan |
| Pelanggan | End-customer/subscriber |

## Konteks Bisnis

- Pasar ISP Indonesia (nomor telepon format +62 atau 08, 9-12 digit)
- Siklus billing: invoice generate tanggal 1, auto-isolir tanggal 10 pukul 23:59
- Pembayaran via Tripay payment gateway (VA, QRIS, Minimarket)
- Perangkat jaringan: MikroTik router, FreeRADIUS, GPON (OLT/ODP/ONT)
- Mitra/Merchant menggunakan sistem saldo prepaid (topup sebelum bisa proses pembayaran)
- Prorata billing opsional per Branch/customer
- PPN 11% opsional per paket

## Istilah Penting

- **Isolir**: Suspend layanan karena tagihan belum dibayar, redirect ke halaman peringatan
- **CoA**: Change of Authorization — update atribut sesi RADIUS secara real-time
- **POD**: Packet of Disconnect — putus paksa sesi PPPoE
- **FUP**: Fair Usage Policy — pengurangan kecepatan setelah melebihi kuota
- **Prorata**: Perhitungan tagihan proporsional untuk aktivasi tengah bulan
- **Address_List**: Fitur firewall Mikrotik untuk isolasi/blokir traffic pelanggan
