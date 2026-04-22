import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import { Search } from 'lucide-react';
import { api, type AuditLogRead } from '../services/api';

const categories = ['ALL', 'machine_event', 'state_transition', 'user_action', 'error'];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const categoryBadge: Record<string, string> = {
  machine_event: 'badge badge--info',
  state_transition: 'badge badge--neutral',
  user_action: 'badge badge--success',
  error: 'badge badge--danger',
};

export default function AuditPage() {
  const { t } = useTranslation();
  const [activeCat, setActiveCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const params: Record<string, string> = { limit: '200' };
      if (activeCat !== 'ALL') params.category = activeCat;
      api.auditLogs(params)
        .then((l) => { if (!cancelled) { setLogs(l); setLoading(false); } })
        .catch(() => { if (!cancelled) { setLogs([]); setLoading(false); } });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeCat]);

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (log.detail || '').toLowerCase().includes(q) ||
      (log.reference_id || '').toLowerCase().includes(q) ||
      log.event_type.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Topbar title={t('audit.title')} subtitle={t('audit.subtitle')} />

      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('audit.pageTitle')}</h1>
            <p className="page-header__desc">{t('audit.pageDesc')}</p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-4">
          <div className="relative" style={{ maxWidth: 420 }}>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={t('audit.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="input input--with-icon" />
          </div>
          <div className="filter-tabs">
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCat(c)} className={`filter-tab ${activeCat === c ? 'filter-tab--active' : ''}`}>
                {c === 'ALL' ? t('common.all') : c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>{t('audit.time')}</th>
                <th>{t('audit.category')}</th>
                <th>{t('audit.event')}</th>
                <th>{t('audit.machineCol')}</th>
                <th>{t('audit.reference')}</th>
                <th>{t('audit.transition')}</th>
                <th>{t('audit.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{logs.length === 0 ? t('common.noData') : t('audit.noMatch')}</td></tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="cell-muted tabular-nums font-mono">{formatTime(log.timestamp)}</td>
                    <td><span className={categoryBadge[log.category] || 'badge badge--neutral'}>{log.category.replace(/_/g, ' ')}</span></td>
                    <td className="cell-primary"><span className="font-mono">{log.event_type}</span></td>
                    <td>{log.machine_id ? <span className="cell-mono">{log.machine_id}</span> : <span className="cell-empty">—</span>}</td>
                    <td>{log.reference_id ? <span className="cell-mono">{log.reference_id}</span> : <span className="cell-empty">—</span>}</td>
                    <td>
                      {log.previous_state && log.new_state ? (
                        <span className="cell-muted">{log.previous_state} <span className="cell-empty">→</span> <span className="cell-primary">{log.new_state}</span></span>
                      ) : log.new_state ? (
                        <span className="cell-primary">{log.new_state}</span>
                      ) : <span className="cell-empty">—</span>}
                    </td>
                    <td className="cell-muted">{log.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
