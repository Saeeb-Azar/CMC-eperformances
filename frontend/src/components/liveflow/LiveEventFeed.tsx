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

const sevConfig = {
  info:    { color: 'text-blue-500',    bg: 'bg-blue-50',    line: 'bg-blue-200' },
  success: { color: 'text-emerald-500', bg: 'bg-emerald-50', line: 'bg-emerald-200' },
  warning: { color: 'text-amber-500',   bg: 'bg-amber-50',   line: 'bg-amber-200' },
  error:   { color: 'text-red-500',     bg: 'bg-red-50',     line: 'bg-red-200' },
};

const icons: Record<string, React.ReactNode> = {
  ENQ: <ScanBarcode size={14} />, IND: <LogIn size={14} />, ACK: <Ruler size={14} />,
  INV: <FileText size={14} />, LAB: <Tag size={14} />, LAB1: <Tag size={14} />,
  END: <CheckCircle size={14} />, REM: <Trash2 size={14} />, HBT: <Wifi size={14} />,
};

const fallbackIcons: Record<string, React.ReactNode> = {
  info: <Info size={14} />, success: <CheckCircle size={14} />,
  warning: <XCircle size={14} />, error: <XCircle size={14} />,
};

export default function LiveEventFeed({ events, maxVisible = 14 }: LiveEventFeedProps) {
  const visible = events.slice(0, maxVisible);

  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Live Activity</h3>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>

      <div className="px-6 py-5 max-h-[560px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Waiting for activity...</div>
        ) : (
          <div className="relative">
            {/* Timeline vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-100" />

            <div className="space-y-0">
              {visible.map((event, idx) => {
                const sev = sevConfig[event.severity];
                const icon = icons[event.technicalCode] || fallbackIcons[event.severity];
                const isFirst = idx === 0;

                return (
                  <div key={event.id} className="relative flex gap-4 py-3.5 group">
                    {/* Timeline node */}
                    <div className="relative z-10 flex-shrink-0">
                      <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center ${sev.bg} ${sev.color} ${isFirst ? 'ring-2 ring-white shadow-sm' : ''}`}>
                        {icon}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-relaxed ${isFirst ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                            {event.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-gray-300 font-mono">{event.technicalCode}</span>
                            {event.referenceId && (
                              <span className="text-xs text-gray-300 font-mono">{event.referenceId}</span>
                            )}
                          </div>
                        </div>

                        {/* Timestamp right-aligned */}
                        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0 pt-0.5">
                          {event.timestamp}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
