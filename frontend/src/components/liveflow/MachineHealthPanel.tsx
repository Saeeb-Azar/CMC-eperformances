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
  healthy: { color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'OK' },
  warning: { color: 'text-amber-500', bg: 'bg-amber-50', label: 'Warning' },
  error: { color: 'text-red-500', bg: 'bg-red-50', label: 'Error' },
  offline: { color: 'text-gray-400', bg: 'bg-gray-50', label: 'Offline' },
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
    <div className="bg-surface rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-text-primary">Machine Health</h3>
        <span className="text-xs text-text-muted">{machineName}</span>
      </div>

      {/* Health indicators */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {indicators.map((ind) => {
          const config = statusConfig[ind.status];
          return (
            <div
              key={ind.label}
              className={`flex items-center gap-2.5 p-3 rounded-xl ${config.bg}`}
            >
              <span className={config.color}>{ind.icon}</span>
              <div>
                <p className="text-xs text-text-secondary">{ind.label}</p>
                <p className={`text-xs font-medium ${config.color}`}>{config.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-text-secondary">Packages today</span>
          <span className="text-sm font-semibold text-text-primary">{packagesTotal}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-text-secondary">Successful</span>
          <span className="text-sm font-medium text-emerald-600">{packagesSuccess}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-text-secondary">Rejected</span>
          <span className="text-sm font-medium text-amber-600">{packagesRejected}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-text-secondary">Uptime (24h)</span>
          <span className="text-sm font-medium text-text-primary">{uptimePercent}%</span>
        </div>
        {/* Uptime bar */}
        <div className="w-full bg-surface-tertiary rounded-full h-1.5">
          <div
            className="bg-emerald-400 h-1.5 rounded-full transition-all"
            style={{ width: `${uptimePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
