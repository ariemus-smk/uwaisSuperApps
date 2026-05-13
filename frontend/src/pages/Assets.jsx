import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import axios from 'axios';
import { 
  Package, Search, Plus, Info, RefreshCw, CheckCircle, HelpCircle, HardDrive
} from 'lucide-react';

const Assets = () => {
  const { activeRole } = useAuth();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [listLoading, setListLoading] = useState(false);

  // Tool borrow state
  const [showBorrowForm, setShowBorrowForm] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [expectedReturnDate, setExpectedReturnDate] = useState('2026-05-20');
  const [isSubmittingBorrow, setIsSubmittingBorrow] = useState(false);

  // Asset states
  const [assets, setAssets] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch from Real API
  const fetchAssets = async () => {
    setListLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/assets');
      if (response.data && response.data.status === 'success') {
        const apiData = response.data.data;
        const assetsArray = (apiData && Array.isArray(apiData.data))
          ? apiData.data
          : (Array.isArray(apiData) ? apiData : []);
        setAssets(assetsArray);
      } else {
        setAssets([]);
        setErrorMessage(response.data?.message || 'Gagal memuat daftar aset');
      }
    } catch (err) {
      console.error("Direct Asset API fetch failed:", err);
      setAssets([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API gagal');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleOpenBorrow = (asset) => {
    setSelectedAsset(asset);
    setShowBorrowForm(true);
    setExpectedReturnDate('2026-05-20');
  };

  const handleSubmitBorrow = async (e) => {
    e.preventDefault();
    setIsSubmittingBorrow(true);
    try {
      const payload = {
        asset_id: selectedAsset.id,
        branch_id: 1,
        borrow_date: '2026-05-13',
        expected_return_date: expectedReturnDate
      };

      // Call real API: POST /api/assets/tools/borrow
      const response = await axios.post('/api/assets/tools/borrow', payload);
      
      if (response.data && response.data.status === 'success') {
        await fetchAssets();
        setShowBorrowForm(false);
        alert(`Peminjaman alat "${selectedAsset.name}" sukses diajukan ke admin cabang!`);
      } else {
        throw new Error(response.data?.message || "Pengajuan ditolak oleh server");
      }
    } catch (err) {
      console.error("Direct POST borrow failed:", err);
      alert(`Gagal meminjam alat: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsSubmittingBorrow(false);
    }
  };

  const filteredAssets = assets.filter(a => {
    const nameVal = a.name || '';
    const snVal = a.serial_number || '';
    const catVal = a.category || '';

    const matchesSearch = nameVal.toLowerCase().includes(search.toLowerCase()) || 
                          snVal.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'ALL' || catVal.toUpperCase() === filterCategory.toUpperCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Inventaris & <span className="gradient-text-primary">Stok Gudang (Assets)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Gudang material cabang, monitoring mutasi barang (Inbound/Outbound), dan log peminjaman alat splicing milik teknisi.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in">
          {errorMessage}
        </div>
      )}

      {/* FILTER AND SEARCH CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama barang, tipe model, serial number..." 
            className="w-full input-field pl-11 text-xs"
          />
        </div>

        <div className="flex items-center space-x-3 overflow-x-auto pb-2 md:pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            {listLoading && <RefreshCw className="h-3 w-3 animate-spin text-brand-400" />}
            <span>Kategori:</span>
          </span>
          {['ALL', 'PERANGKATAKTIF', 'KABEL', 'AKSESORIS'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border
                ${filterCategory === cat 
                  ? 'bg-brand-500 border-brand-400 text-white' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700/80'
                }`}
            >
              {cat === 'PERANGKATAKTIF' ? 'Perangkat Aktif' : cat === 'KABEL' ? 'Kabel Optik' : cat === 'AKSESORIS' ? 'Aksesoris/Tools' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      {/* ASSET DATA TABLE */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/40">
                <th className="py-4 px-6 font-semibold">Nama Item</th>
                <th className="py-4 px-6 font-semibold">Serial Number / Batch</th>
                <th className="py-4 px-6 font-semibold">Kategori Gudang</th>
                <th className="py-4 px-6 font-semibold">Stok Tersedia</th>
                <th className="py-4 px-6 font-semibold">Kondisi Alat</th>
                <th className="py-4 px-6 font-semibold">Asal Cabang (Branch)</th>
                <th className="py-4 px-6 font-semibold text-center">Status</th>
                <th className="py-4 px-6 font-semibold text-center">Aksi Peminjaman</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-800/15 transition-colors">
                  <td className="py-4 px-6 font-bold text-slate-200">{asset.name}</td>
                  <td className="py-4 px-6 font-mono text-slate-400">{asset.serial_number || 'BATCH-MULTIPLEX'}</td>
                  <td className="py-4 px-6 font-semibold text-slate-400">
                    {asset.category === 'PerangkatAktif' ? 'Perangkat Aktif (ONU/SFP)' : asset.category === 'Kabel' ? 'Kabel Optik Drop-Core' : 'Aksesoris & Tools'}
                  </td>
                  <td className="py-4 px-6 font-mono font-bold text-slate-300">{asset.quantity} Unit</td>
                  <td className="py-4 px-6 font-medium text-slate-400">{asset.condition || 'Baru'}</td>
                  <td className="py-4 px-6 text-slate-300">
                    <span className="bg-slate-800/60 border border-slate-700/40 px-2.5 py-0.5 rounded-lg text-[10px]">
                      {asset.branch || 'Balikpapan'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <StatusBadge status={asset.status === 'Dipinjam' ? 'DIPINJAM' : 'TERSEDIA'} />
                  </td>
                  <td className="py-4 px-6 text-center">
                    {asset.status === 'Tersedia' && (activeRole === 'Superadmin' || activeRole === 'Admin' || activeRole === 'Teknisi') ? (
                      <button 
                        onClick={() => handleOpenBorrow(asset)}
                        className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-colors flex items-center space-x-1 mx-auto"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Pinjam Alat</span>
                      </button>
                    ) : (
                      <span className="text-slate-500 text-[10px] font-bold">— Terpakai/Dipinjam</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TOOL BORROW MODAL */}
      {showBorrowForm && selectedAsset && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 max-w-md w-full border-brand-500/30 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Pinjam Peralatan Lapangan</h3>
            <p className="text-xs text-slate-500 mb-6 font-medium">Buat pengajuan peminjaman alat ukur, splicer, atau toolkit milik perusahaan untuk aktivitas kerja lapangan.</p>

            <form onSubmit={handleSubmitBorrow} className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-1 text-xs">
                <div><span className="text-slate-500 font-semibold">Nama Alat:</span> <span className="text-slate-300 font-bold">{selectedAsset.name}</span></div>
                <div><span className="text-slate-500 font-semibold">Serial Number:</span> <span className="text-slate-300 font-mono text-brand-400 font-bold">{selectedAsset.serial_number}</span></div>
                <div><span className="text-slate-500 font-semibold">Stok Saat Ini:</span> <span className="text-slate-300 font-semibold">{selectedAsset.quantity} Unit</span></div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Perkiraan Tanggal Pengembalian *</label>
                <input 
                  type="date" 
                  required
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  className="w-full input-field text-xs bg-slate-950 font-semibold text-slate-200" 
                />
              </div>

              <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800 text-[10px] text-slate-500 flex items-start space-x-1.5 leading-relaxed">
                <Info className="h-4 w-4 text-brand-400 mt-0.5 flex-shrink-0" />
                <span>Dengan mengklik "Kirim Pengajuan", status peminjaman akan diverifikasi oleh Admin Cabang sebelum alat dilepas dari ruang inventaris.</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowBorrowForm(false)}
                  className="glow-btn-secondary text-xs py-2 font-semibold"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingBorrow}
                  className="glow-btn-primary text-xs font-bold py-2 flex items-center justify-center space-x-1.5"
                >
                  {isSubmittingBorrow ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Memproses Pengajuan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Kirim Pengajuan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assets;
