1. Manajemen Pelanggan (CRM - Customer Relationship Management) 

Fitur ini adalah pusat data pelanggan agar tim administrasi dan teknisi memiliki pandangan yang sama. 

Siklus Hidup Pelanggan (Lifecycle) 

Status yang jelas untuk setiap pelanggan, mulai dari Prospek (survey), Instalasi, Aktif, Isolir (terblokir karena tunggakan), hingga Terminated (berhenti berlangganan). 

Database Komprehensif 

Pencatatan identitas (KTP/NPWP), kontak (WhatsApp/Email), dan titik koordinat (Maps) lokasi pemasangan. 

Multi-Layanan 

Mendukung satu akun pelanggan yang memiliki lebih dari satu koneksi (misalnya satu pelanggan memiliki 3 titik PPPoE di lokasi berbeda). 

Menghubungkan Setiap pelanggan ke ACS berdasarkan akun PPPOE 

 

2. Manajemen Paket dan Layanan (Service Management) 

Pengaturan produk internet yang Anda jual ke pelanggan. 

Profil Kecepatan Fleksibel 

Pembuatan paket internet dengan parameter lengkap, tidak hanya Rate-Limit (Upload/Download), tetapi juga Burst Limit dan Burst Threshold untuk optimasi quality of service (QoS). 

Fitur penurunan kecepatan otomatis jika pelanggan melewati batas kuota tertentu dalam satu bulan (biasanya digunakan untuk paket broadband murah). 

Sistem Prorata 

Perhitungan biaya otomatis untuk pelanggan yang aktif di tengah bulan, sehingga tagihan bulan pertama disesuaikan dengan sisa hari aktif. 

Billing Cycle 

Tanggal Isolir setiang tanggal 10 jam 23:59 

 

3. Sistem Tagihan dan Keuangan (Billing & Finance) 

Otomatisasi perputaran uang agar ISP tidak bocor secara finansial. 

Auto-Generate Tagihan 

Sistem otomatis membuat invoice pada tanggal yang ditentukan (misalnya setiap tanggal 1) dan mengirimkan notifikasi via WhatsApp/Email. 

Pembuatan Billing Setiap tanggal 1 jam 00:00 

Integrasi Payment Gateway 

Pembacaan pembayaran otomatis 24 jam menggunakan Virtual Account, QRIS, atau minimarket. Status invoice langsung berubah menjadi "Lunas" tanpa perlu cek mutasi manual. 

Menggunakan TRIPAY 

Denda dan Pajak 

Opsi untuk menambahkan PPN 11% secara Otomatis berdasarkan profil/pelanggan 

Sales 

Bisa input data pelanggan 

Mencari pelanggan baru 

Mitra 

Input pelanggan baru 

Menerima pembayaran 

Laporan pendapatan 

Nominal bagi hasil flexsibel (diatur saat pembuatan akun) berdasarkan harga profil 

Mitra harus topup terlebih dahulu 

Merchant 

Menerima pembayaran 

Komisi merchant ditentukan oleh admin dengan catatan di invoice tertulis biaya admin (komisi ditentukan oleh admin) 

Biller harus topup saldo terlebih dahulu. 

Export Laporan Fleksibel 

Kemampuan merangkum laporan keuangan (pemasukan, tunggakan, kasbon teknisi) yang dapat di-export langsung menjadi file Excel untuk kebutuhan pembukuan lanjutan. 

 

4. Kontrol Jaringan dan Interaksi Router (Network Control) 

Ini adalah fungsi utama RADIUS untuk menggantikan manajemen manual di Winbox. 

Auto-Isolir (Suspend/Resume) 

Sistem otomatis memerintahkan NAS/Router untuk memindahkan IP pelanggan ke Address List isolir tepat pada pukul 23:59 jika tagihan belum dibayar. Pelanggan akan diarahkan ke halaman peringatan (Isolated Page). 

Kick Session (CoA - Change of Authorization) 

Tombol di panel web untuk mendiskonek sesi PPPoE pelanggan secara real-time (memaksa router melakukan re-dial) tanpa perlu masuk ke router. 

Monitoring NAS Terpusat 

Dashboard yang memantau status Up/Down seluruh router gateway. Sangat berguna untuk melakukan manajemen massal, seperti penjadwalan backup konfigurasi secara serentak ke puluhan router cabang. 

