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
  const metrics = [
    { label: 'Packages today', value: packagesTotal, color: 'text-gray-900' },
    { label: 'Successful', value: packagesSuccess, color: 'text-emerald-600' },
    { label: 'Rejected', value: packagesRejected, color: 'text-amber-600' },
  ];

  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Machine Health</h3>
        <span className="text-xs text-gray-400">{machineName}</span>
      </div>

      {/* System status - section header */}
      <div className="mx-6 mt-5 mb-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">System Status</span>
      </div>

      {/* Indicators as table rows */}
      {indicators.map((ind) => {
        const st = statusMap[ind.status];
        return (
          <div key={ind.label} className="mx-6 py-3 flex items-center border-b border-gray-100 last:border-b-0">
            <span className={`flex-shrink-0 ${st.color}`}>{ind.icon}</span>
            <span className="text-sm text-gray-600 ml-3 flex-1">{ind.label}</span>
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${st.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {st.label}
            </span>
          </div>
        );
      })}

      {/* Metrics - section header */}
      <div className="mx-6 mt-5 mb-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Performance</span>
      </div>

      {/* Metrics rows */}
      {metrics.map((row) => (
        <div key={row.label} className="mx-6 py-3 flex items-center justify-between border-b border-gray-100 last:border-b-0">
          <span className="text-sm text-gray-500">{row.label}</span>
          <span className={`text-sm font-semibold tabular-nums ${row.color}`}>{row.value}</span>
        </div>
      ))}

      {/* Uptime */}
      <div className="mx-6 mt-4 mb-6">
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
