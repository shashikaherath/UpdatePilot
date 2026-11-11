import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  ArrowUpCircle,
  Monitor,
  Activity,
  RotateCw,
  Clock,
  ShieldCheck,
  CheckCircle,
  FileSearch,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { dashboardService } from '../services/dashboardService';
import { DashboardData } from '../types/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../lib/api';
import { formatRelativeTime, formatDateTime, formatNumber } from '../utils/formatters';

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const dashboardData = await dashboardService.getDashboard();
      setData(dashboardData);
      setLastUpdated(new Date());
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to load dashboard data. Please try again.');
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] space-y-3">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Loading dashboard overview...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-8 max-w-2xl mx-auto">
        <ErrorMessage
          title="Unable to load dashboard"
          error={error}
          onRetry={() => void fetchDashboard()}
        />
      </div>
    );
  }

  const applicationCount = data?.applicationCount ?? 0;
  const availableUpdatesCount = data?.availableUpdatesCount ?? 0;
  const devices = data?.devices ?? [];
  const connectedDevicesCount = devices.filter((d) => d.status === 'CONNECTED').length;
  const lastScan = data?.lastScan ?? null;
  const recentActivity = data?.recentActivity ?? [];

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Overview</h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Last updated:{' '}
              {lastUpdated ? formatDateTime(lastUpdated.toISOString()) : 'Just now'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchDashboard(true)}
            disabled={isRefreshing}
            icon={<RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Inline refresh error if data was already cached */}
      {error && (
        <ErrorMessage
          title="Refresh failed"
          error={error}
          onRetry={() => void fetchDashboard(true)}
          className="mb-4"
        />
      )}

      {/* 2. Stats Row (4 cards across) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Stat 1: Total Applications */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Applications
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatNumber(applicationCount)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Tracked across all paired devices</p>
        </div>

        {/* Stat 2: Available Updates */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Available Updates
            </span>
            <div
              className={`p-2 rounded-lg ${
                availableUpdatesCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <ArrowUpCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatNumber(availableUpdatesCount)}
            </span>
            {availableUpdatesCount > 0 ? (
              <Badge variant="warning" size="sm">
                Updates Ready
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                Up to date
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {availableUpdatesCount > 0
              ? 'Candidate packages available for install'
              : 'All detected software is up to date'}
          </p>
        </div>

        {/* Stat 3: Connected Devices */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Connected Devices
            </span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Monitor className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatNumber(connectedDevicesCount)}
            </span>
            <span className="text-xs font-medium text-slate-500">
              / {devices.length} total
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {connectedDevicesCount === devices.length && devices.length > 0
              ? 'All paired devices online'
              : `${devices.length - connectedDevicesCount} offline or pairing`}
          </p>
        </div>

        {/* Stat 4: Last Scan Status */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Last Scan Status
            </span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            {lastScan ? (
              <div className="flex items-center gap-2">
                <Badge variant={lastScan.status} size="md">
                  {lastScan.status}
                </Badge>
                <span className="text-xs text-slate-500 truncate" title={lastScan.deviceName}>
                  on {lastScan.deviceName}
                </span>
              </div>
            ) : (
              <span className="text-base font-semibold text-slate-600">No scans yet</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400 truncate">
            {lastScan
              ? `${formatRelativeTime(lastScan.completedAt || lastScan.createdAt)}`
              : 'Trigger a scan from paired device'}
          </p>
        </div>
      </div>

      {/* 4. Last Scan Details Card (if lastScan exists) */}
      {lastScan && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-indigo-600" />
              <span>Latest Scan Execution</span>
            </div>
          }
          subtitle={`Job ID: ${lastScan.jobId}`}
          action={<Badge variant={lastScan.status}>{lastScan.status}</Badge>}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 py-1">
            <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Device</p>
              <p className="text-sm font-semibold text-slate-900 mt-1 truncate" title={lastScan.deviceName}>
                {lastScan.deviceName}
              </p>
            </div>
            <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Mode</p>
              <p className="text-sm font-semibold text-slate-900 mt-1 uppercase">
                {lastScan.scanMode}
              </p>
            </div>
            <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Scanned</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {formatNumber(lastScan.scannedCount)} items
              </p>
            </div>
            <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Updates Found</p>
              <p
                className={`text-sm font-semibold mt-1 ${
                  lastScan.foundCount > 0 ? 'text-amber-600 font-bold' : 'text-slate-900'
                }`}
              >
                {formatNumber(lastScan.foundCount)}
              </p>
            </div>
            <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Started</p>
              <p className="text-xs font-medium text-slate-700 mt-1" title={formatDateTime(lastScan.createdAt)}>
                {formatRelativeTime(lastScan.createdAt)}
              </p>
            </div>
            <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Finished</p>
              <p
                className="text-xs font-medium text-slate-700 mt-1"
                title={lastScan.completedAt ? formatDateTime(lastScan.completedAt) : 'In progress'}
              >
                {lastScan.completedAt ? formatRelativeTime(lastScan.completedAt) : 'Pending completion'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Two-Column Section: Devices & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Devices Card */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-indigo-600" />
              <span>Devices</span>
            </div>
          }
          subtitle={`${devices.length} registered system${devices.length === 1 ? '' : 's'}`}
        >
          {devices.length === 0 ? (
            <EmptyState
              icon={<Monitor className="w-6 h-6 text-slate-400" />}
              title="No devices paired yet"
              description="Pair a Windows device with an agent pairing code to view installed applications and automate updates."
            />
          ) : (
            <div className="divide-y divide-slate-100 -mx-6 -my-2">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-600 mt-0.5 shrink-0">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate" title={device.deviceName}>
                          {device.deviceName}
                        </p>
                        <Badge variant={device.status} size="sm">
                          {device.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-slate-400" />
                          <span>{device.osInfo || 'Windows OS'}</span>
                        </span>
                        {device.agentVersion && (
                          <span className="text-slate-400">
                            v{device.agentVersion}
                          </span>
                        )}
                        <span title={device.lastSeenAt ? formatDateTime(device.lastSeenAt) : 'Never'}>
                          Last seen: {formatRelativeTime(device.lastSeenAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: Recent Activity Card */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <span>Recent Activity</span>
            </div>
          }
          subtitle="Audit trail of security and scan events"
        >
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-6 h-6 text-slate-400" />}
              title="No recent activity"
              description="System audit logs will appear here as devices pair, scan, and apply software updates."
            />
          ) : (
            <div className="divide-y divide-slate-100 -mx-6 -my-2">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="px-6 py-3.5 flex items-start justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-1.5 rounded-full bg-indigo-50 text-indigo-600 mt-0.5 shrink-0">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 break-words">
                        {activity.eventType.replace(/_/g, ' ')}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="uppercase tracking-wider font-medium text-slate-400">
                          {activity.actorType}
                        </span>
                        {activity.targetType && (
                          <span>• Target: {activity.targetType}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-xs text-slate-400 shrink-0 mt-0.5"
                    title={formatDateTime(activity.createdAt)}
                  >
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
