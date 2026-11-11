import React from 'react';
import { Menu, ShieldCheck, AlertTriangle, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export interface TopBarProps {
  title?: string;
  isBackendConnected?: boolean;
  onOpenSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title = 'Overview',
  isBackendConnected = true,
  onOpenSidebar,
}) => {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 sm:px-6 backdrop-blur">
      {/* Left: Mobile hamburger + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
          {title}
        </h1>
      </div>

      {/* Right: Status pill + user email */}
      <div className="flex items-center gap-4">
        {/* Backend health status pill */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            isBackendConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
              : 'bg-rose-50 text-rose-700 border-rose-200/80'
          }`}
          title={
            isBackendConnected
              ? 'Connected to UpdatePilot API (http://localhost:3001)'
              : 'Cannot reach UpdatePilot API'
          }
        >
          {isBackendConnected ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Backend Connected</span>
              <span className="sm:hidden">Online</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
              <span className="hidden sm:inline">Backend Offline</span>
              <span className="sm:hidden">Offline</span>
            </>
          )}
        </div>

        {/* User profile capsule */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs shadow-xs">
            {user?.email ? user.email.slice(0, 2).toUpperCase() : <UserIcon className="w-4 h-4" />}
          </div>
          <span className="text-xs font-medium text-slate-700 max-w-[150px] truncate" title={user?.email}>
            {user?.email || 'Admin'}
          </span>
        </div>
      </div>
    </header>
  );
};
