import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Plus,
  Play,
  Trash2,
  RotateCw,
  Clock,
  Copy,
  Check,
  AlertTriangle,
  X,
  Download,
  Sparkles,
  Terminal,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { deviceService } from '../services/deviceService';
import { Device, PairingCodeResponse } from '../types/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../lib/api';
import { formatDateTime, formatRelativeTime } from '../utils/formatters';
import { sendBrowserNotification } from '../utils/notifications';

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Auto-registration state for this PC
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);

  // Pairing modal state
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [pairingTab, setPairingTab] = useState<'easy' | 'manual'>('easy');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingData, setPairingData] = useState<PairingCodeResponse | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Download 1-Click Setup Script
  const handleDownloadInstaller = () => {
    if (!pairingData) return;
    const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
    const currentServerUrl = rawBaseUrl.endsWith('/api/v1') ? rawBaseUrl.slice(0, -7) : rawBaseUrl;
    const scriptContent = `@echo off
REM =========================================================================
REM UpdatePilot Windows Agent - 1-Click Setup for "${pairingData.deviceName}"
REM =========================================================================

setlocal EnableDelayedExpansion
set "AGENT_DIR=%LocalAppData%\\UpdatePilot"
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"

REM If UpdatePilotAgent.ps1 exists alongside this script, use it; otherwise download it
if exist "%~dp0UpdatePilotAgent.ps1" (
    copy /y "%~dp0UpdatePilotAgent.ps1" "%AGENT_DIR%\\UpdatePilotAgent.ps1" >nul 2>&1
) else if not exist "%AGENT_DIR%\\UpdatePilotAgent.ps1" (
    echo [UpdatePilot] Downloading agent from server...
    powershell.exe -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('${currentServerUrl}/agent/v1/download/script', '%AGENT_DIR%\\UpdatePilotAgent.ps1')"
)

cd /d "%AGENT_DIR%"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%AGENT_DIR%\\UpdatePilotAgent.ps1" -GUI -ServerUrl "${currentServerUrl}" -PairingCode "${pairingData.pairingCode}"
`;
    const blob = new Blob([scriptContent], { type: 'application/cmd' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UpdatePilot-Setup-${pairingData.deviceName.replace(/[^a-zA-Z0-9_-]/g, '_')}.cmd`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Scanning / Revoking state
  const [scanningDeviceId, setScanningDeviceId] = useState<string | null>(null);
  const [revokingDevice, setRevokingDevice] = useState<Device | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await deviceService.listDevices();
      setDevices(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to fetch registered devices.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  // Poll for device connection while pairing modal is open
  useEffect(() => {
    if (!isPairingModalOpen || !pairingData) return;
    const interval = setInterval(() => {
      void fetchDevices();
    }, 3000);
    return () => clearInterval(interval);
  }, [isPairingModalOpen, pairingData, fetchDevices]);

  // Handle Generate Pairing Code
  const handleGeneratePairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;

    try {
      setPairingLoading(true);
      const result = await deviceService.createPairingCode(newDeviceName.trim());
      setPairingData(result);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, 'Could not generate pairing code.'),
      });
    } finally {
      setPairingLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Handle Automatic Registration of Current Computer
  const handleAutoRegisterCurrentDevice = async () => {
    try {
      setIsAutoRegistering(true);
      const userAgent = navigator.userAgent;
      const isWindows = userAgent.includes('Windows');
      const estimatedOs = isWindows ? 'Windows 11 (Desktop)' : navigator.platform || 'Windows';
      
      const res = await deviceService.autoEnrollDevice({
        deviceName: 'This Windows PC',
        osInfo: estimatedOs,
        agentVersion: '1.0.0',
      });

      setActionMessage({
        type: 'success',
        text: res.isNew
          ? `Device "${res.deviceName}" registered automatically!`
          : `Device "${res.deviceName}" connected and synchronized.`,
      });
      await fetchDevices();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, 'Failed to auto-register current device.'),
      });
    } finally {
      setIsAutoRegistering(false);
    }
  };

  // Handle Start Scan with Real-Time Progress Polling
  const handleStartScan = async (device: Device) => {
    if (device.status !== 'CONNECTED') {
      setActionMessage({
        type: 'error',
        text: `Cannot start scan: "${device.deviceName}" is currently offline. Please ensure the UpdatePilot Windows agent is running on this computer.`,
      });
      return;
    }

    try {
      setScanningDeviceId(device.id);
      setActionMessage({
        type: 'info',
        text: `Scan requested for ${device.deviceName}. Waiting for agent to claim...`,
      });

      const res = await deviceService.startScan(device.id, 'full');

      let pollCount = 0;
      const pollTimer = setInterval(async () => {
        try {
          pollCount++;
          const status = await deviceService.getScanStatus(res.scanId || res.jobId);
          if (status.state === 'running') {
            setActionMessage({
              type: 'info',
              text: `Windows Agent is executing software discovery on ${device.deviceName}...`,
            });
          } else if (status.state === 'succeeded') {
            clearInterval(pollTimer);
            setScanningDeviceId(null);
            setActionMessage({
              type: 'success',
              text: `Scan completed on ${device.deviceName}! Discovered ${status.scannedCount} applications. View them in the Applications tab.`,
            });
            sendBrowserNotification(`UpdatePilot Scan Completed`, {
              body: `Discovered ${status.scannedCount} applications on ${device.deviceName}.`,
              deduplicationKey: `scan-success-${res.jobId}`,
            });
            void fetchDevices();
          } else if (status.state === 'failed') {
            clearInterval(pollTimer);
            setScanningDeviceId(null);
            setActionMessage({
              type: 'error',
              text: `Scan failed on ${device.deviceName}: ${status.errorSummary || 'Agent timeout or execution error'}`,
            });
            sendBrowserNotification(`UpdatePilot Scan Failed`, {
              body: `Scan failed on ${device.deviceName}: ${status.errorSummary || 'Execution error'}`,
              deduplicationKey: `scan-fail-${res.jobId}`,
            });
            void fetchDevices();
          } else if (status.state === 'queued' && pollCount >= 20) {
            // Unclaimed for 40 seconds
            clearInterval(pollTimer);
            setScanningDeviceId(null);
            setActionMessage({
              type: 'error',
              text: `Scan timed out waiting for ${device.deviceName}. The Windows agent may be offline or stopped.`,
            });
            void fetchDevices();
          }
        } catch {
          // Network hiccup during poll, continue
        }
      }, 2000);

      // Auto clear polling safety timeout after 90 seconds
      setTimeout(() => {
        clearInterval(pollTimer);
        setScanningDeviceId((curr) => (curr === device.id ? null : curr));
      }, 90000);

    } catch (err) {
      setScanningDeviceId(null);
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, `Failed to trigger scan for ${device.deviceName}.`),
      });
    }
  };

  // Handle Revoke Device
  const handleConfirmRevoke = async () => {
    if (!revokingDevice) return;
    try {
      setIsRevoking(true);
      await deviceService.revokeDevice(revokingDevice.id);
      setActionMessage({
        type: 'success',
        text: `Device "${revokingDevice.deviceName}" revoked successfully.`,
      });
      setRevokingDevice(null);
      await fetchDevices();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, 'Failed to revoke device.'),
      });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Devices</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage your registered Windows endpoints, initiate scans, and pair new devices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchDevices()}
            icon={<RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            variant="secondary"
            size="sm"
            loading={isAutoRegistering}
            onClick={() => void handleAutoRegisterCurrentDevice()}
            icon={<Monitor className="w-4 h-4 text-indigo-600" />}
          >
            Register This PC
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPairingData(null);
              setNewDeviceName('');
              setIsPairingModalOpen(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Pair New Device
          </Button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : actionMessage.type === 'info'
              ? 'bg-sky-50 text-sky-800 border-sky-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px]">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 mt-2 font-medium">Loading devices...</p>
        </div>
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => void fetchDevices()} />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<Monitor className="w-8 h-8 text-slate-400" />}
          title="No devices registered"
          description="Register this Windows computer automatically or pair an external device using a pairing code."
          action={
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                loading={isAutoRegistering}
                onClick={() => void handleAutoRegisterCurrentDevice()}
                icon={<Monitor className="w-4 h-4" />}
              >
                Register This PC Automatically
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsPairingModalOpen(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                Pair Remote Device
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {devices.map((device) => {
            const isScanning = scanningDeviceId === device.id;
            const isRevoked = device.status === 'REVOKED';

            return (
              <Card key={device.id} className="relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 text-base truncate">
                          {device.deviceName}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono truncate" title={device.id}>
                          ID: {device.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>

                    <Badge variant={device.status} />
                  </div>

                  <div className="space-y-2 mt-4 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Operating System:</span>
                      <span className="font-medium text-slate-700 text-right truncate max-w-[180px]">
                        {device.osInfo || 'Windows'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Agent Version:</span>
                      <span className="font-mono text-slate-700 font-medium">
                        v{device.agentVersion || '1.0.0'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Last Seen:</span>
                      <span className="text-slate-700">
                        {device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : 'Never'}
                      </span>
                    </div>

                    {device.pairedAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Paired:</span>
                        <span className="text-slate-700">{formatDateTime(device.pairedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isScanning || isRevoked}
                    loading={isScanning}
                    onClick={() => void handleStartScan(device)}
                    icon={<Play className="w-3.5 h-3.5 text-indigo-600" />}
                  >
                    Scan Now
                  </Button>

                  {!isRevoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokingDevice(device)}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pairing Modal */}
      {isPairingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Monitor className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Pair New Windows Device</h3>
              </div>
              <button
                onClick={() => setIsPairingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pairingData && devices.some(d => d.deviceName.toLowerCase() === pairingData.deviceName.toLowerCase() && d.status === 'CONNECTED') ? (
              <div className="py-8 space-y-4 text-center animate-in fade-in">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Device Connected Successfully!</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    &quot;{pairingData.deviceName}&quot; is paired and actively communicating with your UpdatePilot account.
                  </p>
                </div>
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    onClick={() => {
                      setIsPairingModalOpen(false);
                      setPairingData(null);
                      void fetchDevices();
                    }}
                  >
                    Done & View Devices
                  </Button>
                </div>
              </div>
            ) : !pairingData ? (
              <form onSubmit={handleGeneratePairingCode} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Device Identifier Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My-Windows-PC, Work-Laptop"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Enter a friendly name for this computer. A short-lived pairing code (valid for 15 minutes) will be generated.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsPairingModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={pairingLoading}
                  >
                    Continue
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                {/* Pairing Code Banner */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-[11px] font-medium text-slate-400 block mb-0.5">
                    One-Time Pairing Code for &quot;{pairingData.deviceName}&quot;
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl font-mono font-bold tracking-widest text-indigo-600">
                      {pairingData.pairingCode}
                    </span>
                    <button
                      onClick={() => copyToClipboard(pairingData.pairingCode)}
                      className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200 transition-colors"
                      title="Copy code"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-amber-600 flex items-center justify-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    Expires: {formatDateTime(pairingData.expiresAt)}
                  </span>
                </div>

                {/* Tab Switcher: 1-Click vs Manual */}
                <div className="flex border-b border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setPairingTab('easy')}
                    className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 font-semibold transition-all ${
                      pairingTab === 'easy'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    1-Click Setup (Recommended)
                  </button>

                  <button
                    type="button"
                    onClick={() => setPairingTab('manual')}
                    className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 font-semibold transition-all ${
                      pairingTab === 'manual'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    PowerShell (Advanced)
                  </button>
                </div>

                {pairingTab === 'easy' ? (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2">
                      <div className="flex items-center gap-2 text-indigo-950 font-semibold">
                        <ShieldCheck className="w-4 h-4 text-indigo-600" />
                        <span>Simple 2-Step Windows Setup</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-slate-600 text-[11px]">
                        <li>
                          Click below to download the pre-configured launcher:
                        </li>
                      </ol>

                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="w-full text-xs font-semibold py-2"
                        onClick={handleDownloadInstaller}
                        icon={<Download className="w-3.5 h-3.5" />}
                      >
                        Download 1-Click Setup (.cmd)
                      </Button>

                      <ol start={2} className="list-decimal list-inside space-y-1.5 text-slate-600 text-[11px] pt-1">
                        <li>
                          Double-click the downloaded file in your Downloads folder.
                        </li>
                        <li>
                          A Windows prompt will appear: click <strong>&quot;Allow and Connect&quot;</strong>.
                        </li>
                      </ol>
                    </div>

                    {/* Waiting pulse */}
                    <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                      <span>Waiting for agent to connect... This screen updates automatically.</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 bg-slate-900 text-slate-200 p-3 rounded-xl space-y-2">
                    <p className="text-[11px] text-slate-400">
                      Run this in PowerShell from your project directory:
                    </p>
                    <div className="text-emerald-400 font-mono text-[11px] break-all select-all">
                      powershell -ExecutionPolicy Bypass -File .\agent\UpdatePilotAgent.ps1 -ServerUrl &quot;{(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')}&quot; -PairingCode &quot;{pairingData.pairingCode}&quot;
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full text-xs mt-1"
                      onClick={() => {
                        const rawBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
                        const serverUrl = rawBase.endsWith('/api/v1') ? rawBase.slice(0, -7) : rawBase;
                        copyToClipboard(`powershell -ExecutionPolicy Bypass -File .\\agent\\UpdatePilotAgent.ps1 -ServerUrl "${serverUrl}" -PairingCode "${pairingData.pairingCode}"`);
                      }}
                      icon={<Copy className="w-3.5 h-3.5" />}
                    >
                      Copy PowerShell Command
                    </Button>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsPairingModalOpen(false);
                      setPairingData(null);
                      void fetchDevices();
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Revoke Device?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to revoke &quot;<strong>{revokingDevice.deviceName}</strong>&quot;? All
              active credentials for this agent will be permanently invalidated.
            </p>

            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="secondary"
                size="sm"
                disabled={isRevoking}
                onClick={() => setRevokingDevice(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={isRevoking}
                onClick={() => void handleConfirmRevoke()}
              >
                Yes, Revoke
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
