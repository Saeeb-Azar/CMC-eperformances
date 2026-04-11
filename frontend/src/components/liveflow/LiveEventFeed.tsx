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
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Live Activity</h3>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-text-muted">Live</span>
        </div>
      </div>

      <div className="divide-y divide-border-light max-h-[480px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center text-text-muted text-sm">
            Waiting for activity...
          </div>
        ) : (
          visible.map((event, idx) => {
            const severity = severityStyles[event.severity];
            const icon = eventIcons[event.technicalCode] || severity.icon;

            return (
              <div
                key={event.id}
                className={`px-5 py-3 flex items-start gap-3 transition-all duration-300 hover:bg-surface-secondary ${
                  idx === 0 ? 'bg-surface-secondary/50' : ''
                }`}
              >
                {/* Icon */}
                <div className={`p-1.5 rounded-lg mt-0.5 ${severity.bg} ${severity.text}`}>
                  {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary leading-relaxed">
                    {event.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-text-muted">{event.timestamp}</span>
                    <span className="text-[11px] text-text-muted font-mono opacity-50">
                      {event.technicalCode}
                    </span>
                    {event.referenceId && (
                      <span className="text-[11px] text-text-muted font-mono opacity-50">
                        {event.referenceId}
                      </span>
                    )}
                  </div>
                </div>

                {/* Severity dot */}
                <div className={`w-1.5 h-1.5 rounded-full mt-2 ${severity.dot}`} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
