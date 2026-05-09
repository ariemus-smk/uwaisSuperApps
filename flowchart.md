Flowchart Alur Kerja Sistem ISPDokumen ini berisi visualisasi alur kerja utama menggunakan sintaks Mermaid.1. Alur Penjualan & Instalasi Pelanggan Baru (Metode Prabayar)Alur ini menggambarkan proses dari awal calon pelanggan didaftarkan (termasuk pemetaan otomatis ke pengelola Branch atau Mitra tertentu), melakukan pembayaran awal (prabayar), hingga internet menyala dan siap digunakan.graph TD
    Start((Mulai)) --> Sales[Sales/Mitra/Admin: Input Calon Pelanggan]
    Sales --> Mapping[Sistem: Mapping Pelanggan ke Branch / Mitra Spesifik]
    Mapping --> CekCoverage{Teknisi/Sistem/Admin/Mitra/Sales: <br>Cek Coverage Jaringan}
    
    CekCoverage -- Tidak Tercover --> Batal[Prospek Dibatalkan / Pending] --> End1((Selesai))
    CekCoverage -- Tercover (Tersedia ODP/FAT) --> Setuju[Pelanggan Setuju & TTD Kontrak]
    
    Setuju --> CekDP{Ada Down<br>Payment (DP)?}
    CekDP -- Ya --> InputDP[Admin/Sales: Input Nominal DP & Proses Bayar]
    InputDP --> Jadwal
    CekDP -- Tidak --> Jadwal[Admin Branch/Mitra: Buat Jadwal Instalasi]
    
    Jadwal --> GenPPPoE[Sistem: Generate Akun PPPoE Otomatis]
    GenPPPoE --> Instalasi[Teknisi Area: Instalasi, Tarik Kabel & Pemasangan Add-on di Lokasi]
    
    Instalasi --> Aktivasi[Teknisi Area: Binding MAC Address/SN ONT via App]
    Aktivasi --> Konek[Sistem: Modem terkoneksi ke OLT & NAS]
    
    Konek --> Validasi[Admin Branch/Mitra: Validasi BAST, Data Instalasi & Laporan Pemakaian Add-on]
    
    Validasi --> CekProrata{Fitur Prorata<br>Bulan 1 Aktif?}
    
    CekProrata -- Ya --> HitungProrata[Sistem: Hitung Nominal Proporsional Bulan 1]
    CekProrata -- Tidak --> HitungPenuh[Sistem: Tetapkan Nominal Penuh Bulan 1]
    
    HitungProrata --> CekBiayaPasang{Fitur Biaya<br>Pasang Aktif?}
    HitungPenuh --> CekBiayaPasang
    
    CekBiayaPasang -- Ya --> TagihanDasar[Sistem: Set Tagihan = Pemasangan + Nominal Bulan 1]
    CekBiayaPasang -- Tidak --> TagihanDasar[Sistem: Set Tagihan = Nominal Bulan 1 Saja]
    
    TagihanDasar --> KurangiDP[Sistem: Kurangi Tagihan dengan DP Jika Ada]
    
    KurangiDP --> CekAddOn{Ada Pemakaian<br>Layanan Add-on?}
    
    CekAddOn -- Ya (AP, Kabel Ext, dll) --> TambahAddOn[Sistem: Tambahkan Biaya Add-on ke Total Tagihan]
    CekAddOn -- Tidak --> TerbitkanTagihan[Sistem: Terbitkan Tagihan Akhir]
    
    TambahAddOn --> TerbitkanTagihan
    
    TerbitkanTagihan --> Bayar{Pelanggan<br>Membayar?}
    
    Bayar -- Tidak / Expired --> BatalIsolir[Batal / Isolir]
    Bayar -- Ya (Lunas) --> Aktif[Sistem: Layanan Internet Aktif] --> End2((Selesai))
