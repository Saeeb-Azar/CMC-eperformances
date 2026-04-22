import { useTranslation } from 'react-i18next';

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

export default function MachineHealthPanel({
  machineName, indicators, packagesTotal, packagesSuccess, packagesRejected, uptimePercent,
}: MachineHealthPanelProps) {
  const { t } = useTranslation();

  const statusMap = {
    healthy: { color: 'text-emerald-600', dot: 'bg-emerald-400', label: t('liveFlow.statusOk') },
    warning: { color: 'text-amber-600',   dot: 'bg-amber-400',   label: t('liveFlow.statusWarning') },
    error:   { color: 'text-red-600',     dot: 'bg-red-400',     label: t('liveFlow.statusError') },
    offline: { color: 'text-gray-400',    dot: 'bg-gray-300',    label: t('liveFlow.statusOffline') },
  };

  const metrics = [
    { label: t('liveFlow.packagesToday'), value: packagesTotal, color: 'text-gray-900' },
    { label: t('liveFlow.successful'),    value: packagesSuccess, color: 'text-emerald-600' },
    { label: t('liveFlow.rejected'),      value: packagesRejected, color: 'text-amber-600' },
  ];

  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">{t('liveFlow.machineHealth')}</h3>
        <span className="text-xs text-gray-400">{machineName}</span>
      </div>

      {/* System status table */}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 36 }}></th>
            <th>{t('liveFlow.component')}</th>
            <th style={{ width: 90 }} className="!text-right">{t('liveFlow.status')}</th>
          </tr>
        </thead>
        <tbody>
          {indicators.map((ind) => {
            const st = statusMap[ind.status];
            return (
              <tr key={ind.label}>
                <td><span className={st.color}>{ind.icon}</span></td>
                <td>{ind.label}</td>
                <td className="!text-right">
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

      {/* Metrics table */}
      <table className="table">
        <thead>
          <tr>
            <th>{t('liveFlow.metric')}</th>
            <th style={{ width: 80 }} className="!text-right">{t('liveFlow.value')}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="!text-right">
                <span className={`font-semibold tabular-nums ${row.color}`}>{row.value}</span>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <div className="flex items-center justify-between">
                <span>{t('liveFlow.uptime24h')}</span>
              </div>
            </td>
            <td className="!text-right">
              <span className="font-semibold tabular-nums text-gray-900">{uptimePercent}%</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Uptime bar */}
      <div className="mx-8 mb-6 mt-2">
        <div className="w-full bg-gray-100 rounded h-1.5">
          <div className="bg-emerald-500 h-1.5 rounded transition-all" style={{ width: `${uptimePercent}%` }} />
        </div>
      </div>
    </div>
  );
}
