import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import { Building2, CreditCard } from 'lucide-react';
import { api, type UserRead, type TenantRead } from '../../services/api';

const planFeatures: Record<string, string[]> = {
  starter: ['1 Machine', 'Live Monitor only', '2 Users', 'Email support'],
  pro: ['Up to 5 Machines', 'Full analytics + DB', '25 Users', 'Priority support'],
  enterprise: ['Unlimited Machines', 'AI insights + API', 'Unlimited Users', 'Dedicated support'],
};

export default function SettingsCompanyPage() {
  const { t } = useTranslation();
  const [me, setMe] = useState<UserRead | null>(null);
  const [tenant, setTenant] = useState<TenantRead | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then(async (u) => {
        if (cancelled) return;
        setMe(u);
        try {
          const tenants = await api.listTenants();
          if (!cancelled) setTenant(tenants.find((t) => t.id === u.tenant_id) ?? null);
        } catch {
          /* user may not have tenant list access */
        }
      })
      .catch(() => { /* not authenticated */ });
    return () => { cancelled = true; };
  }, []);

  const plan = tenant?.plan ?? 'starter';
  const features = planFeatures[plan] ?? planFeatures.starter;
  const createdAt = tenant ? new Date(tenant.created_at).toLocaleDateString('de-DE') : '—';

  return (
    <div>
      <Topbar title={t('settings.company.title')} subtitle={t('settings.company.subtitle')} />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">{t('settings.company.pageTitle')}</h1>
            <p className="page-header__desc">{t('settings.company.pageDesc')}</p>
          </div>
        </div>

        <div className="grid-2-1 gap-6">
          {/* Company Info */}
          <div className="panel">
            <div className="panel__header">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-gray-500" />
                <h3 className="panel__title">{t('settings.company.companyInfo')}</h3>
              </div>
            </div>
            <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="grid-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.company.companyName')}</label>
                  <input type="text" defaultValue={tenant?.name ?? ''} className="input" key={tenant?.id ?? 'empty'} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.company.slug')}</label>
                  <input type="text" defaultValue={tenant?.slug ?? ''} className="input" style={{ fontFamily: 'var(--font-mono)' }} key={(tenant?.id ?? 'empty') + '-slug'} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.company.email')}</label>
                <input type="email" defaultValue={me?.email ?? ''} className="input" key={me?.id ?? 'empty-email'} readOnly />
              </div>
              <div className="flex justify-end pt-2">
                <button className="btn btn--primary">{t('common.saveChanges')}</button>
              </div>
            </div>
          </div>

          {/* Plan */}
          <div className="stack-6">
            <div className="panel">
              <div className="panel__header">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-gray-500" />
                  <h3 className="panel__title">{t('settings.company.subscription')}</h3>
                </div>
              </div>
              <div className="panel__body">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center mb-5">
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wider">{t('settings.company.currentPlan')}</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1 capitalize">{plan}</p>
                </div>
                <ul className="space-y-2 mb-5">
                  {features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className="btn btn--secondary w-full">{t('settings.company.upgradePlan')}</button>
              </div>
            </div>

            <div className="panel" style={{ textAlign: 'center' }}>
              <div className="panel__body">
                <p className="text-xs text-gray-400">{t('settings.company.memberSince')}</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{createdAt}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
