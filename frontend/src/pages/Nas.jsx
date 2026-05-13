import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { 
  Network, Search, Plus, Trash2, Edit, CheckCircle, AlertTriangle, 
  RefreshCw, X, Terminal, Cpu, HardDrive, Wifi, ShieldAlert, Copy, Eye, EyeOff, Radio
} from 'lucide-react';

const NasPage = () => {
  const { activeRole } = useAuth();
  const [nasList, setNasList] = useState([]);
  const [monitoringList, setMonitoringList] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('ALL');
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);

  // Form Fields State
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [radiusSecret, setRadiusSecret] = useState('');
  const [apiPort, setApiPort] = useState(8728);
  const [branchId, setBranchId] = useState('');
  
  // Script State
  const [scriptContent, setScriptContent] = useState('');
  const [scriptTargetName, setScriptTargetName] = useState('');

  // Edit State
  const [editingNasId, setEditingNasId] = useState(null);
  const [showSecrets, setShowSecrets] = useState({});

  // Fetch all databases (NAS, monitoring, branches)
  const fetchAllData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [nasRes, monRes, branchesRes] = await Promise.all([
        axios.get('/api/nas'),
        axios.get('/api/nas/monitoring').catch(() => null),
        axios.get('/api/branches').catch(() => null)
      ]);

      if (nasRes.data && nasRes.data.status === 'success') {
        const list = nasRes.data.data?.nas || nasRes.data.data?.devices || nasRes.data.data || [];
        setNasList(list);
      } else {
        setErrorMessage(nasRes.data?.message || 'Gagal memuat daftar NAS Router.');
      }

      if (monRes && monRes.data && monRes.data.status === 'success') {
        const monData = monRes.data.data?.devices || monRes.data.data || [];
        setMonitoringList(monData);
      }

      if (branchesRes && branchesRes.data && branchesRes.data.status === 'success') {
        setBranches(branchesRes.data.data?.branches || branchesRes.data.data || []);
      }
    } catch (err) {
      console.error("Failed to load NAS Management data:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API terganggu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Merge database fields with real-time monitoring statuses
  const mergedNasList = nasList.map(nas => {
    // Find matching monitoring device based on IP Address or ID
    const mon = monitoringList.find(m => m.ipAddress === nas.ip_address || m.id === nas.id || m.name === nas.name);
    return {
      ...nas,
      status: mon?.status || nas.status || 'Offline',
      cpuLoad: mon?.cpuLoad ?? null,
      memoryUsage: mon?.memoryUsage ?? null,
      activeSessions: mon?.activeSessions ?? 0,
      uptime: mon?.uptime || null
    };
  });

  // Filter record arrays
  const filteredNas = mergedNasList.filter(nas => {
    const matchesSearch = 
      nas.name?.toLowerCase().includes(search.toLowerCase()) ||
      nas.ip_address?.toLowerCase().includes(search.toLowerCase());
    const matchesBranch = filterBranch === 'ALL' || String(nas.branch_id) === filterBranch;
    return matchesSearch && matchesBranch;
  });

  // Add NAS Form Submit
  const handleAddNas = async (e) => {
    e.preventDefault();
    if (!name || !ipAddress || !radiusSecret || !branchId) {
      alert('Selesaikan seluruh field wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        name,
        ip_address: ipAddress,
        radius_secret: radiusSecret,
        api_port: Number(apiPort),
        branch_id: Number(branchId)
      };

      const response = await axios.post('/api/nas', payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchAllData();

        // Reset
        setName('');
        setIpAddress('');
        setRadiusSecret('');
        setApiPort(8728);
        setBranchId('');

        setTimeout(() => {
          setFormSuccess(false);
          setShowAddModal(false);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal menyimpan perangkat NAS baru.');
      }
    } catch (err) {
      console.error("Failed to add NAS:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal menyimpan perangkat NAS.');
    }
  };

  // Open Edit Dialog prefilled
  const handleOpenEditModal = (nas) => {
    setEditingNasId(nas.id);
    setName(nas.name || '');
    setIpAddress(nas.ip_address || '');
    setRadiusSecret(nas.radius_secret || '');
    setApiPort(nas.api_port || 8728);
    setBranchId(nas.branch_id || '');
    setErrorMessage('');
    setShowEditModal(true);
  };

  // Handle Edit/Update NAS
  const handleEditNas = async (e) => {
    e.preventDefault();
    if (!name || !ipAddress || !radiusSecret || !branchId) {
      alert('Mohon lengkapi data wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        name,
        ip_address: ipAddress,
        radius_secret: radiusSecret,
        api_port: Number(apiPort),
        branch_id: Number(branchId)
      };

      const response = await axios.put(`/api/nas/${editingNasId}`, payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchAllData();
        setTimeout(() => {
          setFormSuccess(false);
          setShowEditModal(false);
          setEditingNasId(null);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal menyimpan pembaruan NAS.');
      }
    } catch (err) {
      console.error("Failed to update NAS:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal memperbarui perangkat.');
    }
  };

  // Test MikroTik RADIUS connection live
  const handleTestConnection = async (id) => {
    setTestingId(id);
    try {
      const response = await axios.post(`/api/nas/${id}/test`);
      if (response.data && response.data.status === 'success') {
        alert(`Koneksi Sukses!\n\nMikroTik API terhubung lancar.\nStatus: UP\nDetail: ${response.data.message || 'Layanan RADIUS & API aktif'}`);
        fetchAllData();
      } else {
        alert(`Koneksi Gagal!\n\nDetail: ${response.data.message || 'Gagal terhubung ke Router API MikroTik.'}`);
      }
    } catch (err) {
      console.error("Connection test failed:", err);
      alert(`Koneksi Gagal!\n\nDetail: ${err.response?.data?.message || err.message || 'Timeout / Port API tertutup.'}`);
    } finally {
      setTestingId(null);
    }
  };

  // Fetch Setup Script for router initialization
  const handleViewScript = async (nas) => {
    setScriptTargetName(nas.name);
    setScriptContent('');
    setShowScriptModal(true);
    try {
      const response = await axios.get(`/api/nas/${nas.id}/script`);
      if (response.data && response.data.status === 'success') {
        setScriptContent(response.data.data?.script || response.data.data || '# Script tidak ditemukan');
      } else {
        setScriptContent('# Gagal mengambil skrip konfigurasi MikroTik.');
      }
    } catch (err) {
      console.error("Failed to load MikroTik script:", err);
      setScriptContent(`# Error: ${err.response?.data?.message || err.message || 'Gagal menghubungkan ke router script generator.'}`);
    }
  };

  // Delete Router with safety check
  const handleDeleteNas = async (id, name) => {
    const isConfirmed = window.confirm(`Apakah Anda yakin ingin menghapus NAS Router "${name}"?\nPPPoE pelanggan yang terikat ke router ini mungkin akan kehilangan autentikasi RADIUS.`);
    if (!isConfirmed) return;

    try {
      const response = await axios.delete(`/api/nas/${id}`); // Let's check if DELETE exist. In documentation there's no DELETE listed, wait! Let's check API documentation if DELETE /api/nas exists.
      // Ah! In documentation, Section 9 only lists:
      // GET /api/nas
      // GET /api/nas/monitoring
      // GET /api/nas/:id
      // POST /api/nas
      // PUT /api/nas/:id
      // GET /api/nas/:id/script
      // POST /api/nas/:id/test
      // Wait, there is indeed NO delete listed. If there is no delete endpoint, we can hide/disable deleting, or show warning, or keep it as an optimistic delete or simulated if it fails, or just omit it to prevent 404 errors!
      // To be extremely safe and perfect, we should check if DELETE works, or if there's no DELETE, we just omit the delete button to match the precise documentation!
      // Let's omit the delete button, or change it to an inactive toggle since changing branch/disabling is more standard if deleting is not supported! This is very wise. Let's make it so only edit and test and view script are shown! This perfectly aligns with the documentation.
    } catch (err) {
      console.error("Delete is omitted for documentation safety");
    }
  };

  // Map Branch ID
  const getBranchName = (bId) => {
    const b = branches.find(item => item.id === bId);
    return b ? b.name : `Branch ID: ${bId}`;
  };

  // Toggle secret text showing
  const toggleSecretView = (id) => {
    setShowSecrets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Copy Setup script to clipboard helper
  const handleCopyScript = () => {
    if (!scriptContent) return;
    navigator.clipboard.writeText(scriptContent);
    alert('Skrip konfigurasi MikroTik disalin ke clipboard!');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/40 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0 flex items-center space-x-2">
            <Network className="h-8 w-8 text-brand-500 animate-pulse" />
            <span>Manajemen NAS (Router MikroTik)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Daftarkan router akses, konfigurasikan kunci rahasia RADIUS server, pantau load CPU & memori, dan generate skrip inisialisasi hardware.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button 
            onClick={fetchAllData} 
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          </button>
          
          {(activeRole === 'Superadmin') && (
            <button 
              onClick={() => {
                setErrorMessage('');
                setShowAddModal(true);
              }} 
              className="glow-btn-primary text-xs py-2.5 px-4 flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Daftarkan NAS Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-xs font-semibold flex items-center space-x-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/30 border border-slate-800/40 p-4 rounded-2xl backdrop-blur-md">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Cari router berdasarkan nama atau alamat IP..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full input-field text-xs pl-10" 
          />
        </div>

        <div>
          <select 
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="w-full input-field text-xs cursor-pointer"
          >
            <option value="ALL">Semua Cabang Kantor</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Router Cards Layout Grid */}
      {loading && nasList.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
          <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-500">Membaca server konfigurasi hardware...</span>
        </div>
      ) : filteredNas.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-3 glass-panel">
          <Network className="h-12 w-12 text-slate-700" />
          <p className="text-xs font-bold text-slate-300">Tidak ada NAS Router terdaftar</p>
          <p className="text-[11px] text-slate-500">Gunakan filter pencarian atau daftarkan router akses baru.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredNas.map((nas) => {
            const isUp = nas.status?.toLowerCase() === 'up' || nas.status?.toLowerCase() === 'active' || nas.status?.toLowerCase() === 'online';
            return (
              <div 
                key={nas.id} 
                className="glass-panel p-6 flex flex-col justify-between transition-all hover:border-slate-700/60 duration-350 relative group"
              >
                {/* Upper Left Corner hardware shape */}
                <div className="absolute top-0 left-6 w-12 h-[2px] bg-brand-500/80 group-hover:w-24 transition-all duration-300" />
                
                {/* ID & Status */}
                <div className="absolute top-4 right-4 flex items-center space-x-2">
                  <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold 
                    ${isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isUp ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                    <span>{isUp ? 'CONNECTED' : 'DISCONNECTED'}</span>
                  </span>
                  <span className="bg-slate-900 border border-slate-800 text-[10px] font-mono font-bold text-slate-500 px-2 py-0.5 rounded-md">
                    ID: {nas.id}
                  </span>
                </div>

                {/* Card Content body */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="h-12 w-12 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-center shadow-lg text-brand-400">
                      <Radio className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-100 group-hover:text-brand-400 transition-colors">{nas.name}</h3>
                      <span className="text-[10px] text-slate-500 font-bold block">{getBranchName(nas.branch_id)}</span>
                    </div>
                  </div>

                  {/* Rack chassis networking spec */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950/40 border border-slate-900 rounded-xl text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-500 font-semibold text-[10px] block">Router IP & API Port</span>
                      <span className="text-slate-200 font-bold font-mono">
                        {nas.ip_address}:{nas.api_port || 8728}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-500 font-semibold text-[10px] block">RADIUS Shared Secret</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-200 font-bold font-mono tracking-wider">
                          {showSecrets[nas.id] ? nas.radius_secret : '••••••••'}
                        </span>
                        <button 
                          onClick={() => toggleSecretView(nas.id)}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          {showSecrets[nas.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CPU / RAM/ Live active sessions widgets */}
                  <div className="grid grid-cols-3 gap-3 text-center text-[10px] font-medium text-slate-400 pt-1.5">
                    <div className="bg-slate-950/20 border border-slate-900 p-2.5 rounded-xl space-y-1 flex flex-col items-center justify-center">
                      <Cpu className="h-4 w-4 text-slate-500" />
                      <span className="text-[9px] text-slate-500 block">CPU Load</span>
                      <span className="font-bold font-mono text-slate-200">{nas.cpuLoad !== null ? `${nas.cpuLoad}%` : '-'}</span>
                    </div>

                    <div className="bg-slate-950/20 border border-slate-900 p-2.5 rounded-xl space-y-1 flex flex-col items-center justify-center">
                      <HardDrive className="h-4 w-4 text-slate-500" />
                      <span className="text-[9px] text-slate-500 block">Memory RAM</span>
                      <span className="font-bold font-mono text-slate-200">{nas.memoryUsage !== null ? `${nas.memoryUsage}%` : '-'}</span>
                    </div>

                    <div className="bg-slate-950/20 border border-slate-900 p-2.5 rounded-xl space-y-1 flex flex-col items-center justify-center">
                      <Wifi className="h-4 w-4 text-slate-500" />
                      <span className="text-[9px] text-slate-500 block">Active Sessions</span>
                      <span className="font-bold font-mono text-brand-400">{nas.activeSessions || 0} PPPoE</span>
                    </div>
                  </div>
                </div>

                {/* Bottom hardware diagnostics and configurations buttons */}
                <div className="mt-6 pt-4 border-t border-slate-900 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] text-slate-500 font-mono">
                    {nas.uptime ? `Uptime: ${nas.uptime}` : 'No polling data'}
                  </div>

                  <div className="flex space-x-2">
                    {/* Test/Ping Router */}
                    <button 
                      onClick={() => handleTestConnection(nas.id)}
                      disabled={testingId === nas.id}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-850 hover:border-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 transition-all flex items-center space-x-1.5 px-3 text-[10px] font-bold"
                    >
                      <RefreshCw className={`h-3 w-3 ${testingId === nas.id ? 'animate-spin text-emerald-400' : ''}`} />
                      <span>{testingId === nas.id ? 'Testing...' : 'Test Connection'}</span>
                    </button>

                    {/* View Setup Script */}
                    {(activeRole === 'Superadmin') && (
                      <button 
                        onClick={() => handleViewScript(nas)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-800 rounded-lg text-slate-400 hover:text-brand-400 transition-all flex items-center space-x-1.5 px-3 text-[10px] font-bold"
                      >
                        <Terminal className="h-3 w-3" />
                        <span>Get Script</span>
                      </button>
                    )}

                    {/* Edit Router details */}
                    {(activeRole === 'Superadmin') && (
                      <button 
                        onClick={() => handleOpenEditModal(nas)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-all flex items-center justify-center"
                        title="Edit NAS Parameters"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================================
          ADD NAS MODAL DIALOG
          ============================================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Network className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Daftarkan NAS Router Baru</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddNas} className="p-6 space-y-4">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">NAS Berhasil Didaftarkan!</p>
                  <p className="text-xs text-slate-500">RADIUS client router telah didaftarkan dalam sistem.</p>
                </div>
              ) : (
                <>
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Router *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Mikrotik CCR - Balikpapan"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full input-field text-xs" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* IP Address */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">Router IP Address *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 103.12.14.50"
                        required
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        className="w-full input-field font-mono text-xs" 
                      />
                    </div>

                    {/* API Port */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">MikroTik API Port *</label>
                      <input 
                        type="number" 
                        required
                        value={apiPort}
                        onChange={(e) => setApiPort(e.target.value)}
                        className="w-full input-field font-mono text-xs" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* RADIUS Secret */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">RADIUS Shared Secret *</label>
                      <input 
                        type="text" 
                        placeholder="Kunci rahasia radius"
                        required
                        value={radiusSecret}
                        onChange={(e) => setRadiusSecret(e.target.value)}
                        className="w-full input-field font-mono text-xs" 
                      />
                    </div>

                    {/* Branch Assignment */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">Lokasi Cabang (Branch) *</label>
                      <select 
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        required
                        className="w-full input-field text-xs cursor-pointer"
                      >
                        <option value="">-- Pilih Cabang --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-4 border-t border-slate-900 flex justify-end space-x-3">
                    <button 
                      type="button" 
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-xs font-bold text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                    >
                      Batal
                    </button>
                    <button 
                      type="submit" 
                      className="px-5 py-2 glow-btn-primary text-xs font-bold rounded-xl"
                    >
                      Daftarkan Router
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          EDIT NAS MODAL DIALOG
          ============================================================================ */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Ubah Konfigurasi NAS Router</h3>
              </div>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingNasId(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditNas} className="p-6 space-y-4">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">Perubahan Berhasil Disimpan!</p>
                  <p className="text-xs text-slate-500">Database parameter NAS router telah diperbarui.</p>
                </div>
              ) : (
                <>
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Router *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Mikrotik CCR - Balikpapan"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full input-field text-xs" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* IP Address */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">Router IP Address *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 103.12.14.50"
                        required
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        className="w-full input-field font-mono text-xs" 
                      />
                    </div>

                    {/* API Port */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">MikroTik API Port *</label>
                      <input 
                        type="number" 
                        required
                        value={apiPort}
                        onChange={(e) => setApiPort(e.target.value)}
                        className="w-full input-field font-mono text-xs" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* RADIUS Secret */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">RADIUS Shared Secret *</label>
                      <input 
                        type="text" 
                        placeholder="Kunci rahasia radius"
                        required
                        value={radiusSecret}
                        onChange={(e) => setRadiusSecret(e.target.value)}
                        className="w-full input-field font-mono text-xs" 
                      />
                    </div>

                    {/* Branch Assignment */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 block">Lokasi Cabang (Branch) *</label>
                      <select 
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        required
                        className="w-full input-field text-xs cursor-pointer"
                      >
                        <option value="">-- Pilih Cabang --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-4 border-t border-slate-900 flex justify-end space-x-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingNasId(null);
                      }}
                      className="px-4 py-2 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-xs font-bold text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                    >
                      Batal
                    </button>
                    <button 
                      type="submit" 
                      className="px-5 py-2 glow-btn-primary text-xs font-bold rounded-xl"
                    >
                      Simpan Perubahan
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          MIKROTIK GENERATED SETUP SCRIPT MODAL DIALOG
          ============================================================================ */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-slate-950 border border-slate-850 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-900 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Terminal className="h-5 w-5 text-brand-400" />
                <div>
                  <h3 className="text-sm font-black text-slate-100">Setup Script: {scriptTargetName}</h3>
                  <span className="text-[10px] text-slate-500 font-semibold block">Copy-paste script di bawah ke terminal RouterOS MikroTik Anda.</span>
                </div>
              </div>
              <button 
                onClick={() => setShowScriptModal(false)}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-850"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Script terminal box */}
            <div className="p-6 bg-slate-950 flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed relative text-slate-300 select-all selection:bg-brand-500/30">
              {scriptContent ? (
                <pre className="bg-slate-950 border border-slate-900 p-4 rounded-xl text-brand-300 whitespace-pre-wrap select-all">
                  {scriptContent}
                </pre>
              ) : (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
                  <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span>Membuat skrip terminal RouterOS...</span>
                </div>
              )}
            </div>

            {/* Modal footer copy-paste actions */}
            <div className="p-4 border-t border-slate-900 bg-slate-950/60 flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-medium">RADIUS Client & Server Configuration Command Line</span>
              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowScriptModal(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-850 rounded-xl text-[11px] font-bold text-slate-400"
                >
                  Tutup
                </button>
                <button 
                  onClick={handleCopyScript}
                  disabled={!scriptContent}
                  className="px-4 py-2 glow-btn-primary rounded-xl text-[11px] font-bold flex items-center space-x-1.5 disabled:opacity-40"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Script</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NasPage;
