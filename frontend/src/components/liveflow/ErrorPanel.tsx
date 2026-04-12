import { AlertTriangle, Clock, ChevronRight, Package } from 'lucide-react';

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
      <div className="bg-white border border-gray-200 rounded-2xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Issues</h3>
        </div>
        <div className="px-6 py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <Package size={20} className="text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-gray-600">No issues right now</p>
          <p className="text-xs text-gray-400 mt-1">Everything is running smoothly</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Issues</h3>
        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full">
          {errors.length} active
        </span>
      </div>

      {/* Error items */}
      <div>
        {errors.map((err, idx) => (
          <div
            key={err.id}
            className={`px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer group ${
              idx < errors.length - 1 ? 'border-b border-gray-50' : ''
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                  err.severity === 'error'
                    ? 'bg-red-50 text-red-500 border border-red-100'
                    : 'bg-amber-50 text-amber-500 border border-amber-100'
                }`}
              >
                <AlertTriangle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{err.title}</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  {err.description}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {err.barcode && (
                    <span className="text-xs text-gray-400 font-mono">{err.barcode}</span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={10} />
                    {err.timestamp}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
