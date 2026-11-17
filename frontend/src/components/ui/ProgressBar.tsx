import React from 'react';
import { ArrowDown, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface ProgressBarProps {
  progress: number; // 0 to 100
  status?: string;
  stageLabel?: string;
  detailLabel?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  status = 'RUNNING',
  stageLabel,
  detailLabel,
  className = '',
}) => {
  const isSucceeded = status === 'SUCCEEDED';
  const isFailed = status === 'FAILED' || status === 'VERIFICATION_FAILED' || status === 'CANCELLED';
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  // Determine stage text if not explicitly provided
  const resolvedLabel = stageLabel || (
    isSucceeded
      ? 'Installation verified and complete!'
      : isFailed
      ? 'Installation encountered an error'
      : status === 'VERIFYING'
      ? 'Verifying installed version via WinGet...'
      : status === 'RUNNING'
      ? clampedProgress < 40
        ? 'Connecting to agent & starting WinGet...'
        : clampedProgress < 75
        ? 'Downloading package installer...'
        : 'Installing software update on Windows...'
      : 'Waiting for Windows agent to claim job...'
  );

  return (
    <div className={`w-full space-y-2.5 ${className}`}>
      {/* Top Labels: Stage on left, Percentage on right */}
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

        <span
          className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
            isSucceeded
              ? 'bg-emerald-100 text-emerald-800'
              : isFailed
              ? 'bg-rose-100 text-rose-800'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {clampedProgress}%
        </span>
      </div>

      {/* Chrome-Style Green Progress Bar Track */}
      <div className="w-full bg-slate-100 rounded-full h-3.5 p-0.5 border border-slate-200/90 shadow-inner overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden ${
            isFailed
              ? 'bg-rose-500'
              : isSucceeded
              ? 'bg-emerald-500'
              : 'bg-emerald-500 shadow-sm'
          }`}
          style={{ width: `${clampedProgress}%` }}
        >
          {/* Animated Sheen / Stripes effect when active */}
          {!isSucceeded && !isFailed && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full h-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Optional Detail Note */}
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
