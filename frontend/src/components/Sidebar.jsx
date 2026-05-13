import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Users, Wifi, CreditCard, Network, 
  Ticket, Package, Menu, X, LogOut, Shield, MapPin, ClipboardList, HelpCircle, Building, Gauge, Cpu
} from 'lucide-react';

const Sidebar = () => {
  const { activeRole, logout, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const navigationByRole = {
    Superadmin: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Pelanggan', path: '/customers', icon: Users },
      { name: 'Layanan PPPoE', path: '/subscriptions', icon: Wifi },
      { name: 'Tagihan & Invoice', path: '/billing', icon: CreditCard },
      { name: 'Infrastruktur Jaringan', path: '/infrastructure', icon: Network },
      { name: 'Tiket Support', path: '/tickets', icon: Ticket },
      { name: 'Aset & Inventori', path: '/assets', icon: Package },
      { name: 'Manajemen User', path: '/users', icon: Shield },
      { name: 'Manajemen Cabang', path: '/branches', icon: Building },
      { name: 'Paket Internet', path: '/packages', icon: Gauge },
      { name: 'Manajemen NAS', path: '/nas', icon: Cpu },
      { name: 'Wilayah / Region', path: '/regions', icon: MapPin },
    ],
    Admin: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Pelanggan', path: '/customers', icon: Users },
      { name: 'Layanan PPPoE', path: '/subscriptions', icon: Wifi },
      { name: 'Tagihan & Invoice', path: '/billing', icon: CreditCard },
      { name: 'Infrastruktur Jaringan', path: '/infrastructure', icon: Network },
      { name: 'Tiket Support', path: '/tickets', icon: Ticket },
      { name: 'Aset & Inventori', path: '/assets', icon: Package },
      { name: 'Manajemen Cabang', path: '/branches', icon: Building },
      { name: 'Paket Internet', path: '/packages', icon: Gauge },
      { name: 'Manajemen NAS', path: '/nas', icon: Cpu },
      { name: 'Wilayah / Region', path: '/regions', icon: MapPin },
    ],
    Accounting: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Pelanggan', path: '/customers', icon: Users },
      { name: 'Tagihan & Keuangan', path: '/billing', icon: CreditCard },
      { name: 'Data Inventori', path: '/assets', icon: Package },
      { name: 'Paket Internet', path: '/packages', icon: Gauge },
    ],
    Mitra: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Pelanggan Baru', path: '/customers', icon: Users },
      { name: 'Layanan & Tagihan', path: '/billing', icon: CreditCard },
      { name: 'Paket Internet', path: '/packages', icon: Gauge },
    ],
    Sales: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Input Pelanggan', path: '/customers', icon: Users },
      { name: 'Cek Coverage', path: '/infrastructure', icon: MapPin },
      { name: 'Paket Internet', path: '/packages', icon: Gauge },
    ],
    Merchant: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Pembayaran Billing', path: '/billing', icon: CreditCard },
    ],
    Teknisi: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Aktivasi Pasang Baru', path: '/customers', icon: ClipboardList },
      { name: 'Infrastruktur ODP', path: '/infrastructure', icon: Network },
      { name: 'Tiket Kerja', path: '/tickets', icon: Ticket },
    ],
    Pelanggan: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Tagihan Saya', path: '/billing', icon: CreditCard },
      { name: 'Lapor Gangguan', path: '/tickets', icon: HelpCircle },
      { name: 'Paket Internet', path: '/packages', icon: Gauge },
    ]
  };

  const menuItems = navigationByRole[activeRole] || navigationByRole['Pelanggan'];

  return (
    <>
      {/* Mobile Toggle Bar */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-brand-500/25">
            <span className="font-extrabold text-white text-base">U</span>
          </div>
          <span className="font-bold tracking-wide text-lg gradient-text-primary">UwaisApps</span>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="p-1 rounded-lg bg-slate-800 border border-slate-700">
          {isOpen ? <X className="h-6 w-6 text-slate-200" /> : <Menu className="h-6 w-6 text-slate-200" />}
        </button>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 lg:static lg:block
        bg-slate-950 lg:bg-slate-950/40 border-r border-slate-800/80 
        flex flex-col h-screen transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo and Branding Header */}
        <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-gradient-to-tr from-brand-500 via-indigo-600 to-brand-700 rounded-xl flex items-center justify-center shadow-xl shadow-brand-500/20 ring-1 ring-white/10">
              <span className="font-black text-white text-xl">U</span>
            </div>
            <div>
              <span className="font-extrabold tracking-wide text-xl gradient-text-primary block">UwaisApps</span>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block -mt-1">Billing ISP System</span>
            </div>
          </div>
          <button lg-only="true" onClick={() => setIsOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-slate-800">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {menuItems.map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <NavLink
                key={idx}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) => `
                  flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all duration-150
                  ${isActive 
                    ? 'bg-gradient-to-r from-brand-500/15 to-indigo-500/5 border border-brand-500/30 text-brand-400 shadow-sm shadow-brand-500/5' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                  }
                `}
              >
                <IconComponent className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="p-4 border-t border-slate-800/50 bg-slate-950/30">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 font-bold uppercase ring-1 ring-white/5">
                {user?.username?.substring(0, 2) || 'AD'}
              </div>
              <div className="truncate w-32">
                <span className="text-xs font-semibold text-slate-200 block truncate">{user?.full_name || 'Admin User'}</span>
                <span className="text-[10px] text-brand-400 font-bold block leading-none">{activeRole}</span>
              </div>
            </div>
            <button 
              onClick={logout} 
              title="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
