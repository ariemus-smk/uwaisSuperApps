import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import CustomMap from '../components/CustomMap';
import StatusBadge from '../components/StatusBadge';
import axios from 'axios';
import { 
  Wifi, HelpCircle, HardDrive, Key, Plus, CheckCircle, AlertCircle, RefreshCw, Send, Radio, Trash2, Zap, Search
} from 'lucide-react';

const Subscriptions = () => {
  const { activeRole } = useAuth();
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [step, setStep] = useState(1);

  // Wizard state values
  const [selectedCustId, setSelectedCustId] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('');
  const [nasId, setNasId] = useState('');
  const [odpId, setOdpId] = useState(null);
  const [odpName, setOdpName] = useState('');
  const [odpPort, setOdpPort] = useState(null);
  const [onuSn, setOnuSn] = useState('');
  const [onuMac, setOnuMac] = useState('');
  const [customerCoords, setCustomerCoords] = useState(null);

  // Dropdown lists
  const [customersList, setCustomersList] = useState([]);
  const [packagesList, setPackagesList] = useState([]);
  const [nasList, setNasList] = useState([]);
  const [olts, setOlts] = useState([]);
  const [odps, setOdps] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [selectedCustName, setSelectedCustName] = useState('');

  // Generated results simulation
  const [generatedUser, setGeneratedUser] = useState('');
  const [generatedPass, setGeneratedPass] = useState('');
  const [generatedInvoice, setGeneratedInvoice] = useState('');

  const [subscriptions, setSubscriptions] = useState([]);

  // Fetch from real subscription endpoint
  const fetchSubscriptions = async () => {
    setListLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/subscriptions');
      if (response.data && response.data.status === 'success') {
        const apiData = response.data.data;
        const subsArray = (apiData && Array.isArray(apiData.subscriptions)) 
          ? apiData.subscriptions 
          : (Array.isArray(apiData) ? apiData : []);
        setSubscriptions(subsArray);
      } else {
        setSubscriptions([]);
        setErrorMessage(response.data?.message || 'Gagal memuat daftar subskripsi');
      }
    } catch (err) {
      console.error("Direct API fetch failed:", err);
      setSubscriptions([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API gagal');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchCustomers = async (search = '') => {
    setIsSearchingCustomers(true);
    try {
      const response = await axios.get('/api/customers', { 
        params: { 
          'lifecycle_status[]': ['Instalasi', 'Aktif'], 
          search,
          limit: 50 
        } 
      });
      if (response.data?.status === 'success') {
        const arr = response.data.data?.customers || response.data.data || [];
        setCustomersList(arr);
        if (arr.length > 0 && !selectedCustId) {
          const first = arr[0];
          setSelectedCustId(first.id);
          setSelectedCustName(first.full_name);
          if (first.latitude && first.longitude) {
            setCustomerCoords({ lat: parseFloat(first.latitude), lng: parseFloat(first.longitude) });
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setIsSearchingCustomers(false);
    }
  };

  useEffect(() => {
    if (showWizard) {
      const loadWizardData = async () => {
        try {
          // Fetch initial customers (first 50)
          fetchCustomers();

          const [packRes, nasRes] = await Promise.all([
            axios.get('/api/packages'),
            axios.get('/api/nas', { params: { limit: 100 } })
          ]);

          if (packRes.data?.status === 'success') {
            const arr = packRes.data.data?.packages || packRes.data.data || [];
            setPackagesList(arr);
            if (arr.length > 0) setSelectedPackId(arr[0].id);
          }
          if (nasRes.data?.status === 'success') {
            const arr = nasRes.data.data?.nas || nasRes.data.data?.devices || nasRes.data.data || [];
            setNasList(arr);
            if (arr.length > 0) setNasId(arr[0].id);
          }

          // Fetch Infrastructure for Map
          const [oltRes, odpRes] = await Promise.all([
            axios.get('/api/infrastructure/olts', { params: { limit: 100 } }),
            axios.get('/api/infrastructure/odps', { params: { limit: 100 } })
          ]);
          if (oltRes.data?.status === 'success') setOlts(oltRes.data.data || []);
          if (odpRes.data?.status === 'success') setOdps(odpRes.data.data || []);
        } catch (err) {
          console.error('Failed to load wizard options', err);
        }
      };
      loadWizardData();
    }
  }, [showWizard]);

  // Debounced customer search
  useEffect(() => {
    if (showWizard && customerSearch.length >= 1) {
      const timeoutId = setTimeout(() => {
        fetchCustomers(customerSearch);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (showWizard && customerSearch.length === 0) {
      fetchCustomers();
    }
  }, [customerSearch, showWizard]);

  const handleMapSelection = (latLng) => {
    setCustomerCoords(latLng);
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus layanan PPPoE ${username}? Akun di Mikrotik/RADIUS juga akan dihapus.`)) {
      return;
    }

    try {
      setListLoading(true);
      await axios.delete(`/api/subscriptions/${id}`);
      await fetchSubscriptions();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(err.response?.data?.message || err.message || 'Gagal menghapus layanan');
    } finally {
      setListLoading(false);
    }
  };
  
  const handleCoA = async (subId, nasId, username) => {
    if (!window.confirm(`Kirim perintah CoA/POD untuk memutuskan sesi ${username}? Pelanggan akan terputus sebentar dan otomatis dial-ulang.`)) {
      return;
    }

    try {
      setListLoading(true);
      const response = await axios.post('/api/coa/kick', {
        subscription_id: subId,
        nas_id: nasId,
        username: username
      });

      if (response.data?.status === 'success') {
        alert(`Berhasil! Perintah CoA terkirim ke NAS. Sesi ${username} telah diputus.`);
      } else {
        alert(`Gagal: ${response.data?.message || 'NAS tidak merespon perintah CoA'}`);
      }
    } catch (err) {
      console.error("CoA failed:", err);
      alert(err.response?.data?.message || err.message || 'Gagal mengirim perintah CoA');
    } finally {
      setListLoading(false);
    }
  };

  const handleOdpPortSelect = (portNum, odp) => {
    setOdpId(odp.id);
    setOdpName(odp.name);
    setOdpPort(portNum);
  };

  const executeActivation = async () => {
    if (!odpPort || !onuSn || !onuMac || !selectedCustId || !selectedPackId || !nasId) {
      alert('Selesaikan mapping ODP & input SN/MAC ONU terlebih dahulu! Pastikan semua field sudah terisi.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      // 1. Create Subscription
      const subPayload = {
        customer_id: Number(selectedCustId),
        package_id: Number(selectedPackId),
        nas_id: Number(nasId)
      };
      const createRes = await axios.post('/api/subscriptions', subPayload);
      if (createRes.data?.status !== 'success') throw new Error('Gagal membuat subskripsi');
      const subId = createRes.data.data.id;

      // 2. Submit Installation Data
      const installPayload = {
        odp_id: Number(odpId),
        odp_port: Number(odpPort),
        onu_serial_number: onuSn,
        onu_mac_address: onuMac,
        install_latitude: customerCoords?.lat || -1.2654,
        install_longitude: customerCoords?.lng || 116.8312
      };
      const installRes = await axios.post(`/api/subscriptions/${subId}/installation`, installPayload);
      if (installRes.data?.status !== 'success') throw new Error('Gagal menyimpan instalasi');

      // 3. Activate Subscription
      const activateRes = await axios.post(`/api/subscriptions/${subId}/activate`);
      if (activateRes.data?.status !== 'success') throw new Error('Gagal mengaktifkan koneksi PPPoE');

      const subData = activateRes.data.data;
      setGeneratedUser(subData?.pppoe_username || 'uwais-user');
      setGeneratedPass(subData?.pppoe_password || 'uwais-password');
      setGeneratedInvoice(`INV-${subData?.id || Date.now()}`);

      await fetchSubscriptions();
      setStep(3);
    } catch (err) {
      console.error("Activation flow failed:", err);
      const msg = err.response?.data?.message || err.message || "Aktivasi gagal";
      alert(`Gagal mengaktivasi koneksi: ${msg}`);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Layanan <span className="gradient-text-primary">Koneksi PPPoE (RADIUS)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manajemen akun PPPoE pelanggan, monitoring status binding MAC/SN ONT, serta interaksi real-time ke router NAS.
          </p>
        </div>

        {/* Start activation wizard (Only for Admin, Teknisi) */}
        {(activeRole === 'Superadmin' || activeRole === 'Admin' || activeRole === 'Teknisi') && (
          <button 
            onClick={() => { setShowWizard(!showWizard); setStep(1); }}
            className="glow-btn-primary text-xs py-2.5 px-5 flex items-center space-x-2 mt-4 md:mt-0"
          >
            <Plus className="h-4 w-4" />
            <span>Aktivasi Pasang Baru (Splicing)</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in">
          {errorMessage}
        </div>
      )}

      {/* ACTIVATION WIZARD CONTAINER */}
      {showWizard && (
        <div className="glass-panel p-6 border-brand-500/25 relative overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="absolute top-0 right-0 p-4">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Step {step} of 3</span>
          </div>

          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">Wizard Aktivasi Pemasangan Baru (FTTH)</h3>

          {/* STEP 1: SELECT CUSTOMER & PACKAGE */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Cari & Pilih Pelanggan (Instalasi / Aktif)</label>
                  <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden focus-within:border-brand-500/50 transition-colors">
                    {/* Search Input Part */}
                    <div className="relative border-b border-slate-800/60">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {isSearchingCustomers ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-400" />
                        ) : (
                          <Search className="h-3.5 w-3.5 text-slate-500" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Ketik nama atau KTP untuk mencari..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full bg-transparent border-0 text-xs pl-9 pr-3 py-2.5 text-slate-200 placeholder:text-slate-600 focus:ring-0"
                      />
                    </div>
                    {/* Select Dropdown Part */}
                    <select 
                      value={selectedCustId} 
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedCustId(id);
                        const cust = customersList.find(c => c.id.toString() === id.toString());
                        if (cust) {
                          setSelectedCustName(cust.full_name);
                          if (cust.latitude && cust.longitude) {
                            setCustomerCoords({ lat: parseFloat(cust.latitude), lng: parseFloat(cust.longitude) });
                          }
                        }
                      }}
                      className="w-full bg-slate-900/50 border-0 text-xs py-2.5 px-3 text-slate-300 focus:ring-0 cursor-pointer"
                    >
                      {customersList.length === 0 && !isSearchingCustomers && (
                        <option value="">-- Tidak ada pelanggan ditemukan --</option>
                      )}
                      {customersList.length === 0 && isSearchingCustomers && (
                        <option value="">Mencari data...</option>
                      )}
                      {customersList.map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.lifecycle_status}] {c.full_name} - {c.code || `ID:${c.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 italic">
                    * Pelanggan Aktif bisa menambah layanan PPPoE di lokasi baru.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Pilih Paket Berlangganan</label>
                  <select 
                    value={selectedPackId} 
                    onChange={(e) => setSelectedPackId(e.target.value)}
                    className="w-full input-field text-xs bg-slate-950"
                  >
                    {packagesList.length === 0 && <option value="">-- Tidak ada paket aktif --</option>}
                    {packagesList.map(p => {
                      const price = Number(p.monthly_price) || 0;
                      const speed = p.download_rate_limit ? Math.round(p.download_rate_limit / 1000) : 0;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({speed} Mbps) - Rp {price.toLocaleString()}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Pilih NAS Router (Splicing Target)</label>
                  <select 
                    value={nasId} 
                    onChange={(e) => setNasId(e.target.value)}
                    className="w-full input-field text-xs bg-slate-950"
                  >
                    {nasList.length === 0 && <option value="">-- Tidak ada NAS aktif --</option>}
                    {nasList.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.ip_address})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-800/60 mt-4">
                <button onClick={() => setStep(2)} className="glow-btn-primary text-xs py-2 px-8">Selanjutnya</button>
              </div>
            </div>
          )}

          {/* STEP 2: SPLICING MAP, BIND PORT & ONT */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-3">1. Mapping ODP & Splicing Port</h4>
                  <CustomMap 
                    onLocationSelect={handleMapSelection} 
                    onPortSelect={handleOdpPortSelect}
                    olts={olts}
                    odps={odps}
                    subscriptions={subscriptions}
                    searchCoords={customerCoords}
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-3">2. Register Perangkat ONT (ONU)</h4>
                  
                  <div className="bg-slate-950/60 p-4 border border-slate-800 rounded-xl space-y-1.5 text-xs mb-4">
                    <span className="text-slate-500 block font-semibold"><strong className="text-slate-300">Selected ODP:</strong> {odpName || 'None'}</span>
                    <span className="text-slate-500 block font-semibold"><strong className="text-slate-300">Selected Port:</strong> {odpPort ? `Port ${odpPort}` : 'None'}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Serial Number ONU (ZTE/Huawei) *</label>
                    <input 
                      type="text" 
                      required
                      value={onuSn}
                      onChange={(e) => setOnuSn(e.target.value)}
                      placeholder="e.g. ZTEGC043D2A1" 
                      className="w-full input-field text-xs font-mono uppercase" 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">MAC Address ONU *</label>
                    <input 
                      type="text" 
                      required
                      value={onuMac}
                      onChange={(e) => setOnuMac(e.target.value)}
                      placeholder="e.g. CC:2D:E8:4A:9C:1D" 
                      className="w-full input-field text-xs font-mono uppercase" 
                    />
                  </div>

                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[10px] text-slate-400 leading-relaxed flex items-start space-x-2">
                    <Radio className="h-4 w-4 text-brand-400 mt-0.5 flex-shrink-0 animate-pulse" />
                    <span>Sistem akan mendeteksi ONU secara otomatis via TR-069 ACS server, melakukan provisi default Wi-Fi, dan mem-bind MAC address untuk keamanan login PPPoE.</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800/60">
                <button onClick={() => setStep(1)} className="glow-btn-secondary text-xs py-2">Sebelumnya</button>
                <button 
                  onClick={executeActivation} 
                  disabled={loading}
                  className="glow-btn-success text-xs font-bold py-2 px-8 flex items-center space-x-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Provisi Jaringan (ACS)...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Aktivasi & Nyalakan Internet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: ACTIVATION SUCCESS MODAL */}
          {step === 3 && (
            <div className="text-center py-6 space-y-4 max-w-md mx-auto">
              <div className="h-14 w-14 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg shadow-emerald-500/10 animate-bounce">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-200">Aktivasi Selesai! Sesi Aktif!</h4>
                <p className="text-xs text-slate-500 mt-1">Sistem berhasil memprovisi ONT via ACS, menyinkronkan database RADIUS, membuat billing prorata bulan pertama, dan mengirimkan pesan WhatsApp.</p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-left text-xs font-mono space-y-1.5">
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">PPPoE User:</span><span className="text-brand-400 font-bold">{generatedUser}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">PPPoE Pass:</span><span className="text-slate-300 font-bold">{generatedPass}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">Invoice No:</span><span className="text-slate-400">{generatedInvoice}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">ODP Port:</span><span className="text-slate-400">{odpName} - Port {odpPort}</span></div>
              </div>

              <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/15 text-slate-400 text-[10px] leading-relaxed flex items-start space-x-2 text-left">
                <Send className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span><strong>WA Sent:</strong> "Yth. Siti Rahayu, akun internet Anda telah aktif. Username: {generatedUser}, sandi: {generatedPass}. Tagihan pertama Anda sebesar Rp 222,000 dapat diakses via link..."</span>
              </div>

              <button 
                onClick={() => { 
                  setShowWizard(false); 
                  setStep(1); 
                  fetchSubscriptions();
                }} 
                className="glow-btn-primary text-xs font-bold py-2.5 px-8 w-full"
              >
                Selesai & Tutup Panel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE SUBSCRIPTION TABLE */}
      <div className="glass-panel overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/40 flex justify-between items-center bg-slate-950/20">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daftar Sesi Pelanggan Aktif (PPPoE Interface)</h3>
          <span className="text-[10px] bg-indigo-500/10 text-brand-400 px-2.5 py-0.5 rounded-full font-bold flex items-center space-x-1.5">
            {listLoading && <RefreshCw className="h-3 w-3 animate-spin text-brand-400" />}
            <span>Total: {subscriptions.length} Akun</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6 font-semibold">PPPoE Username</th>
                <th className="py-4 px-6 font-semibold">Nama Pelanggan</th>
                <th className="py-4 px-6 font-semibold">Mikrotik Address List</th>
                <th className="py-4 px-6 font-semibold">ODP & Port Splitter</th>
                <th className="py-4 px-6 font-semibold">Serial Number ONT</th>
                <th className="py-4 px-6 font-semibold">Speed Limit</th>
                <th className="py-4 px-6 text-center">Status Sesi</th>
                <th className="py-4 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-800/15">
                  <td className="py-4 px-6 font-mono font-bold text-slate-200">{sub.pppoe_username}</td>
                  <td className="py-4 px-6 font-bold text-slate-300">{sub.customer_name}</td>
                  
                  {/* Improved Mikrotik Address List Column */}
                  <td className="py-4 px-6 font-medium">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Pool:</span>
                        <span className="text-brand-400 font-mono text-[10px] font-bold">
                          {sub.ip_pool || 'PPPOE-POOL'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold font-mono w-fit ${
                        sub.status === 'Isolir' 
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}>
                        {sub.status === 'Isolir' ? 'LIST: ISOLIR' : 'LIST: ACTIVE-CLIENT'}
                      </span>
                    </div>
                  </td>

                  <td className="py-4 px-6 text-slate-400 font-semibold">
                    {sub.odp_name || 'Direct'} [Port {sub.odp_port || '-'}]
                  </td>
                  <td className="py-4 px-6 font-mono text-slate-400">{sub.onu_serial_number}</td>
                  <td className="py-4 px-6 font-mono text-brand-400 font-bold">{sub.package_name || '-'}</td>
                  <td className="py-4 px-6 text-center">
                    <StatusBadge status={sub.status === 'Active' ? 'ACTIVE' : 'ISOLIR'} />
                  </td>
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button 
                        onClick={() => handleCoA(sub.id, sub.nas_id, sub.pppoe_username)}
                        className="p-2 text-slate-500 hover:text-brand-400 hover:bg-brand-400/10 rounded-lg transition-colors"
                        title="Kirim CoA (Reset Sesi)"
                      >
                        <Zap className="h-4 w-4" />
                      </button>

                      <button 
                        onClick={() => handleDelete(sub.id, sub.pppoe_username)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Hapus Layanan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Subscriptions;
