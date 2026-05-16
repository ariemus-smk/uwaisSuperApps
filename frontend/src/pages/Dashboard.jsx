import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import axios from 'axios';
import { 
  Users, Wifi, CreditCard, Activity, AlertTriangle, Play, HelpCircle, 
  Send, ShieldCheck, HardDrive, Key, CheckCircle, ArrowUpRight, TrendingUp, DollarSign
} from 'lucide-react';

const Dashboard = () => {
  const { activeRole, user } = useAuth();
  const [wifiSsid, setWifiSsid] = useState('UwaisFiber_Arie');
  const [wifiPass, setWifiPass] = useState('S3kumpul@25');
  const [isSavedWifi, setIsSavedWifi] = useState(false);

  // Live dynamic statistics state
  const [stats, setStats] = useState({
    totalCustomers: 0,
    pppoeActive: 0,
    monthlyRevenue: 0,
    activeTickets: 0,
    loading: true
  });
  const [nasList, setNasList] = useState([]);

  useEffect(() => {
    if (activeRole === 'Superadmin' || activeRole === 'Admin') {
      const fetchDashboardData = async () => {
        try {
          // 1. Fetch total customers
          let customersCount = 0;
          try {
            const custRes = await axios.get('/api/customers?limit=1');
            if (custRes.data?.status === 'success') {
              customersCount = custRes.data.data?.total || 0;
            }
          } catch (err) {
            console.error("Failed to fetch customers count:", err);
          }

          // 2. Fetch NAS & active sessions monitoring
          let activeSessionsCount = 0;
          let devicesList = [];
          try {
            const nasRes = await axios.get('/api/nas/monitoring');
            if (nasRes.data?.status === 'success') {
              activeSessionsCount = nasRes.data.data?.summary?.totalActiveSessions || 0;
              devicesList = nasRes.data.data?.devices || [];
            }
          } catch (err) {
            console.error("Failed to fetch NAS monitoring:", err);
          }

          // 3. Fetch financial/revenue report
          let revenueAmount = 0;
          try {
            const finRes = await axios.get('/api/reports/financial?reportType=income');
            if (finRes.data?.status === 'success') {
              revenueAmount = finRes.data.data?.income?.summary?.totalRevenue || 0;
            }
          } catch (err) {
            console.error("Failed to fetch financial report:", err);
          }

          // 4. Fetch active tickets count
          let openTicketsCount = 0;
          try {
            const ticketRes = await axios.get('/api/tickets?status=Open&limit=1');
            if (ticketRes.data?.status === 'success') {
              openTicketsCount = ticketRes.data.pagination?.totalItems || 0;
            }
          } catch (err) {
            console.error("Failed to fetch tickets count:", err);
          }

          setStats({
            totalCustomers: customersCount,
            pppoeActive: activeSessionsCount,
            monthlyRevenue: revenueAmount,
            activeTickets: openTicketsCount,
            loading: false
          });
          setNasList(devicesList);
        } catch (error) {
          console.error("Error fetching dashboard stats:", error);
          setStats(prev => ({ ...prev, loading: false }));
        }
      };

      fetchDashboardData();
    }
  }, [activeRole]);

  const handleWifiSave = (e) => {
    e.preventDefault();
    setIsSavedWifi(true);
    setTimeout(() => setIsSavedWifi(false), 3000);
  };

  // 1. SUPERADMIN / ADMIN DASHBOARD
  const renderAdminDashboard = () => {
    const displayCustomers = stats.totalCustomers;
    const displayActivePppoe = stats.pppoeActive;
    const displayRevenue = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(stats.monthlyRevenue);
    const displayTickets = stats.activeTickets;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Pelanggan" value={displayCustomers.toString()} icon={Users} change="Real-time" changeType="increase" gradient="violet" subtext="Registered customers" />
          <StatCard title="PPPoE Aktif" value={`${displayActivePppoe} / ${displayCustomers}`} icon={Wifi} change="Sesi Aktif" changeType="increase" gradient="emerald" subtext="Current sessions" />
          <StatCard title="Bulanan Revenue" value={displayRevenue} icon={CreditCard} change="Total Keuangan" changeType="increase" gradient="emerald" subtext="Collected this month" />
          <StatCard title="Active Tickets" value={displayTickets.toString()} icon={AlertTriangle} change="Tiket Open" changeType="decrease" gradient="rose" subtext="Open complaints" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Router Gateways status */}
          <div className="glass-panel p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">NAS Gateway Router Status (FreeRADIUS CoAs)</h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                {nasList.filter(d => (d.poll_status || d.status || '').toLowerCase() === 'up' || (d.poll_status || d.status || '').toLowerCase() === 'active' || (d.poll_status || d.status || '').toLowerCase() === 'online').length} Active NAS
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Router Name</th>
                    <th className="pb-3 font-semibold">IP Address</th>
                    <th className="pb-3 font-semibold">Ping Latency</th>
                    <th className="pb-3 font-semibold">PPPoE Sesi</th>
                    <th className="pb-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {nasList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-500 font-medium">
                        Tidak ada Router NAS aktif. Silakan daftarkan router pusat di menu Manajemen NAS.
                      </td>
                    </tr>
                  ) : (
                    nasList.map((router, i) => {
                      const isUp = (router.poll_status || router.status || '').toLowerCase() === 'up' || (router.poll_status || router.status || '').toLowerCase() === 'active' || (router.poll_status || router.status || '').toLowerCase() === 'online';
                      return (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="py-3 font-bold text-slate-300">{router.name}</td>
                          <td className="py-3 text-slate-400">{router.ip_address || router.ipAddress || router.ip}</td>
                          <td className="py-3 font-mono text-slate-400">{router.ping || '---'}</td>
                          <td className="py-3 text-slate-300">
                            {router.active_sessions !== undefined ? router.active_sessions : (router.activeSessions !== undefined ? router.activeSessions : 0)} active
                          </td>
                          <td className="py-3">
                            <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold 
                              ${isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-rose-400 animate-ping'}`} />
                              <span>{isUp ? 'UP' : 'DOWN'}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Operations panel */}
          <div className="glass-panel p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Quick Operations</h3>
              <div className="space-y-3">
                <button className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/60 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-brand-500/10 text-brand-400 rounded-lg"><Activity className="h-4 w-4" /></div>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">Test CoA Ping</span>
                      <span className="text-[10px] text-slate-500 block">Force router authorization check</span>
                    </div>
                  </div>
                  <Play className="h-3.5 w-3.5 text-slate-500" />
                </button>

                <button className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/60 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg"><AlertTriangle className="h-4 w-4" /></div>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">Trigger Auto-Isolir</span>
                      <span className="text-[10px] text-slate-500 block">Perform isolation (due date check)</span>
                    </div>
                  </div>
                  <Play className="h-3.5 w-3.5 text-slate-500" />
                </button>

                <button className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/60 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Send className="h-4 w-4" /></div>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">Send WA Broadcast</span>
                      <span className="text-[10px] text-slate-500 block">Mass invoice reminder alert</span>
                    </div>
                  </div>
                  <Play className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-slate-500 text-[10px] font-semibold flex items-center space-x-2 mt-4">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>RADIUS database and SSH bridge fully synced.</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 2. ACCOUNTING DASHBOARD
  const renderAccountingDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Pemasukan Kas" value="Rp 86,100,000" icon={DollarSign} change="11.4%" changeType="increase" gradient="emerald" subtext="Collected invoices" />
        <StatCard title="Piutang Outstanding" value="Rp 4,250,000" icon={CreditCard} change="8 Invoice" changeType="increase" gradient="rose" subtext="Unpaid bills" />
        <StatCard title="Denda Terkumpul" value="Rp 750,000" icon={TrendingUp} change="Auto-apply PPN 11%" changeType="increase" gradient="violet" subtext="PPN enabled profile" />
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Pending Waiver / Pemutihan Requests</h3>
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/60 text-center py-8">
          <ShieldCheck className="h-10 w-10 text-emerald-500/80 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-300">All waiver requests approved or resolved</p>
          <p className="text-[10px] text-slate-500 mt-1">When technicians or admins apply for customer pemutihan, they appear here.</p>
        </div>
      </div>
    </div>
  );

  // 3. MITRA DASHBOARD
  const renderMitraDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Saldo Deposit Mitra" value="Rp 1,500,000" icon={DollarSign} change="Topup Active" changeType="increase" gradient="emerald" subtext="To perform instant cash payment" />
        <StatCard title="Total Pelanggan Saya" value="24" icon={Users} change="3 Baru" changeType="increase" gradient="violet" subtext="Registered under my code" />
        <StatCard title="Bagi Hasil Bulan Ini" value="Rp 1,800,000" icon={TrendingUp} change="15% Komisi" changeType="increase" gradient="emerald" subtext="Dynamic sharing profile" />
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Mitra Fast Quick links</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-xs font-bold text-slate-300 block mb-1">Daftar Pelanggan Baru</span>
            <span className="text-[11px] text-slate-500 block mb-3">Input data KTP & nomor WhatsApp pelanggan baru di area kemitraan Anda.</span>
            <button className="glow-btn-primary py-2 text-xs font-bold w-full">Buka CRM Input</button>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-xs font-bold text-slate-300 block mb-1">Top Up Saldo</span>
            <span className="text-[11px] text-slate-500 block mb-3">Top up your prepaid balance first to allow customers to pay cash through your counter.</span>
            <button className="glow-btn-secondary py-2 text-xs font-bold w-full">Request Top-Up</button>
          </div>
        </div>
      </div>
    </div>
  );

  // 4. SALES DASHBOARD
  const renderSalesDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Input Leads Baru" value="18 Prospek" icon={Users} change="12 Tercover" changeType="increase" gradient="violet" subtext="Registered prospek leads" />
        <StatCard title="Coverage Success Rate" value="66.6%" icon={TrendingUp} change="Within 500m ODP" changeType="increase" gradient="emerald" subtext="Network reachability" />
        <StatCard title="Sales Commission" value="Rp 900,000" icon={DollarSign} change="Rp 50K / customer" changeType="increase" gradient="emerald" subtext="Commission generated" />
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Check Fiber Coverage</h3>
        <p className="text-xs text-slate-500 mb-4">Verify instantly if a client location is viable for installation by plotting coordinates.</p>
        <button className="glow-btn-primary text-xs font-bold py-2.5">Open Map Coverage Tool</button>
      </div>
    </div>
  );

  // 5. MERCHANT DASHBOARD
  const renderMerchantDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard title="Saldo Top-Up Biller" value="Rp 2,450,000" icon={DollarSign} change="Active" changeType="increase" gradient="emerald" subtext="Merchant balance" />
        <StatCard title="Total Komisi Admin" value="Rp 312,000" icon={TrendingUp} change="Rp 2,500 / trx" changeType="increase" gradient="violet" subtext="Accumulated commissions" />
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Accept Bill Payment</h3>
        <form onSubmit={(e) => { e.preventDefault(); alert('Inquiry lookup successful!'); }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">Customer ID / WhatsApp</label>
            <div className="flex space-x-2">
              <input type="text" placeholder="e.g. UWS0024" className="input-field flex-1 text-xs" />
              <button type="submit" className="glow-btn-primary text-xs py-2 px-6">Inquiry</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  // 6. TEKNISI DASHBOARD
  const renderTeknisiDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Tiket Kerja Aktif" value="3 Tiket" icon={AlertTriangle} change="2 VIP" changeType="increase" gradient="rose" subtext="Assigned work tickets" />
        <StatCard title="Instalasi Baru Ready" value="2 Order" icon={Wifi} change="SLA 24 hours" changeType="increase" gradient="violet" subtext="Awaiting on-site splicing" />
        <StatCard title="SLA Resolusi KPI" value="98.2%" icon={CheckCircle} change="+1.2%" changeType="increase" gradient="emerald" subtext="Average repair timing" />
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Your Active Tasks (Multi Work Orders)</h3>
        <div className="space-y-3">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div className="space-y-1">
              <span className="text-xs bg-rose-500/15 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold text-rose-400 uppercase tracking-wider">VIP Complaint</span>
              <h4 className="text-sm font-bold text-slate-200">Kabel Putus Tertimpa Pohon - ODP-BPN-B05</h4>
              <span className="text-xs text-slate-500 block">Customer: Budi Santoso | Jl. Soekarno Hatta KM 2</span>
            </div>
            <button className="glow-btn-primary text-xs font-bold mt-3 md:mt-0 py-2">Open Splicing Log</button>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div className="space-y-1">
              <span className="text-xs bg-violet-500/15 border border-violet-500/20 px-2 py-0.5 rounded-full font-bold text-brand-400 uppercase tracking-wider">Pasang Baru</span>
              <h4 className="text-sm font-bold text-slate-200">Instalasi Baru - Paket Broadband 20M</h4>
              <span className="text-xs text-slate-500 block">Customer: Siti Rahayu | Jl. MT Haryono No 45</span>
            </div>
            <button className="glow-btn-secondary text-xs font-bold mt-3 md:mt-0 py-2">Start Activation Wizard</button>
          </div>
        </div>
      </div>
    </div>
  );

  // 7. PELANGGAN DASHBOARD (CUSTOMER PORTAL)
  const renderPelangganDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Status card */}
        <div className="glass-panel p-6 flex flex-col justify-between bg-gradient-to-br from-emerald-500/10 to-teal-500/2 hover:border-emerald-500/30">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Status Koneksi</span>
              <span className="text-2xl font-black text-slate-100 block">Internet Aktif</span>
            </div>
            <div className="p-3 rounded-xl text-emerald-400 bg-emerald-500/10"><Wifi className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/40 text-xs text-slate-400 flex justify-between">
            <span>Paket: Broadband 20 Mbps</span>
            <span className="text-emerald-400 font-bold">IP: 10.20.10.150</span>
          </div>
        </div>

        {/* Invoice card */}
        <div className="glass-panel p-6 flex flex-col justify-between bg-gradient-to-br from-rose-500/10 to-pink-500/2 hover:border-rose-500/30">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Tagihan Bulan Mei</span>
              <span className="text-2xl font-black text-slate-100 block">Rp 222,000</span>
            </div>
            <div className="p-3 rounded-xl text-rose-400 bg-rose-500/10"><CreditCard className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/40 text-xs text-slate-400 flex justify-between items-center">
            <span>Jatuh Tempo: 10 Mei 23:59</span>
            <span className="text-rose-400 font-bold">UNPAID (Isolir soon!)</span>
          </div>
        </div>

        {/* Helpdesk ticket status */}
        <div className="glass-panel p-6 flex flex-col justify-between bg-gradient-to-br from-violet-500/10 to-indigo-500/2 hover:border-violet-500/30">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Laporan Gangguan</span>
              <span className="text-2xl font-black text-slate-100 block">Tidak Ada Tiket</span>
            </div>
            <div className="p-3 rounded-xl text-brand-400 bg-brand-500/10"><HelpCircle className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/40 text-xs text-slate-400">
            <span>Kondisi modem normal (ONT RX: -19.4 dBm)</span>
          </div>
        </div>
      </div>

      {/* WIFI SSID AND PASSWORD CHANGER CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Manajemen Wi-Fi Rumah (ACS TR-069)</h3>
          <p className="text-xs text-slate-500 mb-6">Ubah SSID dan Password WiFi modem Anda langsung dari panel ini. Sistem akan mengupdate konfigurasi modem ZTE/Huawei Anda secara instan via protokol TR-069.</p>

          <form onSubmit={handleWifiSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Nama Wi-Fi (SSID)</label>
                <div className="relative">
                  <Wifi className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    className="w-full input-field text-xs pl-10" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Kata Sandi Baru</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    className="w-full input-field text-xs pl-10" 
                  />
                </div>
              </div>
            </div>

            {isSavedWifi && (
              <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>Wi-Fi SSID & password changed successfully in modem via TR-069 ACS!</span>
              </div>
            )}

            <button type="submit" className="glow-btn-primary text-xs py-2 px-6">Simpan Konfigurasi Wi-Fi</button>
          </form>
        </div>

        {/* Quick billing summary */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Bayar Tagihan Instan</h3>
            <p className="text-xs text-slate-500 mb-4">You have 1 UNPAID bill. Pay instantly via QRIS or Virtual Account using TRIPAY gateway.</p>
            <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 font-semibold">Invoice No</span><span className="text-slate-300 font-mono font-bold">INV-2026-0504</span></div>
              <div className="flex justify-between"><span className="text-slate-500 font-semibold">Amount</span><span className="text-brand-400 font-black">Rp 222,000</span></div>
            </div>
          </div>
          <button className="glow-btn-primary w-full text-xs py-3 flex items-center justify-center space-x-2">
            <span>Bayar Sekarang (TRIPAY)</span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderDashboardByRole = () => {
    switch (activeRole) {
      case 'Superadmin':
      case 'Admin':
        return renderAdminDashboard();
      case 'Accounting':
        return renderAccountingDashboard();
      case 'Mitra':
        return renderMitraDashboard();
      case 'Sales':
        return renderSalesDashboard();
      case 'Merchant':
        return renderMerchantDashboard();
      case 'Teknisi':
        return renderTeknisiDashboard();
      case 'Pelanggan':
        return renderPelangganDashboard();
      default:
        return renderPelangganDashboard();
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Welcome header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800/40 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Selamat Datang, <span className="gradient-text-primary">{user?.full_name || 'User'}</span>!
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            You are logged in as <strong className="text-brand-400">{activeRole}</strong> in <strong className="text-slate-300">{activeRole === 'Superadmin' ? 'All Branch' : (user?.branch_id ? `Cabang ID: ${user.branch_id}` : 'All Branch')}</strong>.
          </p>
        </div>
        <div className="mt-4 md:mt-0 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 flex items-center space-x-2">
          <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
          <span>System Status: Fully Operational</span>
        </div>
      </div>

      {/* Scoped Dashboard Core View */}
      {renderDashboardByRole()}
    </div>
  );
};

export default Dashboard;
