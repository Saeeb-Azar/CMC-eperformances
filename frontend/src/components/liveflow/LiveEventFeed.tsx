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

      {/* Table-style feed */}
      <div className="max-h-[560px] overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left pl-8 pr-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 border-b border-gray-100" style={{ width: 52 }}></th>
              <th className="text-left px-0 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 border-b border-gray-100">Event</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 border-b border-gray-100" style={{ width: 100 }}>Code</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 border-b border-gray-100" style={{ width: 120 }}>Reference</th>
              <th className="text-right pr-8 pl-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 border-b border-gray-100" style={{ width: 90 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-gray-400 text-sm">
                  Waiting for activity...
                </td>
              </tr>
            ) : (
              visible.map((event, idx) => {
                const sev = sevConfig[event.severity];
                const icon = icons[event.technicalCode] || fallbackIcons[event.severity];
                const isFirst = idx === 0;

                return (
                  <tr key={event.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="pl-8 pr-4 py-4">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${sev.bg} ${sev.color}`}>
                        {icon}
                      </div>
                    </td>
                    <td className="px-0 py-4">
                      <p className={`text-sm leading-relaxed ${isFirst ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                        {event.message}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs text-gray-400 font-mono">{event.technicalCode}</span>
                    </td>
                    <td className="px-4 py-4">
                      {event.referenceId ? (
                        <span className="text-xs text-gray-400 font-mono">{event.referenceId}</span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                    <td className="pr-8 pl-4 py-4 text-right">
                      <span className="text-xs text-gray-400 tabular-nums">{event.timestamp}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