2. Alur Penagihan & Pembayaran (Billing)Alur ini menunjukkan bagaimana sistem menangani tagihan bulanan secara otomatis, termasuk proses pemblokiran (isolir) jika pelanggan telat membayar, serta penyesuaian tagihan jika isolir berlangsung lebih dari 1 bulan.graph TD
    Start((Awal Bulan/Siklus)) --> Generate[Sistem: Generate Tagihan Massal]
    
    Generate --> CekLamaLangganan{Lama <br>Berlangganan?}
    
    CekLamaLangganan -- <= 2 Bulan (Pelanggan Baru) --> AntreanWA[Sistem: Antrean Broadcast WA/Email & Notif App]
    CekLamaLangganan -- > 2 Bulan (Pelanggan Lama) --> PushNotifApp[Sistem: Kirim Push Notification via Aplikasi Mobile]
    
    AntreanWA --> Notif[Kirim Peringatan Jatuh Tempo]
    PushNotifApp --> Notif
    
    Notif --> Tunggu{Pelanggan <br>Membayar?}
    
    Tunggu -- Ya (Bayar Tepat Waktu) --> Gateway[Via Payment Gateway / Mitra / Merchant / Tunai]
    Tunggu -- Tidak (Lewat Jatuh Tempo) --> Isolir[Sistem NAS: Blokir Internet / Auto-Isolir]
    
    Isolir --> NotifIsolir[Sistem: Kirim Notif Peringatan Isolir <br>(WA & App untuk Pelanggan Baru, App untuk Lama)]
    NotifIsolir --> TungguBayar{Pelanggan <br>Melunasi?}
    
    TungguBayar -- Ya --> CekLamaIsolir{Lama Isolir <br>> 1 Bulan?}
    
    CekLamaIsolir -- Ya --> Pemutihan[Sistem: Bebaskan/Hapus Tagihan <br>Selama Masa Isolir]
    CekLamaIsolir -- Tidak --> Gateway
    
    Pemutihan --> Gateway
    
    TungguBayar -- Tidak (Tunggakan 2 Bulan) --> NotifCabut[Sistem: Kirim Notif Cabut Layanan ke Pelanggan]
    
    NotifCabut --> TiketCabut[Sistem: Auto-Create Tiket Penarikan Perangkat]
    TiketCabut --> Cabut[Admin/Teknisi: Eksekusi Cabut Layanan & Tarik Perangkat] --> End2((Selesai))
    
    Gateway --> UpdateLunas[Sistem: Update Status Tagihan = LUNAS]
    UpdateLunas --> OpenIsolir[Sistem NAS: Buka Blokir Internet otomatis jika diisolir]
    OpenIsolir --> Rekon[Accounting: Rekonsiliasi Dana] --> End1((Selesai))
3. Alur Komplain, Tiket Prioritas & Penanganan GangguanAlur ini menjelaskan proses penanganan gangguan, dengan penambahan pengecekan Tiket Prioritas (VIP) serta pengajuan Lembur jika tiket harus diselesaikan di luar jam kerja reguler tim teknisi.graph TD
    Start((Mulai)) --> Lapor[Pelanggan/Teknisi: Submit Tiket Gangguan via App]
    Lapor --> SistemKlasifikasi[Sistem: Klasifikasi Prioritas Tiket <br>VIP / High / Normal / Low]
    SistemKlasifikasi --> AdminTerima[Admin/CS: Menerima Tiket & Analisa Awal]
    
    AdminTerima --> RemoteCek{Bisa diselesaikan <br>Remote (ACS/NAS)?}
    
    RemoteCek -- Ya (Misal: Restart, Ganti SSID) --> ACS[Admin: Lakukan perbaikan via ACS/Sistem]
    ACS --> Confirm[Sistem: Konfirmasi ke Pelanggan]
    
    RemoteCek -- Tidak (Kabel Putus/ONT Rusak) --> GroupTickets[Admin: Kelompokkan Multi-Tiket Area <br>& Dispatch ke Tim Teknisi (>1 Orang)]
    
    GroupTickets --> CekWaktu{Di Luar Jam <br>Kerja/Shift?}
    
    CekWaktu -- Ya (Tiket High/VIP) --> ApprovalLembur[Sistem/Admin: Request Lembur Tim Teknisi]
    ApprovalLembur --> CekLembur{Lembur <br>Disetujui?}
    CekLembur -- Ya --> NotifTim[Tim Teknisi: Terima Multi-Work Order di App]
    CekLembur -- Tidak --> PendingTiket[Tiket Masuk Antrean Shift Berikutnya] --> End1((Selesai Sementara))
    
    CekWaktu -- Tidak --> NotifTim
    
    NotifTim --> OnSite[Tim Teknisi: Menuju Lokasi & Perbaikan Fisik]
    OnSite --> UpdateApp[Tim Teknisi: Update Jurnal, Foto Bukti]
    
    UpdateApp --> CekSisaTiket{Masih Ada Sisa <br>Tiket di Tim?}
    
    CekSisaTiket -- Ya --> OnSite
    CekSisaTiket -- Tidak --> Confirm
    
    Confirm --> CatatKPI[Sistem: Catat Waktu Resolusi untuk KPI Teknisi]
    CatatKPI --> Close[Admin: Tiket Ditutup (Resolved)] --> End((Selesai))
