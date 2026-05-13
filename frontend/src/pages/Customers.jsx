import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import CustomMap from '../components/CustomMap';
import axios from 'axios';
import { 
  Users, Search, UserPlus, MapPin, Phone, Mail, ClipboardList, Info, CheckCircle, RefreshCw
} from 'lucide-react';

const Customers = () => {
  const { activeRole } = useAuth();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Core customer form state
  const [fullName, setFullName] = useState('');
  const [ktpNumber, setKtpNumber] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(-1.2654);
  const [longitude, setLongitude] = useState(116.8312);

  // New detailed address states
  const [rt, setRt] = useState('');
  const [rw, setRw] = useState('');
  const [dusun, setDusun] = useState('');
  
  // Dynamic cascading lists loaded from regions database
  const [provinsiList, setProvinsiList] = useState([]);
  const [kabupatenList, setKabupatenList] = useState([]);
  const [kecamatanList, setKecamatanList] = useState([]);
  const [desaList, setDesaList] = useState([]);

  // Chosen regions IDs
  const [selectedProvinsi, setSelectedProvinsi] = useState('');
  const [selectedKabupaten, setSelectedKabupaten] = useState('');
  const [selectedKecamatan, setSelectedKecamatan] = useState('');
  const [selectedDesa, setSelectedDesa] = useState('');

  // Superadmin branch selection states
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  // Dropdowns loaders state
  const [regionsLoading, setRegionsLoading] = useState(false);

  // State for customers list from API
  const [customers, setCustomers] = useState([]);

  // Fetch from Real API
  const fetchCustomers = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/customers');
      if (response.data && response.data.status === 'success') {
        const apiData = response.data.data;
        const customersArray = (apiData && Array.isArray(apiData.customers))
          ? apiData.customers
          : (Array.isArray(apiData) ? apiData : []);
        setCustomers(customersArray);
      } else {
        setCustomers([]);
        setErrorMessage(response.data?.message || 'Gagal memuat daftar pelanggan');
      }
    } catch (err) {
      console.error("Direct API fetch failed:", err);
      setCustomers([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API gagal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Fetch Provinces on mount / when form toggles open
  useEffect(() => {
    if (showAddForm) {
      const loadProvinsi = async () => {
        setRegionsLoading(true);
        try {
          const res = await axios.get('/api/regions', { params: { region_type: 'Provinsi', limit: 1000 } });
          if (res.data && res.data.status === 'success') {
            setProvinsiList(res.data.data || []);
          }
        } catch (err) {
          console.error('Failed to load provinces:', err);
        } finally {
          setRegionsLoading(false);
        }
      };
      loadProvinsi();
    }
  }, [showAddForm]);

  // Fetch active branches if logged in as Superadmin
  useEffect(() => {
    if (showAddForm && activeRole === 'Superadmin') {
      const loadBranches = async () => {
        try {
          const res = await axios.get('/api/branches');
          if (res.data && res.data.status === 'success') {
            const branchList = res.data.data || [];
            setBranches(branchList);
            if (branchList.length > 0) {
              setSelectedBranch(branchList[0].id.toString());
            }
          }
        } catch (err) {
          console.error('Failed to load active branches:', err);
        }
      };
      loadBranches();
    }
  }, [showAddForm, activeRole]);

  // Load Kabupaten cascades when Provinsi selection changes
  useEffect(() => {
    const loadKabupaten = async () => {
      if (!selectedProvinsi) {
        setKabupatenList([]);
        return;
      }
      setRegionsLoading(true);
      try {
        const res = await axios.get('/api/regions', { params: { region_type: 'Kabupaten', region_ref: selectedProvinsi, limit: 1000 } });
        if (res.data && res.data.status === 'success') {
          setKabupatenList(res.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load kabupatens:', err);
      } finally {
        setRegionsLoading(false);
      }
    };
    loadKabupaten();

    // Reset dependent cascading children
    setKabupatenList([]);
    setKecamatanList([]);
    setDesaList([]);
    setSelectedKabupaten('');
    setSelectedKecamatan('');
    setSelectedDesa('');
  }, [selectedProvinsi]);

  // Load Kecamatan cascades when Kabupaten selection changes
  useEffect(() => {
    const loadKecamatan = async () => {
      if (!selectedKabupaten) {
        setKecamatanList([]);
        return;
      }
      setRegionsLoading(true);
      try {
        const res = await axios.get('/api/regions', { params: { region_type: 'Kecamatan', region_ref: selectedKabupaten, limit: 1000 } });
        if (res.data && res.data.status === 'success') {
          setKecamatanList(res.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load kecamatans:', err);
      } finally {
        setRegionsLoading(false);
      }
    };
    loadKecamatan();

    // Reset dependent cascading children
    setKecamatanList([]);
    setDesaList([]);
    setSelectedKecamatan('');
    setSelectedDesa('');
  }, [selectedKabupaten]);

  // Load Desa cascades when Kecamatan selection changes
  useEffect(() => {
    const loadDesa = async () => {
      if (!selectedKecamatan) {
        setDesaList([]);
        return;
      }
      setRegionsLoading(true);
      try {
        const res = await axios.get('/api/regions', { params: { region_type: 'Desa', region_ref: selectedKecamatan, limit: 1000 } });
        if (res.data && res.data.status === 'success') {
          setDesaList(res.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load desas:', err);
      } finally {
        setRegionsLoading(false);
      }
    };
    loadDesa();

    // Reset dependent cascading children
    setDesaList([]);
    setSelectedDesa('');
  }, [selectedKecamatan]);

  const handleMapLocationSelect = (coords) => {
    setLatitude(coords.lat);
    setLongitude(coords.lng);
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!fullName || !ktpNumber || !whatsapp || !address) {
      alert('Selesaikan field wajib!');
      return;
    }

    if (activeRole === 'Superadmin' && !selectedBranch) {
      alert('Superadmin wajib memilih Cabang (Branch)!');
      return;
    }

    setErrorMessage('');
    try {
      // Find region name string from selections array to save in customer table
      const provObj = provinsiList.find(p => p.id === Number(selectedProvinsi));
      const kabObj = kabupatenList.find(k => k.id === Number(selectedKabupaten));
      const kecObj = kecamatanList.find(k => k.id === Number(selectedKecamatan));
      const desaObj = desaList.find(d => d.id === Number(selectedDesa));

      const payload = {
        full_name: fullName,
        ktp_number: ktpNumber,
        whatsapp_number: whatsapp,
        email: email || undefined,
        address,
        rt: rt || undefined,
        rw: rw || undefined,
        dusun: dusun || undefined,
        desa: desaObj ? desaObj.region_name : undefined,
        kecamatan: kecObj ? kecObj.region_name : undefined,
        kabupaten: kabObj ? kabObj.region_name : undefined,
        provinsi: provObj ? provObj.region_name : undefined,
        latitude,
        longitude,
        // Include branch_id selector if logged in as Superadmin
        branch_id: activeRole === 'Superadmin' ? Number(selectedBranch) : undefined
      };

      // Call Direct POST API
      const response = await axios.post('/api/customers', payload);
      
      if (response.data && response.data.status === 'success') {
        setFormSuccess(true);
        fetchCustomers(); // Refresh list from backend
        
        // Reset form fields
        setFullName('');
        setKtpNumber('');
        setWhatsapp('');
        setEmail('');
        setAddress('');
        setRt('');
        setRw('');
        setDusun('');
        setSelectedProvinsi('');
        setSelectedKabupaten('');
        setSelectedKecamatan('');
        setSelectedDesa('');
        
        setTimeout(() => {
          setFormSuccess(false);
          setShowAddForm(false);
        }, 2500);
      } else {
        throw new Error(response.data?.message || "API refused input");
      }
    } catch (err) {
      console.error("Direct POST failed:", err);
      const msg = err.response?.data?.message || err.message || "Pendaftaran gagal";
      alert(`Gagal mendaftarkan pelanggan: ${msg}`);
      setErrorMessage(msg);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const nameVal = c.full_name || '';
    const codeVal = c.code || '';
    const waVal = c.whatsapp_number || '';
    const statusVal = c.lifecycle_status || '';

    const matchesSearch = nameVal.toLowerCase().includes(search.toLowerCase()) || 
                          codeVal.toLowerCase().includes(search.toLowerCase()) ||
                          waVal.includes(search);
    const matchesStatus = filterStatus === 'ALL' || statusVal.toUpperCase() === filterStatus.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Manajemen <span className="gradient-text-primary">Pelanggan (CRM)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Database CRM Pelanggan terintegrasi berdasarkan wilayah Branch dan status siklus hidup (Lifecycle).
          </p>
        </div>
        
        {/* Register customer button (Only for Superadmin, Admin, Sales, Mitra) */}
        {(activeRole === 'Superadmin' || activeRole === 'Admin' || activeRole === 'Sales' || activeRole === 'Mitra') && (
          <button 
            onClick={() => { setShowAddForm(!showAddForm); setFormSuccess(false); }}
            className="glow-btn-primary text-xs py-2.5 px-5 flex items-center space-x-2 mt-0 self-start md:self-center"
          >
            <UserPlus className="h-4 w-4" />
            <span>Daftar Pelanggan Baru</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in">
          {errorMessage}
        </div>
      )}

      {/* FORM: REGISTER CUSTOMER */}
      {showAddForm && (
        <div className="glass-panel p-6 border-brand-500/20 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-5">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Input Calon Pelanggan Baru (Prospek)</h3>
            {regionsLoading && (
              <span className="flex items-center text-[10px] text-brand-400 font-bold space-x-1 animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Memproses Wilayah...</span>
              </span>
            )}
          </div>
          
          {formSuccess ? (
            <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs font-semibold flex items-center space-x-3 mb-4">
              <CheckCircle className="h-5 w-5 animate-bounce" />
              <div>
                <span className="font-bold block">Pendaftaran Berhasil!</span>
                <span className="text-slate-400 block mt-0.5">Calon pelanggan telah terdaftar sebagai status "Prospek" dan dikirim ke daftar antrean survey ODP.</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAddCustomer} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Form fields */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nama Lengkap *</label>
                      <input 
                        type="text" 
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Nama sesuai KTP" 
                        className="w-full input-field text-xs" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">No KTP (16 Digit) *</label>
                      <input 
                        type="text" 
                        required
                        maxLength={16}
                        value={ktpNumber}
                        onChange={(e) => setKtpNumber(e.target.value)}
                        placeholder="64710xxxxxxxxxxx" 
                        className="w-full input-field text-xs font-mono" 
                      />
                    </div>
                  </div>

                  {/* BRANCH SELECTOR FOR SUPERADMIN */}
                  {activeRole === 'Superadmin' && (
                    <div className="space-y-1 bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl animate-in slide-in-from-top-2 duration-150">
                      <label className="text-[10px] font-extrabold text-brand-400 uppercase tracking-wider block mb-1">Pilih Cabang (Branch) *</label>
                      <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full input-field select-field text-xs py-2"
                        required
                      >
                        <option value="" disabled>-- Pilih Cabang --</option>
                        {branches.map(br => (
                          <option key={br.id} value={br.id}>{br.name} - {br.address}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">WhatsApp Number *</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <input 
                          type="tel" 
                          required
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value)}
                          placeholder="e.g. 08123456789" 
                          className="w-full input-field text-xs pl-10" 
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <input 
                          type="email" 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="e.g. name@domain.com" 
                          className="w-full input-field text-xs pl-10" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* ALAMAT UTAMA & RT/RW/DUSUN GROUP */}
                  <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl">
                    <span className="text-[10px] font-extrabold text-brand-400 uppercase tracking-wider block">Spesifikasi Alamat Rumah</span>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Alamat Jalan / No Rumah *</label>
                      <textarea 
                        required
                        rows={2}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Nama Jalan, Blok, Nomor Rumah" 
                        className="w-full input-field text-xs resize-none" 
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">RT</label>
                        <input 
                          type="text" 
                          value={rt}
                          onChange={(e) => setRt(e.target.value)}
                          placeholder="03" 
                          className="w-full input-field text-xs" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">RW</label>
                        <input 
                          type="text" 
                          value={rw}
                          onChange={(e) => setRw(e.target.value)}
                          placeholder="01" 
                          className="w-full input-field text-xs" 
                        />
                      </div>
                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dusun</label>
                        <input 
                          type="text" 
                          value={dusun}
                          onChange={(e) => setDusun(e.target.value)}
                          placeholder="Dusun Mekar" 
                          className="w-full input-field text-xs" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* DYNAMIC CASCADING REGIONS SELECTORS */}
                  <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-800/80 rounded-2xl">
                    <span className="text-[10px] font-extrabold text-brand-400 uppercase tracking-wider block">Daerah Administratif (Regions)</span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Provinsi Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Provinsi</label>
                        <select 
                          value={selectedProvinsi}
                          onChange={(e) => setSelectedProvinsi(e.target.value)}
                          className="w-full input-field select-field text-xs py-2"
                        >
                          <option value="">-- Pilih Provinsi --</option>
                          {provinsiList.map(prov => (
                            <option key={prov.id} value={prov.id}>{prov.region_name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Kabupaten Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Kabupaten / Kota</label>
                        <select 
                          value={selectedKabupaten}
                          onChange={(e) => setSelectedKabupaten(e.target.value)}
                          disabled={!selectedProvinsi}
                          className="w-full input-field select-field text-xs py-2 disabled:opacity-40"
                        >
                          <option value="">-- Pilih Kabupaten --</option>
                          {kabupatenList.map(kab => (
                            <option key={kab.id} value={kab.id}>{kab.region_name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Kecamatan Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Kecamatan</label>
                        <select 
                          value={selectedKecamatan}
                          onChange={(e) => setSelectedKecamatan(e.target.value)}
                          disabled={!selectedKabupaten}
                          className="w-full input-field select-field text-xs py-2 disabled:opacity-40"
                        >
                          <option value="">-- Pilih Kecamatan --</option>
                          {kecamatanList.map(kec => (
                            <option key={kec.id} value={kec.id}>{kec.region_name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Desa Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Desa / Kelurahan</label>
                        <select 
                          value={selectedDesa}
                          onChange={(e) => setSelectedDesa(e.target.value)}
                          disabled={!selectedKecamatan}
                          className="w-full input-field select-field text-xs py-2 disabled:opacity-40"
                        >
                          <option value="">-- Pilih Desa --</option>
                          {desaList.map(desa => (
                            <option key={desa.id} value={desa.id}>{desa.region_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Latitude Koordinat</label>
                      <input type="text" readOnly value={latitude} className="w-full input-field text-xs bg-slate-950 font-mono text-slate-400" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Longitude Koordinat</label>
                      <input type="text" readOnly value={longitude} className="w-full input-field text-xs bg-slate-950 font-mono text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* Map Selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-2">Tandai Lokasi Rumah di Peta (Untuk Cek ODP & Radius Coverage)</label>
                  <CustomMap onLocationSelect={handleMapLocationSelect} />
                </div>

              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)} 
                  className="glow-btn-secondary text-xs font-semibold py-2"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="glow-btn-primary text-xs font-bold py-2 px-8"
                >
                  Simpan Calon Pelanggan
                </button>
              </div>
            </form>
          )}
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
            placeholder="Cari nama, KTP, atau No. Handphone..." 
            className="w-full input-field pl-11 text-xs"
          />
        </div>

        <div className="flex items-center space-x-3 overflow-x-auto pb-2 md:pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            {loading && <RefreshCw className="h-3 w-3 animate-spin text-brand-400" />}
            <span>Status:</span>
          </span>
          {['ALL', 'PROSPEK', 'INSTALASI', 'AKTIF', 'ISOLIR', 'TERMINATED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border
                ${filterStatus === status 
                  ? 'bg-brand-500 border-brand-400 text-white shadow-sm shadow-brand-500/10' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700/80'
                }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* CUSTOMERS DATA TABLE */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/40">
                <th className="py-4 px-6 font-semibold">Customer ID</th>
                <th className="py-4 px-6 font-semibold">Nama Pelanggan</th>
                <th className="py-4 px-6 font-semibold">No KTP</th>
                <th className="py-4 px-6 font-semibold">Kontak WA</th>
                <th className="py-4 px-6 font-semibold">Alamat Rumah</th>
                <th className="py-4 px-6 font-semibold">Wilayah Branch</th>
                <th className="py-4 px-6 font-semibold text-center">Siklus Hidup (Status)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-800/15 transition-colors group">
                    <td className="py-4 px-6 font-mono font-bold text-brand-400 group-hover:text-brand-300">{cust.code || `UWS0${cust.id}`}</td>
                    <td className="py-4 px-6 font-bold text-slate-200">{cust.full_name}</td>
                    <td className="py-4 px-6 font-mono text-slate-400">{cust.ktp_number}</td>
                    <td className="py-4 px-6 font-mono text-slate-400">{cust.whatsapp_number}</td>
                    <td className="py-4 px-6 text-slate-400 max-w-xs" title={cust.address}>
                      <div className="font-semibold text-slate-300 truncate">{cust.address}</div>
                      {(cust.rt || cust.rw || cust.desa || cust.kecamatan || cust.kabupaten || cust.provinsi) && (
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {[
                            cust.rt && `RT ${cust.rt}`,
                            cust.rw && `RW ${cust.rw}`,
                            cust.dusun && `Dsn. ${cust.dusun}`,
                            cust.desa,
                            cust.kecamatan,
                            cust.kabupaten,
                            cust.provinsi
                          ].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-300">
                      <span className="bg-slate-800/60 border border-slate-700/40 px-2.5 py-0.5 rounded-lg text-[10px]">
                        {cust.branch || 'Balikpapan'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <StatusBadge status={cust.lifecycle_status || 'PROSPEK'} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-semibold">
                    <Info className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <span>Tidak ada pelanggan yang cocok dengan pencarian / filter Anda</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Customers;
