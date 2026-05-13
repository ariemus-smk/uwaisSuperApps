import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import axios from 'axios';
import { 
  Ticket, Search, Plus, Info, AlertTriangle, CheckCircle, RefreshCw, Clipboard, MapPin, Camera
} from 'lucide-react';

const Tickets = () => {
  const { activeRole } = useAuth();
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [listLoading, setListLoading] = useState(false);

  // Technician progress journal drawer/modal state
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [journalText, setJournalText] = useState('');
  const [progressStatus, setProgressStatus] = useState('Selesai');
  const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);

  // Tickets state from API
  const [tickets, setTickets] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch Tickets from API
  const fetchTickets = async () => {
    setListLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.get('/api/tickets');
      if (response.data && response.data.status === 'success') {
        const apiData = response.data.data;
        setTickets(apiData || []);
      } else {
        setTickets([]);
        setErrorMessage(response.data?.message || 'Gagal memuat daftar tiket');
      }
    } catch (err) {
      console.error("Direct API fetch failed:", err);
      setTickets([]);
      setErrorMessage(err.response?.data?.message || err.message || 'Koneksi API gagal');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleOpenJournal = (ticket) => {
    setSelectedTicket(ticket);
    setShowJournalForm(true);
    setJournalText('');
    setProgressStatus('Selesai');
  };

  const handleSubmitJournal = async (e) => {
    e.preventDefault();
    if (!journalText) {
      alert('Tuliskan rincian jurnal pekerjaan teknisi!');
      return;
    }

    setIsSubmittingJournal(true);
    try {
      const payload = {
        description: journalText,
        progress_status: progressStatus, // Selesai|BelumSelesai|Progress
        photo_urls: [],
        latitude: -1.2654,
        longitude: 116.8312
      };

      // Call real backend endpoint: PATCH /api/tickets/:id/progress
      const response = await axios.patch(`/api/tickets/${selectedTicket.id}/progress`, payload);
      
      if (response.data && response.data.status === 'success') {
        await fetchTickets();
        setShowJournalForm(false);
      } else {
        throw new Error(response.data?.message || "Gagal memperbarui progres tiket");
      }
    } catch (err) {
      console.error("Direct PATCH progress failed:", err);
      alert(`Gagal menyimpan jurnal tiket: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsSubmittingJournal(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const numVal = t.number || '';
    const nameVal = t.customer_name || '';
    const descVal = t.issue_description || '';
    const prioVal = t.priority || '';

    const matchesSearch = numVal.toLowerCase().includes(search.toLowerCase()) || 
                          nameVal.toLowerCase().includes(search.toLowerCase()) ||
                          descVal.toLowerCase().includes(search.toLowerCase());
    const matchesPriority = filterPriority === 'ALL' || prioVal.toUpperCase() === filterPriority.toUpperCase();
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight m-0">
            Pusat Bantuan & <span className="gradient-text-primary">Tiket Gangguan (Helpdesk)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Penugasan teknisi, monitoring SLA perbaikan (SLA), klasifikasi tiket VIP, serta penulisan Jurnal Splicing harian lapangan.
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
            placeholder="Cari ID tiket, nama pelanggan, rincian keluhan..." 
            className="w-full input-field pl-11 text-xs"
          />
        </div>

        <div className="flex items-center space-x-3 overflow-x-auto pb-2 md:pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            {listLoading && <RefreshCw className="h-3 w-3 animate-spin text-brand-400" />}
            <span>Prioritas:</span>
          </span>
          {['ALL', 'VIP', 'HIGH', 'NORMAL', 'LOW'].map((prio) => (
            <button
              key={prio}
              onClick={() => setFilterPriority(prio)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border
                ${filterPriority === prio 
                  ? 'bg-rose-500 border-rose-400 text-white shadow-sm shadow-rose-500/10' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700/80'
                }`}
            >
              {prio}
            </button>
          ))}
        </div>
      </div>

      {/* SUPPORT TICKETS DATA TABLE */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider bg-slate-950/40">
                <th className="py-4 px-6 font-semibold">No Tiket</th>
                <th className="py-4 px-6 font-semibold">Nama Pelanggan</th>
                <th className="py-4 px-6 font-semibold">Rincian Komplain / Gangguan</th>
                <th className="py-4 px-6 font-semibold">Teknisi Bertanggung Jawab</th>
                <th className="py-4 px-6 font-semibold">Tanggal Masuk</th>
                <th className="py-4 px-6 font-semibold text-center">Prioritas</th>
                <th className="py-4 px-6 font-semibold text-center">Status</th>
                <th className="py-4 px-6 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-800/15 transition-colors group">
                  <td className="py-4 px-6 font-mono font-bold text-slate-200">{ticket.number || `TKT-0${ticket.id}`}</td>
                  <td className="py-4 px-6 font-bold text-slate-300">{ticket.customer_name || 'Active Client'}</td>
                  <td className="py-4 px-6 text-slate-400 max-w-sm truncate" title={ticket.issue_description}>{ticket.issue_description}</td>
                  <td className="py-4 px-6 text-slate-300 font-medium">
                    <span className="bg-slate-800/60 border border-slate-700/40 px-2 py-0.5 rounded-lg text-[10px]">
                      {ticket.assigned_teknisi || 'Belum Ditunjuk'}
                    </span>
                  </td>
                  <td className="py-4 px-6 font-mono text-slate-500">{ticket.date || '2026-05-13'}</td>
                  <td className="py-4 px-6 text-center">
                    <StatusBadge status={ticket.priority || 'NORMAL'} />
                  </td>
                  <td className="py-4 px-6 text-center">
                    <StatusBadge status={ticket.status || 'OPEN'} />
                  </td>
                  <td className="py-4 px-6 text-center">
                    {(ticket.status === 'OPEN' || ticket.status === 'INPROGRESS') && (activeRole === 'Superadmin' || activeRole === 'Admin' || activeRole === 'Teknisi') ? (
                      <button 
                        onClick={() => handleOpenJournal(ticket)}
                        className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-colors flex items-center space-x-1 mx-auto"
                      >
                        <Clipboard className="h-3 w-3" />
                        <span>Isi Jurnal Kerja</span>
                      </button>
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

      {/* TECHNICIAN JOURNAL LOG MODAL */}
      {showJournalForm && selectedTicket && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 max-w-md w-full border-brand-500/30 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Tulis Jurnal Pekerjaan Teknisi</h3>
            <p className="text-xs text-slate-500 mb-6">Input rincian kerusakan aktual, hasil splicing, redaman akhir, dan lampirkan bukti foto geotagging.</p>

            <form onSubmit={handleSubmitJournal} className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-1 text-xs">
                <div><span className="text-slate-500 font-semibold">No Tiket:</span> <span className="text-slate-300 font-mono font-bold">{selectedTicket.number}</span></div>
                <div><span className="text-slate-500 font-semibold">Pelanggan:</span> <span className="text-slate-300 font-bold">{selectedTicket.customer_name}</span></div>
                <div><span className="text-slate-500 font-semibold">Komplain:</span> <span className="text-slate-400">{selectedTicket.issue_description}</span></div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Jurnal Temuan Lapangan & Tindakan *</label>
                <textarea 
                  required
                  rows={3}
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="e.g. Melakukan splicing ulang core ke-4 di box ODP. Redaman turun dari -28dBm menjadi -19.4dBm (stabil)." 
                  className="w-full input-field text-xs resize-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Status Akhir Pekerjaan</label>
                  <select 
                    value={progressStatus}
                    onChange={(e) => setProgressStatus(e.target.value)}
                    className="w-full input-field text-xs bg-slate-950"
                  >
                    <option value="Selesai">Selesai (Resolved)</option>
                    <option value="Progress">Masih Dikerjakan (In Progress)</option>
                    <option value="BelumSelesai">Belum Selesai (Pending)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Lampirkan Foto Bukti</label>
                  <div className="h-10 border border-slate-800 bg-slate-950/80 hover:bg-slate-900 rounded-xl flex items-center justify-center cursor-pointer transition-colors space-x-1.5 text-slate-500">
                    <Camera className="h-4 w-4" />
                    <span className="text-[10px] font-semibold">Upload Photo</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800 text-[10px] text-slate-500 flex items-center space-x-1.5">
                <MapPin className="h-4 w-4 text-brand-400" />
                <span>Geotagging koordinat GPS Anda disisipkan secara otomatis.</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowJournalForm(false)}
                  className="glow-btn-secondary text-xs py-2 font-semibold"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingJournal}
                  className="glow-btn-primary text-xs font-bold py-2 flex items-center justify-center space-x-1.5"
                >
                  {isSubmittingJournal ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Menyimpan Jurnal...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Simpan Jurnal</span>
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

export default Tickets;