4. Alur Manajemen Aset & InventoriAlur ini mencakup proses masuknya barang ke gudang (inbound), distribusi ke teknisi, penarikan barang dari pelanggan/lapangan (retur), penjualan langsung, audit stok fisik, hingga peminjaman alat kerja untuk teknisi. Semua stok dikelola secara terpisah per Branch/Cabang.graph TD
    Start((Mulai)) --> Pilihan{Jenis Transaksi <br>Aset (Per Branch)?}

    %% Alur Barang Masuk
    Pilihan -- Barang Masuk <br>(Pembelian Baru) --> InputInvoice[Admin: Input Data Invoice Pembelian & Upload File Bukti Pembelian]
    InputInvoice --> InputPO[Admin: Input Detail Barang Masuk Sesuai Invoice <br> Nama Produk, Merk/Model, Kategori]
    
    InputPO --> TentukanSatuan{Kategori <br>Barang?}
    TentukanSatuan -- Kabel --> SatuanRoll[Sistem: Masuk per Roll <br>Input Total Meter per SN]
    TentukanSatuan -- Aksesoris/RJ45 --> SatuanPack[Sistem: Masuk per Pack <br>Input Total Pcs per Pack]
    TentukanSatuan -- Perangkat Aktif --> SatuanUnit[Sistem: Set Satuan = Pcs/Unit]
    
    SatuanRoll --> CekSN{Punya <br>SN/MAC?}
    SatuanPack --> CekSN
    SatuanUnit --> CekSN
    
    CekSN -- Tidak --> GenerateSN[Sistem: Generate SN/Batch Otomatis <br>Format: UBG-YYYYMMDD-XXXXXX]
    CekSN -- Ya --> CatatSistem[Sistem: Update Stok Branch & Catat SN]
    GenerateSN --> CatatSistem
    CatatSistem --> EndIn((Stok Gudang Branch Bertambah))

    %% Alur Peminjaman Alat Kerja (Aset Teknisi Dipakai Ulang)
    Pilihan -- Peminjaman Alat Kerja <br>(Tang, Splicer, dll) --> ReqAlat[Teknisi/Tim: Request Peminjaman Alat di App]
    ReqAlat --> ApproveAlat[Admin Gudang: Approve & Serahkan Alat]
    ApproveAlat --> StatusPinjam[Sistem: Status Alat 'Dipinjam Teknisi/Tim X']
    StatusPinjam --> PakaiAlat[Teknisi/Tim: Gunakan Alat di Lapangan]
    PakaiAlat --> BalikAlat[Teknisi/Tim: Kembalikan Alat ke Gudang]
    BalikAlat --> CekAlat[Admin Gudang: Cek Fisik & Fungsi Alat]
    CekAlat --> KondisiAlatCek{Kondisi <br>Alat?}
    KondisiAlatCek -- Normal --> AlatReady[Sistem: Status Alat 'Tersedia' di Gudang Branch] --> EndAlat((Selesai))
    KondisiAlatCek -- Rusak/Hilang --> AlatRusakPinjam[Sistem: Status Alat 'Rusak/Hilang' & Catat Tanggung Jawab Teknisi/Tim] --> EndAlat

    %% Alur Transfer Barang Antar Branch & Retur Transfer
    Pilihan -- Transfer Barang <br>(Antar Branch) --> ReqTransfer[Admin Branch Asal: Buat Permintaan/Surat Jalan Transfer]
    ReqTransfer --> PilihBarangTransfer[Sistem: Pilih Barang & SN yang Ditransfer]
    PilihBarangTransfer --> ProsesKirim[Sistem: Kurangi Stok Asal & Status 'Dalam Pengiriman']
    ProsesKirim --> TerimaTransfer[Admin Branch Tujuan: Terima Fisik & Konfirmasi di Sistem]
    TerimaTransfer --> UpdateStokTujuan[Sistem: Status 'Tersedia' & Tambah Stok di Branch Tujuan]
    UpdateStokTujuan --> ButuhReturTransfer{Perlu Retur <br>ke Branch Asal?}
    ButuhReturTransfer -- Ya (Salah Barang/Sisa) --> ReqReturTransfer[Admin Branch Tujuan: Buat Surat Jalan Retur]
    ReqReturTransfer --> ProsesReturKirim[Sistem: Kurangi Stok Tujuan & Status 'Retur Pengiriman']
    ProsesReturKirim --> TerimaReturAsal[Admin Branch Asal: Terima Fisik & Konfirmasi]
    TerimaReturAsal --> BalikStokAsal[Sistem: Tambah Stok Kembali ke Branch Asal] --> EndReturTransfer((Retur Transfer Selesai))
    ButuhReturTransfer -- Tidak --> EndTransfer((Transfer Selesai))

    %% Alur Barang Keluar (Instalasi)
    Pilihan -- Permintaan Barang <br>(Untuk Instalasi/Maintenance) --> Request[Teknisi: Request Barang dari Gudang Branch di App]
    Request --> Approve[Admin Gudang Branch: Approve & Serahkan Fisik]
    
    Approve --> CekOut{Kategori <br>Barang?}
    CekOut -- Kabel --> OutMeter[Sistem: Keluar & Kurangi Stok Branch <br>Kabel per Meter]
    CekOut -- Aksesoris/RJ45 --> OutPcs[Sistem: Keluar & Kurangi Stok Branch <br>Aksesoris per Pcs]
    CekOut -- Perangkat Aktif --> OutUnit[Sistem: Keluar & Kurangi Stok Branch <br>Perangkat per Unit]
    
    OutMeter --> UpdateOut[Sistem: Status Barang 'Dibawa Teknisi']
    OutPcs --> UpdateOut
    OutUnit --> UpdateOut
    
    UpdateOut --> Pasang{Dipasang di <br>Pelanggan?}
    Pasang -- Ya --> InputAktual[Teknisi: Input Aktual Terpasang <br>Kabel per Meter & RJ45 per Pcs]
    InputAktual --> BindAlat[Sistem: Status Barang 'Terpasang' terikat ID Pelanggan & Branch]
    
    BindAlat --> CekSisa{Ada Sisa <br>Material?}
    CekSisa -- Ya --> Retur
    CekSisa -- Tidak --> EndOut((Selesai))
    
    %% Alur Retur
    Pasang -- Tidak (Batal Pasang) --> Retur[Teknisi: Serahkan Barang Kembali ke Gudang Branch]
    Pilihan -- Penarikan / <br>Perangkat Rusak --> TarikBarang[Teknisi: Tarik Perangkat dari Lapangan] --> Retur
    
    Retur --> CekKondisi[Admin Gudang Branch: Cek Fisik & Fungsi Barang]
    CekKondisi --> Kondisi{Kondisi <br>Barang?}
    
    Kondisi -- Normal / Bisa Dipakai --> BalikStok[Sistem: Status 'Tersedia' & Masuk Stok Gudang Branch] --> EndRetur((Selesai))
    Kondisi -- Rusak --> StokRusak[Sistem: Masuk Daftar Aset Rusak / RMA Branch] --> EndRetur

    %% Alur Penjualan Langsung
    Pilihan -- Penjualan Langsung <br>(Tanpa Langganan) --> DataPelangganJual[Admin/Sales Branch: Input/Pilih Data Pelanggan]
    DataPelangganJual --> InputJual[Admin/Sales Branch: Input Item Transaksi]
    InputJual --> MetodeBayarJual{Metode <br>Pembayaran?}
    
    MetodeBayarJual -- Lunas --> CatatLunas[Sistem: Catat Pendapatan Kas Branch]
    MetodeBayarJual -- Hutang/Tempo --> CatatHutang[Sistem: Catat Piutang Pelanggan]
    
    CatatLunas --> CekJual{Kategori <br>Barang?}
    CatatHutang --> CekJual
    
    CekJual -- Kabel --> JualMeter[Sistem: Kurangi Stok Branch Kabel per Meter]
    CekJual -- Aksesoris/RJ45 --> JualPcs[Sistem: Kurangi Stok Branch Aksesoris per Pcs]
    CekJual -- Perangkat Aktif --> JualUnit[Sistem: Kurangi Stok Branch Perangkat per Unit]
    
    JualMeter --> CatatHistori[Sistem: Simpan Histori Transaksi ke Profil Pelanggan]
    JualPcs --> CatatHistori
    JualUnit --> CatatHistori
    
    CatatHistori --> Serahkan[Admin/Sales: Serahkan Barang & Nota ke Pelanggan] --> EndJual((Selesai))
    
    MetodeBayarJual -- Batal --> BatalJual[Transaksi Batal] --> EndJual

    %% Alur Audit Barang (Stock Opname)
    Pilihan -- Audit Stok <br>(Stock Opname) --> MulaiAudit[Admin Gudang Branch: Hitung Fisik Barang Branch]
    MulaiAudit --> CekSelisih{Ada Selisih <br>Sistem vs Fisik?}
    CekSelisih -- Ya --> Penyesuaian[Admin Branch: Buat Jurnal Penyesuaian / Laporan Kehilangan] --> EndAudit((Selesai))
    CekSelisih -- Tidak --> Sinkron[Status Stok Branch Sinkron] --> EndAudit
