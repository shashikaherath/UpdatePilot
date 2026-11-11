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

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Auto-registration state for this PC
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);

  // Pairing modal state
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingData, setPairingData] = useState<PairingCodeResponse | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

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
    try {
      setScanningDeviceId(device.id);
      setActionMessage({
        type: 'info',
        text: `Scan requested for ${device.deviceName}. Waiting for agent to claim...`,
      });

      const res = await deviceService.startScan(device.id, 'full');

      const pollTimer = setInterval(async () => {
        try {
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
            void fetchDevices();
          } else if (status.state === 'failed') {
            clearInterval(pollTimer);
            setScanningDeviceId(null);
            setActionMessage({
              type: 'error',
              text: `Scan failed on ${device.deviceName}: ${status.errorSummary || 'Agent timeout or execution error'}`,
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

            {!pairingData ? (
              <form onSubmit={handleGeneratePairingCode} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Device Identifier Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DESKTOP-MAIN, Work-Laptop"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    A short-lived pairing code (valid for 15 minutes) will be generated.
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
                    Generate Code
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-xs font-medium text-slate-400 block mb-1">
                    One-Time Pairing Code for &quot;{pairingData.deviceName}&quot;
                  </span>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl font-mono font-bold tracking-widest text-indigo-600">
                      {pairingData.pairingCode}
                    </span>
                    <button
                      onClick={() => copyToClipboard(pairingData.pairingCode)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200 transition-colors"
                      title="Copy code"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-xs text-amber-600 mt-2 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Expires: {formatDateTime(pairingData.expiresAt)}
                  </span>
                </div>

                <div className="text-xs text-slate-500 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                  <p className="font-semibold text-indigo-900 mb-1">How to use:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Launch the UpdatePilot Windows Agent on your PC.</li>
                    <li>Enter this pairing code when prompted.</li>
                    <li>The agent will automatically exchange this code for a secure bearer token.</li>
                  </ol>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIsPairingModalOpen(false);
                      void fetchDevices();
                    }}
                  >
                    Done
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
