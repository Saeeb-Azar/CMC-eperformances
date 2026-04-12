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

const statusConfig = {
  healthy: { color: 'text-emerald-600', bg: 'bg-emerald-50 border border-emerald-100', label: 'OK' },
  warning: { color: 'text-amber-600', bg: 'bg-amber-50 border border-amber-100', label: 'Warning' },
  error: { color: 'text-red-600', bg: 'bg-red-50 border border-red-100', label: 'Error' },
  offline: { color: 'text-gray-400', bg: 'bg-gray-50 border border-gray-100', label: 'Offline' },
};

export default function MachineHealthPanel({
  machineName,
  indicators,
  packagesTotal,
  packagesSuccess,
  packagesRejected,
  uptimePercent,
}: MachineHealthPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Machine Health</h3>
        <span className="text-xs font-medium text-gray-400">{machineName}</span>
      </div>

      {/* Health indicators */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          {indicators.map((ind) => {
            const config = statusConfig[ind.status];
            return (
              <div
                key={ind.label}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl ${config.bg}`}
              >
                <span className={config.color}>{ind.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 leading-tight">{ind.label}</p>
                  <p className={`text-sm font-semibold leading-tight mt-0.5 ${config.color}`}>
                    {config.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Stats */}
      <div className="px-6 py-5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Packages today</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">{packagesTotal}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Successful</span>
          <span className="text-sm font-semibold text-emerald-600 tabular-nums">{packagesSuccess}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Rejected</span>
          <span className="text-sm font-semibold text-amber-600 tabular-nums">{packagesRejected}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500">Uptime (24h)</span>
            <span className="text-sm font-bold text-gray-900 tabular-nums">{uptimePercent}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-emerald-400 h-2 rounded-full transition-all"
              style={{ width: `${uptimePercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
