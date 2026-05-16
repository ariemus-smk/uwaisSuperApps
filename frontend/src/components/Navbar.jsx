import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, ShieldAlert, User, CheckCircle, ChevronDown } from 'lucide-react';
import axios from 'axios';

const Navbar = () => {
  const { user, activeRole } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  useEffect(() => {
    const fetchLiveNotifications = async () => {
      try {
        const list = [];
        
        // 1. Fetch live open support tickets
        try {
          const ticketsRes = await axios.get('/api/tickets?status=Open&limit=5');
          if (ticketsRes.data && ticketsRes.data.status === 'success') {
            const tickets = ticketsRes.data.data?.tickets || ticketsRes.data.data || [];
            tickets.forEach(ticket => {
              list.push({
                id: `ticket-${ticket.id}`,
                text: `Tiket gangguan baru #${ticket.ticket_number || ticket.id} (${ticket.category || 'Support'})`,
                time: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('id-ID') : 'Hari ini',
                unread: true
              });
            });
          }
        } catch (err) {
          console.error("Failed to load tickets for notification badge:", err);
        }

        // 2. Fetch live system notifications queue
        try {
          const queueRes = await axios.get('/api/notifications/queue?limit=5');
          if (queueRes.data && queueRes.data.status === 'success') {
            const queueItems = queueRes.data.data?.queue || queueRes.data.data || [];
            queueItems.forEach(item => {
              list.push({
                id: `queue-${item.id}`,
                text: `Pesan WA ke ${item.recipient_phone || 'Pelanggan'} (${item.status})`,
                time: item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : 'Queue Log',
                unread: item.status === 'Failed'
              });
            });
          }
        } catch (err) {
          console.error("Failed to load notification queue:", err);
        }

        setNotifications(list);
      } catch (error) {
        console.error("Failed to compile live notifications:", error);
      }
    };

    if (user) {
      fetchLiveNotifications();
    }
  }, [user]);

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <header className="h-16 border-b border-slate-800/50 bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left side: Branch Scope info */}
      <div className="flex items-center space-x-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider hidden md:block">
          Scope:
        </h2>
        <span className="bg-slate-800/80 border border-slate-700/80 px-3 py-1 rounded-full text-xs font-semibold text-slate-200 shadow-sm flex items-center space-x-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{activeRole === 'Superadmin' ? 'All Branch' : (user?.branch_id ? `Cabang ID: ${user.branch_id}` : 'All Branch')}</span>
        </span>
      </div>

      {/* Right side: Notifications + User profile */}
      <div className="flex items-center space-x-4">
        
        {/* ACTIVE ROLE BADGE */}
        <span className="bg-slate-800 border border-slate-700/60 px-3 py-1 rounded-xl text-xs font-bold text-slate-300">
          Role: {activeRole || 'Guest'}
        </span>

        {/* NOTIFICATIONS DROPDOWN */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-xl border border-transparent hover:border-slate-800/60 transition-all relative"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-slate-950"></span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-slate-800/60 flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-200">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-brand-400 font-bold hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs font-semibold">
                    Tidak ada notifikasi baru.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={`p-2.5 rounded-xl transition-colors flex items-start space-x-2.5
                        ${notif.unread ? 'bg-slate-800/40 border border-slate-800/80' : 'opacity-60'}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0 ${notif.unread ? 'bg-brand-400' : 'bg-transparent'}`} />
                      <div className="flex-1">
                        <p className="text-xs text-slate-300 leading-tight">{notif.text}</p>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">{notif.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* PROFILE BADGE */}
        <div className="flex items-center space-x-2 border-l border-slate-800/50 pl-4">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white text-xs font-black shadow-md shadow-brand-500/10">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden lg:block text-left">
            <span className="text-xs font-semibold text-slate-200 block truncate leading-none mb-0.5">{user?.full_name}</span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{user?.username}</span>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Navbar;
