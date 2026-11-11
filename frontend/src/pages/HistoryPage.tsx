import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Download,
  RotateCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { historyService, ListHistoryParams } from '../services/historyService';
import { AuditEventItem, JobKind, PaginationMeta } from '../types/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../lib/api';
import { formatDateTime } from '../utils/formatters';

export const HistoryPage: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<AuditEventItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Filters
  const [selectedType, setSelectedType] = useState<JobKind | ''>('');
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params: ListHistoryParams = {
        page,
        pageSize: 20,
        type: selectedType || undefined,
      };
      const response = await historyService.getHistory(params);
      setHistoryItems(response.data);
      setMeta(response.meta);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to fetch audit history.'));
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedType]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleExportCsv = async () => {
    try {
      setExportLoading(true);
      const blob = await historyService.exportCsv({
        type: selectedType || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `updatepilot-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Audit History</h2>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident audit trail of system scans, update authorizations, and agent operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchHistory()}
            icon={<RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            loading={exportLoading}
            onClick={() => void handleExportCsv()}
            icon={<Download className="w-4 h-4" />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as JobKind | '');
              setPage(1);
            }}
            className="bg-transparent text-slate-700 font-medium focus:outline-none"
          >
            <option value="">All Event Kinds</option>
            <option value="SCAN">Scan Operations</option>
            <option value="UPDATE">Update Operations</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px]">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 mt-2 font-medium">Loading audit history...</p>
        </div>
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => void fetchHistory()} />
      ) : historyItems.length === 0 ? (
        <EmptyState
          icon={<History className="w-8 h-8 text-slate-400" />}
          title="No history recorded yet"
          description="Scan executions and software updates will be audited and logged here."
        />
      ) : (
        <Card className="overflow-hidden p-0 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Device</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="font-mono">{item.eventType}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {item.actorType}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">
                      {item.targetType ? `${item.targetType}` : '—'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {item.device?.deviceName || '—'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {formatDateTime(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-600">
            <span>
              Showing page <strong>{meta.page}</strong> of <strong>{meta.totalPages}</strong> ({meta.total} records)
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                icon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                icon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