5. Alur Penambahan & Integrasi NAS (Network Access Server)Alur ini menjelaskan proses mendaftarkan perangkat router gateway baru (seperti Mikrotik) ke dalam sistem manajemen pusat (RADIUS/Billing) agar dapat melayani koneksi pelanggan PPPoE/Hotspot melalui koneksi VPN yang aman.graph TD
    Start((Mulai)) --> Prep[Superadmin/Admin Jaringan: Siapkan Perangkat NAS Baru]
    Prep --> InputSistem[Superadmin: Input Data NAS ke Sistem <br> Nama Router, Branch]
    
    InputSistem --> CreateVPN[Sistem: Create 4 Akun VPN Otomatis Service Berbeda <br> Setup sbg Failover Koneksi ke Server Pusat]
    CreateVPN --> GenerateScript[Sistem: Generate Skrip Konfigurasi Mikrotik <br> Berisi 4 VPN Failover, RADIUS Secret, API Port, Auto Isolir, PPPoE Profile, & User Profile Hotspot]
    
    GenerateScript --> CopyScript[Superadmin: Copy/Download Skrip dari Dashboard]
    CopyScript --> PasteTerminal[Superadmin: Paste Skrip ke Terminal Mikrotik NAS]
    
    PasteTerminal --> TestKoneksi{Sistem: Test Koneksi <br> API & RADIUS via VPN?}
    
    TestKoneksi -- Gagal --> Troubleshoot[Superadmin: Troubleshoot Jaringan / Konfigurasi VPN]
    Troubleshoot --> TestKoneksi
    
    TestKoneksi -- Berhasil --> SimpanNAS[Sistem: Simpan Data & Set NAS Berstatus 'Aktif']
    SimpanNAS --> AssignPaket[Superadmin: Alokasikan IP Pool & Paket Layanan pada NAS]
    
    AssignPaket --> SiapPakai[Sistem: NAS Siap Digunakan untuk <br> Terminasi Internet Pelanggan] --> End((Selesai))
