import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorMessageProps {
  error: string;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  title = 'Something went wrong',
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-rose-900 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-rose-900">{title}</h4>
          <p className="text-xs text-rose-700 mt-1 break-words">{error}</p>
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="danger"
                size="sm"
                onClick={onRetry}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
