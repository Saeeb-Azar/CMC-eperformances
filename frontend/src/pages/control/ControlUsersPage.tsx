import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import { UserCircle, Plus, Search, MoreVertical } from 'lucide-react';
import { api, type UserRead, type TenantRead } from '../../services/api';

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function ControlUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [tenants, setTenants] = useState<TenantRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.listUsers(), api.listTenants()]).then(([u, t]) => {
      if (cancelled) return;
      if (u.status === 'fulfilled') setUsers(u.value);
      if (t.status === 'fulfilled') setTenants(t.value);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const tenantById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tenants) map.set(t.id, t.name);
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

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter && !(roleFilter === 'admin' && u.role === 'tenant_admin') && !(roleFilter === 'owner' && u.role === 'super_admin')) {
      return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

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

        {/* Filter + Search */}
        <div className="flex items-center justify-between">
          <div style={{ position: 'relative', width: 280 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('control.users.searchPlaceholder')}
              className="input input--with-icon"
            />
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: t('common.all') },
              { key: 'owner', label: t('roles.owner') },
              { key: 'admin', label: t('roles.admin') },
              { key: 'operator', label: t('roles.operator') },
              { key: 'viewer', label: t('roles.viewer') },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setRoleFilter(f.key)}
                className={`filter-tab ${roleFilter === f.key ? 'filter-tab--active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t('control.users.user')}</th>
                <th style={{ width: 110 }}>{t('common.role')}</th>
                <th style={{ width: 180 }}>{t('control.users.tenant')}</th>
                <th style={{ width: 150 }}>{t('common.lastLogin')}</th>
                <th style={{ width: 80 }}>{t('common.status')}</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.noData')}</td></tr>
              ) : (
                filtered.map(u => {
                  const rb = roleBadge[u.role] ?? { label: u.role, cls: 'badge badge--neutral' };
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                          <UserCircle size={18} className="text-gray-400" />
                        </div>
                      </td>
                      <td>
                        <span className="cell-primary block">{u.full_name}</span>
                        <span className="cell-muted block mt-0.5">{u.email}</span>
                      </td>
                      <td><span className={rb.cls}>{rb.label}</span></td>
                      <td>{tenantById.get(u.tenant_id) ?? <span className="cell-muted">{u.tenant_id.slice(0, 8)}</span>}</td>
                      <td><span className="cell-mono">{formatLogin(u.last_login)}</span></td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.is_active ? 'text-emerald-600' : 'text-gray-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                          {u.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td><button className="btn-icon"><MoreVertical size={14} /></button></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
