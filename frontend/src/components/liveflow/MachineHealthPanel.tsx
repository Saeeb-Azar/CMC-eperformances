interface HealthIndicator {
  label: string;
  status: 'healthy' | 'warning' | 'error' | 'offline';
  icon: React.ReactNode;
}

interface MachineHealthPanelProps {
  machineName: string;
  indicators: HealthIndicator[];
  packagesTotal: number;
  packagesSuccess: number;
  packagesRejected: number;
  uptimePercent: number;
}

const statusMap = {
  healthy: { color: 'text-emerald-600', dot: 'bg-emerald-400', label: 'OK' },
  warning: { color: 'text-amber-600', dot: 'bg-amber-400', label: 'Warning' },
  error:   { color: 'text-red-600', dot: 'bg-red-400', label: 'Error' },
  offline: { color: 'text-gray-400', dot: 'bg-gray-300', label: 'Offline' },
};

export default function MachineHealthPanel({
  machineName, indicators, packagesTotal, packagesSuccess, packagesRejected, uptimePercent,
}: MachineHealthPanelProps) {
  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Machine Health</h3>
        <span className="text-xs text-gray-400">{machineName}</span>
      </div>

      {/* Indicators */}
      <div className="px-8 py-4">
        {indicators.map((ind) => {
          const st = statusMap[ind.status];
          return (
            <div key={ind.label} className="flex items-center py-2.5 border-b border-gray-50 last:border-b-0">
              <span className={`flex-shrink-0 ${st.color}`}>{ind.icon}</span>
              <span className="text-sm text-gray-600 ml-3 flex-1">{ind.label}</span>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${st.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                {st.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Metrics */}
      <div className="px-8 py-4 border-t border-gray-100">
        {[
          { label: 'Packages today', value: packagesTotal, color: 'text-gray-900' },
          { label: 'Successful', value: packagesSuccess, color: 'text-emerald-600' },
          { label: 'Rejected', value: packagesRejected, color: 'text-amber-600' },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
            <span className="text-sm text-gray-500">{row.label}</span>
            <span className={`text-sm font-semibold tabular-nums ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Uptime */}
      <div className="px-8 py-4 border-t border-gray-100">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-500">Uptime (24h)</span>
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{uptimePercent}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded h-1.5">
          <div className="bg-emerald-500 h-1.5 rounded transition-all" style={{ width: `${uptimePercent}%` }} />
        </div>
      </div>
    </div>
  );
}
