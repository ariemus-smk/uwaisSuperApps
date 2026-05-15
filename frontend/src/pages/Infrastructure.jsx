import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import CustomMap from '../components/CustomMap';
import axios from 'axios';
import { 
  Network, Radio, MapPin, ZoomIn, Info, CheckCircle, AlertTriangle, ShieldCheck, RefreshCw, Plus, X, Edit, Trash2
} from 'lucide-react';

const Infrastructure = () => {
  const { activeRole } = useAuth();
  
  // Coverage form state
  const [latInput, setLatInput] = useState('-0.0263');
  const [lngInput, setLngInput] = useState('109.3425');
  const [searchCoords, setSearchCoords] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [mapFocus, setMapFocus] = useState(null);

  // Inventories state
  const [olts, setOlts] = useState([]);
  const [odps, setOdps] = useState([]);
  const [branches, setBranches] = useState([]);

  // Modals state
  const [isOltModalOpen, setIsOltModalOpen] = useState(false);
  const [isOdpModalOpen, setIsOdpModalOpen] = useState(false);
  const [isEditOltModalOpen, setIsEditOltModalOpen] = useState(false);
  const [isEditOdpModalOpen, setIsEditOdpModalOpen] = useState(false);

  // OLT Create Form state
  const [oltName, setOltName] = useState('');
  const [oltIp, setOltIp] = useState('');
  const [oltPonPorts, setOltPonPorts] = useState('8');
  const [oltBranchId, setOltBranchId] = useState('');
  const [oltLat, setOltLat] = useState('');
  const [oltLng, setOltLng] = useState('');

  // OLT Edit Form state
  const [editingOltId, setEditingOltId] = useState('');
  const [editOltName, setEditOltName] = useState('');
  const [editOltIp, setEditOltIp] = useState('');
  const [editOltPonPorts, setEditOltPonPorts] = useState('8');
  const [editOltBranchId, setEditOltBranchId] = useState('');
  const [editOltStatus, setEditOltStatus] = useState('Active');
  const [editOltLat, setEditOltLat] = useState('');
  const [editOltLng, setEditOltLng] = useState('');

  // ODP Create Form state
  const [odpName, setOdpName] = useState('');
  const [odpLat, setOdpLat] = useState('');
  const [odpLng, setOdpLng] = useState('');
  const [odpTotalPorts, setOdpTotalPorts] = useState('8');
  const [odpOltId, setOdpOltId] = useState('');
  const [odpOltPonPort, setOdpOltPonPort] = useState('1');
  const [odpBranchId, setOdpBranchId] = useState('');
  const [odpParent, setOdpParent] = useState('');

  // ODP Edit Form state
  const [editingOdpId, setEditingOdpId] = useState('');
  const [editOdpName, setEditOdpName] = useState('');
  const [editOdpLat, setEditOdpLat] = useState('');
  const [editOdpLng, setEditOdpLng] = useState('');
  const [editOdpTotalPorts, setEditOdpTotalPorts] = useState('8');
  const [editOdpOltId, setEditOdpOltId] = useState('');
  const [editOdpOltPonPort, setEditOdpOltPonPort] = useState('1');
  const [editOdpBranchId, setEditOdpBranchId] = useState('');
  const [editOdpStatus, setEditOdpStatus] = useState('Active');
  const [editOdpParent, setEditOdpParent] = useState('');

  const [opDefaultBranchId, setOpDefaultBranchId] = useState('');

  // Fetch OLT, ODP, and Branches lists
  const fetchInventory = async () => {
    setListLoading(true);
    setErrorMessage('');
    try {
      const [oltRes, odpRes, branchRes] = await Promise.all([
        axios.get('/api/infrastructure/olts'),
        axios.get('/api/infrastructure/odps'),
        axios.get('/api/branches').catch(() => null)
      ]);

      if (oltRes.data && oltRes.data.status === 'success') {
        setOlts(oltRes.data.data || []);
      }
      if (odpRes.data && odpRes.data.status === 'success') {
        setOdps(odpRes.data.data || []);
      }
      if (branchRes && branchRes.data && branchRes.data.status === 'success') {
        const branchData = branchRes.data.data || [];
        setBranches(branchData);
        if (branchData.length > 0) {
          const firstBranchIdStr = branchData[0].id.toString();
          setOltBranchId(firstBranchIdStr);
          setOpDefaultBranchId(firstBranchIdStr);
        }
      }
    } catch (err) {
      console.error("Failed to load infrastructure data:", err);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API gagal');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Update default selections in ODP form when branches or OLTs load
  useEffect(() => {
    if (olts.length > 0 && !odpOltId) {
      setOdpOltId(olts[0].id.toString());
    }
    if (branches.length > 0 && !odpBranchId) {
      setOpDefaultBranchId(branches[0].id.toString());
      setOdpBranchId(branches[0].id.toString());
    }
  }, [olts, branches]);

  const handleQueryCoverage = async (e) => {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Masukkan koordinat Latitude/Longitude yang valid!');
      return;
    }

    setCoverageLoading(true);
    try {
      await axios.get(`/api/infrastructure/coverage?latitude=${lat}&longitude=${lng}`);
    } catch (err) {
      console.warn("Direct Coverage API failure:", err.message);
    } finally {
      setSearchCoords({ lat, lng });
      setCoverageLoading(false);
    }
  };

  // Submit OLT handler
  const handleAddOlt = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!oltName || !oltIp || !oltPonPorts || !oltBranchId) {
      setErrorMessage('Semua field OLT wajib diisi!');
      return;
    }

    try {
      const payload = {
        name: oltName,
        ip_address: oltIp,
        total_pon_ports: parseInt(oltPonPorts, 10),
        branch_id: parseInt(oltBranchId, 10),
        latitude: oltLat ? parseFloat(oltLat) : null,
        longitude: oltLng ? parseFloat(oltLng) : null,
      };

      const res = await axios.post('/api/infrastructure/olts', payload);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('OLT berhasil ditambahkan!');
        setIsOltModalOpen(false);
        // Reset form
        setOltName('');
        setOltIp('');
        setOltLat('');
        setOltLng('');
        fetchInventory();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal menambahkan OLT device.');
    }
  };

  // Pre-fill and open OLT Edit Modal
  const handleOpenEditOlt = (olt) => {
    setEditingOltId(olt.id);
    setEditOltName(olt.name);
    setEditOltIp(olt.ip_address);
    setEditOltPonPorts(olt.total_pon_ports.toString());
    setEditOltBranchId(olt.branch_id.toString());
    setEditOltStatus(olt.status || 'Active');
    setEditOltLat(olt.latitude ? olt.latitude.toString() : '');
    setEditOltLng(olt.longitude ? olt.longitude.toString() : '');
    setIsEditOltModalOpen(true);
  };

  // Submit OLT edit handler
  const handleUpdateOlt = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        name: editOltName,
        ip_address: editOltIp,
        total_pon_ports: parseInt(editOltPonPorts, 10),
        branch_id: parseInt(editOltBranchId, 10),
        status: editOltStatus,
        latitude: editOltLat ? parseFloat(editOltLat) : null,
        longitude: editOltLng ? parseFloat(editOltLng) : null,
      };

      const res = await axios.put(`/api/infrastructure/olts/${editingOltId}`, payload);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('OLT berhasil diperbarui!');
        setIsEditOltModalOpen(false);
        fetchInventory();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal memperbarui OLT.');
    }
  };

  // Submit OLT delete handler
  const handleDeleteOlt = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus OLT ini? Seluruh ODP di bawah OLT ini harus dihapus terlebih dahulu.')) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await axios.delete(`/api/infrastructure/olts/${id}`);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('OLT berhasil dihapus!');
        fetchInventory();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal menghapus OLT. Pastikan tidak ada ODP aktif di bawahnya.');
    }
  };

  // Submit ODP handler
  const handleAddOdp = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!odpName || !odpLat || !odpLng || !odpTotalPorts || !odpOltId || !odpOltPonPort || !odpBranchId) {
      setErrorMessage('Semua field ODP wajib diisi!');
      return;
    }

    try {
      const payload = {
        name: odpName,
        latitude: parseFloat(odpLat),
        longitude: parseFloat(odpLng),
        total_ports: parseInt(odpTotalPorts, 10),
        olt_id: parseInt(odpOltId, 10),
        olt_pon_port: parseInt(odpOltPonPort, 10),
        branch_id: parseInt(odpBranchId, 10),
        parent: odpParent || null
      };

      const res = await axios.post('/api/infrastructure/odps', payload);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('ODP berhasil ditambahkan!');
        setIsOdpModalOpen(false);
        // Reset form
        setOdpName('');
        setOdpLat('');
        setOdpLng('');
        setOdpParent('');
        fetchInventory();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal menambahkan ODP splitter.');
    }
  };

  // Pre-fill and open ODP Edit Modal
  const handleOpenEditOdp = (odp) => {
    setEditingOdpId(odp.id);
    setEditOdpName(odp.name);
    setEditOdpLat(odp.latitude ? odp.latitude.toString() : '');
    setEditOdpLng(odp.longitude ? odp.longitude.toString() : '');
    setEditOdpTotalPorts(odp.total_ports.toString());
    setEditOdpOltId(odp.olt_id ? odp.olt_id.toString() : '');
    setEditOdpOltPonPort(odp.olt_pon_port ? odp.olt_pon_port.toString() : '1');
    setEditOdpBranchId(odp.branch_id ? odp.branch_id.toString() : '');
    setEditOdpStatus(odp.status || 'Active');
    setEditOdpParent(odp.parent || '');
    setIsEditOdpModalOpen(true);
  };

  // Submit ODP edit handler
  const handleUpdateOdp = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        name: editOdpName,
        latitude: parseFloat(editOdpLat),
        longitude: parseFloat(editOdpLng),
        total_ports: parseInt(editOdpTotalPorts, 10),
        olt_id: parseInt(editOdpOltId, 10),
        olt_pon_port: parseInt(editOdpOltPonPort, 10),
        branch_id: parseInt(editOdpBranchId, 10),
        status: editOdpStatus,
        parent: editOdpParent || null
      };

      const res = await axios.put(`/api/infrastructure/odps/${editingOdpId}`, payload);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('ODP berhasil diperbarui!');
        setIsEditOdpModalOpen(false);
        fetchInventory();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal memperbarui ODP.');
    }
  };

  // Submit ODP delete handler
  const handleDeleteOdp = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus ODP ini?')) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await axios.delete(`/api/infrastructure/odps/${id}`);
      if (res.data && res.data.status === 'success') {
        setSuccessMessage('ODP berhasil dihapus!');
        fetchInventory();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Gagal menghapus ODP.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Infrastruktur <span className="gradient-text-primary">Jaringan Fisik</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Peta serat optik rill, inventaris core OLT, box splitter ODP dari database, serta alat cek kelayakan sinyal (Coverage Area).
          </p>
        </div>
        
        {/* Buttons to open create modals */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsOltModalOpen(true)}
            className="flex items-center space-x-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-violet-600/15"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah OLT</span>
          </button>
          <button 
            onClick={() => setIsOdpModalOpen(true)}
            className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/15"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah ODP</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in">
          {successMessage}
        </div>
      )}

      {/* SECTION 1: LIVE COVERAGE AREA LOOKUP TOOL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coverage form */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2.5 mb-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl"><Network className="h-5 w-5" /></div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Cek Layanan Coverage</h3>
            </div>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Query instan ketersediaan tiang dan kotak ODP terdekat berdasarkan parameter koordinat GPS pelanggan baru. Sesuai konfigurasi, jangkauan maksimal instalasi adalah 500 meter dari ODP.
            </p>

            <form onSubmit={handleQueryCoverage} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude Koordinat</label>
                <input 
                  type="text" 
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="e.g. -0.0263" 
                  className="w-full input-field text-xs font-mono" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude Koordinat</label>
                <input 
                  type="text" 
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="e.g. 109.3425" 
                  className="w-full input-field text-xs font-mono" 
                />
              </div>

              <button type="submit" disabled={coverageLoading} className="glow-btn-primary text-xs py-2.5 w-full font-bold flex items-center justify-center space-x-2">
                {coverageLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ZoomIn className="h-4 w-4" />}
                <span>Pindai Jarak Terdekat (Peta)</span>
              </button>
            </form>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-[10px] text-slate-500 font-semibold flex items-center space-x-2 mt-6">
            <Info className="h-4 w-4 text-brand-400 flex-shrink-0" />
            <span>Klik area mana saja pada peta rill di samping untuk menarik koordinat penunjuk secara otomatis.</span>
          </div>
        </div>

        {/* Dynamic map simulation */}
        <div className="lg:col-span-2">
          <CustomMap 
            searchCoords={searchCoords} 
            olts={olts} 
            odps={odps} 
            focusCoords={mapFocus}
            loading={listLoading}
          />
        </div>
      </div>

      {/* SECTION 2: OLT AND ODP REGISTRATION LISTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* OLT Core lists */}
        <div className="glass-panel p-6 lg:col-span-1">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inventaris OLT (Optical Line Terminal)</h3>
            <span className="text-[9px] bg-brand-500/10 text-brand-400 font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
              {listLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
              <span>Live DB</span>
            </span>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {olts.length > 0 ? (
              olts.map(olt => (
                <div key={olt.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => {
                        if (olt.latitude && olt.longitude) {
                          setMapFocus({ lat: parseFloat(olt.latitude), lng: parseFloat(olt.longitude) });
                        }
                      }}
                      className="text-xs font-bold text-slate-200 flex items-center space-x-1.5 hover:text-brand-400 transition-colors"
                    >
                      <Radio className="h-3.5 w-3.5 text-brand-400" />
                      <span>{olt.name}</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded">{olt.status || 'Active'}</span>
                      <button 
                        onClick={() => handleOpenEditOlt(olt)}
                        className="p-1 hover:bg-slate-900 rounded text-slate-400 hover:text-white transition-colors"
                        title="Edit OLT"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button 
                        onClick={() => handleDeleteOlt(olt.id)}
                        className="p-1 hover:bg-rose-950/30 rounded text-slate-400 hover:text-rose-400 transition-colors"
                        title="Hapus OLT"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                    <span><strong>IP:</strong> {olt.ip_address}</span>
                    <span><strong>Kapasitas:</strong> {olt.total_pon_ports} PON Ports</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">Tidak ada OLT yang terdaftar</div>
            )}
          </div>
        </div>

        {/* ODP Splitter Box details list */}
        <div className="glass-panel p-6 lg:col-span-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Optical Distribution Packets (ODP / FAT)</h3>
          
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/25 sticky top-0 backdrop-blur">
                  <th className="py-3 px-4 font-semibold">Nama ODP</th>
                  <th className="py-3 px-4 font-semibold">OLT Uplink Source</th>
                  <th className="py-3 px-4 font-semibold">Uplink PON Port</th>
                  <th className="py-3 px-4 font-semibold">Kapasitas Port</th>
                  <th className="py-3 px-4 font-semibold">Koordinat GPS</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {odps.length > 0 ? (
                  odps.map(odp => (
                    <tr key={odp.id} className="hover:bg-slate-800/10">
                      <td className="py-3 px-4 font-bold text-slate-200">
                        <button 
                          onClick={() => {
                            if (odp.latitude && odp.longitude) {
                              setMapFocus({ lat: parseFloat(odp.latitude), lng: parseFloat(odp.longitude) });
                            }
                          }}
                          className="hover:text-brand-400 transition-colors text-left"
                        >
                          {odp.name}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {olts.find(o => o.id === odp.olt_id)?.name || 'OLT PONTIANAK CORE'}
                      </td>
                      <td className="py-3 px-4 font-bold text-brand-400">PON {odp.olt_pon_port || 1}</td>
                      <td className="py-3 px-4 text-slate-300">{odp.used_ports || 0}/{odp.total_ports} Ports</td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {odp.latitude ? parseFloat(odp.latitude).toFixed(4) : '0.0000'}, {odp.longitude ? parseFloat(odp.longitude).toFixed(4) : '0.0000'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${odp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                          <span className={`h-1 w-1 rounded-full ${odp.status === 'Active' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                          <span>{odp.status || 'Active'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button 
                            onClick={() => handleOpenEditOdp(odp)}
                            className="p-1 hover:bg-slate-900 rounded text-slate-400 hover:text-white transition-colors"
                            title="Edit ODP"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          <button 
                            onClick={() => handleDeleteOdp(odp.id)}
                            className="p-1 hover:bg-rose-950/30 rounded text-slate-400 hover:text-rose-400 transition-colors"
                            title="Hapus ODP"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-xs text-slate-500">Tidak ada ODP terdaftar di database</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL: REGISTER OLT */}
      {isOltModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 relative flex flex-col space-y-4">
            <button 
              onClick={() => setIsOltModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Radio className="h-5 w-5 text-violet-500" />
              <h3 className="text-base font-bold text-slate-200">Register New OLT Core</h3>
            </div>

            <form onSubmit={handleAddOlt} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Device OLT</label>
                <input 
                  type="text" 
                  value={oltName}
                  onChange={(e) => setOltName(e.target.value)}
                  placeholder="e.g. OLT-KB-PUSAT-01"
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Management IP Address</label>
                <input 
                  type="text" 
                  value={oltIp}
                  onChange={(e) => setOltIp(e.target.value)}
                  placeholder="e.g. 192.168.10.2"
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude (Opsional)</label>
                  <input 
                    type="text" 
                    value={oltLat}
                    onChange={(e) => setOltLat(e.target.value)}
                    placeholder="e.g. -0.0245"
                    className="w-full input-field font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude (Opsional)</label>
                  <input 
                    type="text" 
                    value={oltLng}
                    onChange={(e) => setOltLng(e.target.value)}
                    placeholder="e.g. 109.3456"
                    className="w-full input-field font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Total PON Ports</label>
                  <select 
                    value={oltPonPorts}
                    onChange={(e) => setOltPonPorts(e.target.value)}
                    className="w-full input-field select-field"
                  >
                    <option value="1">1 Port</option>
                    <option value="2">2 Ports</option>
                    <option value="4">4 Ports</option>
                    <option value="8">8 Ports</option>
                    <option value="16">16 Ports</option>
                    <option value="32">32 Ports</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Alokasi Kantor Cabang</label>
                  <select 
                    value={oltBranchId}
                    onChange={(e) => setOltBranchId(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsOltModalOpen(false)}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-white shadow-lg shadow-violet-600/15"
                >
                  Simpan OLT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT OLT */}
      {isEditOltModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 relative flex flex-col space-y-4">
            <button 
              onClick={() => setIsEditOltModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Radio className="h-5 w-5 text-violet-500" />
              <h3 className="text-base font-bold text-slate-200">Edit OLT Device</h3>
            </div>

            <form onSubmit={handleUpdateOlt} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Device OLT</label>
                <input 
                  type="text" 
                  value={editOltName}
                  onChange={(e) => setEditOltName(e.target.value)}
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Management IP Address</label>
                <input 
                  type="text" 
                  value={editOltIp}
                  onChange={(e) => setEditOltIp(e.target.value)}
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude (Opsional)</label>
                  <input 
                    type="text" 
                    value={editOltLat}
                    onChange={(e) => setEditOltLat(e.target.value)}
                    placeholder="e.g. -0.0245"
                    className="w-full input-field font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude (Opsional)</label>
                  <input 
                    type="text" 
                    value={editOltLng}
                    onChange={(e) => setEditOltLng(e.target.value)}
                    placeholder="e.g. 109.3456"
                    className="w-full input-field font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Total PON Ports</label>
                  <select 
                    value={editOltPonPorts}
                    onChange={(e) => setEditOltPonPorts(e.target.value)}
                    className="w-full input-field select-field"
                  >
                    <option value="1">1 Port</option>
                    <option value="2">2 Ports</option>
                    <option value="4">4 Ports</option>
                    <option value="8">8 Ports</option>
                    <option value="16">16 Ports</option>
                    <option value="32">32 Ports</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Alokasi Kantor Cabang</label>
                  <select 
                    value={editOltBranchId}
                    onChange={(e) => setEditOltBranchId(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Status Perangkat</label>
                <select 
                  value={editOltStatus}
                  onChange={(e) => setEditOltStatus(e.target.value)}
                  className="w-full input-field select-field"
                >
                  <option value="Active">Active (Dapat terhubung ODP)</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsEditOltModalOpen(false)}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-white shadow-lg shadow-violet-600/15"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTER ODP */}
      {isOdpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 relative flex flex-col space-y-4">
            <button 
              onClick={() => setIsOdpModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <MapPin className="h-5 w-5 text-indigo-500" />
              <h3 className="text-base font-bold text-slate-200">Register New ODP Splitter Box</h3>
            </div>

            <form onSubmit={handleAddOdp} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Kotak ODP</label>
                <input 
                  type="text" 
                  value={odpName}
                  onChange={(e) => setOdpName(e.target.value)}
                  placeholder="e.g. ODP-PTK-A05"
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Sumber Koneksi Utama (Parent)</label>
                <select 
                  value={odpParent}
                  onChange={(e) => setOdpParent(e.target.value)}
                  className="w-full input-field select-field"
                >
                  <option value="">Langsung ke OLT (Pusat)</option>
                  {odps.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
                <p className="text-[9px] text-slate-500 italic mt-0.5">
                  Pilih ODP lain jika kotak ini terhubung secara cascading, atau kosongkan untuk langsung ke OLT.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label>
                  <input 
                    type="text" 
                    value={odpLat}
                    onChange={(e) => setOdpLat(e.target.value)}
                    placeholder="e.g. -0.0245"
                    className="w-full input-field font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label>
                  <input 
                    type="text" 
                    value={odpLng}
                    onChange={(e) => setOdpLng(e.target.value)}
                    placeholder="e.g. 109.3456"
                    className="w-full input-field font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Total Splitter Ports</label>
                  <select 
                    value={odpTotalPorts}
                    onChange={(e) => setOdpTotalPorts(e.target.value)}
                    className="w-full input-field select-field"
                  >
                    <option value="8">8 Ports</option>
                    <option value="16">16 Ports</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Kantor Cabang</label>
                  <select 
                    value={odpBranchId}
                    onChange={(e) => setOdpBranchId(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Parent Uplink OLT</label>
                  <select 
                    value={odpOltId}
                    onChange={(e) => setOdpOltId(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {olts.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Uplink OLT PON Port</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="128"
                    value={odpOltPonPort}
                    onChange={(e) => setOdpOltPonPort(e.target.value)}
                    className="w-full input-field"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsOdpModalOpen(false)}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white shadow-lg shadow-indigo-600/15"
                >
                  Simpan ODP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ODP */}
      {isEditOdpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 relative flex flex-col space-y-4">
            <button 
              onClick={() => setIsEditOdpModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <MapPin className="h-5 w-5 text-indigo-500" />
              <h3 className="text-base font-bold text-slate-200">Edit ODP Splitter Box</h3>
            </div>

            <form onSubmit={handleUpdateOdp} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Kotak ODP</label>
                <input 
                  type="text" 
                  value={editOdpName}
                  onChange={(e) => setEditOdpName(e.target.value)}
                  className="w-full input-field"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Sumber Koneksi Utama (Parent)</label>
                <select 
                  value={editOdpParent}
                  onChange={(e) => setEditOdpParent(e.target.value)}
                  className="w-full input-field select-field"
                >
                  <option value="">Langsung ke OLT (Pusat)</option>
                  {odps.filter(o => o.id !== editingOdpId).map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label>
                  <input 
                    type="text" 
                    value={editOdpLat}
                    onChange={(e) => setEditOdpLat(e.target.value)}
                    className="w-full input-field font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label>
                  <input 
                    type="text" 
                    value={editOdpLng}
                    onChange={(e) => setEditOdpLng(e.target.value)}
                    className="w-full input-field font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Total Splitter Ports</label>
                  <select 
                    value={editOdpTotalPorts}
                    onChange={(e) => setEditOdpTotalPorts(e.target.value)}
                    className="w-full input-field select-field"
                  >
                    <option value="8">8 Ports</option>
                    <option value="16">16 Ports</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Kantor Cabang</label>
                  <select 
                    value={editOdpBranchId}
                    onChange={(e) => setEditOdpBranchId(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Parent Uplink OLT</label>
                  <select 
                    value={editOdpOltId}
                    onChange={(e) => setEditOdpOltId(e.target.value)}
                    className="w-full input-field select-field"
                    required
                  >
                    {olts.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Uplink OLT PON Port</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="128"
                    value={editOdpOltPonPort}
                    onChange={(e) => setEditOdpOltPonPort(e.target.value)}
                    className="w-full input-field"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Status Kotak ODP</label>
                <select 
                  value={editOdpStatus}
                  onChange={(e) => setEditOdpStatus(e.target.value)}
                  className="w-full input-field select-field"
                >
                  <option value="Active">Active (Sinyal Terbuka)</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsEditOdpModalOpen(false)}
                  className="px-4 py-2 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors font-bold text-slate-400"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white shadow-lg shadow-indigo-600/15"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Infrastructure;
