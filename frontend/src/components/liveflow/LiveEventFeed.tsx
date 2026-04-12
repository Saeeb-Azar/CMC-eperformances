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

const sevColor = {
  info: 'text-blue-500',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
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

      <div className="max-h-[520px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-5 py-16 text-center text-gray-400 text-sm">Waiting for activity...</div>
        ) : (
          visible.map((event) => {
            const icon = icons[event.technicalCode] || fallbackIcons[event.severity];
            const color = sevColor[event.severity];
            return (
              <div key={event.id} className="px-5 py-3.5 flex items-start gap-3.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors">
                <span className={`mt-0.5 flex-shrink-0 ${color}`}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 leading-relaxed">{event.message}</p>
                  <div className="flex items-center gap-2.5 mt-1">
                    <span className="text-xs text-gray-400 tabular-nums">{event.timestamp}</span>
                    <span className="text-xs text-gray-300 font-mono">{event.technicalCode}</span>
                    {event.referenceId && <span className="text-xs text-gray-300 font-mono">{event.referenceId}</span>}
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
