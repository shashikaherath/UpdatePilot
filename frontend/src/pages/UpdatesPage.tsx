import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  RotateCw,
  X,
  AlertTriangle,
  Search,
  CheckSquare,
  Square,
  Layers,
  Laptop,
  Check,
} from 'lucide-react';
import { updateService } from '../services/updateService';
import {
  UpdateCandidateItem,
  UpdatePreviewResponse,
  JobDetail,
} from '../types/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../lib/api';

interface BatchProgressItem {
  id: string;
  name: string;
  targetVersion: string;
  status: 'PENDING' | 'PREVIEWING' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  error?: string;
}

export const UpdatesPage: React.FC = () => {
  const [updates, setUpdates] = useState<UpdateCandidateItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');

  // Multi-Selection for Batch Updates
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchProgressItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  // 2-Step Confirmation Workflow (Single Update)
  const [activeCandidate, setActiveCandidate] = useState<UpdateCandidateItem | null>(null);
  const [previewData, setPreviewData] = useState<UpdatePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);

  // Job Polling State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobDetail | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUpdates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await updateService.listUpdates({
        q: searchTerm.trim() || undefined,
      });
      setUpdates(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to fetch available update candidates.'));
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    void fetchUpdates();
  }, [fetchUpdates]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Filtered list
  const filteredUpdates = updates.filter((item) => {
    const appName = item.application?.displayName || item.applicationName || '';
    const pkgId = item.packageId || '';
    const deviceName = item.application?.device?.deviceName || item.deviceName || '';

    const matchesSearch =
      searchTerm === '' ||
      appName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkgId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDevice =
      selectedDevice === 'all' ||
      deviceName.toLowerCase() === selectedDevice.toLowerCase();

    return matchesSearch && matchesDevice;
  });

  // Unique devices for filter
  const deviceList = Array.from(
    new Set(
      updates.map(
        (u) => u.application?.device?.deviceName || u.deviceName || 'Windows PC'
      )
    )
  );

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUpdates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUpdates.map((u) => u.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Step 1: Open Preview for Single Update
  const handleOpenPreview = async (candidate: UpdateCandidateItem) => {
    try {
      setActiveCandidate(candidate);
      setPreviewData(null);
      setJobStatus(null);
      setActiveJobId(null);
      setPreviewLoading(true);
      const preview = await updateService.previewUpdate(candidate.id);
      setPreviewData(preview);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not generate update preview capability.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Step 2: Confirm & Execute Single Update
  const handleConfirmUpdate = async () => {
    if (!activeCandidate || !previewData) return;

    try {
      setExecuteLoading(true);
      const result = await updateService.executeUpdate(
        activeCandidate.id,
        previewData.previewToken
      );

      setActiveJobId(result.jobId);

      // Start polling job status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const job = await updateService.getJob(result.jobId);
          setJobStatus(job);

          if (
            ['SUCCEEDED', 'FAILED', 'VERIFICATION_FAILED', 'CANCELLED'].includes(job.status)
          ) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (job.status === 'SUCCEEDED') {
              const name = activeCandidate.application?.displayName || activeCandidate.applicationName || 'Application';
              setSuccessBanner(`Successfully updated and verified ${name} to v${previewData.targetVersion}!`);
              setTimeout(() => setSuccessBanner(null), 8000);
            }
            void fetchUpdates();
          }
        } catch (pollErr) {
          console.error('Job polling error:', pollErr);
        }
      }, 2000);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to queue update job execution.'));
    } finally {
      setExecuteLoading(false);
    }
  };

  const handleCloseModal = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setActiveCandidate(null);
    setPreviewData(null);
    setActiveJobId(null);
    setJobStatus(null);
  };

  // Batch Update Workflow
  const handleOpenBatchModal = () => {
    const selectedApps = updates
      .filter((u) => selectedIds.has(u.id))
      .map((u) => ({
        id: u.id,
        name: u.application?.displayName || u.applicationName || 'Application',
        targetVersion: u.targetVersion,
        status: 'PENDING' as const,
      }));
    setBatchItems(selectedApps);
    setIsBatchModalOpen(true);
  };

  const handleExecuteBatch = async () => {
    setBatchRunning(true);
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      setBatchItems((prev) =>
        prev.map((b, idx) => (idx === i ? { ...b, status: 'PREVIEWING' } : b))
      );

      try {
        const preview = await updateService.previewUpdate(item.id);
        setBatchItems((prev) =>
          prev.map((b, idx) => (idx === i ? { ...b, status: 'QUEUED' } : b))
        );

        const result = await updateService.executeUpdate(item.id, preview.previewToken);
        setBatchItems((prev) =>
          prev.map((b, idx) => (idx === i ? { ...b, status: 'RUNNING' } : b))
        );

        // Wait for job completion
        let finished = false;
        let attempts = 0;
        while (!finished && attempts < 60) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          attempts++;
          try {
            const job = await updateService.getJob(result.jobId);
            if (job.status === 'SUCCEEDED') {
              finished = true;
              setBatchItems((prev) =>
                prev.map((b, idx) => (idx === i ? { ...b, status: 'SUCCEEDED' } : b))
              );
            } else if (job.status === 'FAILED' || job.status === 'VERIFICATION_FAILED') {
              finished = true;
              setBatchItems((prev) =>
                prev.map((b, idx) => (idx === i ? { ...b, status: 'FAILED', error: job.errorSummary || 'Failed' } : b))
              );
            }
          } catch {
            // retry
          }
        }
      } catch (err) {
        setBatchItems((prev) =>
          prev.map((b, idx) =>
            idx === i ? { ...b, status: 'FAILED', error: getApiErrorMessage(err, 'Failed') } : b
          )
        );
      }
    }
    setBatchRunning(false);
    setSelectedIds(new Set());
    void fetchUpdates();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Available Updates</h2>
          <p className="text-xs text-slate-500 mt-1">
            Verified updates detected on your connected Windows endpoints. Every operation requires human confirmation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="primary"
              size="sm"
              icon={<Layers className="w-3.5 h-3.5" />}
              onClick={handleOpenBatchModal}
            >
              Update Selected ({selectedIds.size})
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchUpdates()}
            icon={<RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Success Notification */}
      {successBanner && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2.5 text-xs font-medium animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search updates by software name or package ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        {deviceList.length > 1 && (
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Devices ({deviceList.length})</option>
            {deviceList.map((dev) => (
              <option key={dev} value={dev}>
                {dev}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px]">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 mt-2 font-medium">Scanning update candidates...</p>
        </div>
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => void fetchUpdates()} />
      ) : filteredUpdates.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-8 h-8 text-emerald-500" />}
          title="All software is up to date"
          description={
            searchTerm
              ? `No available updates matching "${searchTerm}".`
              : "No pending updates found for your paired devices. Check back after triggering a scan."
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Multi-Select Select All Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 font-semibold hover:text-slate-900"
            >
              {selectedIds.size === filteredUpdates.length ? (
                <CheckSquare className="w-4 h-4 text-indigo-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>
                {selectedIds.size === filteredUpdates.length
                  ? 'Deselect All'
                  : 'Select All'} ({filteredUpdates.length} available)
              </span>
            </button>

            {selectedIds.size > 0 && (
              <span className="text-indigo-600 font-bold">
                {selectedIds.size} application{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            )}
          </div>

          {/* Cards List */}
          <div className="grid grid-cols-1 gap-3">
            {filteredUpdates.map((item) => {
              const appName = item.application?.displayName || item.applicationName || 'Application';
              const publisher = item.application?.publisher || item.publisher || 'Unknown Publisher';
              const deviceName = item.application?.device?.deviceName || item.deviceName || 'Windows PC';
              const installedVer = item.application?.installedVersion || item.installedVersion || 'unknown';
              const targetVer = item.targetVersion;
              const packageId = item.packageId || item.application?.id;
              const isSelected = selectedIds.has(item.id);

              return (
                <Card
                  key={item.id}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors ${
                    isSelected ? 'border-indigo-400 bg-indigo-50/20' : 'hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelectOne(item.id)}
                      className="mt-2 text-slate-400 hover:text-indigo-600 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 font-bold text-sm">
                      {appName.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-sm">
                          {appName}
                        </h3>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {item.source || 'winget'}
                        </span>
                        {item.mayRequireAdmin && (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <ShieldAlert className="w-2.5 h-2.5 text-amber-600" /> Admin
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mt-0.5">
                        {publisher}
                        {packageId && (
                          <> • <span className="font-mono text-slate-500">{packageId}</span></>
                        )}
                        {' '}• On <span className="text-slate-600 font-medium inline-flex items-center gap-1"><Laptop className="w-3 h-3" /> {deviceName}</span>
                      </p>

                      {/* Version difference pill */}
                      <div className="flex items-center gap-2 mt-2 font-mono text-xs">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          v{installedVer}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                          v{targetVer}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleOpenPreview(item)}
                    >
                      Review Update
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 2-Step Confirmation & Execution Modal (Single Update) */}
      {activeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Review Software Update</h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewLoading || !previewData ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Spinner size="md" />
                <p className="text-xs text-slate-400 mt-2 font-medium">
                  Validating update metadata and generating authorization token...
                </p>
              </div>
            ) : !activeJobId ? (
              /* Step 1 Review Confirmation View */
              <div className="mt-4 space-y-4 text-xs">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Application:</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {activeCandidate.application?.displayName || activeCandidate.applicationName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Target Device:</span>
                    <span className="font-medium text-slate-800">
                      {activeCandidate.application?.device?.deviceName || activeCandidate.deviceName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-500">Installed Version:</span>
                    <span className="text-slate-700">v{previewData.installedVersion}</span>
                  </div>

                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-500">Target Version:</span>
                    <span className="font-bold text-emerald-600">v{previewData.targetVersion}</span>
                  </div>

                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-500">Package Identifier:</span>
                    <span className="text-slate-700">{previewData.packageId}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Package Source:</span>
                    <span className="text-slate-700 uppercase font-semibold">{previewData.source}</span>
                  </div>
                </div>

                {previewData.mayRequireAdmin && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Administrator privileges:</strong> This package installer may require elevated permissions on the target Windows endpoint.
                    </p>
                  </div>
                )}

                {previewData.releaseNotesUrl && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100">
                    <span className="text-indigo-900 font-medium">Official Release Notes</span>
                    <a
                      href={previewData.releaseNotesUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      View Changelog <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" size="sm" onClick={handleCloseModal}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={executeLoading}
                    onClick={() => void handleConfirmUpdate()}
                  >
                    Confirm & Update
                  </Button>
                </div>
              </div>
            ) : (
              /* Step 2 Execution & Real-Time Polling View */
              <div className="mt-4 space-y-4 text-xs">
                <div className="text-center py-6">
                  {jobStatus?.status === 'SUCCEEDED' ? (
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : jobStatus?.status === 'FAILED' || jobStatus?.status === 'VERIFICATION_FAILED' ? (
                    <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 animate-pulse">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                  )}

                  <h4 className="text-base font-bold text-slate-900">
                    {jobStatus?.status === 'SUCCEEDED'
                      ? 'Update Installed and Verified!'
                      : jobStatus?.status === 'FAILED'
                      ? 'Installation Failed'
                      : jobStatus?.status === 'VERIFICATION_FAILED'
                      ? 'Post-Install Verification Failed'
                      : 'Windows Agent Executing Update...'}
                  </h4>

                  <div className="mt-2 flex justify-center">
                    <Badge variant={jobStatus?.status || 'QUEUED'} />
                  </div>

                  <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                    {jobStatus?.status === 'SUCCEEDED'
                      ? `Application has been updated to version ${previewData.targetVersion} and verified on your PC.`
                      : jobStatus?.errorSummary ||
                        'The Windows agent has claimed this update job and is running the WinGet package installer.'}
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCloseModal}
                  >
                    {jobStatus?.status === 'SUCCEEDED' ? 'Close' : 'Dismiss'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Update Modal (Feature 6) */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Batch Update Confirmation</h3>
              </div>
              <button
                onClick={() => !batchRunning && setIsBatchModalOpen(false)}
                disabled={batchRunning}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <p className="text-slate-600">
                You are about to install updates for <strong>{batchItems.length}</strong> application{batchItems.length > 1 ? 's' : ''}. Each update will be validated and executed individually by your Windows agent.
              </p>

              <div className="max-h-60 overflow-y-auto space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                {batchItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-slate-900 block truncate">{item.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">Target: v{item.targetVersion}</span>
                    </div>

                    <div>
                      {item.status === 'PENDING' && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">Pending</span>
                      )}
                      {item.status === 'PREVIEWING' && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-medium">Authorizing...</span>
                      )}
                      {item.status === 'QUEUED' && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">Queued</span>
                      )}
                      {item.status === 'RUNNING' && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium animate-pulse">Installing...</span>
                      )}
                      {item.status === 'SUCCEEDED' && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Updated
                        </span>
                      )}
                      {item.status === 'FAILED' && (
                        <span className="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-medium">Failed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={batchRunning}
                  onClick={() => setIsBatchModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={batchRunning}
                  onClick={() => void handleExecuteBatch()}
                >
                  Confirm & Update All Selected
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