Traffic Dashboard (Pengembangan Lanjutan)❇️ 

Visualisasi grafik trafik dari router utama untuk memantau utilitas bandwidth, memastikan kapasitas jaringan secara keseluruhan tetap aman, terutama jika beban throughput agregat sudah menyentuh angka 1-2 Gbps. 

 

5. Manajemen Perangkat dan Inventaris (Asset Management) 

Pencatatan perangkat keras milik perusahaan yang ada di lapangan. 

Pencatatan ONT/ONU & Router 

Melacak MAC Address, Serial Number, dan merk perangkat (seperti ZTE atau Huawei) yang dipinjamkan di rumah pelanggan. Jika perangkat rusak atau ditarik, riwayatnya jelas. 

Mapping Jaringan Fisik 

Pendataan jalur kabel pelanggan. Pelanggan A terhubung ke ODP mana, di port berapa, redaman optik berapa, dan bermuara ke OLT/PON port yang mana. 

Terhubung ke ACS 

 

6. Helpdesk & Ticketing (Dukungan Pelanggan) 

Fitur untuk mengatur penanganan gangguan agar terpantau dengan baik. 

Pembuatan Tiket 

Fitur untuk mencatat komplain pelanggan yang masuk (gangguan lambat, kabel putus, LOS merah). 

Setiap teknisi bisa multi ticket 

Penugasan Teknisi 

Dispatcher bisa melempar tiket gangguan ke aplikasi/dashboard tim teknisi lapangan. 

Notifikasi tiket ke teknisi 

Konfirmasi Selesai/progress/belum selesai dari teknisi. 

Konfirmasi kerusakan yang di alami (dari teknisi) 

History Gangguan 

Saat pelanggan komplain, customer service bisa melihat apakah pelanggan ini sering mengalami gangguan di bulan yang sama. 

Laporan Harian, Mingguan, Bulanan, dan Tahunan 

 

7. Laporan Komdigi 

Laporan Data Paket (Profil) 

List data paket 

Laporan Data Pelanggan 

Total pengguna setiap paket 

Data berdasarkan wilayah branch 

Pertumbuhan pelanggan 

Laporan Pendapatan 

Laporan pendapatan bulanan 

Filter tipe pembayaran 

Siapa yang melakukan/menerima pembayaran 

 

8. Skema Aktivasi Pelanggan 

Pasang Baru 

Input data pelanggan 

Admin yang input 

Pelanggan yang daftar 

Konfirmasi ketersediaan layanan 

Pasang baru masuk tikecting 

Teknisi 

Melakukan pemasangan 

Menginput No ODP, Port ODP, SN ONU, dan Foto ONU 

Generate akun PPPOE + Billing + Kirim WA Pelanggan(Otomatis Sistem) 

Menginputkan Akun PPPOE ke ONU (Opsional) tergantung kondisi 

Melaporkan selesai pemasangan 

Pelanggan melakukan pembayaran 

Akun PPPOE Aktif (Otomatis Sistem) 

Selesai 

 

9. Dashboard Aplikasi 

Superadmin 

Manajemen User 

Manajemen NAS 

Manajemen OLT 

Manajemen Paket Layanan 

Manajemen Branch 

Admin 

Melakukan COA 

Manajemen Pelanggan 

Manajemen Aset 

Manajemen Ticketing 

Inventori 

Manajemen Billing 

Penggunaan ACS 

Accounting 

Manajemen Billing 

Akses data pelanggan 

Inventori 

Mitra 

Input pelanggan baru 

Daftar pelanggan Mitra 

Status pembayaran pelanggan 

Melakukan Pembayaran 

Laporan pendapatan 

Top up saldo 

Sales 

Infrastruktur jaringan (Ketersediaan Layanan) 

Pertumbuhan pelanggan (diambil dari hasil sales Uwais) 

Data pelanggan sesuai dengan hasil sales 

Merchant 

Top up saldo 

Input ID pelanggan hanya untuk pembayaran 

Laporan pembayaran 

Teknisi 

Infrastruktur jaringan 

Input data pelanggan 

Daftar ticketing 

Aktivasi pelanggan 

Jurnal pekerjaan 

Pelanggan 

Data pelanggan 

Data layanan 

Billing 

Ubah password dan SSID wifi 

Input ticket 

History ticket 

History pembayaran 

 