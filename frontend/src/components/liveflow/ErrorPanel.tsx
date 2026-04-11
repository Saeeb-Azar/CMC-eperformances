import { AlertTriangle, Clock, Package, ChevronRight } from 'lucide-react';

export interface ErrorItem {
  id: string;
  title: string;
  description: string;
  barcode?: string;
  referenceId?: string;
  timestamp: string;
  severity: 'warning' | 'error';
}

interface ErrorPanelProps {
  errors: ErrorItem[];
}

export default function ErrorPanel({ errors }: ErrorPanelProps) {
  if (errors.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6">
        <h3 className="text-sm font-medium text-text-primary mb-4">Issues</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <Package size={20} className="text-emerald-500" />
          </div>
          <p className="text-sm text-text-secondary">No issues right now</p>
          <p className="text-xs text-text-muted mt-1">Everything is running smoothly</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Issues</h3>
        <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
          {errors.length} active
        </span>
      </div>

      <div className="divide-y divide-border-light">
        {errors.map((err) => (
          <div
            key={err.id}
            className="px-5 py-4 hover:bg-surface-secondary transition-colors cursor-pointer group"
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-1.5 rounded-lg mt-0.5 ${
                  err.severity === 'error' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'
                }`}
              >
                <AlertTriangle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{err.title}</p>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {err.description}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {err.barcode && (
                    <span className="text-[11px] text-text-muted font-mono">
                      {err.barcode}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <Clock size={10} />
                    {err.timestamp}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-text-muted mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