6. Alur Change of Authorization (CoA) - Real-time Network UpdateAlur ini menjelaskan mekanisme sistem RADIUS mengirimkan instruksi perubahan atribut sesi pelanggan secara real-time ke perangkat NAS (Mikrotik) tanpa memutus koneksi internet pelanggan.graph TD
    Start((Trigger Perubahan)) --> Pilihan{Jenis Trigger?}

    %% Trigger Sistem
    Pilihan -- Update Paket / Speed --> SysUpdate[Sistem: Perubahan Paket Layanan oleh Admin/Pelanggan]
    Pilihan -- Pembayaran Lunas --> SysLunas[Sistem: Status Invoice LUNAS Terdeteksi]
    Pilihan -- Auto-Isolir --> SysIsolir[Sistem: Masa Berlaku Habis / Jatuh Tempo]

    %% Proses Kirim CoA
    SysUpdate --> RadiusReq[Sistem RADIUS: Siapkan CoA-Request Packet]
    SysLunas --> RadiusReq
    SysIsolir --> RadiusReq
    
    Pilihan -- Manual Kick / Disconnect --> RadiusPOD[Sistem RADIUS: Siapkan Packet of Disconnect - POD]

    RadiusReq --> SendNAS[Sistem RADIUS: Kirim Packet ke IP NAS via UDP Port 3799]
    RadiusPOD --> SendNAS
    
    SendNAS --> NASReceive[NAS/Mikrotik: Menerima Instruksi CoA/POD]
    
    NASReceive --> NASAction{Respon NAS?}
    
    %% Respon Sukses
    NASAction -- CoA-ACK (Success) --> UpdateSession[NAS: Update Atribut Sesi Aktif <br> (Simple Queue / Profile / Firewall)]
    UpdateSession --> SysLog[Sistem: Catat Log Sukses & Update Status Dashboard] --> End((Selesai))
    
    %% Respon Gagal
    NASAction -- CoA-NAK (Failed) --> Retry[Sistem: Lakukan Retry Otomatis / Antrean CoA]
    Retry --> SendNAS
    
    NASAction -- Disconnect POD --> ForceLogout[NAS: Paksa Logout Sesi Pelanggan]
    ForceLogout --> SysLog
