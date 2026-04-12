import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Package, CheckCircle, XCircle, AlertTriangle,
  Activity, Server, Clock, TrendingUp,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';

const demoThroughput = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  completed: Math.floor(Math.random() * 40 + 20),
  ejected: Math.floor(Math.random() * 5),
  failed: Math.floor(Math.random() * 2),
}));

const demoTimings = [
  { pair: 'ENQ → IND', avg: 3.2 },
  { pair: 'IND → ACK', avg: 8.5 },
  { pair: 'ACK → LAB1', avg: 22.1 },
  { pair: 'LAB1 → END', avg: 6.8 },
];

const recentOrders = [
  { id: '1', ref: 'ref-0487', barcode: '4062196101493', state: 'COMPLETED', time: '14:32' },
  { id: '2', ref: 'ref-0486', barcode: 'M319991', state: 'COMPLETED', time: '14:31' },
  { id: '3', ref: 'ref-0485', barcode: '4052400033054', state: 'LABELED', time: '14:30' },
  { id: '4', ref: 'ref-0484', barcode: '8711319002345', state: 'EJECTED', time: '14:29' },
  { id: '5', ref: 'ref-0483', barcode: '4062196101493', state: 'SCANNED', time: '14:28' },
  { id: '6', ref: 'ref-0482', barcode: 'M320001', state: 'FAILED', time: '14:25' },
];

const tooltipStyle = { background: '#18181b', border: 'none', borderRadius: '8px', color: '#f3f4f6', fontSize: '12px' };

export default function DashboardPage() {
  const { t } = useTranslation();

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

        {/* KPI Cards - big, readable */}
        <div className="grid-4 gap-4">
          <StatCard label={t('dashboard.ordersToday')} value={487} sub={t('dashboard.vsYesterday')} icon={<Package size={20} />} color="info" />
          <StatCard label={t('dashboard.completed')} value={461} sub={t('dashboard.successRate')} icon={<CheckCircle size={20} />} color="success" />
          <StatCard label={t('dashboard.ejected')} value={22} sub={t('dashboard.rejectRate')} icon={<AlertTriangle size={20} />} color="warning" />
          <StatCard label={t('dashboard.failed')} value={4} sub={t('dashboard.requireResolution')} icon={<XCircle size={20} />} color="danger" />
        </div>

        {/* Second row KPIs */}
        <div className="grid-4 gap-4">
          <StatCard label={t('dashboard.activeOnConveyor')} value={3} sub={t('dashboard.acrossAllMachines')} icon={<Activity size={20} />} color="info" />
          <StatCard label={t('dashboard.machinesOnline')} value="2 / 3" sub="CW-001, CW-002" icon={<Server size={20} />} color="success" />
          <StatCard label={t('dashboard.avgProcessing')} value="38.4s" sub={t('dashboard.enqToEnd')} icon={<Clock size={20} />} />
          <StatCard label={t('dashboard.throughputHour')} value={32} sub={t('dashboard.lastHour')} icon={<TrendingUp size={20} />} />
        </div>

        {/* Charts */}
        <div className="grid-2-1 gap-5">
          {/* Throughput chart */}
          <div className="panel">
            <div className="panel__header">
              <h3 className="panel__title">{t('dashboard.throughput24h')}</h3>
            </div>
            <div className="panel__body">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={demoThroughput}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="completed" stackId="1" fill="#059669" fillOpacity={0.15} stroke="#059669" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="ejected" stackId="1" fill="#d97706" fillOpacity={0.15} stroke="#d97706" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="failed" stackId="1" fill="#dc2626" fillOpacity={0.15} stroke="#dc2626" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Station Timings */}
          <div className="panel">
            <div className="panel__header">
              <h3 className="panel__title">{t('dashboard.stationTimings')}</h3>
              <span className="panel__subtitle">{t('dashboard.average')}</span>
            </div>
            <div className="panel__body">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={demoTimings} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#d1d5db" unit="s" />
                  <YAxis dataKey="pair" type="category" tick={{ fontSize: 11 }} stroke="#d1d5db" width={90} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avg" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <div className="panel">
          <div className="panel__header">
            <h3 className="panel__title">{t('dashboard.recentOrders')}</h3>
            <span className="panel__subtitle">{t('dashboard.last30min')}</span>
          </div>
          <div>
            {recentOrders.map((order) => (
              <div key={order.id} className="px-8 py-[18px] flex items-center justify-between border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-5">
                  <span className="text-sm font-semibold font-mono text-gray-900">{order.ref}</span>
                  <span className="text-sm text-gray-400 font-mono">{order.barcode}</span>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={order.state} />
                  <span className="text-xs text-gray-400 tabular-nums w-12 text-right">{order.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
