import Topbar from '../components/layout/Topbar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter,
} from 'recharts';

const dimData = Array.from({ length: 50 }, () => ({
  length: Math.floor(Math.random() * 400 + 100),
  width: Math.floor(Math.random() * 300 + 80),
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
  { name: 'too large', value: 48 },
  { name: 'label mismatch', value: 28 },
  { name: 'carrier timeout', value: 16 },
  { name: 'skipped', value: 8 },
];
const COLORS = ['#d97706', '#dc2626', '#2563eb', '#9ca3af'];

const carrierPerf = [
  { carrier: 'DHL', avg_ms: 1200 },
  { carrier: 'DPD', avg_ms: 890 },
  { carrier: 'FedEx', avg_ms: 2100 },
  { carrier: 'GLS', avg_ms: 950 },
];

const tooltipStyle = { background: '#18181b', border: 'none', borderRadius: '8px', color: '#f3f4f6', fontSize: '12px' };

export default function AnalyticsPage() {
  return (
    <div>
      <Topbar title="Analytics" subtitle="Insights" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Analytics</h1>
            <p className="page-header__desc">Deep insights into machine performance and package data</p>
          </div>
        </div>

        <div className="grid-2 gap-5">
          <div className="panel">
            <div className="panel__header"><h3 className="panel__title">Weight Distribution (7d)</h3></div>
            <div className="panel__body">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weightDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel__header"><h3 className="panel__title">Reject Reasons (7d)</h3></div>
            <div className="panel__body">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={rejectPie} cx="50%" cy="50%" outerRadius={110} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {rejectPie.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid-2 gap-5">
          <div className="panel">
            <div className="panel__header"><h3 className="panel__title">3D Dimensions (L vs W)</h3></div>
            <div className="panel__body">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="length" name="Length" unit="mm" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <YAxis dataKey="width" name="Width" unit="mm" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Scatter data={dimData} fill="#2563eb" fillOpacity={0.5} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel__header"><h3 className="panel__title">Carrier Label Speed</h3><span className="panel__subtitle">avg ms</span></div>
            <div className="panel__body">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={carrierPerf}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="carrier" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" unit="ms" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avg_ms" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
