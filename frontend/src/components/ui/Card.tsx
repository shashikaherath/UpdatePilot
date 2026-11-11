import React from 'react';

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  children,
}) => {
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <div className={`bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden ${className}`}>
      {hasHeader && (
        <div
          className={`flex items-center justify-between px-6 py-4 border-b border-slate-100 ${headerClassName}`}
        >
          <div>
            {title && (
              <h3 className="text-base font-semibold text-slate-900 leading-snug">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={`p-6 ${bodyClassName}`}>{children}</div>
    </div>
  );
};