7. Alur Pendaftaran Infrastruktur Jaringan (OLT & ODP)Alur ini menjelaskan proses perencanaan dan pendaftaran perangkat keras jaringan pasif optik (seperti OLT dan ODP/FAT) dari tahap pembangunan di lapangan hingga aktif terdaftar di sistem agar siap digunakan untuk pelanggan baru.graph TD
    Start((Mulai)) --> Rencana[Tim Perencana/Admin: Survey & Penentuan Area Ekspansi Baru]
    Rencana --> TarikFisik[Teknisi Lapangan: Penarikan Kabel Fiber, Pemasangan Tiang, ODC & ODP/FAT]
    
    TarikFisik --> DaftarOLT[Superadmin/Admin Jaringan: Input OLT Baru ke Sistem]
    DaftarOLT --> InputDetailOLT[Input Detail: IP OLT, Total Port PON, Branch Tujuan]
    
    InputDetailOLT --> CekOLT{Sistem: Tes Ping / <br>Koneksi ke IP OLT?}
    CekOLT -- Gagal --> TroubleshootOLT[Admin Jaringan: Periksa Jaringan OLT] --> CekOLT
    
    CekOLT -- Berhasil --> DaftarODP[Teknisi/Admin: Input Data ODP/FAT Baru ke Sistem via App/Web]
    DaftarODP --> InputDetailODP[Input Detail: Nama ODP, Koordinat GPS, Total Port/Kapasitas, Mapping ke Port OLT]
    
    InputDetailODP --> ValidasiInfra[Sistem/Admin Branch: Validasi Data Geotagging & Relasi Perangkat]
    
    ValidasiInfra --> SetAktif[Sistem: ODP/FAT Berstatus 'Aktif & Ready']
    SetAktif --> AreaSiap[Area Coverage Tersedia di Aplikasi Sales] --> End((Selesai Infrastruktur Siap Dijual))
