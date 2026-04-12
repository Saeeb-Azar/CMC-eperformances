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

interface ErrorPanelProps {
  errors: ErrorItem[];
}

export default function ErrorPanel({ errors }: ErrorPanelProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg">
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Issues</h3>
        {errors.length > 0 && (
          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-sm">
            {errors.length}
          </span>
        )}
      </div>

      {errors.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CheckCircle2 size={20} className="text-green-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">No issues</p>
          <p className="text-xs text-zinc-400 mt-0.5">Everything running smoothly</p>
        </div>
      ) : (
        <div>
          {errors.map((err, idx) => (
            <div
              key={err.id}
              className={`px-5 py-3.5 flex items-start gap-3 hover:bg-zinc-50 transition-colors cursor-pointer group ${
                idx < errors.length - 1 ? 'border-b border-zinc-50' : ''
              }`}
            >
              <AlertTriangle
                size={15}
                className={`flex-shrink-0 mt-0.5 ${err.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900">{err.title}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{err.description}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {err.barcode && <code className="text-[11px] text-zinc-400 font-mono">{err.barcode}</code>}
                  <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                    <Clock size={9} /> {err.timestamp}
                  </span>
                </div>
              </div>
              <ChevronRight size={14} className="text-zinc-300 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
