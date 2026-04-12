import {
  ScanBarcode,
  LogIn,
  Ruler,
  Tag,
  CheckCircle,
  XCircle,
  Trash2,
  Wifi,
  FileText,
  Info,
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

const severityStyles = {
  info: { icon: <Info size={14} />, bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-400' },
  success: { icon: <CheckCircle size={14} />, bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  warning: { icon: <XCircle size={14} />, bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-400' },
  error: { icon: <XCircle size={14} />, bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
};

const eventIcons: Record<string, React.ReactNode> = {
  ENQ: <ScanBarcode size={14} />,
  IND: <LogIn size={14} />,
  ACK: <Ruler size={14} />,
  INV: <FileText size={14} />,
  LAB: <Tag size={14} />,
  LAB1: <Tag size={14} />,
  END: <CheckCircle size={14} />,
  REM: <Trash2 size={14} />,
  HBT: <Wifi size={14} />,
};

export default function LiveEventFeed({ events, maxVisible = 12 }: LiveEventFeedProps) {
  const visible = events.slice(0, maxVisible);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Live Activity</h3>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-gray-400">Live</span>
        </div>
      </div>

      {/* Events */}
      <div className="max-h-[520px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400 text-sm">
            Waiting for activity...
          </div>
        ) : (
          visible.map((event, idx) => {
            const severity = severityStyles[event.severity];
            const icon = eventIcons[event.technicalCode] || severity.icon;

            return (
              <div
                key={event.id}
                className={`px-6 py-4 flex items-start gap-4 transition-colors hover:bg-gray-50 ${
                  idx < visible.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                {/* Icon */}
                <div className={`p-2 rounded-lg flex-shrink-0 ${severity.bg} ${severity.text}`}>
                  {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 leading-relaxed">
                    {event.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-400">{event.timestamp}</span>
                    <span className="text-xs text-gray-300 font-mono">
                      {event.technicalCode}
                    </span>
                    {event.referenceId && (
                      <span className="text-xs text-gray-300 font-mono">
                        {event.referenceId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Severity indicator */}
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${severity.dot}`} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
