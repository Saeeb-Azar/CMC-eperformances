import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import { Building2, Plus, Search, MoreVertical } from 'lucide-react';
import { api, type TenantRead } from '../../services/api';

const planBadge: Record<string, string> = {
  starter: 'badge badge--neutral',
  pro: 'badge badge--info',
  enterprise: 'badge badge--accent',
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

export default function ControlTenantsPage() {
  const { t } = useTranslation();
  const [tenants, setTenants] = useState<TenantRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listTenants()
      .then((ts) => { if (!cancelled) { setTenants(ts); setLoading(false); } })
      .catch(() => { if (!cancelled) { setTenants([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const filtered = tenants.filter((ten) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ten.name.toLowerCase().includes(q) || ten.slug.toLowerCase().includes(q);
  });

  return (
    <div>
      <Topbar title={t('control.tenants.title')} subtitle={t('control.tenants.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('control.tenants.pageTitle')}</h1>
            <p className="page-header__desc">{t('control.tenants.pageDesc')}</p>
          </div>
          <button className="btn btn--primary btn--lg"><Plus size={16} /> {t('control.tenants.addTenant')}</button>
        </div>

        {/* Stats */}
        <div className="grid-4 gap-4">
          {[
            { label: t('control.tenants.totalTenants'), value: tenants.length },
            { label: t('control.tenants.activeTenants'), value: tenants.filter(t => t.is_active).length },
            { label: 'Enterprise', value: tenants.filter(t => t.plan === 'enterprise').length },
            { label: 'Pro', value: tenants.filter(t => t.plan === 'pro').length },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('control.tenants.searchPlaceholder')}
            className="input input--with-icon"
          />
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t('control.tenants.company')}</th>
                <th style={{ width: 100 }}>{t('common.plan')}</th>
                <th style={{ width: 80 }}>{t('common.status')}</th>
                <th style={{ width: 100 }}>{t('common.created')}</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">{t('common.noData')}</td></tr>
              ) : (
                filtered.map(ten => (
                  <tr key={ten.id}>
                    <td>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${ten.is_active ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                        <Building2 size={16} className={ten.is_active ? 'text-emerald-600' : 'text-gray-400'} />
                      </div>
                    </td>
                    <td>
                      <span className="cell-primary block">{ten.name}</span>
                      <span className="cell-muted block mt-0.5">{ten.slug}</span>
                    </td>
                    <td><span className={planBadge[ten.plan] ?? 'badge badge--neutral'}>{ten.plan}</span></td>
                    <td><StatusBadge status={ten.is_active ? 'RUNNING' : 'STOP'} /></td>
                    <td><span className="cell-muted">{formatDate(ten.created_at)}</span></td>
                    <td><button className="btn-icon"><MoreVertical size={14} /></button></td>
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
