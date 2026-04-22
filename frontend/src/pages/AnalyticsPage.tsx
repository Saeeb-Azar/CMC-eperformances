import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  api,
  type DimensionStats,
  type WeightStats,
  type RejectAnalysis,
  type StationTiming,
} from '../services/api';

const COLORS = ['#d97706', '#dc2626', '#2563eb', '#9ca3af', '#059669', '#7c3aed'];
const tooltipStyle = { background: '#18181b', border: 'none', borderRadius: '8px', color: '#f3f4f6', fontSize: '12px' };

const EmptyChart = ({ label }: { label: string }) => (
  <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-muted)', fontSize: 13 }}>
    {label}
  </div>
);

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [dims, setDims] = useState<DimensionStats | null>(null);
  const [weights, setWeights] = useState<WeightStats | null>(null);
  const [rejects, setRejects] = useState<RejectAnalysis[]>([]);
  const [timings, setTimings] = useState<StationTiming[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [d, w, r, tm] = await Promise.allSettled([
        api.dimensions(7),
        api.weights(7),
        api.rejects(7),
        api.timings(7),
      ]);
      if (cancelled) return;
      if (d.status === 'fulfilled') setDims(d.value);
      if (w.status === 'fulfilled') setWeights(w.value);
      if (r.status === 'fulfilled') setRejects(r.value);
      if (tm.status === 'fulfilled') setTimings(tm.value);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const rejectChart = rejects.map((r) => ({ name: r.reason, value: r.count }));
  const timingChart = timings.map((ts) => ({
    pair: `${ts.station_from}→${ts.station_to}`,
    avg: Number(ts.avg_seconds.toFixed(1)),
  }));

  return (
    <div>
      <Topbar title={t('analytics.title')} subtitle={t('analytics.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('analytics.pageTitle')}</h1>
            <p className="page-header__desc">{t('analytics.pageDesc')}</p>
          </div>
        </div>

        <div className="grid-2 gap-5">
          {/* Weight stats */}
          <div className="panel">
            <div className="panel__header">
              <h3 className="panel__title">{t('analytics.weightDist')}</h3>
              {weights && <span className="panel__subtitle">{weights.total_weighed}</span>}
            </div>
            <div className="panel__body">
              {!weights || weights.total_weighed === 0 ? (
                <EmptyChart label={t('common.noData')} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Metric label="Ø Scale" value={weights.avg_weight_scale_g} unit="g" />
                  <Metric label="Ø Carton" value={weights.avg_weight_carton_g} unit="g" />
                  <Metric label="Ø Content" value={weights.avg_weight_content_g} unit="g" />
                  <Metric label="Min / Max" value={weights.min_weight_g != null && weights.max_weight_g != null ? `${weights.min_weight_g} / ${weights.max_weight_g}` : null} unit="g" />
                </div>
              )}
            </div>
          </div>

          {/* Rejects pie */}
          <div className="panel">
            <div className="panel__header"><h3 className="panel__title">{t('analytics.rejectReasons')}</h3></div>
            <div className="panel__body">
              {rejectChart.length === 0 ? (
                <EmptyChart label={t('common.noData')} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={rejectChart}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {rejectChart.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="grid-2 gap-5">
          {/* Dimension stats */}
          <div className="panel">
            <div className="panel__header">
              <h3 className="panel__title">{t('analytics.dimensions3d')}</h3>
              {dims && <span className="panel__subtitle">{dims.total_measured}</span>}
            </div>
            <div className="panel__body">
              {!dims || dims.total_measured === 0 ? (
                <EmptyChart label={t('common.noData')} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <Metric label={t('analytics.length')} value={dims.avg_length_mm} unit="mm" sub={dims.min_length_mm != null ? `${dims.min_length_mm}–${dims.max_length_mm}` : undefined} />
                  <Metric label={t('analytics.width')} value={dims.avg_width_mm} unit="mm" sub={dims.min_width_mm != null ? `${dims.min_width_mm}–${dims.max_width_mm}` : undefined} />
                  <Metric label="Height" value={dims.avg_height_mm} unit="mm" sub={dims.min_height_mm != null ? `${dims.min_height_mm}–${dims.max_height_mm}` : undefined} />
                </div>
              )}
            </div>
          </div>

          {/* Station timings */}
          <div className="panel">
            <div className="panel__header"><h3 className="panel__title">{t('analytics.carrierSpeed')}</h3><span className="panel__subtitle">avg s</span></div>
            <div className="panel__body">
              {timingChart.length === 0 ? (
                <EmptyChart label={t('common.noData')} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={timingChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="pair" tick={{ fontSize: 11 }} stroke="#d1d5db" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#d1d5db" unit="s" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="avg" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: number | string | null; unit?: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900 tabular-nums mt-1">
        {value == null ? '—' : typeof value === 'number' ? Math.round(value).toLocaleString() : value}
        {value != null && unit && <span className="text-sm text-gray-400 font-normal ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{sub}</p>}
    </div>
  );
}
