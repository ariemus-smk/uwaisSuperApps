import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { 
  Gauge, Search, Plus, Trash2, Edit, CheckCircle, AlertTriangle, 
  RefreshCw, X, ShieldAlert, BadgePercent, Zap, HelpCircle, HardDrive
} from 'lucide-react';

const PackagesPage = () => {
  const { activeRole } = useAuth();
  const [packages, setPackages] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Form Fields State
  const [name, setName] = useState('');
  const [uploadRateLimit, setUploadRateLimit] = useState(20480); // kbps default (20 Mbps)
  const [downloadRateLimit, setDownloadRateLimit] = useState(20480);
  const [uploadBurstLimit, setUploadBurstLimit] = useState(30720); // kbps default (30 Mbps)
  const [downloadBurstLimit, setDownloadBurstLimit] = useState(30720);
  const [uploadBurstThreshold, setUploadBurstThreshold] = useState(15360); // kbps (15 Mbps)
  const [downloadBurstThreshold, setDownloadBurstThreshold] = useState(15360);
  const [monthlyPrice, setMonthlyPrice] = useState(200000); // Rupiah
  const [ppnEnabled, setPpnEnabled] = useState(false);
  const [fupEnabled, setFupEnabled] = useState(false);
  const [fupQuotaGb, setFupQuotaGb] = useState('');
  const [fupUploadSpeed, setFupUploadSpeed] = useState('');
  const [fupDownloadSpeed, setFupDownloadSpeed] = useState('');
  const [status, setStatus] = useState('Active');
  const [ipPool, setIpPool] = useState('');
  
  // Edit State
  const [editingPackageId, setEditingPackageId] = useState(null);

  // Fetch packages from backend
  const fetchPackages = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/packages');
      if (response.data && response.data.status === 'success') {
        const pkgs = response.data.data?.packages || response.data.data || [];
        setPackages(pkgs);
      } else {
        setPackages([]);
        setErrorMessage(response.data?.message || 'Gagal memuat paket internet.');
      }
    } catch (err) {
      console.error("Failed to fetch packages:", err);
      setPackages([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi ke server terganggu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  // Utility to convert kbps to Mbps/Gbps cleanly for display
  const formatSpeed = (kbps) => {
    if (!kbps || isNaN(kbps)) return '0 Kbps';
    const num = Number(kbps);
    if (num >= 1048576) {
      return `${(num / 1048576).toFixed(1).replace('.0', '')} Gbps`;
    }
    if (num >= 1024) {
      return `${(num / 1024).toFixed(0)} Mbps`;
    }
    return `${num} Kbps`;
  };

  // Filter package records
  const filteredPackages = packages.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Handle Add Package
  const handleAddPackage = async (e) => {
    e.preventDefault();
    if (!name || !uploadRateLimit || !downloadRateLimit || !monthlyPrice) {
      alert('Mohon lengkapi parameter kecepatan dan harga paket!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        name,
        upload_rate_limit: Number(uploadRateLimit),
        download_rate_limit: Number(downloadRateLimit),
        upload_burst_limit: Number(uploadBurstLimit || uploadRateLimit),
        download_burst_limit: Number(downloadBurstLimit || downloadRateLimit),
        upload_burst_threshold: Number(uploadBurstThreshold || uploadRateLimit),
        download_burst_threshold: Number(downloadBurstThreshold || downloadRateLimit),
        monthly_price: Number(monthlyPrice),
        ppn_enabled: Boolean(ppnEnabled),
        fup_enabled: Boolean(fupEnabled),
        fup_quota_gb: fupEnabled && fupQuotaGb ? Number(fupQuotaGb) : null,
        fup_upload_speed: fupEnabled && fupUploadSpeed ? Number(fupUploadSpeed) : null,
        fup_download_speed: fupEnabled && fupDownloadSpeed ? Number(fupDownloadSpeed) : null,
        status,
        ip_pool: ipPool || null
      };

      const response = await axios.post('/api/packages', payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchPackages();

        // Reset fields
        setName('');
        setUploadRateLimit(20480);
        setDownloadRateLimit(20480);
        setUploadBurstLimit(30720);
        setDownloadBurstLimit(30720);
        setUploadBurstThreshold(15360);
        setDownloadBurstThreshold(15360);
        setMonthlyPrice(200000);
        setPpnEnabled(false);
        setFupEnabled(false);
        setFupQuotaGb('');
        setFupUploadSpeed('');
        setFupDownloadSpeed('');
        setStatus('Active');
        setIpPool('');

        setTimeout(() => {
          setFormSuccess(false);
          setShowAddModal(false);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal menambahkan paket baru.');
      }
    } catch (err) {
      console.error("Failed to add package:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal menambahkan paket baru.');
    }
  };

  // Open Edit Modal with prefilled parameters
  const handleOpenEditModal = (p) => {
    setEditingPackageId(p.id);
    setName(p.name || '');
    setUploadRateLimit(p.upload_rate_limit || 0);
    setDownloadRateLimit(p.download_rate_limit || 0);
    setUploadBurstLimit(p.upload_burst_limit || 0);
    setDownloadBurstLimit(p.download_burst_limit || 0);
    setUploadBurstThreshold(p.upload_burst_threshold || 0);
    setDownloadBurstThreshold(p.download_burst_threshold || 0);
    setMonthlyPrice(p.monthly_price || 0);
    setPpnEnabled(p.ppn_enabled || false);
    setFupEnabled(p.fup_enabled || false);
    setFupQuotaGb(p.fup_quota_gb || '');
    setFupUploadSpeed(p.fup_upload_speed || '');
    setFupDownloadSpeed(p.fup_download_speed || '');
    setStatus(p.status || 'Active');
    setIpPool(p.ip_pool || '');
    setErrorMessage('');
    setShowEditModal(true);
  };

  // Handle Update Package Form Submission
  const handleEditPackage = async (e) => {
    e.preventDefault();
    if (!name || !uploadRateLimit || !downloadRateLimit || !monthlyPrice) {
      alert('Selesaikan parameter kecepatan dan harga paket wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        name,
        upload_rate_limit: Number(uploadRateLimit),
        download_rate_limit: Number(downloadRateLimit),
        upload_burst_limit: Number(uploadBurstLimit || uploadRateLimit),
        download_burst_limit: Number(downloadBurstLimit || downloadRateLimit),
        upload_burst_threshold: Number(uploadBurstThreshold || uploadRateLimit),
        download_burst_threshold: Number(downloadBurstThreshold || downloadRateLimit),
        monthly_price: Number(monthlyPrice),
        ppn_enabled: Boolean(ppnEnabled),
        fup_enabled: Boolean(fupEnabled),
        fup_quota_gb: fupEnabled && fupQuotaGb ? Number(fupQuotaGb) : null,
        fup_upload_speed: fupEnabled && fupUploadSpeed ? Number(fupUploadSpeed) : null,
        fup_download_speed: fupEnabled && fupDownloadSpeed ? Number(fupDownloadSpeed) : null,
        status,
        ip_pool: ipPool || null
      };

      const response = await axios.put(`/api/packages/${editingPackageId}`, payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchPackages();
        setTimeout(() => {
          setFormSuccess(false);
          setShowEditModal(false);
          setEditingPackageId(null);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal mengubah data paket.');
      }
    } catch (err) {
      console.error("Failed to update package:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal merubah paket.');
    }
  };

  // Handle Delete Package with modal safety
  const handleDeletePackage = async (id, name) => {
    const isConfirmed = window.confirm(`Apakah Anda yakin ingin menghapus paket "${name}"?\nTindakan ini tidak dapat dibatalkan.`);
    if (!isConfirmed) return;

    try {
      const response = await axios.delete(`/api/packages/${id}`);
      if (response.data && response.data.status === 'success') {
        // Optimistic local state update
        setPackages(packages.filter(p => p.id !== id));
        alert('Paket berhasil dihapus!');
      } else {
        alert(response.data?.message || 'Gagal menghapus paket.');
      }
    } catch (err) {
      console.error("Failed to delete package:", err);
      alert(err.response?.data?.message || 'Gagal menghapus paket. Paket mungkin sedang digunakan oleh subskripsi aktif.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/40 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0 flex items-center space-x-2">
            <Gauge className="h-8 w-8 text-brand-500" />
            <span>Paket Layanan Internet</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manajemen profil kecepatan bandwidth, limitasi burst speed MikroTik, harga berlangganan bulanan, dan kebijakan FUP.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button 
            onClick={fetchPackages} 
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
              <span>Tambah Paket Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Feedback Banner */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-xs font-semibold flex items-center space-x-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/30 border border-slate-800/40 p-4 rounded-2xl backdrop-blur-md">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Cari nama paket layanan..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full input-field text-xs pl-10" 
          />
        </div>

        <div>
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full input-field text-xs cursor-pointer"
          >
            <option value="ALL">Semua Status Paket</option>
            <option value="Active">Aktif (Active)</option>
            <option value="Inactive">Nonaktif (Inactive)</option>
          </select>
        </div>
      </div>

      {/* Core Grid Packages Cards */}
      {loading && packages.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
          <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-500">Menghubungkan ke server profil paket...</span>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-3 glass-panel">
          <Gauge className="h-12 w-12 text-slate-700" />
          <p className="text-xs font-bold text-slate-300">Tidak ada paket internet terdaftar</p>
          <p className="text-[11px] text-slate-500">Mulai buat profil paket baru untuk dialokasikan ke pelanggan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((p) => (
            <div 
              key={p.id} 
              className={`glass-panel p-6 flex flex-col justify-between transition-all hover:border-slate-700/60 duration-350 relative group ${
                p.status === 'Inactive' ? 'opacity-60' : ''
              }`}
            >
              {/* ID and Status badge */}
              <div className="absolute top-4 right-4 flex space-x-1.5 items-center">
                <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold 
                  ${p.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  <span className={`h-1 w-1 rounded-full ${p.status === 'Active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span>{p.status || 'Active'}</span>
                </span>
                <span className="bg-slate-900 border border-slate-800 text-[10px] font-mono font-bold text-slate-500 px-2 py-0.5 rounded-md">
                  ID: {p.id}
                </span>
              </div>

              {/* Package Content details */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-100 group-hover:text-brand-400 transition-colors pr-14">{p.name}</h3>
                  <div className="flex items-baseline space-x-1 pt-1">
                    <span className="text-2xl font-black text-brand-400">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(p.monthly_price || 0)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">/ bulan</span>
                  </div>
                </div>

                {/* Speed Details Display */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-[11px]">
                  <div className="space-y-1">
                    <span className="text-slate-500 font-semibold block">Download Limit</span>
                    <span className="text-slate-200 font-bold font-mono text-xs flex items-center space-x-1">
                      <Zap className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      <span>{formatSpeed(p.download_rate_limit)}</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-500 font-semibold block">Upload Limit</span>
                    <span className="text-slate-200 font-bold font-mono text-xs flex items-center space-x-1">
                      <Zap className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                      <span>{formatSpeed(p.upload_rate_limit)}</span>
                    </span>
                  </div>
                </div>

                {/* Additional Settings (PPN, FUP, Burst, IP Pool) info */}
                <div className="border-t border-slate-900 pt-3.5 space-y-2 text-[10px] font-medium text-slate-400">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">PPN 11% Tax Invoice</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${p.ppn_enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-600'}`}>
                      {p.ppn_enabled ? 'Sesuai' : 'Bebas PPN'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold">FUP Quota Policy</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${p.fup_enabled ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-900 text-slate-600'}`}>
                      {p.fup_enabled ? `FUP (${p.fup_quota_gb} GB)` : 'Unlimited'}
                    </span>
                  </div>

                  {/* IP Pool info */}
                  {p.ip_pool && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">IP Pool</span>
                      <span className="bg-slate-900 border border-slate-800 text-[10px] font-mono font-bold text-slate-300 px-2 py-0.5 rounded-md flex items-center space-x-1">
                        <HardDrive className="h-3 w-3 text-brand-400" />
                        <span>{p.ip_pool}</span>
                      </span>
                    </div>
                  )}

                  {/* Throttled FUP rates if FUP active */}
                  {p.fup_enabled && (
                    <div className="bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg text-amber-500/80 font-mono text-[9px] mt-1.5 space-y-1">
                      <div className="flex justify-between">
                        <span>Speed Throttle:</span>
                        <span className="font-bold">
                          DL {formatSpeed(p.fup_download_speed)} / UL {formatSpeed(p.fup_upload_speed)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Burst details */}
                  {(p.download_burst_limit > p.download_rate_limit) && (
                    <div className="bg-brand-500/5 border border-brand-500/10 p-2.5 rounded-lg text-brand-400/80 font-mono text-[9px] space-y-1">
                      <div className="flex justify-between">
                        <span>MikroTik Burst Limit:</span>
                        <span className="font-bold">DL {formatSpeed(p.download_burst_limit)} / UL {formatSpeed(p.upload_burst_limit)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action operations (Superadmin only) */}
              {(activeRole === 'Superadmin') && (
                <div className="mt-6 pt-4 border-t border-slate-900/60 flex items-center justify-end space-x-3">
                  <button 
                    onClick={() => handleDeletePackage(p.id, p.name)}
                    className="p-2 bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 rounded-xl text-slate-500 hover:text-rose-400 transition-all"
                    title="Hapus Profil Paket"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <button 
                    onClick={() => handleOpenEditModal(p)}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700/60 rounded-xl text-slate-400 hover:text-brand-400 transition-all flex items-center space-x-1.5 px-3 text-[10px] font-bold"
                  >
                    <Edit className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ============================================================================
          ADD PACKAGE MODAL DIALOG
          ============================================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Gauge className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Tambah Paket Baru</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddPackage} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">Paket Berhasil Ditambahkan!</p>
                  <p className="text-xs text-slate-500">Profil bandwidth MikroTik dan billing paket berhasil disimpan.</p>
                </div>
              ) : (
                <>
                  {/* Package Name & Price */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Paket *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Paket Broadband 20 Mbps"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Harga Bulanan (Rp) *</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 200000"
                        required
                        value={monthlyPrice}
                        onChange={(e) => setMonthlyPrice(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>
                  </div>

                  {/* Core Speeds (Download / Upload Limits) */}
                  <div className="border-t border-slate-900 pt-3.5">
                    <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">Sesi Kecepatan Utama (Default Rate Limit)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 block">Download Limit (Kbps) *</label>
                        <input 
                          type="number" 
                          required
                          value={downloadRateLimit}
                          onChange={(e) => {
                            setDownloadRateLimit(e.target.value);
                            setDownloadBurstLimit(Math.floor(e.target.value * 1.5));
                            setDownloadBurstThreshold(Math.floor(e.target.value * 0.75));
                          }}
                          className="w-full input-field font-mono text-xs" 
                        />
                        <span className="text-[10px] text-slate-500">Konversi: {formatSpeed(downloadRateLimit)}</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 block">Upload Limit (Kbps) *</label>
                        <input 
                          type="number" 
                          required
                          value={uploadRateLimit}
                          onChange={(e) => {
                            setUploadRateLimit(e.target.value);
                            setUploadBurstLimit(Math.floor(e.target.value * 1.5));
                            setUploadBurstThreshold(Math.floor(e.target.value * 0.75));
                          }}
                          className="w-full input-field font-mono text-xs" 
                        />
                        <span className="text-[10px] text-slate-500">Konversi: {formatSpeed(uploadRateLimit)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Burst Speeds Parameters */}
                  <div className="border-t border-slate-900 pt-3.5">
                    <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">Parameter Burst Speed MikroTik (Kecepatan Lonjakan)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Download Burst */}
                      <div className="space-y-3 bg-slate-900/20 p-3 rounded-xl border border-slate-900">
                        <span className="text-[10px] font-extrabold text-slate-400 block">Download Burst</span>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Limit (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={downloadBurstLimit}
                              onChange={(e) => setDownloadBurstLimit(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Threshold (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={downloadBurstThreshold}
                              onChange={(e) => setDownloadBurstThreshold(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Upload Burst */}
                      <div className="space-y-3 bg-slate-900/20 p-3 rounded-xl border border-slate-900">
                        <span className="text-[10px] font-extrabold text-slate-400 block">Upload Burst</span>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Limit (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={uploadBurstLimit}
                              onChange={(e) => setUploadBurstLimit(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Threshold (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={uploadBurstThreshold}
                              onChange={(e) => setUploadBurstThreshold(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* General settings & switches */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-900 pt-3.5">
                    {/* Status selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Paket *</label>
                      <select 
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full input-field text-xs cursor-pointer"
                      >
                        <option value="Active">Aktif (Active)</option>
                        <option value="Inactive">Nonaktif (Inactive)</option>
                      </select>
                    </div>

                    {/* IP Pool field */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">IP Pool (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. pool-pppoe"
                        value={ipPool}
                        onChange={(e) => setIpPool(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    {/* Tax switch */}
                    <div className="flex items-center space-x-3 pt-6">
                      <input 
                        type="checkbox" 
                        id="add-ppn"
                        checked={ppnEnabled}
                        onChange={(e) => setPpnEnabled(e.target.checked)}
                        className="h-4 w-4 bg-slate-900 border-slate-800 text-brand-500 focus:ring-brand-500/20 rounded cursor-pointer"
                      />
                      <label htmlFor="add-ppn" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                        Kenakan PPN 11% Pajak Invoice
                      </label>
                    </div>
                  </div>

                  {/* Fair Usage Policy (FUP) Config Block */}
                  <div className="border-t border-slate-900 pt-3.5 space-y-3">
                    <div className="flex items-center space-x-3">
                      <input 
                        type="checkbox" 
                        id="add-fup"
                        checked={fupEnabled}
                        onChange={(e) => setFupEnabled(e.target.checked)}
                        className="h-4 w-4 bg-slate-900 border-slate-800 text-brand-500 focus:ring-brand-500/20 rounded cursor-pointer"
                      />
                      <label htmlFor="add-fup" className="text-xs font-black text-slate-300 cursor-pointer select-none flex items-center space-x-1">
                        <span>Aktifkan Kebijakan FUP (Fair Usage Policy)</span>
                        <HelpCircle className="h-3.5 w-3.5 text-slate-500" title="Kecepatan akan diturunkan jika kuota bulan ini habis" />
                      </label>
                    </div>

                    {fupEnabled && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/10 border border-slate-900 p-4 rounded-xl animate-in slide-in-from-top-2 duration-100">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">Kuota Limit (GB) *</label>
                          <input 
                            type="number" 
                            required={fupEnabled}
                            placeholder="e.g. 300"
                            value={fupQuotaGb}
                            onChange={(e) => setFupQuotaGb(e.target.value)}
                            className="w-full input-field font-mono text-xs" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">Limit DL Throttled (Kbps)</label>
                          <input 
                            type="number" 
                            required={fupEnabled}
                            placeholder="e.g. 5120"
                            value={fupDownloadSpeed}
                            onChange={(e) => setFupDownloadSpeed(e.target.value)}
                            className="w-full input-field font-mono text-xs" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">Limit UL Throttled (Kbps)</label>
                          <input 
                            type="number" 
                            required={fupEnabled}
                            placeholder="e.g. 5120"
                            value={fupUploadSpeed}
                            onChange={(e) => setFupUploadSpeed(e.target.value)}
                            className="w-full input-field font-mono text-xs" 
                          />
                        </div>
                      </div>
                    )}
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
                      Simpan Paket
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          EDIT PACKAGE MODAL DIALOG
          ============================================================================ */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Ubah Profil Paket</h3>
              </div>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingPackageId(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditPackage} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">Perubahan Berhasil Disimpan!</p>
                  <p className="text-xs text-slate-500">Profil paket internet di database telah diperbarui.</p>
                </div>
              ) : (
                <>
                  {/* Package Name & Price */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Paket *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Paket Broadband 20 Mbps"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Harga Bulanan (Rp) *</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 200000"
                        required
                        value={monthlyPrice}
                        onChange={(e) => setMonthlyPrice(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>
                  </div>

                  {/* Core Speeds (Download / Upload Limits) */}
                  <div className="border-t border-slate-900 pt-3.5">
                    <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">Sesi Kecepatan Utama (Default Rate Limit)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 block">Download Limit (Kbps) *</label>
                        <input 
                          type="number" 
                          required
                          value={downloadRateLimit}
                          onChange={(e) => {
                            setDownloadRateLimit(e.target.value);
                            setDownloadBurstLimit(Math.floor(e.target.value * 1.5));
                            setDownloadBurstThreshold(Math.floor(e.target.value * 0.75));
                          }}
                          className="w-full input-field font-mono text-xs" 
                        />
                        <span className="text-[10px] text-slate-500">Konversi: {formatSpeed(downloadRateLimit)}</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 block">Upload Limit (Kbps) *</label>
                        <input 
                          type="number" 
                          required
                          value={uploadRateLimit}
                          onChange={(e) => {
                            setUploadRateLimit(e.target.value);
                            setUploadBurstLimit(Math.floor(e.target.value * 1.5));
                            setUploadBurstThreshold(Math.floor(e.target.value * 0.75));
                          }}
                          className="w-full input-field font-mono text-xs" 
                        />
                        <span className="text-[10px] text-slate-500">Konversi: {formatSpeed(uploadRateLimit)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Burst Speeds Parameters */}
                  <div className="border-t border-slate-900 pt-3.5">
                    <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">Parameter Burst Speed MikroTik (Kecepatan Lonjakan)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Download Burst */}
                      <div className="space-y-3 bg-slate-900/20 p-3 rounded-xl border border-slate-900">
                        <span className="text-[10px] font-extrabold text-slate-400 block">Download Burst</span>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Limit (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={downloadBurstLimit}
                              onChange={(e) => setDownloadBurstLimit(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Threshold (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={downloadBurstThreshold}
                              onChange={(e) => setDownloadBurstThreshold(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Upload Burst */}
                      <div className="space-y-3 bg-slate-900/20 p-3 rounded-xl border border-slate-900">
                        <span className="text-[10px] font-extrabold text-slate-400 block">Upload Burst</span>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Limit (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={uploadBurstLimit}
                              onChange={(e) => setUploadBurstLimit(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-semibold text-slate-500">Burst Threshold (Kbps)</label>
                            <input 
                              type="number" 
                              required
                              value={uploadBurstThreshold}
                              onChange={(e) => setUploadBurstThreshold(e.target.value)}
                              className="w-full input-field font-mono text-[11px]" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* General settings & switches */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-900 pt-3.5">
                    {/* Status selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Paket *</label>
                      <select 
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full input-field text-xs cursor-pointer"
                      >
                        <option value="Active">Aktif (Active)</option>
                        <option value="Inactive">Nonaktif (Inactive)</option>
                      </select>
                    </div>

                    {/* IP Pool field */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">IP Pool (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. pool-pppoe"
                        value={ipPool}
                        onChange={(e) => setIpPool(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    {/* Tax switch */}
                    <div className="flex items-center space-x-3 pt-6">
                      <input 
                        type="checkbox" 
                        id="edit-ppn"
                        checked={ppnEnabled}
                        onChange={(e) => setPpnEnabled(e.target.checked)}
                        className="h-4 w-4 bg-slate-900 border-slate-800 text-brand-500 focus:ring-brand-500/20 rounded cursor-pointer"
                      />
                      <label htmlFor="edit-ppn" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                        Kenakan PPN 11% Pajak Invoice
                      </label>
                    </div>
                  </div>

                  {/* Fair Usage Policy (FUP) Config Block */}
                  <div className="border-t border-slate-900 pt-3.5 space-y-3">
                    <div className="flex items-center space-x-3">
                      <input 
                        type="checkbox" 
                        id="edit-fup"
                        checked={fupEnabled}
                        onChange={(e) => setFupEnabled(e.target.checked)}
                        className="h-4 w-4 bg-slate-900 border-slate-800 text-brand-500 focus:ring-brand-500/20 rounded cursor-pointer"
                      />
                      <label htmlFor="edit-fup" className="text-xs font-black text-slate-300 cursor-pointer select-none flex items-center space-x-1">
                        <span>Aktifkan Kebijakan FUP (Fair Usage Policy)</span>
                        <HelpCircle className="h-3.5 w-3.5 text-slate-500" title="Kecepatan akan diturunkan jika kuota bulan ini habis" />
                      </label>
                    </div>

                    {fupEnabled && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/10 border border-slate-900 p-4 rounded-xl animate-in slide-in-from-top-2 duration-100">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">Kuota Limit (GB) *</label>
                          <input 
                            type="number" 
                            required={fupEnabled}
                            placeholder="e.g. 300"
                            value={fupQuotaGb}
                            onChange={(e) => setFupQuotaGb(e.target.value)}
                            className="w-full input-field font-mono text-xs" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">Limit DL Throttled (Kbps)</label>
                          <input 
                            type="number" 
                            required={fupEnabled}
                            placeholder="e.g. 5120"
                            value={fupDownloadSpeed}
                            onChange={(e) => setFupDownloadSpeed(e.target.value)}
                            className="w-full input-field font-mono text-xs" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">Limit UL Throttled (Kbps)</label>
                          <input 
                            type="number" 
                            required={fupEnabled}
                            placeholder="e.g. 5120"
                            value={fupUploadSpeed}
                            onChange={(e) => setFupUploadSpeed(e.target.value)}
                            className="w-full input-field font-mono text-xs" 
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-4 border-t border-slate-900 flex justify-end space-x-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingPackageId(null);
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
    </div>
  );
};

export default PackagesPage;
