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
  healthy: { color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400', label: 'OK' },
  warning: { color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-400', label: 'Warning' },
  error:   { color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-400', label: 'Error' },
  offline: { color: 'text-gray-400', bg: 'bg-gray-50', dot: 'bg-gray-300', label: 'Offline' },
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

      {/* System status table */}
      <div className="px-8 py-4">
        <table className="w-full">
          <tbody>
            {indicators.map((ind) => {
              const st = statusMap[ind.status];
              return (
                <tr key={ind.label} className="border-b border-gray-50 last:border-b-0">
                  <td className="py-3 pr-3" style={{ width: 32 }}>
                    <span className={`${st.color}`}>{ind.icon}</span>
                  </td>
                  <td className="py-3 text-sm text-gray-600">{ind.label}</td>
                  <td className="py-3 text-right">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${st.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Metrics */}
      <div className="px-8 py-4 border-t border-gray-100">
        <table className="w-full">
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="py-2.5 text-sm text-gray-500">Packages today</td>
              <td className="py-2.5 text-sm font-semibold text-gray-900 text-right tabular-nums">{packagesTotal}</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-2.5 text-sm text-gray-500">Successful</td>
              <td className="py-2.5 text-sm font-semibold text-emerald-600 text-right tabular-nums">{packagesSuccess}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-sm text-gray-500">Rejected</td>
              <td className="py-2.5 text-sm font-semibold text-amber-600 text-right tabular-nums">{packagesRejected}</td>
            </tr>
          </tbody>
        </table>
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
