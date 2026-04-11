import Topbar from '../components/layout/Topbar';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
} from 'recharts';

const dimData = Array.from({ length: 50 }, () => ({
  length: Math.floor(Math.random() * 400 + 100),
  width: Math.floor(Math.random() * 300 + 80),
  height: Math.floor(Math.random() * 200 + 50),
}));

const weightDist = [
  { range: '0-500g', count: 45 },
  { range: '500g-1kg', count: 120 },
  { range: '1-2kg', count: 180 },
  { range: '2-3kg', count: 85 },
  { range: '3-5kg', count: 40 },
  { range: '5kg+', count: 17 },
];

const rejectPie = [
  { name: 'too_large', value: 48 },
  { name: 'label_mismatch', value: 28 },
  { name: 'carrier_timeout', value: 16 },
  { name: 'skipped', value: 8 },
];
const COLORS = ['#f59e0b', '#dc2626', '#3b82f6', '#9ca3af'];

const carrierPerf = [
  { carrier: 'DHL', avg_ms: 1200, errors: 3 },
  { carrier: 'DPD', avg_ms: 890, errors: 1 },
  { carrier: 'FedEx', avg_ms: 2100, errors: 7 },
  { carrier: 'GLS', avg_ms: 950, errors: 2 },
];

export default function AnalyticsPage() {
  return (
    <div>
      <Topbar title="Analytics" subtitle="Deep insights into machine performance and package data" />

      <div className="page-content stack-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Weight distribution */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-text-primary mb-4">Weight Distribution (7d)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weightDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip contentStyle={{ background: '#262526', border: 'none', borderRadius: '8px', color: '#e5e5e5', fontSize: '12px' }} />
                <Bar dataKey="count" fill="#4f8c5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Reject reasons pie */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-text-primary mb-4">Reject Reasons (7d)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={rejectPie} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${(name ?? '').replace(/_/g, ' ')} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {rejectPie.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#262526', border: 'none', borderRadius: '8px', color: '#e5e5e5', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Dimension scatter */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-text-primary mb-4">3D Dimensions (L vs W) - 7d</h3>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="length" name="Length" unit="mm" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis dataKey="width" name="Width" unit="mm" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip contentStyle={{ background: '#262526', border: 'none', borderRadius: '8px', color: '#e5e5e5', fontSize: '12px' }} />
                <Scatter data={dimData} fill="#3b82f6" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Carrier performance */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-text-primary mb-4">Carrier Label Generation (avg ms)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={carrierPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="carrier" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" unit="ms" />
                <Tooltip contentStyle={{ background: '#262526', border: 'none', borderRadius: '8px', color: '#e5e5e5', fontSize: '12px' }} />
                <Bar dataKey="avg_ms" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
