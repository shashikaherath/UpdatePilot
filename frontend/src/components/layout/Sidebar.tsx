import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Monitor,
  Package,
  RefreshCw,
  History,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface NavItem {
  name: string;
  to: string;
  icon: React.ElementType;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { name: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { name: 'Devices', to: '/devices', icon: Monitor },
  { name: 'Applications', to: '/applications', icon: Package },
  { name: 'Updates', to: '/updates', icon: RefreshCw },
  { name: 'History', to: '/history', icon: History },
  { name: 'Settings', to: '/settings', icon: Settings },
];

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-slate-800 text-slate-300 select-none">
      {/* Top: Branding */}
      <div>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <Shield className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <span className="font-bold text-white text-lg tracking-tight">UpdatePilot</span>
              <span className="block text-[10px] uppercase tracking-wider text-indigo-400 font-semibold -mt-1">
                Management
              </span>
            </div>
          </div>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-700 focus:outline-none"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="px-3 py-5 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm text-slate-400/80 cursor-not-allowed group opacity-75"
                  title="Coming in Phase 2"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-400 group-hover:text-slate-300" />
                    <span>{item.name}</span>
                  </div>
                  <span className="text-[10px] font-semibold bg-slate-700/80 text-slate-300 px-1.5 py-0.5 rounded">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom: User & Logout */}
      <div className="p-4 border-t border-slate-700/60 bg-slate-800/80">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white truncate" title={user?.email || 'Logged in'}>
              {user?.email || 'Authenticated User'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">Administrator</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Log out"
            aria-label="Log out"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
          >
            <LogOut className={`w-4 h-4 ${loggingOut ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 shadow-lg">
        {sidebarContent}
      </aside>

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out md:hidden shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        aria-label="Mobile navigation"
      >
        {sidebarContent}
      </aside>
    </>
  );
};
