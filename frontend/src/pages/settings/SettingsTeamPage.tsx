import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import DataTable, { type Column, type FilterState } from '../../components/ui/DataTable';
import { UserCircle, Plus, MoreVertical } from 'lucide-react';
import { api, type UserRead } from '../../services/api';

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function SettingsTeamPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({ role: [], active: [] });

  useEffect(() => {
    let cancelled = false;
    api.listUsers()
      .then((u) => { if (!cancelled) { setUsers(u); setLoading(false); } })
      .catch(() => { if (!cancelled) { setUsers([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const roleBadge: Record<string, { label: string; cls: string }> = {
    tenant_admin: { label: t('roles.admin'), cls: 'badge badge--info' },
    admin: { label: t('roles.admin'), cls: 'badge badge--info' },
    operator: { label: t('roles.operator'), cls: 'badge badge--warning' },
    viewer: { label: t('roles.viewer'), cls: 'badge badge--neutral' },
    super_admin: { label: t('roles.owner'), cls: 'badge badge--accent' },
  };

  const roles = useMemo(() => Array.from(new Set(users.map((u) => u.role))).sort(), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.full_name} ${u.email}`.toLowerCase().includes(q)) return false;
      const roleSel = filterState.role ?? [];
      if (roleSel.length > 0 && !roleSel.includes(u.role)) return false;
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
      key: 'member',
      header: t('common.member'),
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
      <Topbar title={t('settings.team.title')} subtitle={t('settings.team.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('settings.team.pageTitle')}</h1>
            <p className="page-header__desc">{t('settings.team.pageDesc')}</p>
          </div>
          <button className="btn btn--primary btn--lg"><Plus size={16} /> {t('settings.team.inviteMember')}</button>
        </div>

        <div className="grid-4 gap-4">
          {[
            { label: t('settings.team.teamMembers'), value: users.length },
            { label: t('settings.team.admins'), value: users.filter(u => u.role === 'admin' || u.role === 'tenant_admin').length },
            { label: t('settings.team.operators'), value: users.filter(u => u.role === 'operator').length },
            { label: t('common.active'), value: users.filter(u => u.is_active).length },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flexDirection: 'column', gap: '4px' }}>
              <span className="stat-card__label">{s.label}</span>
              <span className="stat-card__value">{s.value}</span>
            </div>
          ))}
        </div>

        <DataTable
          title={t('settings.team.teamMembers')}
          totalCount={users.length}
          data={loading ? [] : filtered}
          columns={columns}
          rowKey={(u) => String(u.id)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('settings.team.searchPlaceholder')}
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
          ]}
          filterState={filterState}
          onFilterChange={setFilterState}
          emptyMessage={loading ? t('common.loading') : users.length === 0 ? t('common.noData') : t('common.noMatch')}
        />
      </div>
    </div>
  );
}
