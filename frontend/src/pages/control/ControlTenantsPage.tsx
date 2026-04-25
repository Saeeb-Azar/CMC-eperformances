import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import DataTable, { type Column, type FilterState } from '../../components/ui/DataTable';
import { Building2, Plus, MoreVertical } from 'lucide-react';
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
  const [filterState, setFilterState] = useState<FilterState>({ plan: [], active: [] });

  useEffect(() => {
    let cancelled = false;
    api.listTenants()
      .then((ts) => { if (!cancelled) { setTenants(ts); setLoading(false); } })
      .catch(() => { if (!cancelled) { setTenants([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const plans = useMemo(() => Array.from(new Set(tenants.map((t) => t.plan))).sort(), [tenants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((ten) => {
      if (q && !`${ten.name} ${ten.slug}`.toLowerCase().includes(q)) return false;
      const planSel = filterState.plan ?? [];
      if (planSel.length > 0 && !planSel.includes(ten.plan)) return false;
      const activeSel = filterState.active ?? [];
      if (activeSel.length > 0) {
        const wantActive = activeSel.includes('active');
        const wantInactive = activeSel.includes('inactive');
        if (ten.is_active && !wantActive) return false;
        if (!ten.is_active && !wantInactive) return false;
      }
      return true;
    });
  }, [tenants, search, filterState]);

  const columns: Column<TenantRead>[] = [
    {
      key: 'icon',
      header: '',
      width: 56,
      render: (ten) => (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${ten.is_active ? 'bg-emerald-50' : 'bg-gray-100'}`}>
          <Building2 size={16} className={ten.is_active ? 'text-emerald-600' : 'text-gray-400'} />
        </div>
      ),
    },
    {
      key: 'company',
      header: t('control.tenants.company'),
      render: (ten) => (
        <div>
          <span className="cell-primary block">{ten.name}</span>
          <span className="cell-muted block mt-0.5">{ten.slug}</span>
        </div>
      ),
    },
    {
      key: 'plan',
      header: t('common.plan'),
      width: 110,
      render: (ten) => <span className={planBadge[ten.plan] ?? 'badge badge--neutral'}>{ten.plan}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      width: 110,
      render: (ten) => <StatusBadge status={ten.is_active ? 'RUNNING' : 'STOP'} />,
    },
    {
      key: 'created',
      header: t('common.created'),
      width: 120,
      render: (ten) => <span className="cell-muted">{formatDate(ten.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 48,
      render: () => (
        <button type="button" className="btn-icon" onClick={(e) => e.stopPropagation()}>
          <MoreVertical size={14} />
        </button>
      ),
    },
  ];

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

        <DataTable
          title={t('control.tenants.title')}
          totalCount={tenants.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(ten) => String(ten.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('control.tenants.searchPlaceholder')}
          filterGroups={[
            {
              key: 'plan',
              label: t('common.plan'),
              options: plans.map((p) => ({ value: p, label: t(`plans.${p}`, p) })),
            },
            {
              key: 'active',
              label: t('common.status'),
              options: [
                { value: 'active', label: t('common.active') },
                { value: 'inactive', label: t('common.inactive') },
              ],
            },
          ]}
          filterState={filterState}
          onFilterChange={setFilterState}
          emptyMessage={loading ? t('common.loading') : tenants.length === 0 ? t('common.noData') : t('common.noMatch')}
        />
      </div>
    </div>
  );
}
