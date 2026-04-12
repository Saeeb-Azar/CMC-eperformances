import Topbar from '../../components/layout/Topbar';
import { Building2, Globe, Mail, Phone, MapPin, CreditCard } from 'lucide-react';

const planFeatures: Record<string, string[]> = {
  starter: ['1 Machine', 'Live Monitor only', '2 Users', 'Email support'],
  pro: ['Up to 5 Machines', 'Full analytics + DB', '25 Users', 'Priority support'],
  enterprise: ['Unlimited Machines', 'AI insights + API', 'Unlimited Users', 'Dedicated support'],
};

export default function SettingsCompanyPage() {
  const company = {
    name: 'Müller Versand GmbH',
    slug: 'mueller-versand',
    plan: 'pro',
    email: 'admin@mueller-versand.de',
    phone: '+49 211 123456',
    address: 'Industriestr. 12, 40215 Düsseldorf',
    website: 'www.mueller-versand.de',
    createdAt: '15.01.2026',
  };

  return (
    <div>
      <Topbar title="Company" subtitle="Settings" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Company</h1>
            <p className="page-header__desc">Company profile and subscription</p>
          </div>
        </div>

        <div className="grid-2-1 gap-6">
          {/* Company Info */}
          <div className="panel">
            <div className="panel__header">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-gray-500" />
                <h3 className="panel__title">Company Information</h3>
              </div>
            </div>
            <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="grid-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Company Name</label>
                  <input type="text" defaultValue={company.name} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Slug (URL)</label>
                  <input type="text" defaultValue={company.slug} className="input" style={{ fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
              <div className="grid-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Mail size={12} /> Email</label>
                  <input type="email" defaultValue={company.email} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Phone size={12} /> Phone</label>
                  <input type="tel" defaultValue={company.phone} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><MapPin size={12} /> Address</label>
                <input type="text" defaultValue={company.address} className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Globe size={12} /> Website</label>
                <input type="url" defaultValue={company.website} className="input" />
              </div>
              <div className="flex justify-end pt-2">
                <button className="btn btn--primary">Save Changes</button>
              </div>
            </div>
          </div>

          {/* Plan */}
          <div className="stack-6">
            <div className="panel">
              <div className="panel__header">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-gray-500" />
                  <h3 className="panel__title">Subscription</h3>
                </div>
              </div>
              <div className="panel__body">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center mb-5">
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wider">Current Plan</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1 capitalize">{company.plan}</p>
                </div>
                <ul className="space-y-2 mb-5">
                  {planFeatures[company.plan].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className="btn btn--secondary w-full">Upgrade Plan</button>
              </div>
            </div>

            <div className="panel" style={{ textAlign: 'center' }}>
              <div className="panel__body">
                <p className="text-xs text-gray-400">Member since</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{company.createdAt}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
