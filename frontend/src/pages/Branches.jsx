import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { 
  Building, Search, Plus, MapPin, Phone, Mail, ToggleLeft, ToggleRight, 
  Edit, CheckCircle, AlertTriangle, RefreshCw, X, ArrowUpRight
} from 'lucide-react';

const BranchesPage = () => {
  const { activeRole } = useAuth();
  const [branches, setBranches] = useState([]);
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
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  
  // Edit State
  const [editingBranchId, setEditingBranchId] = useState(null);

  // Fetch branches list from API
  const fetchBranches = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/branches');
      if (response.data && response.data.status === 'success') {
        const branchData = response.data.data;
        const branchesArray = (branchData && Array.isArray(branchData.branches))
          ? branchData.branches
          : (Array.isArray(branchData) ? branchData : []);
        setBranches(branchesArray);
      } else {
        setBranches([]);
        setErrorMessage(response.data?.message || 'Gagal memuat daftar cabang.');
      }
    } catch (err) {
      console.error("Failed to fetch branches:", err);
      setBranches([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi ke API terganggu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  // Filter branches based on search & status
  const filteredBranches = branches.filter(b => {
    const matchesSearch = 
      b.name?.toLowerCase().includes(search.toLowerCase()) ||
      b.address?.toLowerCase().includes(search.toLowerCase()) ||
      b.contact_email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || b.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Handle Create new branch
  const handleAddBranch = async (e) => {
    e.preventDefault();
    if (!name || !address || !contactPhone || !contactEmail) {
      alert('Selesaikan seluruh field wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        name,
        address,
        contact_phone: contactPhone,
        contact_email: contactEmail
      };

      const response = await axios.post('/api/branches', payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchBranches();
        
        // Reset fields
        setName('');
        setAddress('');
        setContactPhone('');
        setContactEmail('');

        setTimeout(() => {
          setFormSuccess(false);
          setShowAddModal(false);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal menambahkan cabang baru.');
      }
    } catch (err) {
      console.error("Failed to add branch:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal menambahkan cabang.');
    }
  };

  // Open Edit Modal with prefilled data
  const handleOpenEditModal = (b) => {
    setEditingBranchId(b.id);
    setName(b.name || '');
    setAddress(b.address || '');
    setContactPhone(b.contact_phone || '');
    setContactEmail(b.contact_email || '');
    setErrorMessage('');
    setShowEditModal(true);
  };

  // Handle Edit/Update Form Submission
  const handleEditBranch = async (e) => {
    e.preventDefault();
    if (!name || !address || !contactPhone || !contactEmail) {
      alert('Selesaikan seluruh field wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        name,
        address,
        contact_phone: contactPhone,
        contact_email: contactEmail
      };

      const response = await axios.put(`/api/branches/${editingBranchId}`, payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchBranches();
        setTimeout(() => {
          setFormSuccess(false);
          setShowEditModal(false);
          setEditingBranchId(null);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal mengubah data cabang.');
      }
    } catch (err) {
      console.error("Failed to update branch:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal mengubah data cabang.');
    }
  };

  // Toggle branch active/inactive status
  const handleToggleStatus = async (b) => {
    const newStatus = b.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const response = await axios.patch(`/api/branches/${b.id}/status`, { status: newStatus });
      if (response.data && response.data.status === 'success') {
        // Optimistic local update
        setBranches(branches.map(item => item.id === b.id ? { ...item, status: newStatus } : item));
      } else {
        alert(response.data?.message || 'Gagal mengubah status cabang.');
      }
    } catch (err) {
      console.error("Failed to change branch status:", err);
      alert(err.response?.data?.message || 'Koneksi API gagal mengubah status cabang.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/40 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0 flex items-center space-x-2">
            <Building className="h-8 w-8 text-brand-500" />
            <span>Manajemen Cabang</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Kelola wilayah kantor cabang operasional jaringan ISP Uwais Fiber di seluruh Indonesia.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button 
            onClick={fetchBranches} 
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
              <span>Tambah Cabang</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-xs font-semibold flex items-center space-x-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/30 border border-slate-800/40 p-4 rounded-2xl backdrop-blur-md">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Cari nama cabang, alamat, email..." 
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
            <option value="ALL">Semua Status Cabang</option>
            <option value="Active">Aktif (Active)</option>
            <option value="Inactive">Nonaktif (Inactive)</option>
          </select>
        </div>
      </div>

      {/* Branches Cards / Table Grid */}
      {loading && branches.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
          <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-500">Memuat data kantor cabang...</span>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-3 glass-panel">
          <Building className="h-12 w-12 text-slate-700" />
          <p className="text-xs font-bold text-slate-300">Tidak ada cabang yang terdaftar</p>
          <p className="text-[11px] text-slate-500">Gunakan filter pencarian atau buat cabang baru.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBranches.map((b) => (
            <div 
              key={b.id} 
              className={`glass-panel p-6 flex flex-col justify-between transition-all hover:border-slate-700/60 duration-350 relative group ${
                b.status === 'Inactive' ? 'opacity-60' : ''
              }`}
            >
              {/* ID Badge on upper corner */}
              <span className="absolute top-4 right-4 bg-slate-900 border border-slate-800 text-[10px] font-mono font-bold text-slate-500 px-2 py-0.5 rounded-md">
                ID: {b.id}
              </span>

              {/* Branch Content */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="h-11 w-11 bg-brand-500/15 border border-brand-500/20 text-brand-400 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/5">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-100 group-hover:text-brand-400 transition-colors">{b.name}</h3>
                    <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold mt-1 
                      ${b.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      <span className={`h-1 w-1 rounded-full ${b.status === 'Active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span>{b.status || 'Active'}</span>
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-3 space-y-2.5 text-[11px] text-slate-400">
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{b.address || 'Belum diatur'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                    <span>{b.contact_phone || 'Belum diatur'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{b.contact_email || 'Belum diatur'}</span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions (Superadmin Only) */}
              {(activeRole === 'Superadmin') && (
                <div className="mt-6 pt-4 border-t border-slate-900/60 flex items-center justify-between">
                  <button 
                    onClick={() => handleToggleStatus(b)}
                    className={`inline-flex items-center space-x-1 p-1 rounded-lg border transition-all ${
                      b.status === 'Active' 
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20' 
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {b.status === 'Active' ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    <span className="text-[9px] pr-1.5 font-bold uppercase">{b.status === 'Active' ? 'Deactivate' : 'Activate'}</span>
                  </button>

                  <button 
                    onClick={() => handleOpenEditModal(b)}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700/60 rounded-lg text-slate-400 hover:text-brand-400 transition-all flex items-center space-x-1.5 px-2.5 text-[10px] font-bold"
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
          ADD BRANCH MODAL DIALOG
          ============================================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Tambah Cabang Baru</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddBranch} className="p-6 space-y-4">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">Cabang Berhasil Ditambahkan!</p>
                  <p className="text-xs text-slate-500">Database kantor cabang baru berhasil diregistrasikan.</p>
                </div>
              ) : (
                <>
                  {/* Branch Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Cabang *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Cabang Samarinda"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full input-field text-xs" 
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Alamat Lengkap *</label>
                    <textarea 
                      placeholder="e.g. Jl. MT Haryono No. 100, Samarinda, Kaltim"
                      required
                      rows="3"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full input-field text-xs resize-none" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Contact Phone */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Telepon Kontak *</label>
                      <input 
                        type="tel" 
                        placeholder="e.g. 08123456789"
                        required
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    {/* Contact Email */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Kontak *</label>
                      <input 
                        type="email" 
                        placeholder="e.g. samarinda@uwaisfiber.com"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
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
                      Simpan Cabang
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          EDIT BRANCH MODAL DIALOG
          ============================================================================ */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Ubah Data Cabang</h3>
              </div>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingBranchId(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditBranch} className="p-6 space-y-4">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">Perubahan Berhasil Disimpan!</p>
                  <p className="text-xs text-slate-500">Database kantor cabang berhasil diperbarui.</p>
                </div>
              ) : (
                <>
                  {/* Branch Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Cabang *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Cabang Samarinda"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full input-field text-xs" 
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Alamat Lengkap *</label>
                    <textarea 
                      placeholder="e.g. Jl. MT Haryono No. 100, Samarinda, Kaltim"
                      required
                      rows="3"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full input-field text-xs resize-none" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Contact Phone */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Telepon Kontak *</label>
                      <input 
                        type="tel" 
                        placeholder="e.g. 08123456789"
                        required
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    {/* Contact Email */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Kontak *</label>
                      <input 
                        type="email" 
                        placeholder="e.g. samarinda@uwaisfiber.com"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-4 border-t border-slate-900 flex justify-end space-x-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingBranchId(null);
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

export default BranchesPage;