8. Alur Perubahan Paket (Upgrade & Downgrade)Alur ini mengatur proses ketika pelanggan atau admin ingin menaikkan atau menurunkan paket kecepatan internet. Terdapat batas maksimal perubahan sebanyak 1 kali dalam sebulan dan memerlukan persetujuan dari Admin.graph TD
    Start((Mulai)) --> Request[Pelanggan/Sales/Mitra: Request Upgrade/Downgrade]
    Request --> CekHistori{Sistem: Cek Histori <br>Perubahan Bulan Ini?}

    CekHistori -- Sudah Pernah (>1x) --> TolakSistem[Sistem: Tolak Request <br>Batas 1 Kali/Bulan Tercapai] --> End1((Selesai))
    CekHistori -- Belum Pernah (Aman) --> Pending[Sistem: Status Request 'Menunggu Konfirmasi Admin']

    Pending --> NotifAdmin[Admin: Menerima Notifikasi Request]
    NotifAdmin --> EvaluasiAdmin{Admin: Setujui <br>Perubahan Paket?}

    EvaluasiAdmin -- Tolak --> TolakAdmin[Admin: Tolak Request & Input Alasan]
    TolakAdmin --> NotifTolak[Sistem: Kirim Notif Penolakan ke Pelanggan] --> End1
    
    EvaluasiAdmin -- Setuju --> ApproveAdmin[Admin: Klik Konfirmasi / Setuju]
    
    ApproveAdmin --> UpdateBilling[Sistem: Update Profil Pelanggan & Hitung Penyesuaian Tagihan Mendatang]
    UpdateBilling --> TriggerCoA[Sistem RADIUS: Trigger CoA ke NAS untuk Ubah Speed Limit]
    
    TriggerCoA --> Berhasil[Sistem: Notifikasi Paket Berhasil Diubah ke Pelanggan] --> End2((Selesai))
9. Alur Pelaporan Pertumbuhan Pelanggan (Analytics & Reporting)Alur ini menjelaskan proses sistem menarik dan mengkalkulasi data jumlah pelanggan secara otomatis setiap bulan dan tahun untuk menghasilkan laporan pertumbuhan (Net Growth) yang dipetakan berdasarkan Branch atau pencapaian masing-masing Sales.graph TD
    Start((Generate Report)) --> TarikData[Sistem/Scheduler: Tarik Data Pelanggan Berkala]
    
    TarikData --> AmbilAktif[Sistem: Hitung Total Aktivasi Baru <br>Per Bulan & Tahun]
    TarikData --> AmbilCabut[Sistem: Hitung Total Pelanggan Cabut/Churn <br>Per Bulan & Tahun]
    
    AmbilAktif --> HitungNet[Sistem: Kalkulasi Net Growth <br> Aktivasi Baru - Pelanggan Cabut]
    AmbilCabut --> HitungNet
    
    HitungNet --> KalkulasiTotal[Sistem: Kalkulasi Total Pelanggan Aktif & <br>Persentase Pertumbuhan YoY / MoM]
    
    KalkulasiTotal --> Pemetaan[Sistem: Petakan Metrik Berdasarkan <br>Mitra / Branch / Sales]
    
    Pemetaan --> Visualisasi[Sistem: Tampilkan di Dashboard <br>Grafik Tren, Bar & KPI Card]
    
    Visualisasi --> OpsiEksport{User: Perlu Cetak <br>Laporan Fisik?}
    
    OpsiEksport -- Ya --> Export[Admin/Superadmin/Sales: Export ke PDF/Excel] --> End((Selesai))
    OpsiEksport -- Tidak --> End
