import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { 
  Cpu, Activity, Shield, Users, Power, Plus, Trash2, Key, Layers, RefreshCw, Server, Settings, Globe, AlertTriangle, ShieldCheck, HelpCircle, ArrowUpRight, ArrowDownLeft, Sliders, Search, Info
} from 'lucide-react';

const VpnChr = () => {
  const { activeRole } = useAuth();
  const [activeTab, setActiveTab] = useState('status');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  // States for API data
  const [systemStatus, setSystemStatus] = useState(null);
  const [secrets, setSecrets] = useState([]);
  const [activeConnections, setActiveConnections] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [ipPools, setIpPools] = useState([]);

  // States for forms and dialogs
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [secretForm, setSecretForm] = useState({ name: '', password: '', service: 'any', profile: 'default', remote_address: '' });

  const [showAddProfile, setShowAddProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', local_address: '', remote_address: '', rate_limit: '' });

  const [showAddPool, setShowAddPool] = useState(false);
  const [poolForm, setPoolForm] = useState({ name: '', ranges: '' });

  // States for client connection scripts helper
  const [clientChrHost, setClientChrHost] = useState('192.168.79.1');
  const [clientVpnUser, setClientVpnUser] = useState('client-username');
  const [clientVpnPass, setClientVpnPass] = useState('password123');
  const [clientInterfaceName, setClientInterfaceName] = useState('vpn-uwais');
  const [copiedScript, setCopiedScript] = useState('');

  // States for static IP within pool allocation
  const [useStaticIp, setUseStaticIp] = useState(false);
  const [staticIpAddress, setStaticIpAddress] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState('');

  // Helpers to validate IP address inside range
  const ipToLong = (ip) => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return 0;
    return (parts[0] * 16777216) + (parts[1] * 65536) + (parts[2] * 256) + parts[3];
  };

  const isIpInRange = (ip, rangeStr) => {
    if (!ip || !rangeStr) return true;
    const singleRanges = rangeStr.split(',');
    const ipNum = ipToLong(ip);
    if (ipNum === 0) return false;

    for (const r of singleRanges) {
      const bounds = r.trim().split('-');
      if (bounds.length === 2) {
        const startNum = ipToLong(bounds[0].trim());
        const endNum = ipToLong(bounds[1].trim());
        if (ipNum >= startNum && ipNum <= endNum) {
          return true;
        }
      } else if (bounds.length === 1) {
        if (ipNum === ipToLong(bounds[0].trim())) {
          return true;
        }
      }
    }
    return false;
  };

  // Search/Filters states
  const [secretSearch, setSecretSearch] = useState('');
  const [secretFilterService, setSecretFilterService] = useState('ALL');
  const [activeSearch, setActiveSearch] = useState('');

  // Fetch all CHR data
  const fetchAllData = async (forceDemo = false) => {
    setLoading(true);
    setErrorMessage('');
    try {
      if (forceDemo) {
        throw new Error("Simulated offline error to trigger Demo Mode");
      }

      // Fetch status, secrets, connections, profiles, and pools concurrently
      const [statusRes, secretsRes, connectionsRes, profilesRes, poolsRes] = await Promise.all([
        axios.get('/api/vpn-chr/status').catch(e => ({ isError: true, error: e })),
        axios.get('/api/vpn-chr/secrets').catch(e => ({ isError: true, error: e })),
        axios.get('/api/vpn-chr/active-connections').catch(e => ({ isError: true, error: e })),
        axios.get('/api/vpn-chr/profiles').catch(e => ({ isError: true, error: e })),
        axios.get('/api/vpn-chr/ip-pools').catch(e => ({ isError: true, error: e }))
      ]);

      // If key APIs are completely unreachable, we fallback to demo mode
      if (statusRes.isError && secretsRes.isError) {
        throw new Error("CHR Mikrotik Router is currently unreachable.");
      }

      // Populate system status
      if (!statusRes.isError && statusRes.data?.status === 'success') {
        const rawStatus = statusRes.data.data;
        const statusObj = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
        setSystemStatus(statusObj);
        if (statusObj && statusObj.configured_host) {
          setClientChrHost(statusObj.configured_host);
        }
      }

      // Populate secrets
      if (!secretsRes.isError && secretsRes.data?.status === 'success') {
        setSecrets(secretsRes.data.data || []);
      }

      // Populate connections
      if (!connectionsRes.isError && connectionsRes.data?.status === 'success') {
        setActiveConnections(connectionsRes.data.data || []);
      }

      // Populate profiles
      if (!profilesRes.isError && profilesRes.data?.status === 'success') {
        setProfiles(profilesRes.data.data || []);
      }

      // Populate IP pools
      if (!poolsRes.isError && poolsRes.data?.status === 'success') {
        setIpPools(poolsRes.data.data || []);
      }

      setIsDemoMode(false);
    } catch (err) {
      console.warn("Mikrotik CHR actual connection failed. Switched to high-fidelity Simulator Mode.", err);
      loadSimulatorData();
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  };

  // Populate realistic simulator mockup data
  const loadSimulatorData = () => {
    setSystemStatus({
      'uptime': '4w2d18h34m12s',
      'version': '7.12.1 (Stable)',
      'cpu-load': 14,
      'free-memory': 1852416000,
      'total-memory': 2147483648,
      'cpu': 'tile',
      'cpu-count': 4,
      'board-name': 'CHR',
      'cpu-frequency': 2400,
      'configured_host': '192.168.79.1'
    });

    setSecrets([
      { id: '*1', name: 'vpn-nas-balikpapan', service: 'l2tp', profile: 'profile-high-speed', password: '••••••••', comment: 'Link NAS Cabang' },
      { id: '*2', name: 'vpn-nas-wajol', service: 'sstp', profile: 'profile-high-speed', password: '••••••••', comment: 'Backup tunnel' },
      { id: '*3', name: 'teknisi-arie', service: 'pptp', profile: 'default', password: '••••••••', comment: 'Remote Teknisi' },
      { id: '*4', name: 'teknisi-budi', service: 'ovpn', profile: 'default', password: '••••••••', comment: 'Mobile OVPN' },
    ]);

    setActiveConnections([
      { id: '*a1', name: 'vpn-nas-balikpapan', service: 'l2tp', 'caller-id': '182.16.42.105', address: '172.16.10.254', uptime: '12d 04h 12m', 'bytes-sent': 1420584903, 'bytes-received': 529140294 },
      { id: '*a2', name: 'teknisi-arie', service: 'pptp', 'caller-id': '114.122.34.82', address: '172.16.10.150', uptime: '02h 45m 11s', 'bytes-sent': 2409581, 'bytes-received': 1058291 },
    ]);

    setProfiles([
      { id: '*p1', name: 'default', 'local-address': '172.16.10.1', 'remote-address': 'vpn-pool', 'rate-limit': '10M/10M' },
      { id: '*p2', name: 'profile-high-speed', 'local-address': '172.16.10.1', 'remote-address': 'vpn-pool', 'rate-limit': '100M/100M' },
    ]);

    setIpPools([
      { id: '*i1', name: 'vpn-pool', ranges: '172.16.10.100-172.16.10.250' }
    ]);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Format memory strings
  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Submit Action: Add Secret
  const handleAddSecret = async (e) => {
    e.preventDefault();
    if (!secretForm.name || !secretForm.password) return;

    const payload = {
      ...secretForm,
      remote_address: useStaticIp ? staticIpAddress : secretForm.remote_address
    };

    try {
      if (isDemoMode) {
        // Add to simulator state
        const newSec = {
          id: `*sim_${Date.now()}`,
          name: payload.name,
          password: '••••••••',
          service: payload.service,
          profile: payload.profile,
          comment: 'Ditambahkan via Simulator'
        };
        setSecrets([...secrets, newSec]);
        setShowAddSecret(false);
        setSecretForm({ name: '', password: '', service: 'any', profile: 'default', remote_address: '' });
        setUseStaticIp(false);
        setStaticIpAddress('');
        setSelectedPoolId('');
        return;
      }

      const res = await axios.post('/api/vpn-chr/secrets', payload);
      if (res.data?.status === 'success') {
        setShowAddSecret(false);
        setSecretForm({ name: '', password: '', service: 'any', profile: 'default', remote_address: '' });
        setUseStaticIp(false);
        setStaticIpAddress('');
        setSelectedPoolId('');
        fetchAllData();
      }
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.errors && Array.isArray(respData.errors)) {
        const errorDetails = respData.errors.map(e => `• ${e.field}: ${e.message}`).join('\n');
        alert(`Gagal menambah secret:\n${errorDetails}`);
      } else {
        alert(`Gagal menambah secret: ${respData?.message || err.message}`);
      }
    }
  };

  // Delete Action: Remove Secret
  const handleDeleteSecret = async (id, name) => {
    if (!window.confirm(`Hapus VPN Secret akun "${name}"?`)) return;

    try {
      if (isDemoMode) {
        setSecrets(secrets.filter(s => (s.id !== id && s['.id'] !== id)));
        return;
      }

      const res = await axios.delete(`/api/vpn-chr/secrets/${id}`);
      if (res.data?.status === 'success') {
        fetchAllData();
      }
    } catch (err) {
      alert(`Gagal menghapus secret: ${err.response?.data?.message || err.message}`);
    }
  };

  // Disconnect Action: Kick session
  const handleDisconnect = async (id, name) => {
    if (!window.confirm(`Putuskan sambungan aktif untuk user "${name}"?`)) return;

    try {
      if (isDemoMode) {
        setActiveConnections(activeConnections.filter(c => (c.id !== id && c['.id'] !== id)));
        return;
      }

      const res = await axios.post(`/api/vpn-chr/disconnect/${id}`);
      if (res.data?.status === 'success') {
        fetchAllData();
      }
    } catch (err) {
      alert(`Gagal memutus sambungan: ${err.response?.data?.message || err.message}`);
    }
  };

  // Submit Action: Add Profile
  const handleAddProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.name) return;

    try {
      if (isDemoMode) {
        const newProf = {
          id: `*sim_p_${Date.now()}`,
          name: profileForm.name,
          'local-address': profileForm.local_address || '172.16.10.1',
          'remote-address': profileForm.remote_address || 'vpn-pool',
          'rate-limit': profileForm.rate_limit || '10M/10M'
        };
        setProfiles([...profiles, newProf]);
        setShowAddProfile(false);
        setProfileForm({ name: '', local_address: '', remote_address: '', rate_limit: '' });
        return;
      }

      const res = await axios.post('/api/vpn-chr/profiles', profileForm);
      if (res.data?.status === 'success') {
        setShowAddProfile(false);
        setProfileForm({ name: '', local_address: '', remote_address: '', rate_limit: '' });
        fetchAllData();
      }
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.errors && Array.isArray(respData.errors)) {
        const errorDetails = respData.errors.map(e => `• ${e.field}: ${e.message}`).join('\n');
        alert(`Gagal membuat profile:\n${errorDetails}`);
      } else {
        alert(`Gagal membuat profile: ${respData?.message || err.message}`);
      }
    }
  };

  // Submit Action: Add IP Pool
  const handleAddPool = async (e) => {
    e.preventDefault();
    if (!poolForm.name || !poolForm.ranges) return;

    try {
      if (isDemoMode) {
        const newPool = {
          id: `*sim_i_${Date.now()}`,
          name: poolForm.name,
          ranges: poolForm.ranges
        };
        setIpPools([...ipPools, newPool]);
        setShowAddPool(false);
        setPoolForm({ name: '', ranges: '' });
        return;
      }

      const res = await axios.post('/api/vpn-chr/ip-pools', poolForm);
      if (res.data?.status === 'success') {
        setShowAddPool(false);
        setPoolForm({ name: '', ranges: '' });
        fetchAllData();
      }
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.errors && Array.isArray(respData.errors)) {
        const errorDetails = respData.errors.map(e => `• ${e.field}: ${e.message}`).join('\n');
        alert(`Gagal membuat IP Pool:\n${errorDetails}`);
      } else {
        alert(`Gagal membuat IP Pool: ${respData?.message || err.message}`);
      }
    }
  };

  // Filtration logic for secrets
  const filteredSecrets = secrets.filter(sec => {
    const sName = sec.name || '';
    const sComment = sec.comment || '';
    const sService = sec.service || '';

    const matchesSearch = sName.toLowerCase().includes(secretSearch.toLowerCase()) ||
                          sComment.toLowerCase().includes(secretSearch.toLowerCase());
    const matchesService = secretFilterService === 'ALL' || sService.toLowerCase() === secretFilterService.toLowerCase();
    return matchesSearch && matchesService;
  });

  // Filtration for active sessions
  const filteredActive = activeConnections.filter(con => {
    const cName = con.name || '';
    const cCaller = con['caller-id'] || '';
    const cAddr = con.address || '';
    return cName.toLowerCase().includes(activeSearch.toLowerCase()) ||
           cCaller.toLowerCase().includes(activeSearch.toLowerCase()) ||
           cAddr.toLowerCase().includes(activeSearch.toLowerCase());
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0 flex items-center space-x-2">
            <Globe className="h-8 w-8 text-brand-400" />
            <span>VPN CHR <span className="gradient-text-primary">Mikrotik</span></span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manajemen terpusat tunnel VPN (PPTP, L2TP, SSTP, OpenVPN) pada RouterOS Mikrotik Cloud Hosted Router (CHR) utama.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-center">
          <button 
            onClick={() => fetchAllData()}
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          </button>

          {activeRole === 'Superadmin' && (
            <button
              onClick={() => {
                if (activeTab === 'secrets') setShowAddSecret(true);
                else if (activeTab === 'profiles') setShowAddProfile(true);
                else setShowAddPool(true);
              }}
              disabled={activeTab === 'status' || activeTab === 'active' || activeTab === 'scripts'}
              className="glow-btn-primary text-xs py-2.5 px-5 flex items-center space-x-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Plus className="h-4 w-4" />
              <span>
                {activeTab === 'secrets' ? 'Tambah Akun VPN' : 
                 activeTab === 'profiles' ? 'Buat PPP Profile' : 'Tambah IP Pool'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* DEMO MODE SIMULATION WARNING BANNER */}
      {isDemoMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in fade-in">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-amber-200 block">Router Mikrotik Utama Sedang Offline (Simulator Mode)</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Sistem otomatis mengaktifkan Simulator Interaktif agar Anda tetap dapat memantau, mendesain, dan melihat kapabilitas fitur VPN ini.</span>
            </div>
          </div>
          <button 
            onClick={() => fetchAllData()} 
            className="px-4 py-1.5 bg-amber-500 text-slate-950 font-extrabold text-xs rounded-lg hover:bg-amber-400 transition-all self-start md:self-center"
          >
            Hubungkan Ulang Router
          </button>
        </div>
      )}

      <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-none">
        {[
          { id: 'status', label: 'Router Status', icon: Cpu },
          { id: 'secrets', label: 'VPN Accounts (Secrets)', icon: Key },
          { id: 'active', label: 'Active Connections', icon: Activity },
          { id: 'profiles', label: 'PPP Profiles & Pools', icon: Sliders },
          { id: 'scripts', label: 'Panduan & Script Client', icon: HelpCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-5 py-3.5 border-b-2 font-bold text-xs whitespace-nowrap transition-all
                ${activeTab === tab.id 
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/15'
                }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.id === 'active' && activeConnections.length > 0 && (
                <span className="ml-1 bg-brand-500/20 border border-brand-400/20 px-1.5 py-0.2 rounded-full text-[9px] text-brand-400 font-extrabold">
                  {activeConnections.length} Connected
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CORE DISPLAY PANELS */}
      <div className="space-y-6">

        {/* TAB 1: ROUTER SYSTEM STATUS */}
        {activeTab === 'status' && systemStatus && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
            {/* Spec Card */}
            <div className="lg:col-span-1 glass-panel p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="h-10 w-10 bg-brand-500/15 border border-brand-500/20 rounded-xl flex items-center justify-center text-brand-400">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Spesifikasi Router</h3>
                    <span className="text-[10px] text-slate-500">Kredensial Cloud Hosted Router</span>
                  </div>
                </div>

                <div className="space-y-3.5 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Platform OS</span>
                    <span className="font-mono text-slate-200 font-bold">Mikrotik RouterOS</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Arsitektur</span>
                    <span className="font-mono text-slate-200 font-bold">{systemStatus['cpu'] || 'x86_64'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Board Name</span>
                    <span className="font-mono text-slate-200 font-bold">{systemStatus['board-name'] || 'CHR'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">RouterOS Version</span>
                    <span className="font-mono text-brand-400 font-bold">{systemStatus['version'] || 'v7'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Jumlah CPU Core</span>
                    <span className="font-mono text-slate-200 font-bold">{systemStatus['cpu-count'] || '1'} Core</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Frekuensi CPU</span>
                    <span className="font-mono text-slate-200 font-bold">{systemStatus['cpu-frequency'] || '2400'} MHz</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-4 mt-6">
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">System Uptime</span>
                  <span className="bg-slate-900 border border-slate-800 text-brand-300 font-mono font-bold px-2.5 py-1 rounded-lg text-[10px]">
                    {systemStatus['uptime'] || '0s'}
                  </span>
                </div>
              </div>
            </div>

            {/* Performance Gauges */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CPU Load Gauge */}
              <div className="glass-panel p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 mb-1 flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <span>Beban Kerja CPU (Load)</span>
                  </h3>
                  <p className="text-[10px] text-slate-500">Persentase pengolahan paket data VPN saat ini</p>
                </div>

                <div className="my-6 flex flex-col items-center justify-center">
                  <div className="relative h-28 w-28 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-slate-800/60" />
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-t-emerald-500 border-r-emerald-500 border-b-transparent border-l-transparent animate-spin-slow"
                      style={{ transform: `rotate(${(systemStatus['cpu-load'] || 0) * 3.6}deg)` }}
                    />
                    <span className="text-2xl font-black text-slate-100 font-mono">{systemStatus['cpu-load'] || 0}%</span>
                  </div>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 p-3 rounded-xl text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Status Processor</span>
                  <span className="text-xs text-emerald-400 font-extrabold mt-0.5 block">Kondisi Stabil / Sehat</span>
                </div>
              </div>

              {/* Memory Usage Gauge */}
              <div className="glass-panel p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 mb-1 flex items-center space-x-2">
                    <Cpu className="h-4 w-4 text-indigo-400" />
                    <span>Penggunaan RAM / Memory</span>
                  </h3>
                  <p className="text-[10px] text-slate-500">Alokasi memori sistem untuk tabel routing VPN</p>
                </div>

                {(() => {
                  const freeMem = systemStatus['free-memory'] || 0;
                  const totalMem = systemStatus['total-memory'] || 1;
                  const usedMem = totalMem - freeMem;
                  const usagePct = Math.round((usedMem / totalMem) * 100);

                  return (
                    <>
                      <div className="my-6 flex flex-col items-center justify-center">
                        <div className="relative h-28 w-28 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-4 border-slate-800/60" />
                          <span className="text-2xl font-black text-slate-100 font-mono">{usagePct}%</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-center border-t border-slate-800 pt-4">
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold uppercase block">Digunakan</span>
                          <span className="text-xs font-bold text-slate-300 font-mono block mt-0.5">{formatBytes(usedMem)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold uppercase block">Kapasitas Total</span>
                          <span className="text-xs font-bold text-slate-300 font-mono block mt-0.5">{formatBytes(totalMem)}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: VPN ACCOUNTS / SECRETS */}
        {activeTab === 'secrets' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Filter controls */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                <input 
                  type="text" 
                  value={secretSearch}
                  onChange={(e) => setSecretSearch(e.target.value)}
                  placeholder="Cari akun VPN berdasarkan nama atau deskripsi..." 
                  className="w-full input-field pl-11 text-xs"
                />
              </div>

              <div className="flex items-center space-x-3 overflow-x-auto">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Layanan:</span>
                {['ALL', 'PPTP', 'L2TP', 'SSTP', 'OVPN'].map((svc) => (
                  <button
                    key={svc}
                    onClick={() => setSecretFilterService(svc)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all
                      ${secretFilterService === svc 
                        ? 'bg-brand-500 border-brand-400 text-white shadow-sm shadow-brand-500/10' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>

            {/* SECRETS DATA TABLE */}
            <div className="glass-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/40">
                      <th className="py-4 px-6 font-semibold">User Secret (.id)</th>
                      <th className="py-4 px-6 font-semibold">Username VPN</th>
                      <th className="py-4 px-6 font-semibold">Password</th>
                      <th className="py-4 px-6 font-semibold">Protokol Service</th>
                      <th className="py-4 px-6 font-semibold">PPP Profile</th>
                      <th className="py-4 px-6 font-semibold">Keterangan / Comment</th>
                      {activeRole === 'Superadmin' && <th className="py-4 px-6 font-semibold text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredSecrets.length > 0 ? (
                      filteredSecrets.map((sec) => {
                        const secId = sec.id || sec['.id'];
                        return (
                          <tr key={secId} className="hover:bg-slate-800/15 transition-colors group">
                            <td className="py-4 px-6 font-mono font-bold text-brand-400">{secId}</td>
                            <td className="py-4 px-6 font-bold text-slate-200">{sec.name}</td>
                            <td className="py-4 px-6 font-mono text-slate-500">{sec.password || '••••••••'}</td>
                            <td className="py-4 px-6">
                              <span className={`uppercase font-extrabold px-2.5 py-0.5 rounded-lg text-[9px] border
                                ${sec.service === 'l2tp' ? 'bg-indigo-500/10 border-indigo-400/20 text-indigo-400' :
                                  sec.service === 'sstp' ? 'bg-amber-500/10 border-amber-400/20 text-amber-400' :
                                  sec.service === 'ovpn' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-400' :
                                  'bg-cyan-500/10 border-cyan-400/20 text-cyan-400'
                                }`}>
                                {sec.service || 'any'}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-slate-400 font-medium">
                              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg text-[10px]">
                                {sec.profile}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-slate-400 italic max-w-xs truncate" title={sec.comment}>{sec.comment || '-'}</td>
                            {activeRole === 'Superadmin' && (
                              <td className="py-4 px-6 text-center">
                                <button 
                                  onClick={() => handleDeleteSecret(secId, sec.name)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                  title="Delete Account"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500 font-semibold">
                          <Info className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                          <span>Tidak ada VPN secrets yang terdaftar / cocok dengan filter</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ACTIVE CONNECTIONS */}
        {activeTab === 'active' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Search controls */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                <input 
                  type="text" 
                  value={activeSearch}
                  onChange={(e) => setActiveSearch(e.target.value)}
                  placeholder="Cari user aktif berdasarkan nama, IP Publik, atau IP VPN..." 
                  className="w-full input-field pl-11 text-xs"
                />
              </div>

              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Total Sesi Terhubung: <span className="text-brand-400">{filteredActive.length}</span>
              </div>
            </div>

            {/* ACTIVE CONNECTIONS DATA TABLE */}
            <div className="glass-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/40">
                      <th className="py-4 px-6 font-semibold">Sesi ID (.id)</th>
                      <th className="py-4 px-6 font-semibold">Nama Akun (User)</th>
                      <th className="py-4 px-6 font-semibold">Protokol Service</th>
                      <th className="py-4 px-6 font-semibold">IP Publik (Caller ID)</th>
                      <th className="py-4 px-6 font-semibold">IP Address Tersemat</th>
                      <th className="py-4 px-6 font-semibold">Durasi Koneksi (Uptime)</th>
                      <th className="py-4 px-6 font-semibold">Traffic (TX / RX)</th>
                      <th className="py-4 px-6 font-semibold text-center">Konektivitas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredActive.length > 0 ? (
                      filteredActive.map((con) => {
                        const conId = con.id || con['.id'];
                        return (
                          <tr key={conId} className="hover:bg-slate-800/15 transition-colors group">
                            <td className="py-4 px-6 font-mono font-bold text-brand-400">{conId}</td>
                            <td className="py-4 px-6 font-bold text-slate-200">{con.name}</td>
                            <td className="py-4 px-6">
                              <span className="uppercase font-extrabold px-2.5 py-0.5 bg-brand-500/10 border border-brand-400/20 text-brand-400 rounded-lg text-[9px]">
                                {con.service || 'unknown'}
                              </span>
                            </td>
                            <td className="py-4 px-6 font-mono text-slate-400">{con['caller-id'] || '127.0.0.1'}</td>
                            <td className="py-4 px-6 font-mono text-emerald-400 font-bold">{con.address || '-'}</td>
                            <td className="py-4 px-6 font-mono text-slate-300 font-medium">{con.uptime}</td>
                            <td className="py-4 px-6 font-mono text-slate-500 space-y-0.5">
                              <div className="flex items-center space-x-1">
                                <ArrowUpRight className="h-3 w-3 text-brand-400" />
                                <span>{formatBytes(con['bytes-sent'] || con['tx-bytes'])}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <ArrowDownLeft className="h-3 w-3 text-indigo-400" />
                                <span>{formatBytes(con['bytes-received'] || con['rx-bytes'])}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <button 
                                onClick={() => handleDisconnect(conId, con.name)}
                                className="px-3 py-1 bg-rose-500/15 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white font-bold rounded-lg text-[10px] transition-all"
                                title="Disconnect User Session"
                              >
                                Disconnect
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500 font-semibold">
                          <Activity className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                          <span>Tidak ada sesi koneksi VPN aktif saat ini</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PPP PROFILES & IP POOLS */}
        {activeTab === 'profiles' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-150">
            
            {/* PPP PROFILES PANEL */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                  <Sliders className="h-4 w-4 text-brand-400" />
                  <span>PPP Profiles</span>
                </h3>
                <span className="text-[10px] text-slate-500">Profil bandwidth dan segmentasi ip</span>
              </div>

              <div className="space-y-3.5">
                {profiles.map((prof) => {
                  const profId = prof.id || prof['.id'];
                  return (
                    <div key={profId} className="bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl flex justify-between items-center hover:border-slate-700/80 transition-all">
                      <div>
                        <span className="font-extrabold text-slate-200 block text-xs">{prof.name}</span>
                        <div className="flex items-center space-x-4 mt-1.5 text-[10px] text-slate-500 font-semibold">
                          <div>
                            Local IP: <span className="font-mono text-slate-400">{prof['local-address'] || '-'}</span>
                          </div>
                          <div>
                            Remote Pool: <span className="font-mono text-slate-400">{prof['remote-address'] || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {prof['rate-limit'] && (
                        <span className="bg-brand-500/10 border border-brand-400/20 text-brand-400 font-mono font-bold px-2.5 py-0.5 rounded-lg text-[10px]">
                          {prof['rate-limit']}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* IP POOLS PANEL */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-indigo-400" />
                  <span>IP Pools</span>
                </h3>
                <span className="text-[10px] text-slate-500">Rentang alokasi ip dinamis client</span>
              </div>

              <div className="space-y-3.5">
                {ipPools.map((pool) => {
                  const poolId = pool.id || pool['.id'];
                  return (
                    <div key={poolId} className="bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl flex justify-between items-center hover:border-slate-700/80 transition-all">
                      <div>
                        <span className="font-extrabold text-slate-200 block text-xs">{pool.name}</span>
                        <span className="text-[10px] text-slate-500 font-semibold mt-1 block">Tipe Distribusi: DHCP/VPN</span>
                      </div>

                      <span className="bg-slate-900 border border-slate-800 font-mono text-slate-300 px-3 py-1 rounded-lg text-[10px]">
                        {pool.ranges}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* TAB 5: CLIENT SETUP SCRIPTS HELPER */}
        {activeTab === 'scripts' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
            {/* Input Config Form */}
            <div className="lg:col-span-1 glass-panel p-6 space-y-4">
              <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
                <div className="h-10 w-10 bg-brand-500/15 border border-brand-500/20 rounded-xl flex items-center justify-center text-brand-400">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Konfigurasi Client</h3>
                  <span className="text-[10px] text-slate-500">Sesuaikan data akun client Anda</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Domain / IP CHR Server</label>
                  <input 
                    type="text" 
                    value={clientChrHost}
                    onChange={(e) => setClientChrHost(e.target.value)}
                    placeholder="e.g. 192.168.79.1" 
                    className="w-full input-field text-xs" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nama Interface VPN Client</label>
                  <input 
                    type="text" 
                    value={clientInterfaceName}
                    onChange={(e) => setClientInterfaceName(e.target.value)}
                    placeholder="e.g. vpn-uwais" 
                    className="w-full input-field text-xs font-mono" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Username VPN Client</label>
                  <input 
                    type="text" 
                    value={clientVpnUser}
                    onChange={(e) => setClientVpnUser(e.target.value)}
                    placeholder="Username" 
                    className="w-full input-field text-xs font-mono" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Password VPN Client</label>
                  <input 
                    type="text" 
                    value={clientVpnPass}
                    onChange={(e) => setClientVpnPass(e.target.value)}
                    placeholder="Password" 
                    className="w-full input-field text-xs font-mono" 
                  />
                </div>
              </div>
            </div>

            {/* Generated Scripts Viewer */}
            <div className="lg:col-span-2 space-y-6">
              {[
                { 
                  name: 'PPTP Client (Simple VPN)', 
                  desc: 'Protokol VPN ringan, cepat diatur, cocok untuk link cadangan non-enkripsi berat.',
                  command: `/interface pptp-client add name="${clientInterfaceName}" connect-to="${clientChrHost}" user="${clientVpnUser}" password="${clientVpnPass}" disabled=no comment="VPN Client UwaisApps"`
                },
                { 
                  name: 'L2TP Client (Recommended)', 
                  desc: 'Lebih aman dan stabil dibandingkan PPTP, direkomendasikan untuk interkoneksi router client.',
                  command: `/interface l2tp-client add name="${clientInterfaceName}" connect-to="${clientChrHost}" user="${clientVpnUser}" password="${clientVpnPass}" use-ipsec=no disabled=no comment="VPN Client UwaisApps"`
                },
                { 
                  name: 'SSTP Client (High Security)', 
                  desc: 'Menggunakan port TCP 443 (HTTPS), sangat aman dan sanggup menembus blokir firewall ISP ketat.',
                  command: `/interface sstp-client add name="${clientInterfaceName}" connect-to="${clientChrHost}" user="${clientVpnUser}" password="${clientVpnPass}" disabled=no comment="VPN Client UwaisApps"`
                },
                { 
                  name: 'OpenVPN Client (OVPN)', 
                  desc: 'Protokol standar industri dengan enkripsi tinggi (menggunakan port TCP/UDP 1194).',
                  command: `/interface ovpn-client add name="${clientInterfaceName}" connect-to="${clientChrHost}" port=1194 mode=ip user="${clientVpnUser}" password="${clientVpnPass}" cipher=aes128 disabled=no comment="VPN Client UwaisApps"`
                }
              ].map((proto, idx) => (
                <div key={idx} className="glass-panel p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">{proto.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-1">{proto.desc}</p>
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(proto.command);
                        setCopiedScript(proto.name);
                        setTimeout(() => setCopiedScript(''), 2000);
                      }}
                      className="text-[10px] font-bold py-1 px-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 hover:text-brand-400 hover:bg-slate-800 transition-all flex items-center space-x-1"
                    >
                      <span>{copiedScript === proto.name ? 'Tersalin!' : 'Salin Script'}</span>
                    </button>
                  </div>

                  <div className="relative bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl overflow-x-auto">
                    <pre className="text-[11px] font-mono text-emerald-400 select-all whitespace-pre-wrap leading-relaxed">{proto.command}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* MODAL: ADD SECRET ACCOUNT */}
      {showAddSecret && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3 mb-5">Tambah Akun VPN Baru</h3>
            
            <form onSubmit={handleAddSecret} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Username VPN *</label>
                <input 
                  type="text" 
                  required
                  value={secretForm.name}
                  onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })}
                  placeholder="e.g. balikpapan-vpn" 
                  className="w-full input-field text-xs" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Password *</label>
                <input 
                  type="password" 
                  required
                  value={secretForm.password}
                  onChange={(e) => setSecretForm({ ...secretForm, password: e.target.value })}
                  placeholder="Password minimal 6 karakter" 
                  className="w-full input-field text-xs font-mono" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Protokol VPN *</label>
                  <select 
                    value={secretForm.service}
                    onChange={(e) => setSecretForm({ ...secretForm, service: e.target.value })}
                    className="w-full input-field select-field text-xs py-2"
                  >
                    <option value="any">Any (Multi-Protokol)</option>
                    <option value="pptp">PPTP</option>
                    <option value="l2tp">L2TP</option>
                    <option value="sstp">SSTP</option>
                    <option value="ovpn">OpenVPN (ovpn)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">PPP Profile</label>
                  <select 
                    value={secretForm.profile}
                    onChange={(e) => setSecretForm({ ...secretForm, profile: e.target.value })}
                    className="w-full input-field select-field text-xs py-2"
                  >
                    <option value="default">default</option>
                    {profiles.map(p => (
                      <option key={p.id || p['.id']} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3.5 border-t border-slate-800/60 pt-4 mt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Gunakan IP Statik Khusus?</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={useStaticIp} 
                      onChange={(e) => {
                        setUseStaticIp(e.target.checked);
                        if (!e.target.checked) setStaticIpAddress('');
                      }} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-slate-950 peer-checked:after:border-brand-400" />
                  </label>
                </div>

                {!useStaticIp ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Remote IP / Pool Alokasi</label>
                    <select 
                      value={secretForm.remote_address}
                      onChange={(e) => setSecretForm({ ...secretForm, remote_address: e.target.value })}
                      className="w-full input-field select-field text-xs py-2"
                    >
                      <option value="">-- Gunakan Profil PPP Default --</option>
                      {ipPools.map(pool => (
                        <option key={pool.id || pool['.id']} value={pool.name}>
                          {pool.name} ({pool.ranges})
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Menentukan rentang IP Pool alokasi khusus untuk client ini.</span>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Acuan IP Pool Jaringan *</label>
                      <select 
                        value={selectedPoolId}
                        onChange={(e) => {
                          setSelectedPoolId(e.target.value);
                          const chosen = ipPools.find(p => (p.id === e.target.value || p['.id'] === e.target.value));
                          if (chosen && chosen.ranges) {
                            // Suggest the first IP in the range as a guide
                            const firstIp = chosen.ranges.split('-')[0].trim();
                            setStaticIpAddress(firstIp);
                          }
                        }}
                        className="w-full input-field select-field text-xs py-2"
                      >
                        <option value="">-- Pilih Pool untuk Acuan Range --</option>
                        {ipPools.map(pool => (
                          <option key={pool.id || pool['.id']} value={pool.id || pool['.id']}>
                            {pool.name} ({pool.ranges})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Alamat IP Statik Client *</label>
                      <input 
                        type="text"
                        required={useStaticIp}
                        value={staticIpAddress}
                        onChange={(e) => setStaticIpAddress(e.target.value)}
                        placeholder="e.g. 172.16.10.125"
                        className="w-full input-field text-xs font-mono"
                      />
                      
                      {(() => {
                        const chosen = ipPools.find(p => (p.id === selectedPoolId || p['.id'] === selectedPoolId));
                        if (chosen && staticIpAddress) {
                          const valid = isIpInRange(staticIpAddress, chosen.ranges);
                          if (!valid) {
                            return (
                              <span className="text-[10px] text-rose-400 font-bold block mt-1 animate-pulse">
                                ⚠️ Peringatan: IP ini berada di luar rentang pool {chosen.name} ({chosen.ranges})
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-[10px] text-emerald-400 font-bold block mt-1">
                                ✓ IP valid berada di dalam rentang pool {chosen.name}
                              </span>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowAddSecret(false)} 
                  className="glow-btn-secondary text-xs font-semibold py-2"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="glow-btn-primary text-xs font-bold py-2 px-6"
                >
                  Tambah Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PPP PROFILE */}
      {showAddProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3 mb-5">Buat PPP Profile Baru</h3>
            
            <form onSubmit={handleAddProfile} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nama Profile *</label>
                <input 
                  type="text" 
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="e.g. profile-vpn-vip" 
                  className="w-full input-field text-xs" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">IP Lokal (Local Address Gateway)</label>
                <input 
                  type="text" 
                  value={profileForm.local_address}
                  onChange={(e) => setProfileForm({ ...profileForm, local_address: e.target.value })}
                  placeholder="e.g. 172.16.10.1" 
                  className="w-full input-field text-xs font-mono" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Remote Address / Pool</label>
                  <select 
                    value={profileForm.remote_address}
                    onChange={(e) => setProfileForm({ ...profileForm, remote_address: e.target.value })}
                    className="w-full input-field select-field text-xs py-2"
                  >
                    <option value="">-- Pilih Pool / IP --</option>
                    {ipPools.map(pool => (
                      <option key={pool.id || pool['.id']} value={pool.name}>{pool.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Rate Limit Bandwidth</label>
                  <input 
                    type="text" 
                    value={profileForm.rate_limit}
                    onChange={(e) => setProfileForm({ ...profileForm, rate_limit: e.target.value })}
                    placeholder="e.g. 20M/20M" 
                    className="w-full input-field text-xs font-mono" 
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowAddProfile(false)} 
                  className="glow-btn-secondary text-xs font-semibold py-2"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="glow-btn-primary text-xs font-bold py-2 px-6"
                >
                  Buat Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD IP POOL */}
      {showAddPool && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3 mb-5">Tambah IP Pool Baru</h3>
            
            <form onSubmit={handleAddPool} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nama IP Pool *</label>
                <input 
                  type="text" 
                  required
                  value={poolForm.name}
                  onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
                  placeholder="e.g. vpn-pool-balikpapan" 
                  className="w-full input-field text-xs" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Rentang IP (Ranges) *</label>
                <input 
                  type="text" 
                  required
                  value={poolForm.ranges}
                  onChange={(e) => setPoolForm({ ...poolForm, ranges: e.target.value })}
                  placeholder="e.g. 172.16.10.10-172.16.10.100" 
                  className="w-full input-field text-xs font-mono" 
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowAddPool(false)} 
                  className="glow-btn-secondary text-xs font-semibold py-2"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="glow-btn-primary text-xs font-bold py-2 px-6"
                >
                  Buat IP Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default VpnChr;
