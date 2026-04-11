import Header from '../components/layout/Header';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Server,
  Clock,
  TrendingUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

// Demo data until backend is connected
const demoThroughput = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  completed: Math.floor(Math.random() * 40 + 20),
  ejected: Math.floor(Math.random() * 5),
  failed: Math.floor(Math.random() * 2),
}));

const demoTimings = [
  { pair: 'ENQ \u2192 IND', avg: 3.2 },
  { pair: 'IND \u2192 ACK', avg: 8.5 },
  { pair: 'ACK \u2192 LAB1', avg: 22.1 },
  { pair: 'LAB1 \u2192 END', avg: 6.8 },
];

const demoRejects = [
  { reason: 'too_large', count: 12, pct: 48 },
  { reason: 'label_mismatch', count: 7, pct: 28 },
  { reason: 'carrier_timeout', count: 4, pct: 16 },
  { reason: 'skipped_by_subsequent_end', count: 2, pct: 8 },
];

const recentOrders = [
  { id: '1', ref: 'ref-0487', barcode: '4062196101493', state: 'COMPLETED' as const, time: '14:32' },
  { id: '2', ref: 'ref-0486', barcode: 'M319991', state: 'COMPLETED' as const, time: '14:31' },
  { id: '3', ref: 'ref-0485', barcode: '4052400033054', state: 'LABELED' as const, time: '14:30' },
  { id: '4', ref: 'ref-0484', barcode: '8711319002345', state: 'EJECTED' as const, time: '14:29' },
  { id: '5', ref: 'ref-0483', barcode: '4062196101493', state: 'SCANNED' as const, time: '14:28' },
  { id: '6', ref: 'ref-0482', barcode: 'M320001', state: 'FAILED' as const, time: '14:25' },
];

export default function DashboardPage() {
  return (
    <div>
      <Header title="Dashboard" subtitle="Real-time overview of all machines" />

      <div className="p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Orders Today"
            value={487}
            sub="+12% vs yesterday"
            icon={<Package size={20} />}
            color="info"
          />
          <StatCard
            label="Completed"
            value={461}
            sub="94.7% success rate"
            icon={<CheckCircle size={20} />}
            color="success"
          />
          <StatCard
            label="Ejected"
            value={22}
            sub="4.5% reject rate"
            icon={<AlertTriangle size={20} />}
            color="warning"
          />
          <StatCard
            label="Failed"
            value={4}
            sub="Require resolution"
            icon={<XCircle size={20} />}
            color="danger"
          />
        </div>

        {/* Second row: Machine + Performance */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Active on Conveyor"
            value={3}
            sub="Across all machines"
            icon={<Activity size={20} />}
            color="info"
          />
          <StatCard
            label="Machines Online"
            value="2 / 3"
            sub="CW-001, CW-002 running"
            icon={<Server size={20} />}
            color="success"
          />
          <StatCard
            label="Avg. Processing Time"
            value="38.4s"
            sub="ENQ to END"
            icon={<Clock size={20} />}
            color="default"
          />
          <StatCard
            label="Throughput / Hour"
            value={32}
            sub="Last hour"
            icon={<TrendingUp size={20} />}
            color="default"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Throughput Chart */}
          <div className="col-span-2 bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-text-primary mb-4">Throughput (24h)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={demoThroughput}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    background: '#262526',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#e5e5e5',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="completed" stackId="1" fill="#4f8c5e" fillOpacity={0.3} stroke="#4f8c5e" />
                <Area type="monotone" dataKey="ejected" stackId="1" fill="#f59e0b" fillOpacity={0.3} stroke="#f59e0b" />
                <Area type="monotone" dataKey="failed" stackId="1" fill="#dc2626" fillOpacity={0.3} stroke="#dc2626" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Station Timings */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-text-primary mb-4">Station Timings (avg)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={demoTimings} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" unit="s" />
                <YAxis dataKey="pair" type="category" tick={{ fontSize: 11 }} stroke="#9ca3af" width={90} />
                <Tooltip
                  contentStyle={{
                    background: '#262526',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#e5e5e5',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="avg" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom row: Recent Orders + Reject Analysis */}
        <div className="grid grid-cols-3 gap-4">
          {/* Recent Orders */}
          <div className="col-span-2 bg-surface rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-text-primary">Recent Orders</h3>
            </div>
            <div className="divide-y divide-border-light">
              {recentOrders.map((order) => (
                <div key={order.id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-secondary transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-text-primary">{order.ref}</span>
                    <span className="text-xs text-text-muted">{order.barcode}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={order.state} />
                    <span className="text-xs text-text-muted w-12 text-right">{order.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reject Analysis */}
          <div className="bg-surface rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-text-primary">Reject Reasons (7d)</h3>
            </div>
            <div className="p-5 space-y-4">
              {demoRejects.map((r) => (
                <div key={r.reason}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-secondary">{r.reason.replace(/_/g, ' ')}</span>
                    <span className="text-text-primary font-medium">{r.count} ({r.pct}%)</span>
                  </div>
                  <div className="w-full bg-surface-tertiary rounded-full h-2">
                    <div
                      className="bg-warning h-2 rounded-full transition-all"
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
