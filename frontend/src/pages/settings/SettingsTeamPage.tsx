import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import { UserCircle, Plus, Search, MoreVertical } from 'lucide-react';
import { api, type UserRead } from '../../services/api';

const formatLogin = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function SettingsTeamPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

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

        {/* Stats */}
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

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('settings.team.searchPlaceholder')}
            className="input input--with-icon"
          />
        </div>

        {/* Team table */}
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t('common.member')}</th>
                <th style={{ width: 110 }}>{t('common.role')}</th>
                <th style={{ width: 150 }}>{t('common.lastLogin')}</th>
                <th style={{ width: 80 }}>{t('common.status')}</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">{t('common.noData')}</td></tr>
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
