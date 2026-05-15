import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import CustomMap from '../components/CustomMap';
import StatusBadge from '../components/StatusBadge';
import axios from 'axios';
import { 
  Wifi, HelpCircle, HardDrive, Key, Plus, CheckCircle, AlertCircle, RefreshCw, Send, Radio
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

  // Dropdown lists
  const [customersList, setCustomersList] = useState([]);
  const [packagesList, setPackagesList] = useState([]);
  const [nasList, setNasList] = useState([]);

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

  useEffect(() => {
    if (showWizard) {
      const loadWizardData = async () => {
        try {
          const [custRes, packRes, nasRes] = await Promise.all([
            axios.get('/api/customers', { params: { lifecycle_status: 'Instalasi', limit: 100 } }),
            axios.get('/api/packages'),
            axios.get('/api/nas', { params: { limit: 100 } })
          ]);

          if (custRes.data?.status === 'success') {
            const arr = custRes.data.data?.customers || custRes.data.data || [];
            setCustomersList(arr);
            if (arr.length > 0) setSelectedCustId(arr[0].id);
          }
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
        } catch (err) {
          console.error('Failed to load wizard options', err);
        }
      };
      loadWizardData();
    }
  }, [showWizard]);

  const handleMapSelection = (latLng) => {
    // Selected coordinates
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
        install_latitude: -1.2654,
        install_longitude: 116.8312
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
                  <label className="text-xs font-bold text-slate-400">Pilih Calon Pelanggan (Status Instalasi)</label>
                  <select 
                    value={selectedCustId} 
                    onChange={(e) => setSelectedCustId(e.target.value)}
                    className="w-full input-field text-xs bg-slate-950"
                  >
                    {customersList.length === 0 && <option value="">-- Tidak ada pelanggan Instalasi --</option>}
                    {customersList.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.code || `ID:${c.id}`})</option>
                    ))}
                  </select>
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
                onClick={() => { setShowWizard(false); setStep(1); }} 
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-800/15">
                  <td className="py-4 px-6 font-mono font-bold text-slate-200">{sub.pppoe_user || `bpn_user_${sub.id}@uwais`}</td>
                  <td className="py-4 px-6 font-bold text-slate-300">{sub.customer_name || 'Active Customer'}</td>
                  <td className="py-4 px-6 font-medium text-slate-400">
                    <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded font-mono text-[10px]">
                      {sub.status === 'Suspended' ? 'Address-List: ISOLIR' : 'Address-List: LOCAL-BYPASS'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-400 font-semibold">{sub.odp_name || 'ODP-HQ'} [Port {sub.port || 1}]</td>
                  <td className="py-4 px-6 font-mono text-slate-400">{sub.onu_sn || 'ZTEGC0000000'}</td>
                  <td className="py-4 px-6 font-mono text-brand-400 font-bold">{sub.speed_limit || '20M'}</td>
                  <td className="py-4 px-6 text-center">
                    <StatusBadge status={sub.status === 'Active' ? 'ACTIVE' : 'ISOLIR'} />
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
