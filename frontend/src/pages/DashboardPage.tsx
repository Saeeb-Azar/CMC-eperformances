import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable, { type Column } from '../components/ui/DataTable';
import {
  Package, CheckCircle, XCircle, AlertTriangle,
  Activity, Server, Clock, TrendingUp,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import {
  api,
  type DashboardOverview,
  type ThroughputData,
  type StationTiming,
  type OrderStateListItem,
} from '../services/api';

const tooltipStyle = {
  background: '#18181b',
  border: 'none',
  borderRadius: '8px',
  color: '#f3f4f6',
  fontSize: '12px',
};

const formatHour = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export default function DashboardPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [throughput, setThroughput] = useState<ThroughputData[]>([]);
  const [timings, setTimings] = useState<StationTiming[]>([]);
  const [recent, setRecent] = useState<OrderStateListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [o, th, tm, rc] = await Promise.allSettled([
        api.dashboard(),
        api.throughput(24),
        api.timings(7),
        api.listOrders({ limit: '6' }),
      ]);
      if (cancelled) return;
      if (o.status === 'fulfilled') setOverview(o.value);
      if (th.status === 'fulfilled') setThroughput(th.value);
      if (tm.status === 'fulfilled') setTimings(tm.value);
      if (rc.status === 'fulfilled') setRecent(rc.value);
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const throughputChart = throughput.map((p) => ({
    hour: formatHour(p.timestamp),
    completed: p.completed,
    ejected: p.ejected,
    failed: p.failed,
  }));

  const timingsChart = timings.map((ts) => ({
    pair: `${ts.station_from} → ${ts.station_to}`,
    avg: Number(ts.avg_seconds.toFixed(1)),
  }));

  return (
    <div>
      <Topbar title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('dashboard.pageTitle')}</h1>
            <p className="page-header__desc">{t('dashboard.pageDesc')}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid-4 gap-4">
          <StatCard label={t('dashboard.ordersToday')} value={overview?.total_orders_today ?? 0} icon={<Package size={20} />} color="info" />
          <StatCard label={t('dashboard.completed')} value={overview?.completed_today ?? 0} sub={overview ? `${overview.success_rate_percent.toFixed(1)}%` : undefined} icon={<CheckCircle size={20} />} color="success" />
          <StatCard label={t('dashboard.ejected')} value={overview?.ejected_today ?? 0} sub={overview ? `${overview.reject_rate_percent.toFixed(1)}%` : undefined} icon={<AlertTriangle size={20} />} color="warning" />
          <StatCard label={t('dashboard.failed')} value={overview?.failed_today ?? 0} icon={<XCircle size={20} />} color="danger" />
        </div>

        {/* Second row KPIs */}
        <div className="grid-4 gap-4">
          <StatCard label={t('dashboard.activeOnConveyor')} value={overview?.active_on_conveyor ?? 0} icon={<Activity size={20} />} color="info" />
          <StatCard label={t('dashboard.machinesOnline')} value={overview ? `${overview.machines_online} / ${overview.machines_total}` : '—'} icon={<Server size={20} />} color="success" />
          <StatCard label={t('dashboard.avgProcessing')} value={overview?.avg_processing_time_seconds != null ? `${overview.avg_processing_time_seconds.toFixed(1)}s` : '—'} sub={t('dashboard.enqToEnd')} icon={<Clock size={20} />} />
          <StatCard label={t('dashboard.throughputHour')} value={throughput.length > 0 ? throughput[throughput.length - 1].total : 0} sub={t('dashboard.lastHour')} icon={<TrendingUp size={20} />} />
        </div>

        {/* Charts */}
        <div className="grid-2-1 gap-5">
          {/* Throughput chart */}
          <div className="panel">
            <div className="panel__header">
              <h3 className="panel__title">{t('dashboard.throughput24h')}</h3>
            </div>
            <div className="panel__body">
              {throughputChart.length === 0 ? (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-muted)', fontSize: 13 }}>
                  {t('common.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={throughputChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="completed" stackId="1" fill="#059669" fillOpacity={0.15} stroke="#059669" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="ejected" stackId="1" fill="#d97706" fillOpacity={0.15} stroke="#d97706" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="failed" stackId="1" fill="#dc2626" fillOpacity={0.15} stroke="#dc2626" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Station Timings */}
          <div className="panel">
            <div className="panel__header">
              <h3 className="panel__title">{t('dashboard.stationTimings')}</h3>
              <span className="panel__subtitle">{t('dashboard.average')}</span>
            </div>
            <div className="panel__body">
              {timingsChart.length === 0 ? (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-muted)', fontSize: 13 }}>
                  {t('common.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={timingsChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#d1d5db" unit="s" />
                    <YAxis dataKey="pair" type="category" tick={{ fontSize: 11 }} stroke="#d1d5db" width={90} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="avg" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <DashboardRecent recent={recent} />
      </div>
    </div>
  );
}

function DashboardRecent({ recent }: { recent: OrderStateListItem[] }) {
  const { t } = useTranslation();

  const columns: Column<OrderStateListItem>[] = [
    {
      key: 'reference',
      header: t('orders.reference'),
      render: (o) => <span className="cell-mono cell-primary">{o.reference_id}</span>,
    },
    {
      key: 'barcode',
      header: t('orders.barcode'),
      render: (o) => <span className="cell-mono">{o.barcode}</span>,
    },
    {
      key: 'state',
      header: t('orders.state'),
      width: 130,
      render: (o) => <StatusBadge status={o.state} />,
    },
    {
      key: 'time',
      header: t('orders.time'),
      width: 90,
      align: 'right',
      render: (o) => <span className="cell-muted tabular-nums">{formatTime(o.created_at)}</span>,
    },
  ];

  return (
    <DataTable
      title={t('dashboard.recentOrders')}
      subtitle={t('dashboard.last30min')}
      data={recent}
      columns={columns}
      rowKey={(o) => String(o.id)}
      emptyMessage={t('common.noData')}
    />
  );
}
