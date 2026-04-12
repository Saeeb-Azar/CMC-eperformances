import { AlertTriangle, Clock, ChevronRight, CheckCircle2 } from 'lucide-react';

export interface ErrorItem {
  id: string;
  title: string;
  description: string;
  barcode?: string;
  referenceId?: string;
  timestamp: string;
  severity: 'warning' | 'error';
}

interface ErrorPanelProps { errors: ErrorItem[]; }

export default function ErrorPanel({ errors }: ErrorPanelProps) {
  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Issues</h3>
        {errors.length > 0 && (
          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
            {errors.length}
          </span>
        )}
      </div>

      {errors.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <CheckCircle2 size={20} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No issues right now</p>
          <p className="text-xs text-gray-400 mt-0.5">Everything running smoothly</p>
        </div>
      ) : (
        <div>
          {errors.map((err, idx) => (
            <div
              key={err.id}
              className={`px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors cursor-pointer group ${
                idx < errors.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <AlertTriangle
                size={16}
                className={`flex-shrink-0 mt-0.5 ${err.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{err.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{err.description}</p>
                <div className="flex items-center gap-2.5 mt-2">
                  {err.barcode && <code className="text-[11px] text-gray-400 font-mono">{err.barcode}</code>}
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Clock size={10} /> {err.timestamp}
                  </span>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-300 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
