import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
        {icon ?? <Inbox className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
