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
  info:    { color: 'text-blue-500',    bg: 'bg-blue-50' },
  success: { color: 'text-emerald-500', bg: 'bg-emerald-50' },
  warning: { color: 'text-amber-500',   bg: 'bg-amber-50' },
  error:   { color: 'text-red-500',     bg: 'bg-red-50' },
};

const icons: Record<string, React.ReactNode> = {
  ENQ: <ScanBarcode size={13} />, IND: <LogIn size={13} />, ACK: <Ruler size={13} />,
  INV: <FileText size={13} />, LAB: <Tag size={13} />, LAB1: <Tag size={13} />,
  END: <CheckCircle size={13} />, REM: <Trash2 size={13} />, HBT: <Wifi size={13} />,
};

const fallbackIcons: Record<string, React.ReactNode> = {
  info: <Info size={13} />, success: <CheckCircle size={13} />,
  warning: <XCircle size={13} />, error: <XCircle size={13} />,
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

      <div className="max-h-[560px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-8 py-16 text-center text-gray-400 text-sm">Waiting for activity...</div>
        ) : (
          visible.map((event, idx) => {
            const sev = sevConfig[event.severity];
            const icon = icons[event.technicalCode] || fallbackIcons[event.severity];
            const isFirst = idx === 0;

            return (
              <div
                key={event.id}
                className="mx-6 py-4 flex items-center gap-3 border-b border-gray-100 last:border-b-0"
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.bg} ${sev.color}`}>
                  {icon}
                </div>

                {/* Event text - takes remaining space */}
                <div className="flex-1 min-w-0 mr-2">
                  <p className={`text-sm leading-snug truncate ${isFirst ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                    {event.message}
                  </p>
                </div>

                {/* Meta: code + ref + time in a tight group */}
                <div className="flex items-center gap-5 flex-shrink-0">
                  <span className="text-xs text-gray-400 font-mono w-8">
                    {event.technicalCode}
                  </span>
                  <span className="text-xs text-gray-400 font-mono w-16">
                    {event.referenceId || '—'}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums w-14 text-right">
                    {event.timestamp}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
