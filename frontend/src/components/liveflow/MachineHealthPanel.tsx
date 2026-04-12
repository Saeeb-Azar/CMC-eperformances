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
  healthy: { color: 'text-green-600', label: 'OK' },
  warning: { color: 'text-amber-600', label: 'Warning' },
  error:   { color: 'text-red-600',   label: 'Error' },
  offline: { color: 'text-zinc-400',  label: 'Offline' },
};

export default function MachineHealthPanel({
  machineName, indicators, packagesTotal, packagesSuccess, packagesRejected, uptimePercent,
}: MachineHealthPanelProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Machine Health</h3>
        <span className="text-xs text-zinc-400 font-mono">{machineName}</span>
      </div>

      {/* Indicators */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-zinc-100">
        {indicators.map((ind) => {
          const st = statusMap[ind.status];
          return (
            <div key={ind.label} className="flex items-center gap-2.5">
              <span className={`flex-shrink-0 ${st.color}`}>{ind.icon}</span>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-sm text-zinc-500">{ind.label}</span>
                <span className={`text-sm font-semibold ${st.color}`}>{st.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="px-5 py-4">
        <div className="space-y-2.5">
          <div className="flex justify-between">
            <span className="text-sm text-zinc-500">Packages today</span>
            <span className="text-sm font-semibold text-zinc-900 tabular-nums">{packagesTotal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-500">Successful</span>
            <span className="text-sm font-semibold text-green-600 tabular-nums">{packagesSuccess}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-500">Rejected</span>
            <span className="text-sm font-semibold text-amber-600 tabular-nums">{packagesRejected}</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-100">
          <div className="flex justify-between mb-1.5">
            <span className="text-sm text-zinc-500">Uptime (24h)</span>
            <span className="text-sm font-semibold text-zinc-900 tabular-nums">{uptimePercent}%</span>
          </div>
          <div className="w-full bg-zinc-100 rounded-sm h-1.5">
            <div className="bg-green-600 h-1.5 rounded-sm transition-all" style={{ width: `${uptimePercent}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
