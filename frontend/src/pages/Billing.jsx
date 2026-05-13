import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import axios from 'axios';
import { 
  CreditCard, Search, DollarSign, ArrowUpRight, CheckCircle, RefreshCw, Landmark, ShieldCheck
} from 'lucide-react';

const Billing = () => {
  const { activeRole, user } = useAuth();
  const currentRole = activeRole || 'Admin';

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [listLoading, setListLoading] = useState(false);
  
  // Tripay Simulator Modal state
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('QRIS');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Invoices list state from backend
  const [invoices, setInvoices] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch from real Billing Invoice API
  const fetchInvoices = async () => {
    setListLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/billing/invoices');
      if (response.data && response.data.status === 'success') {
        const apiData = response.data.data;
        const invoicesArray = (apiData && Array.isArray(apiData.invoices))
          ? apiData.invoices
          : (Array.isArray(apiData) ? apiData : []);
        setInvoices(invoicesArray);
      } else {
        setInvoices([]);
        setErrorMessage(response.data?.message || 'Gagal memuat invoice');
      }
    } catch (err) {
      console.error("Direct API fetch failed:", err);
      setInvoices([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API gagal');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleOpenCheckout = (inv) => {
    setSelectedInvoice(inv);
    setShowCheckout(true);
    setPaymentSuccess(false);
  };

  const executeTripayWebhook = async () => {
    setIsProcessingPayment(true);
    try {
      // Simulate/trigger raw endpoint payment create: POST /api/payments/tripay/create
      const payload = {
        invoice_id: selectedInvoice.id,
        payment_method: paymentMethod === 'QRIS' ? 'QRIS' : 'VA'
      };

      const response = await axios.post('/api/payments/tripay/create', payload);

      if (response.data && response.data.status === 'success') {
        await fetchInvoices(); // Pull updated invoices
        setPaymentSuccess(true);
      } else {
        throw new Error(response.data?.message || "Gagal membuat transaksi");
      }
    } catch (err) {
      console.error("Direct Payment create failed:", err);
      alert(`Gagal memproses pembayaran: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleMitraCashPayment = async (inv) => {
    const confirmPay = window.confirm(`Bayar tagihan ini secara tunai melalui saldo Anda? Saldo Anda akan dipotong sebesar ${inv.amount.toLocaleString('id-ID')}`);
    if (confirmPay) {
      try {
        // Call real Mitra Payment API: POST /api/payments/mitra
        const response = await axios.post('/api/payments/mitra', { invoice_id: inv.id });
        if (response.data && response.data.status === 'success') {
          await fetchInvoices();
          alert('Pembayaran tunai via Mitra sukses! Sesi PPPoE pelanggan dibuka otomatis.');
        } else {
          throw new Error(response.data?.message || "Pembayaran ditolak");
        }
      } catch (err) {
        console.error("Mitra payment endpoint failed:", err);
        alert(`Pembayaran gagal: ${err.response?.data?.message || err.message}`);
      }
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const numVal = inv.number || '';
    const nameVal = inv.customer_name || '';
    const statusVal = inv.status || '';

    const matchesSearch = numVal.toLowerCase().includes(search.toLowerCase()) || 
                          nameVal.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || statusVal.toUpperCase() === filterStatus.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Sistem Tagihan & <span className="gradient-text-primary">Keuangan (Billing)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Proses otomatisasi tagihan, invoice bulanan, rekonsiliasi PPN, dan integrasi Payment Gateway TRIPAY.
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
            placeholder="Cari nomor invoice atau nama pelanggan..." 
            className="w-full input-field pl-11 text-xs"
          />
        </div>

        <div className="flex items-center space-x-3 overflow-x-auto pb-2 md:pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            {listLoading && <RefreshCw className="h-3 w-3 animate-spin text-brand-400" />}
            <span>Status:</span>
          </span>
          {['ALL', 'UNPAID', 'LUNAS', 'WAIVED', 'CANCELLED'].map((status) => (
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

      {/* INVOICES LIST TABLE */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/40">
                <th className="py-4 px-6 font-semibold">No Invoice</th>
                <th className="py-4 px-6 font-semibold">Nama Pelanggan</th>
                <th className="py-4 px-6 font-semibold">Periode Tagihan</th>
                <th className="py-4 px-6 font-semibold">Nominal Total (+PPN)</th>
                <th className="py-4 px-6 font-semibold">Metode Bayar</th>
                <th className="py-4 px-6 font-semibold text-center">Status</th>
                <th className="py-4 px-6 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/15 transition-colors">
                  <td className="py-4 px-6 font-mono font-bold text-brand-400">{inv.number || `INV-${inv.id}`}</td>
                  <td className="py-4 px-6 font-bold text-slate-200">{inv.customer_name || 'Active Customer'}</td>
                  <td className="py-4 px-6 font-medium text-slate-400">{inv.billing_period || '2026-05'}</td>
                  <td className="py-4 px-6 font-mono font-bold text-slate-300">Rp {(inv.amount || 0).toLocaleString('id-ID')}</td>
                  <td className="py-4 px-6 text-slate-500 font-semibold">{inv.method || '---'}</td>
                  <td className="py-4 px-6 text-center">
                    <StatusBadge status={inv.status || 'UNPAID'} />
                  </td>
                  <td className="py-4 px-6 text-center">
                    {(inv.status === 'UNPAID' || !inv.status) ? (
                      <div className="flex items-center justify-center space-x-2">
                        {/* Tripay Payment Simulator Button */}
                        <button 
                          onClick={() => handleOpenCheckout(inv)}
                          className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-colors"
                        >
                          Checkout TRIPAY
                        </button>
                        
                        {/* Mitra cash payment shortcut */}
                        {currentRole === 'Mitra' && (
                          <button 
                            onClick={() => handleMitraCashPayment(inv)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-colors"
                          >
                            Terima Tunai (Cash)
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px] font-bold">— Selesai</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRIPAY SIMULATOR MODAL */}
      {showCheckout && selectedInvoice && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 max-w-md w-full border-brand-500/30 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">TRIPAY Payment Gateway Checkout Simulator</h3>
            <p className="text-xs text-slate-500 mb-6">Select a mock payment method and trigger a success callback event mimicking Tripay server-to-server API webhooks.</p>

            {paymentSuccess ? (
              <div className="text-center py-6 space-y-4">
                <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                  <CheckCircle className="h-6 w-6 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-200">Pembayaran Sukses Terverifikasi!</h4>
                  <p className="text-xs text-slate-400 mt-1">Invoice <strong className="font-mono text-brand-400">{selectedInvoice.number}</strong> lunas. Sistem otomatis mengirim un-isolir ke router.</p>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl text-left border border-slate-800 text-[10px] text-slate-500 font-mono space-y-1">
                  <span className="block"><strong className="text-slate-300">Method:</strong> TRIPAY {paymentMethod}</span>
                  <span className="block"><strong className="text-slate-300">Trx Ref:</strong> TPY-98234823948</span>
                  <span className="block"><strong className="text-slate-300">Radius Action:</strong> COA_UNISOLIR_SUCCESS</span>
                </div>
                <button 
                  onClick={() => setShowCheckout(false)}
                  className="glow-btn-primary py-2.5 text-xs w-full font-bold"
                >
                  Tutup Simulator
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500 font-semibold">No Tagihan</span><span className="text-slate-300 font-mono font-bold">{selectedInvoice.number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500 font-semibold">Pelanggan</span><span className="text-slate-300 font-bold">{selectedInvoice.customer_name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500 font-semibold">Total Invoice (+PPN)</span><span className="text-brand-400 font-extrabold">Rp {selectedInvoice.amount.toLocaleString('id-ID')}</span></div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Metode Pembayaran</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['QRIS', 'VIRTUAL ACCOUNT', 'ALFAMART'].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 rounded-xl text-[10px] font-bold border transition-all
                          ${paymentMethod === method 
                            ? 'bg-brand-500/10 border-brand-400 text-brand-300' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400'
                          }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  {paymentMethod === 'QRIS' ? (
                    <div className="text-center space-y-2">
                      <div className="h-32 w-32 border border-slate-800 rounded bg-slate-900 mx-auto flex items-center justify-center p-2 relative overflow-hidden">
                        {/* Dynamic barcode/QR mockup */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 to-slate-900 p-3 flex flex-wrap gap-1 border-2 border-dashed border-indigo-500/30">
                          {Array.from({ length: 144 }).map((_, idx) => (
                            <div key={idx} className={`h-1.5 w-1.5 rounded-sm ${Math.random() > 0.4 ? 'bg-slate-200' : 'bg-transparent'}`} />
                          ))}
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 block">Scan QRIS menggunakan M-Banking atau E-Wallet</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-center py-4">
                      <span className="text-[10px] text-slate-500 block">Nomor Rekening Virtual Account</span>
                      <span className="text-base font-black font-mono text-slate-200 tracking-wider">8505 0812 3456 7890</span>
                      <span className="text-[9px] text-brand-400 font-bold uppercase block">BANK MANDIRI BILLER</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => setShowCheckout(false)}
                    className="glow-btn-secondary text-xs py-2 font-semibold"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={executeTripayWebhook}
                    disabled={isProcessingPayment}
                    className="glow-btn-success text-xs font-bold py-2 flex items-center justify-center space-x-1.5"
                  >
                    {isProcessingPayment ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Verifikasi Webhook...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        <span>Simulasi Lunas Webhook</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
