import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  Filter,
  RotateCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
} from 'lucide-react';
import { applicationService, ListApplicationsParams } from '../services/applicationService';
import { Application, ApplicationDetail, MatchStatus, PaginationMeta } from '../types/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../lib/api';

export const ApplicationsPage: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MatchStatus | ''>('');
  const [page, setPage] = useState(1);

  // Detail Modal
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [appDetail, setAppDetail] = useState<ApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchApps = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params: ListApplicationsParams = {
        page,
        pageSize: 15,
        q: searchTerm.trim() || undefined,
        status: statusFilter || undefined,
      };
      const response = await applicationService.listApplications(params);
      setApplications(response.data);
      setMeta(response.meta);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to fetch application inventory.'));
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, statusFilter]);

  useEffect(() => {
    void fetchApps();
  }, [fetchApps]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchApps();
  };

  const handleOpenDetail = async (id: string) => {
    try {
      setSelectedAppId(id);
      setDetailLoading(true);
      const detail = await applicationService.getApplicationById(id);
      setAppDetail(detail);
    } catch (err) {
      console.error('Failed to load application detail', err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Applications</h2>
          <p className="text-xs text-slate-500 mt-1">
            Software inventory discovered across all connected Windows endpoints.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void fetchApps()}
          icon={<RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search software by name or publisher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </form>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as MatchStatus | '');
                setPage(1);
              }}
              className="bg-transparent text-slate-700 font-medium focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="MATCHED">Matched</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="UNKNOWN">Unknown</option>
              <option value="UNSUPPORTED">Unsupported</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table / State */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px]">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 mt-2 font-medium">Loading applications...</p>
        </div>
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => void fetchApps()} />
      ) : applications.length === 0 ? (
        <EmptyState
          icon={<Package className="w-8 h-8 text-slate-400" />}
          title="No applications found"
          description={
            searchTerm || statusFilter
              ? 'No installed software matched your query.'
              : 'No applications have been scanned yet. Ensure your Windows agent is paired and trigger a scan.'
          }
        />
      ) : (
        <Card className="overflow-hidden p-0 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Application</th>
                  <th className="py-3 px-4">Installed Version</th>
                  <th className="py-3 px-4">Publisher</th>
                  <th className="py-3 px-4">Match Status</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {app.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 block truncate max-w-[200px] sm:max-w-[300px]">
                            {app.displayName}
                          </span>
                          {(app.packageId || app.packageIdentity?.packageId) && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {app.packageId || app.packageIdentity?.packageId}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                      <div>{app.installedVersion}</div>
                      {app.availableVersion && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-sans font-semibold mt-0.5">
                          Update: v{app.availableVersion}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 truncate max-w-[150px]">
                      {app.publisher || '—'}
                    </td>

                    <td className="py-3.5 px-4">
                      <Badge variant={app.matchStatus} size="sm" />
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        <Tag className="w-3 h-3 text-slate-400" />
                        {app.source || 'winget'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleOpenDetail(app.id)}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-600">
            <span>
              Showing page <strong>{meta.page}</strong> of <strong>{meta.totalPages}</strong> ({meta.total} applications)
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

      {/* Details Slide-Over / Dialog */}
      {selectedAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Application Information</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedAppId(null);
                  setAppDetail(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading || !appDetail ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Spinner size="md" />
                <p className="text-xs text-slate-400 mt-2">Loading metadata...</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-xs">
                <div>
                  <h4 className="text-base font-bold text-slate-900">{appDetail.displayName}</h4>
                  <p className="text-slate-500">{appDetail.publisher || 'Unknown Publisher'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Installed Version</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {appDetail.installedVersion}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-0.5">Match Status</span>
                    <Badge variant={appDetail.matchStatus} size="sm" />
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-0.5">Package Identity</span>
                    <span className="font-mono text-slate-700">
                      {appDetail.packageIdentity?.packageId || 'None'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-0.5">Provider Source</span>
                    <span className="font-mono text-slate-700">{appDetail.source || 'winget'}</span>
                  </div>
                </div>

                {appDetail.releases && appDetail.releases.length > 0 && (
                  <div>
                    <span className="font-bold text-slate-800 block mb-2">Available Releases</span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {appDetail.releases.map((rel) => (
                        <div
                          key={rel.version}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <span className="font-mono font-medium text-slate-800">v{rel.version}</span>
                          {rel.changelogUrl && (
                            <a
                              href={rel.changelogUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline flex items-center gap-1"
                            >
                              Changelog <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedAppId(null);
                      setAppDetail(null);
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
    </div>
  );
};
