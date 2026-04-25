import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import DataTable, { type Column, type FilterState } from '../../components/ui/DataTable';
import { UserCircle, Plus, MoreVertical } from 'lucide-react';
import { api, type UserRead, type TenantRead } from '../../services/api';

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function ControlUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [tenants, setTenants] = useState<TenantRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({ role: [], active: [], tenant: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.listUsers(), api.listTenants()]).then(([u, ts]) => {
      if (cancelled) return;
      if (u.status === 'fulfilled') setUsers(u.value);
      if (ts.status === 'fulfilled') setTenants(ts.value);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const tenantById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ten of tenants) map.set(ten.id, ten.name);
    return map;
  }, [tenants]);

  const roleBadge: Record<string, { label: string; cls: string }> = {
    super_admin: { label: t('roles.owner'), cls: 'badge badge--accent' },
    owner: { label: t('roles.owner'), cls: 'badge badge--accent' },
    tenant_admin: { label: t('roles.admin'), cls: 'badge badge--info' },
    admin: { label: t('roles.admin'), cls: 'badge badge--info' },
    operator: { label: t('roles.operator'), cls: 'badge badge--warning' },
    viewer: { label: t('roles.viewer'), cls: 'badge badge--neutral' },
  };

  const roles = useMemo(() => Array.from(new Set(users.map((u) => u.role))).sort(), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.full_name} ${u.email}`.toLowerCase().includes(q)) return false;
      const roleSel = filterState.role ?? [];
      if (roleSel.length > 0 && !roleSel.includes(u.role)) return false;
      const tenantSel = filterState.tenant ?? [];
      if (tenantSel.length > 0 && !tenantSel.includes(u.tenant_id)) return false;
      const activeSel = filterState.active ?? [];
      if (activeSel.length > 0) {
        const wantActive = activeSel.includes('active');
        const wantInactive = activeSel.includes('inactive');
        if (u.is_active && !wantActive) return false;
        if (!u.is_active && !wantInactive) return false;
      }
      return true;
    });
  }, [users, search, filterState]);

  const columns: Column<UserRead>[] = [
    {
      key: 'icon',
      header: '',
      width: 56,
      render: () => (
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          <UserCircle size={18} className="text-gray-400" />
        </div>
      ),
    },
    {
      key: 'user',
      header: t('control.users.user'),
      render: (u) => (
        <div>
          <span className="cell-primary block">{u.full_name}</span>
          <span className="cell-muted block mt-0.5">{u.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('common.role'),
      width: 130,
      render: (u) => {
        const rb = roleBadge[u.role] ?? { label: u.role, cls: 'badge badge--neutral' };
        return <span className={rb.cls}>{rb.label}</span>;
      },
    },
    {
      key: 'tenant',
      header: t('control.users.tenant'),
      width: 200,
      render: (u) => tenantById.get(u.tenant_id) ?? <span className="cell-muted">{u.tenant_id.slice(0, 8)}</span>,
    },
    {
      key: 'lastLogin',
      header: t('common.lastLogin'),
      width: 160,
      render: (u) => <span className="cell-mono">{formatLogin(u.last_login)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      width: 110,
      render: (u) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.is_active ? 'text-emerald-600' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
          {u.is_active ? t('common.active') : t('common.inactive')}
        </span>
      ),
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
      <Topbar title={t('control.users.title')} subtitle={t('control.users.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('control.users.pageTitle')}</h1>
            <p className="page-header__desc">{t('control.users.pageDesc')}</p>
          </div>
          <button className="btn btn--primary btn--lg"><Plus size={16} /> {t('control.users.addUser')}</button>
        </div>

        <DataTable
          title={t('control.users.title')}
          totalCount={users.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(u) => String(u.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('control.users.searchPlaceholder')}
          filterGroups={[
            {
              key: 'role',
              label: t('common.role'),
              options: roles.map((r) => ({ value: r, label: roleBadge[r]?.label ?? r })),
            },
            {
              key: 'active',
              label: t('common.status'),
              options: [
                { value: 'active', label: t('common.active') },
                { value: 'inactive', label: t('common.inactive') },
              ],
            },
            ...(tenants.length > 1
              ? [{
                  key: 'tenant',
                  label: t('table.tenant'),
                  options: tenants.map((ten) => ({ value: ten.id, label: ten.name })),
                }]
              : []),
          ]}
          filterState={filterState}
          onFilterChange={setFilterState}
          emptyMessage={loading ? t('common.loading') : users.length === 0 ? t('common.noData') : t('common.noMatch')}
        />
      </div>
    </div>
  );
}