10. Alur Perencanaan Anggaran Proyek Ekspansi Jaringan (Budgeting & CAPEX)Alur ini menjelaskan proses dari awal tim melakukan survei area potensial baru, pembuatan Rencana Anggaran Biaya (RAB) berdasarkan harga master aset, hingga persetujuan Manajemen Keuangan sebelum proyek dikerjakan.graph TD
    Start((Mulai)) --> Survey[Tim Perencana/Sales: Survey Area Potensial Baru]
    Survey --> InputProposal[Tim Perencana: Input Proposal Ekspansi <br>Target Pelanggan, Kebutuhan Material Tiang/Kabel & Perangkat]
    
    InputProposal --> Kalkulasi[Sistem: Kalkulasi Rencana Anggaran Biaya - RAB <br>Berdasarkan Harga Master Aset/Inventori]
    
    Kalkulasi --> Review{Manajemen/Keuangan: <br>Review RAB Proyek?}
    
    Review -- Revisi --> InputProposal
    Review -- Tolak --> Batal[Proyek Ekspansi Dibatalkan] --> End1((Selesai))
    
    Review -- Disetujui --> Approve[Sistem: Status Proyek 'Disetujui' <br>Catat Anggaran sebagai CAPEX]
    
    Approve --> CekStok{Sistem: Cek Ketersediaan <br>Stok Gudang Branch?}
    
    CekStok -- Kurang --> AutoPO[Sistem: Generate Draft Purchase Order / PO Pembelian ke Vendor]
    AutoPO --> OrderBeli[Admin Gudang: Pembelian Barang Masuk <br>Lanjut ke Alur Barang Masuk]
    
    CekStok -- Tersedia --> ReserveStok[Sistem: Reserve / Alokasikan Stok Gudang untuk Proyek Ekspansi ini]
    
    OrderBeli --> SiapFisik
    ReserveStok --> SiapFisik[Tim Teknisi: Eksekusi Pembangunan Lapangan <br>Lanjut ke Alur Infrastruktur OLT & ODP] --> End2((Selesai))
11. Alur Manajemen KPI, Lembur, dan Reward KaryawanAlur ini menjelaskan proses evaluasi kinerja (KPI) bulanan bagi Teknisi dan Sales, kalkulasi jam lembur yang disetujui, hingga penerbitan reward atau bonus ke dalam laporan penggajian (Payroll).graph TD
    Start((Akhir Bulan / <br>Siklus Payroll)) --> TarikData[Sistem: Tarik Data Performa Karyawan]

    TarikData --> DataSales[Data KPI Sales: Target vs Realisasi Akuisisi Pelanggan Baru]
    TarikData --> DataTeknisi[Data KPI Teknisi: SLA Resolusi Tiket Gangguan & Kerapian Instalasi]
    TarikData --> DataLembur[Data Operasional: Total Jam Lembur Teknisi Disetujui]

    DataSales --> KalkulasiKPI[Sistem: Kalkulasi Skor KPI Akhir]
    DataTeknisi --> KalkulasiKPI
    DataLembur --> KalkulasiLembur[Sistem: Hitung Uang Lembur Berdasarkan Jam]

    KalkulasiKPI --> CekTarget{Skor KPI <br>>= Target?}
    
    CekTarget -- Ya --> AddReward[Sistem: Tambahkan Reward / Insentif Kinerja]
    CekTarget -- Tidak --> NoReward[Sistem: Tanpa Insentif Kinerja]

    AddReward --> RekapPayroll[Sistem: Generate Laporan Payroll Terpadu]
    NoReward --> RekapPayroll
    KalkulasiLembur --> RekapPayroll

    RekapPayroll --> ApprovManajemen{Manajemen/Finance: <br>Approve Payroll?}
    
    ApprovManajemen -- Revisi --> KalkulasiKPI
    ApprovManajemen -- Ya --> Pencairan[Sistem: Rilis Slip Gaji Karyawan <br>& Finance Lakukan Transfer] --> End((Selesai))
