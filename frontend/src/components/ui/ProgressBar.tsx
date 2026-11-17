import React from 'react';
import { ArrowDown, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface ProgressBarProps {
  downloadedMB?: number | null;
  totalMB?: number | null;
  status?: string;
  stageLabel?: string;
  detailLabel?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  downloadedMB,
  totalMB,
  status = 'RUNNING',
  stageLabel,
  detailLabel,
  className = '',
}) => {
  const isSucceeded = status === 'SUCCEEDED';
  const isFailed = status === 'FAILED' || status === 'VERIFICATION_FAILED' || status === 'CANCELLED';

  // Compute fill percentage from real MB data, or fall back to status-based estimate
  const hasMB = downloadedMB != null && totalMB != null && totalMB > 0;
  const fillPercent = hasMB
    ? Math.min(100, Math.round((downloadedMB! / totalMB!) * 100))
    : isSucceeded
      ? 100
      : isFailed
        ? 100
        : status === 'VERIFYING'
          ? 94
          : status === 'RUNNING'
            ? 45
            : 10; // QUEUED

  // Right-side label: MB display when available, otherwise status text
  const mbBadge = isSucceeded
    ? 'Done'
    : isFailed
      ? 'Error'
      : hasMB
        ? `${downloadedMB!.toFixed(1)} MB / ${totalMB!.toFixed(0)} MB`
        : status === 'VERIFYING'
          ? 'Verifying...'
          : status === 'RUNNING'
            ? 'Downloading...'
            : 'Waiting...';

  // Stage label for the left side
  const resolvedLabel =
    stageLabel ||
    (isSucceeded
      ? 'Installation verified and complete!'
      : isFailed
        ? 'Installation encountered an error'
        : status === 'VERIFYING'
          ? 'Verifying installed version via WinGet...'
          : status === 'RUNNING'
            ? hasMB
              ? 'Downloading package installer...'
              : 'Connecting to agent & starting WinGet...'
            : 'Waiting for Windows agent to claim job...');

  return (
    <div className={`w-full space-y-2.5 ${className}`}>
      {/* Top Labels */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          {isSucceeded ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : isFailed ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : status === 'VERIFYING' ? (
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 animate-pulse" />
          ) : (
            <ArrowDown className="w-4 h-4 text-emerald-600 shrink-0 animate-bounce" />
          )}
          <span className="truncate">{resolvedLabel}</span>
        </div>

        {/* MB badge — this replaces the old "0%" */}
        <span
          className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${isSucceeded
            ? 'bg-emerald-100 text-emerald-800'
            : isFailed
              ? 'bg-rose-100 text-rose-800'
              : hasMB
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
        >
          {mbBadge}
        </span>
      </div>

      {/* Chrome-style green progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-3.5 p-0.5 border border-slate-200/90 shadow-inner overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden ${isFailed
            ? 'bg-rose-500'
            : isSucceeded
              ? 'bg-emerald-500'
              : 'bg-emerald-500 shadow-sm'
            }`}
          style={{ width: `${fillPercent}%` }}
        >
          {/* Animated sheen when active */}
          {!isSucceeded && !isFailed && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full h-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Optional detail row */}
      {detailLabel && (
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{detailLabel}</span>
          {!isSucceeded && !isFailed && (
            <span className="text-emerald-600 font-medium animate-pulse">In Progress...</span>
          )}
        </div>
      )}
    </div>
  );
};
