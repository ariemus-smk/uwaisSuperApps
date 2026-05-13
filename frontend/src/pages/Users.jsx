import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { 
  Users, Search, UserPlus, Shield, ToggleLeft, ToggleRight, Edit, 
  CheckCircle, AlertTriangle, RefreshCw, X, Percent, DollarSign, Building, Key
} from 'lucide-react';

const UsersPage = () => {
  const { activeRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Form Fields State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Admin');
  const [branchId, setBranchId] = useState('');
  const [profitSharingPct, setProfitSharingPct] = useState('');
  const [commissionAmount, setCommissionAmount] = useState('');
  
  // Edit State
  const [editingUserId, setEditingUserId] = useState(null);

  // Fetch all users and branches from backend API
  const fetchData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // Parallel fetch for speed
      const [usersRes, branchesRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get('/api/branches').catch(() => null) // Fallback if branches route fails
      ]);

      if (usersRes.data && usersRes.data.status === 'success') {
        setUsers(usersRes.data.data?.users || usersRes.data.data || []);
      } else {
        setErrorMessage(usersRes.data?.message || 'Gagal memuat daftar pengguna.');
      }

      if (branchesRes && branchesRes.data && branchesRes.data.status === 'success') {
        setBranches(branchesRes.data.data?.branches || branchesRes.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch User management data:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi ke API terganggu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered users list calculation
  const filteredUsers = users.filter(usr => {
    const matchesSearch = 
      usr.username?.toLowerCase().includes(search.toLowerCase()) ||
      usr.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === 'ALL' || usr.role === filterRole;
    const matchesStatus = filterStatus === 'ALL' || usr.status === filterStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Handle form submission for adding a new user
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!username || !password || !fullName || !role) {
      alert('Selesaikan seluruh field wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        username,
        password,
        full_name: fullName,
        role,
        branch_id: role === 'Superadmin' || !branchId ? null : Number(branchId),
        profit_sharing_pct: role === 'Mitra' && profitSharingPct ? Number(profitSharingPct) : undefined,
        commission_amount: role === 'Merchant' && commissionAmount ? Number(commissionAmount) : undefined
      };

      const response = await axios.post('/api/users', payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchData();
        // Reset form fields
        setUsername('');
        setPassword('');
        setFullName('');
        setRole('Admin');
        setBranchId('');
        setProfitSharingPct('');
        setCommissionAmount('');
        
        setTimeout(() => {
          setFormSuccess(false);
          setShowAddModal(false);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal menambahkan user baru.');
      }
    } catch (err) {
      console.error("Failed to create user:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal menambahkan user baru.');
    }
  };

  // Open Edit Modal with prefilled data
  const handleOpenEditModal = (usr) => {
    setEditingUserId(usr.id);
    setFullName(usr.full_name || '');
    setRole(usr.role || 'Admin');
    setBranchId(usr.branch_id || '');
    setProfitSharingPct(usr.profit_sharing_pct || '');
    setCommissionAmount(usr.commission_amount || '');
    setErrorMessage('');
    setShowEditModal(true);
  };

  // Handle Edit/Update Form Submission
  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!fullName || !role) {
      alert('Selesaikan field nama dan role wajib!');
      return;
    }

    setErrorMessage('');
    try {
      const payload = {
        full_name: fullName,
        role,
        branch_id: role === 'Superadmin' || !branchId ? null : Number(branchId),
        profit_sharing_pct: role === 'Mitra' && profitSharingPct ? Number(profitSharingPct) : null,
        commission_amount: role === 'Merchant' && commissionAmount ? Number(commissionAmount) : null
      };

      const response = await axios.put(`/api/users/${editingUserId}`, payload);
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchData();
        setTimeout(() => {
          setFormSuccess(false);
          setShowEditModal(false);
          setEditingUserId(null);
        }, 1500);
      } else {
        setErrorMessage(response.data?.message || 'Gagal mengubah data user.');
      }
    } catch (err) {
      console.error("Failed to update user:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Gagal mengubah data user.');
    }
  };

  // Toggle user active/inactive status dynamically
  const handleToggleStatus = async (usr) => {
    const newStatus = usr.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const response = await axios.patch(`/api/users/${usr.id}/status`, { status: newStatus });
      if (response.data && response.data.status === 'success') {
        // Optimistic local update
        setUsers(users.map(u => u.id === usr.id ? { ...u, status: newStatus } : u));
      } else {
        alert(response.data?.message || 'Gagal mengubah status pengguna.');
      }
    } catch (err) {
      console.error("Failed to change user status:", err);
      alert(err.response?.data?.message || 'Koneksi API gagal mengubah status.');
    }
  };

  // Map branch ID to branch name
  const getBranchName = (bId) => {
    if (!bId) return 'Pusat / All Branch';
    const b = branches.find(item => item.id === bId);
    return b ? b.name : `Branch ID: ${bId}`;
  };

  // Helper colors for Roles
  const getRoleStyle = (userRole) => {
    switch (userRole) {
      case 'Superadmin':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
      case 'Admin':
        return 'bg-brand-500/10 text-brand-400 border border-brand-500/30';
      case 'Accounting':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'Mitra':
        return 'bg-violet-500/10 text-violet-400 border border-violet-500/30';
      case 'Sales':
        return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30';
      case 'Merchant':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      case 'Teknisi':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30';
      case 'Pelanggan':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
      default:
        return 'bg-slate-800 text-slate-400';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/40 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0 flex items-center space-x-2">
            <Shield className="h-8 w-8 text-brand-500" />
            <span>Manajemen User</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Daftar seluruh staf operasional, akuntan, sales, mitra, dan administrator sistem ISP.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button 
            onClick={fetchData} 
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          </button>
          <button 
            onClick={() => {
              setErrorMessage('');
              setShowAddModal(true);
            }} 
            className="glow-btn-primary text-xs py-2.5 px-4 flex items-center space-x-2"
          >
            <UserPlus className="h-4 w-4" />
            <span>Tambah User Baru</span>
          </button>
        </div>
      </div>

      {/* Error / Feedback Banner */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-xs font-semibold flex items-center space-x-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/30 border border-slate-800/40 p-4 rounded-2xl backdrop-blur-md">
        {/* Search Input */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Cari berdasarkan nama atau username..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full input-field text-xs pl-10" 
          />
        </div>

        {/* Role Filter */}
        <div className="flex flex-col space-y-1">
          <select 
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input-field text-xs cursor-pointer"
          >
            <option value="ALL">Semua Peran (Roles)</option>
            <option value="Superadmin">Superadmin</option>
            <option value="Admin">Admin</option>
            <option value="Accounting">Accounting</option>
            <option value="Mitra">Mitra</option>
            <option value="Sales">Sales</option>
            <option value="Merchant">Merchant</option>
            <option value="Teknisi">Teknisi</option>
            <option value="Pelanggan">Pelanggan</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex flex-col space-y-1">
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field text-xs cursor-pointer"
          >
            <option value="ALL">Semua Status</option>
            <option value="Active">Aktif (Active)</option>
            <option value="Inactive">Nonaktif (Inactive)</option>
          </select>
        </div>
      </div>

      {/* Users Table / Core Grid */}
      <div className="glass-panel overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center justify-center space-y-4">
            <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500">Memuat database pengguna...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center justify-center space-y-3">
            <Users className="h-12 w-12 text-slate-700" />
            <p className="text-xs font-bold text-slate-300">Tidak ada pengguna yang ditemukan</p>
            <p className="text-[11px] text-slate-500">Gunakan filter di atas atau daftarkan pengguna baru jika diperlukan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/20 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">User Profile</th>
                  <th className="p-4 font-semibold">Role / Peran</th>
                  <th className="p-4 font-semibold">Cakupan Cabang</th>
                  <th className="p-4 font-semibold">Komisi / Bagi Hasil</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  <th className="p-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs">
                {filteredUsers.map((usr) => (
                  <tr key={usr.id} className="hover:bg-slate-900/10 transition-colors">
                    {/* User Profile Info */}
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 font-bold uppercase shadow-sm">
                          {usr.username?.substring(0, 2)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-200 block">{usr.full_name || 'N/A'}</span>
                          <span className="text-[10px] text-slate-500 font-mono block">@{usr.username || 'username'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${getRoleStyle(usr.role)}`}>
                        {usr.role}
                      </span>
                    </td>

                    {/* Branch */}
                    <td className="p-4 text-slate-400 font-medium">
                      {getBranchName(usr.branch_id)}
                    </td>

                    {/* Commissions details */}
                    <td className="p-4 font-medium">
                      {usr.role === 'Mitra' && (
                        <div className="flex items-center space-x-1.5 text-violet-400">
                          <Percent className="h-3.5 w-3.5" />
                          <span>{usr.profit_sharing_pct || 0}% Bagi Hasil</span>
                        </div>
                      )}
                      {usr.role === 'Merchant' && (
                        <div className="flex items-center space-x-1.5 text-amber-400">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(usr.commission_amount || 0)} / Trx</span>
                        </div>
                      )}
                      {usr.role !== 'Mitra' && usr.role !== 'Merchant' && (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Status Toggle Button */}
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => handleToggleStatus(usr)}
                        className={`inline-flex items-center space-x-1.5 p-1 rounded-full border transition-all ${
                          usr.status === 'Active' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                        }`}
                        title={usr.status === 'Active' ? 'Nonaktifkan Pengguna' : 'Aktifkan Pengguna'}
                      >
                        {usr.status === 'Active' ? (
                          <ToggleRight className="h-5 w-5" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                        <span className="text-[10px] pr-2 font-bold uppercase">{usr.status || 'Active'}</span>
                      </button>
                    </td>

                    {/* Action buttons */}
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleOpenEditModal(usr)}
                        className="p-2 bg-slate-900 hover:bg-brand-500/10 border border-slate-800 hover:border-brand-500/30 rounded-xl text-slate-400 hover:text-brand-400 transition-all"
                        title="Edit Profil User"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================================
          ADD USER MODAL DIALOG
          ============================================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Tambah User Baru</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">User Berhasil Ditambahkan!</p>
                  <p className="text-xs text-slate-500">Database user sistem Anda berhasil diperbarui.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Username */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Username *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. janesmith"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full input-field text-xs" 
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Password *</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
                        <input 
                          type="password" 
                          placeholder="Min. 6 karakter"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full input-field text-xs pl-9" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Lengkap *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Jane Smith, M.Kom"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full input-field text-xs" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Role Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peran (Role) *</label>
                      <select 
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full input-field text-xs"
                      >
                        <option value="Superadmin">Superadmin</option>
                        <option value="Admin">Admin</option>
                        <option value="Accounting">Accounting</option>
                        <option value="Mitra">Mitra</option>
                        <option value="Sales">Sales</option>
                        <option value="Merchant">Merchant</option>
                        <option value="Teknisi">Teknisi</option>
                        <option value="Pelanggan">Pelanggan</option>
                      </select>
                    </div>

                    {/* Branch Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cabang (Branch) *</label>
                      <select 
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        disabled={role === 'Superadmin'}
                        className="w-full input-field text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        required={role !== 'Superadmin'}
                      >
                        <option value="">-- Pilih Cabang --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Conditional Fields: Mitra Profit Share */}
                  {role === 'Mitra' && (
                    <div className="space-y-1 animate-in slide-in-from-top-2 duration-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Persentase Bagi Hasil (Mitra %)*</label>
                      <div className="relative">
                        <Percent className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
                        <input 
                          type="number" 
                          placeholder="e.g. 15"
                          min="0"
                          max="100"
                          required
                          value={profitSharingPct}
                          onChange={(e) => setProfitSharingPct(e.target.value)}
                          className="w-full input-field text-xs pl-9" 
                        />
                      </div>
                    </div>
                  )}

                  {/* Conditional Fields: Merchant Commission */}
                  {role === 'Merchant' && (
                    <div className="space-y-1 animate-in slide-in-from-top-2 duration-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Jumlah Komisi / Transaksi (IDR)*</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
                        <input 
                          type="number" 
                          placeholder="e.g. 2500"
                          min="0"
                          required
                          value={commissionAmount}
                          onChange={(e) => setCommissionAmount(e.target.value)}
                          className="w-full input-field text-xs pl-9" 
                        />
                      </div>
                    </div>
                  )}

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
                      Simpan User
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          EDIT USER MODAL DIALOG
          ============================================================================ */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit className="h-5 w-5 text-brand-500" />
                <h3 className="text-base font-bold text-slate-100">Ubah Data User</h3>
              </div>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUserId(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800/80"
              >
                <X className="h-5 w-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditUser} className="p-6 space-y-4">
              {formSuccess ? (
                <div className="p-6 text-center py-10 space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-slate-200">Perubahan Berhasil Disimpan!</p>
                  <p className="text-xs text-slate-500">Database user telah berhasil diperbarui.</p>
                </div>
              ) : (
                <>
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Lengkap *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Jane Smith, M.Kom"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full input-field text-xs" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Role Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peran (Role) *</label>
                      <select 
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full input-field text-xs"
                      >
                        <option value="Superadmin">Superadmin</option>
                        <option value="Admin">Admin</option>
                        <option value="Accounting">Accounting</option>
                        <option value="Mitra">Mitra</option>
                        <option value="Sales">Sales</option>
                        <option value="Merchant">Merchant</option>
                        <option value="Teknisi">Teknisi</option>
                        <option value="Pelanggan">Pelanggan</option>
                      </select>
                    </div>

                    {/* Branch Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cabang (Branch) *</label>
                      <select 
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        disabled={role === 'Superadmin'}
                        className="w-full input-field text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        required={role !== 'Superadmin'}
                      >
                        <option value="">-- Pilih Cabang --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Conditional Fields: Mitra Profit Share */}
                  {role === 'Mitra' && (
                    <div className="space-y-1 animate-in slide-in-from-top-2 duration-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Persentase Bagi Hasil (Mitra %)*</label>
                      <div className="relative">
                        <Percent className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
                        <input 
                          type="number" 
                          placeholder="e.g. 15"
                          min="0"
                          max="100"
                          required
                          value={profitSharingPct}
                          onChange={(e) => setProfitSharingPct(e.target.value)}
                          className="w-full input-field text-xs pl-9" 
                        />
                      </div>
                    </div>
                  )}

                  {/* Conditional Fields: Merchant Commission */}
                  {role === 'Merchant' && (
                    <div className="space-y-1 animate-in slide-in-from-top-2 duration-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Jumlah Komisi / Transaksi (IDR)*</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
                        <input 
                          type="number" 
                          placeholder="e.g. 2500"
                          min="0"
                          required
                          value={commissionAmount}
                          onChange={(e) => setCommissionAmount(e.target.value)}
                          className="w-full input-field text-xs pl-9" 
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions buttons */}
                  <div className="pt-4 border-t border-slate-900 flex justify-end space-x-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingUserId(null);
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

export default UsersPage;
