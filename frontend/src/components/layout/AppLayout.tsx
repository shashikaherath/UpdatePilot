import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { dashboardService } from '../../services/dashboardService';

const routeTitleMap: Record<string, string> = {
  '/dashboard': 'Overview',
  '/devices': 'Devices',
  '/applications': 'Applications',
  '/updates': 'Updates',
  '/history': 'Audit History',
  '/settings': 'Settings',
};

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  const location = useLocation();

  const checkBackendHealth = useCallback(async () => {
    try {
      await dashboardService.getHealth();
      setIsBackendConnected(true);
    } catch {
      setIsBackendConnected(false);
    }
  }, []);

  useEffect(() => {
    void checkBackendHealth();
    // Poll backend health every 30 seconds
    const interval = setInterval(() => {
      void checkBackendHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [checkBackendHealth]);

  const currentTitle = routeTitleMap[location.pathname] ?? 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar (Desktop + Mobile drawer) */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        <TopBar
          title={currentTitle}
          isBackendConnected={isBackendConnected}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
