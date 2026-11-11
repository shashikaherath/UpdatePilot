import React from 'react';
import { DeviceStatus, JobStatus } from '../../types/api';

export type BadgeVariant =
  | DeviceStatus
  | JobStatus
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple';

export interface BadgeProps {
  variant?: BadgeVariant | string;
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  dot = true,
  size = 'md',
  className = '',
  children,
}) => {
  const normalizedVariant = (variant || 'neutral').toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  switch (normalizedVariant) {
    case 'CONNECTED':
    case 'SUCCEEDED':
    case 'SUCCESS':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
      dotColor = 'bg-emerald-500';
      break;

    case 'DISCONNECTED':
    case 'QUEUED':
    case 'WARNING':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200/80';
      dotColor = 'bg-amber-500';
      break;

    case 'REVOKED':
    case 'FAILED':
    case 'DANGER':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-200/80';
      dotColor = 'bg-rose-500';
      break;

    case 'PAIRING':
    case 'RUNNING':
    case 'INFO':
      colorClasses = 'bg-sky-50 text-sky-700 border-sky-200/80';
      dotColor = 'bg-sky-500 animate-pulse';
      break;

    case 'VERIFYING':
    case 'PURPLE':
      colorClasses = 'bg-purple-50 text-purple-700 border-purple-200/80';
      dotColor = 'bg-purple-500 animate-pulse';
      break;

    case 'UNPAIRED':
    case 'CANCELLED':
    case 'NEUTRAL':
    default:
      colorClasses = 'bg-slate-100 text-slate-700 border-slate-200/80';
      dotColor = 'bg-slate-400';
      break;
  }

  const sizeClasses =
    size === 'sm' ? 'text-xs px-2 py-0.5 gap-1.5' : 'text-xs px-2.5 py-1 gap-1.5 font-medium';

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-colors ${sizeClasses} ${colorClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />}
      <span>{children ?? variant}</span>
    </span>
  );
};
