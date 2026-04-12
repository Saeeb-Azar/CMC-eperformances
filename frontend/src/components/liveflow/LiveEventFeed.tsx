import {
  ScanBarcode, LogIn, Ruler, Tag, CheckCircle, XCircle,
  Trash2, Wifi, FileText, Info,
} from 'lucide-react';

export interface LiveEvent {
  id: string;
  message: string;
  technicalCode: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  barcode?: string;
  referenceId?: string;
}

interface LiveEventFeedProps {
  events: LiveEvent[];
  maxVisible?: number;
}

const sevColors = {
  info:    'text-blue-500',
  success: 'text-green-600',
  warning: 'text-amber-500',
  error:   'text-red-500',
};

const icons: Record<string, React.ReactNode> = {
  ENQ: <ScanBarcode size={13} />,
  IND: <LogIn size={13} />,
  ACK: <Ruler size={13} />,
  INV: <FileText size={13} />,
  LAB: <Tag size={13} />,
  LAB1: <Tag size={13} />,
  END: <CheckCircle size={13} />,
  REM: <Trash2 size={13} />,
  HBT: <Wifi size={13} />,
};

const fallback: Record<string, React.ReactNode> = {
  info: <Info size={13} />,
  success: <CheckCircle size={13} />,
  warning: <XCircle size={13} />,
  error: <XCircle size={13} />,
};

export default function LiveEventFeed({ events, maxVisible = 14 }: LiveEventFeedProps) {
  const visible = events.slice(0, maxVisible);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg">
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Live Activity</h3>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Live</span>
        </div>
      </div>

      <div className="max-h-[520px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center text-zinc-400 text-sm">
            Waiting for activity...
          </div>
        ) : (
          visible.map((event) => {
            const icon = icons[event.technicalCode] || fallback[event.severity];
            const color = sevColors[event.severity];

            return (
              <div
                key={event.id}
                className="px-5 py-3 flex items-start gap-3 border-b border-zinc-50 last:border-b-0 hover:bg-zinc-50/50 transition-colors"
              >
                <span className={`mt-0.5 flex-shrink-0 ${color}`}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-800 leading-relaxed">{event.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-zinc-400 tabular-nums">{event.timestamp}</span>
                    <span className="text-[11px] text-zinc-300 font-mono">{event.technicalCode}</span>
                    {event.referenceId && (
                      <span className="text-[11px] text-zinc-300 font-mono">{event.referenceId}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
