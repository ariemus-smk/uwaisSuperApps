import React from 'react';

const StatusBadge = ({ status }) => {
  const normalized = status?.toUpperCase() || '';

  // Customer Lifecycle Mapping
  // Prospek, Instalasi, Aktif, Isolir, Terminated
  
  // Billing Mapping
  // UNPAID, LUNAS, WAIVED, CANCELLED

  // Ticket Mapping
  // OPEN, INPROGRESS, PENDING, RESOLVED, CLOSED

  const configs = {
    // Customers & Subscriptions
    PROSPEK: { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-400' },
    INSTALASI: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
    AKTIF: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    ACTIVE: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    ISOLIR: { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-400 animate-pulse' },
    SUSPENDED: { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-400' },
    TERMINATED: { bg: 'bg-slate-800 text-slate-400 border-slate-700', dot: 'bg-slate-500' },

    // Billing Invoices
    UNPAID: { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-400 animate-pulse' },
    LUNAS: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    WAIVED: { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', dot: 'bg-indigo-400' },
    CANCELLED: { bg: 'bg-slate-800 text-slate-400 border-slate-700', dot: 'bg-slate-500' },

    // Tickets
    OPEN: { bg: 'bg-sky-500/10 text-sky-400 border-sky-500/20', dot: 'bg-sky-400 animate-pulse' },
    INPROGRESS: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
    PENDING: { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', dot: 'bg-indigo-400' },
    RESOLVED: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    CLOSED: { bg: 'bg-slate-800 text-slate-400 border-slate-700', dot: 'bg-slate-500' },

    // Priorities
    VIP: { bg: 'bg-red-500/15 text-red-400 border-red-500/30 font-black', dot: 'bg-red-500 animate-ping' },
    HIGH: { bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
    NORMAL: { bg: 'bg-slate-800 text-slate-300 border-slate-700/80', dot: 'bg-slate-400' },
    LOW: { bg: 'bg-slate-800/40 text-slate-400 border-slate-800', dot: 'bg-slate-500' },
  };

  const config = configs[normalized] || { bg: 'bg-slate-800 text-slate-200 border-slate-700', dot: 'bg-slate-400' };

  return (
    <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide border ${config.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      <span>{status}</span>
    </span>
  );
};

export default StatusBadge;
