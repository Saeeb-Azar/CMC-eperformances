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
  healthy: { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'OK' },
  warning: { color: 'text-amber-600', bg: 'bg-amber-50', label: 'Warning' },
  error:   { color: 'text-red-600', bg: 'bg-red-50', label: 'Error' },
  offline: { color: 'text-gray-400', bg: 'bg-gray-50', label: 'Offline' },
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

      {/* Indicators grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-2.5">
        {indicators.map((ind) => {
          const st = statusMap[ind.status];
          return (
            <div key={ind.label} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg ${st.bg}`}>
              <span className={`flex-shrink-0 ${st.color}`}>{ind.icon}</span>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{ind.label}</p>
                <p className={`text-xs font-semibold ${st.color}`}>{st.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="px-5 py-4 border-t border-gray-100 space-y-2.5">
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Packages today</span>
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{packagesTotal}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Successful</span>
          <span className="text-sm font-semibold text-emerald-600 tabular-nums">{packagesSuccess}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Rejected</span>
          <span className="text-sm font-semibold text-amber-600 tabular-nums">{packagesRejected}</span>
        </div>
        <div className="pt-2.5 border-t border-gray-100">
          <div className="flex justify-between mb-1.5">
            <span className="text-sm text-gray-500">Uptime (24h)</span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{uptimePercent}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded transition-all" style={{ width: `${uptimePercent}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
