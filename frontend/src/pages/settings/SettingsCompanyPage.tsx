import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Topbar from '../../components/layout/Topbar';
import {
  Building2, CreditCard, Boxes, ShieldCheck, Loader2, Save, Copy,
  Clock, ListChecks, ShoppingCart, Server, Users, Zap, ChevronRight, Check, Infinity as InfinityIcon,
  RefreshCw, AlertTriangle, MapPin, Truck, Send,
} from 'lucide-react';
import { api, type UserRead, type TenantRead } from '../../services/api';
import type { TFunction } from 'i18next';

interface PulpoStatus {
  test_mode: boolean; configured: boolean; last_sync_at: string | null;
  last_sync_error: string | null; last_sync_error_at: string | null;
  open_orders: number; barcodes: number;
  locations: Record<string, number>; cache_locations: Record<string, number>;
}

function relTime(iso: string | null, t: TFunction): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return t('settings.company.relTime.seconds', { count: Math.max(1, Math.round(diff / 1000)) });
  if (diff < 3_600_000) return t('settings.company.relTime.minutes', { count: Math.round(diff / 60_000) });
  return t('settings.company.relTime.hours', { count: Math.round(diff / 3_600_000) });
}

export default function SettingsCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [me, setMe] = useState<UserRead | null>(null);
  const [tenant, setTenant] = useState<TenantRead | null>(null);
  const [status, setStatus] = useState<PulpoStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then(async (u) => {
        if (cancelled) return;
        setMe(u);
        try {
          const tenants = await api.listTenants();
          if (!cancelled) setTenant(tenants.find((x) => x.id === u.tenant_id) ?? null);
        } catch { /* no tenant list access */ }
      })
      .catch(() => { /* not authed */ });
    const load = () => api.getPulpoStatus().then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const testMode = status ? status.test_mode : true;

  const syncNow = async () => {
    setSyncing(true);
    try {
      await api.triggerPulpoResync();
      const s = await api.getPulpoStatus();
      setStatus(s);
    } catch { /* status poll will catch up */ } finally { setSyncing(false); }
  };

  const toggleTestMode = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await api.setPulpoSettings(next);
      setStatus((s) => (s ? { ...s, test_mode: res.test_mode } : s));
    } catch { /* keep */ } finally { setSaving(false); }
  };

  const plan = (tenant?.plan ?? 'starter');
  const createdAt = tenant ? new Date(tenant.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  return (
    <div>
      <Topbar title={t('settings.company.title')} subtitle={t('settings.company.subtitle')} />
      <div className="page-content">
        <div className="page-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: '#eef2ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={22} />
            </span>
            <div>
              <h1 className="page-header__title">{t('settings.company.pageTitle')}</h1>
              <p className="page-header__desc">{t('settings.company.headerDesc')}</p>
            </div>
          </div>
          <button className="modal-btn modal-btn--primary"><Save size={15} /> {t('common.save')}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start' }}>
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card icon={<Building2 size={16} />} title={t('settings.company.companyProfile')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FieldText label={t('settings.company.companyName')} value={tenant?.name ?? ''} />
                <FieldText label={t('settings.company.slug')} value={tenant?.slug ?? ''} mono copy />
              </div>
              <FieldText label={t('settings.company.email')} value={me?.email ?? ''} readOnly />
            </Card>

            <Card icon={<Boxes size={16} />} title={t('settings.company.pulpo.cardTitle')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
                <div style={{
                  padding: 16, borderRadius: 12,
                  background: testMode ? '#ecfdf5' : '#fff7ed',
                  border: `1px solid ${testMode ? '#a7f3d0' : '#fed7aa'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <ShieldCheck size={20} className={testMode ? 'text-emerald-600' : 'text-orange-500'} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                      {status?.configured ? t('settings.company.pulpo.connected') : t('settings.company.pulpo.notConfigured')}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                      background: testMode ? '#d1fae5' : '#ffedd5', color: testMode ? '#047857' : '#c2410c',
                    }}>{testMode ? t('settings.company.pulpo.testModeBadge') : t('settings.company.pulpo.liveBadge')}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                    {testMode
                      ? t('settings.company.pulpo.testModeDesc')
                      : t('settings.company.pulpo.liveModeDesc')}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
                  <Stat icon={<Clock size={15} />} label={t('settings.company.pulpo.lastSync')} value={relTime(status?.last_sync_at ?? null, t)} />
                  <Stat icon={<ListChecks size={15} />} label={t('settings.company.pulpo.barcodes')} value={String(status?.barcodes ?? 0)} />
                  <Stat icon={<ShoppingCart size={15} />} label={t('settings.company.pulpo.openOrders')} value={String(status?.open_orders ?? 0)} />
                  <button type="button" className="modal-btn modal-btn--ghost" onClick={syncNow} disabled={syncing}
                    style={{ justifyContent: 'center', gap: 6 }}>
                    <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
                    {syncing ? t('settings.company.pulpo.syncing') : t('settings.company.pulpo.syncNow')}
                  </button>
                </div>
              </div>
              {status?.last_sync_error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                  borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca',
                }}>
                  <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
                    <strong>{t('settings.company.pulpo.syncFailed')}</strong> ({relTime(status.last_sync_error_at, t)}) — {t('settings.company.pulpo.syncFailedDesc')}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>{status.last_sync_error}</div>
                  </div>
                </div>
              )}
              {status && (Object.keys(status.locations ?? {}).length > 0 || Object.keys(status.cache_locations ?? {}).length > 0) && (
                <LocationCompare live={status.locations ?? {}} cache={status.cache_locations ?? {}} />
              )}
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 14px', borderRadius: 10, border: '1px solid var(--clr-border)', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13, color: '#334155' }}>
                  <strong>{t('settings.company.pulpo.testModeToggle')}</strong> — {t('settings.company.pulpo.testModeToggleDesc')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {saving && <Loader2 size={14} className="animate-spin text-gray-400" />}
                  <input type="checkbox" checked={testMode} disabled={status === null || saving}
                    onChange={(e) => toggleTestMode(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                </span>
              </label>
            </Card>

            <DhlShippingCard t={t} />

            <Card icon={<Zap size={16} />} title={t('settings.company.quickAccess.title')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <QuickLink icon={<Server size={16} />} title={t('settings.company.quickAccess.machines')} sub={t('settings.company.quickAccess.machinesSub')} onClick={() => navigate('/machines')} />
                <QuickLink icon={<ListChecks size={16} />} title={t('settings.company.quickAccess.cwLists')} sub={t('settings.company.quickAccess.cwListsSub')} onClick={() => navigate('/')} />
                <QuickLink icon={<ShoppingCart size={16} />} title={t('settings.company.quickAccess.pulpoSettings')} sub={t('settings.company.quickAccess.pulpoSettingsSub')} onClick={() => navigate('/simulator')} />
                <QuickLink icon={<Users size={16} />} title={t('settings.company.quickAccess.users')} sub={t('settings.company.quickAccess.usersSub')} onClick={() => navigate('/control/users')} />
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card icon={<CreditCard size={16} />} title={t('settings.company.subscription')}>
              <div style={{
                borderRadius: 14, padding: 20, textAlign: 'center',
                background: 'linear-gradient(180deg,#eff6ff,#eef2ff)', border: '1px solid #dbeafe',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#1d4ed8' }}>{t('settings.company.currentPlan').toUpperCase()}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#d1fae5', color: '#047857', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Check size={11} /> {t('common.active')}
                  </span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#1d4ed8', textTransform: 'capitalize', marginTop: 4 }}>{t(`plans.${plan}`, { defaultValue: plan })}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 16 }}>
                  <Feature icon={<Server size={16} />} label={t('settings.company.featureMachines')} value={<InfinityIcon size={16} />} />
                  <Feature icon={<Users size={16} />} label={t('settings.company.featureUsers')} value={<InfinityIcon size={16} />} />
                  <Feature icon={<Zap size={16} />} label={t('settings.company.featureAiInsights')} value={t('common.active')} />
                  <Feature icon={<ShieldCheck size={16} />} label={t('settings.company.featureSupport')} value={t('settings.company.featureSupportValue')} />
                </div>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {[
                  t('settings.company.planFeatures.unlimitedMachines'),
                  t('settings.company.planFeatures.aiInsightsApi'),
                  t('settings.company.planFeatures.unlimitedUsers'),
                  t('settings.company.planFeatures.dedicatedSupport'),
                ].map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
                    <Check size={15} className="text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
              <button className="modal-btn modal-btn--ghost" style={{ width: '100%', justifyContent: 'center' }}>{t('settings.company.upgradePlan')}</button>
            </Card>

            <Card icon={<Clock size={16} />} title={t('settings.company.memberSince')}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{createdAt}</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/** DHL Versandlabel-Karte: Status, Test-Modus-Toggle, Test-Label-Button.
 *  Komplett analog zur Pulpo-Karte oben — Test-Modus AN heißt Mock-Tracking
 *  ohne API-Call, Test-Modus AUS schickt echte Sendungen (kostet Geld). */
function DhlShippingCard({ t }: { t: TFunction }) {
  type Status = Awaited<ReturnType<typeof api.getDhlStatus>>;
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<{ tracking: string; is_test: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.getDhlStatus().then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const testMode = status ? status.test_mode : true;
  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await api.setDhlSettings(next);
      setStatus((s) => (s ? { ...s, test_mode: res.test_mode } : s));
    } catch { /* lassen */ } finally { setSaving(false); }
  };
  const runTest = async () => {
    setTesting(true);
    setLastTest(null);
    try {
      const r = await api.createTestLabel({
        weight_g: 500, length_mm: 200, width_mm: 150, height_mm: 80,
        order_ref: 'TEST-' + Date.now(),
      });
      setLastTest({ tracking: r.tracking_number, is_test: r.is_test });
      const s = await api.getDhlStatus();
      setStatus(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastTest({ tracking: msg, is_test: true });
    } finally { setTesting(false); }
  };

  return (
    <Card icon={<Truck size={16} />} title={t('settings.company.dhl.cardTitle', 'Versand · DHL Parcel DE')}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={{
          padding: 16, borderRadius: 12,
          background: testMode ? '#ecfdf5' : '#fff7ed',
          border: `1px solid ${testMode ? '#a7f3d0' : '#fed7aa'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <ShieldCheck size={20} className={testMode ? 'text-emerald-600' : 'text-orange-500'} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {status?.configured
                ? t('settings.company.dhl.connected', 'DHL verbunden')
                : t('settings.company.dhl.notConfigured', 'DHL nicht konfiguriert')}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: testMode ? '#d1fae5' : '#ffedd5', color: testMode ? '#047857' : '#c2410c',
            }}>
              {testMode
                ? t('settings.company.dhl.testModeActive', 'Test-Modus aktiv')
                : t('settings.company.dhl.live', 'Live')}
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            {testMode
              ? t('settings.company.dhl.testModeDesc', 'Im Test-Modus werden KEINE echten DHL-Labels erstellt — nur Mock-Trackingnummern. Sobald produktiv geschaltet wird, kostet jede Sendung Geld.')
              : t('settings.company.dhl.liveDesc', 'Live-Modus: Bei LAB1 wird ein echtes DHL-Label erzeugt (kostenpflichtig). Tracking + ZPL/PDF werden gespeichert.')}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
          <Stat icon={<Clock size={15} />} label={t('settings.company.dhl.lastLabel', 'Letztes Label')} value={relTime(status?.last_label_at ?? null, t)} />
          <Stat icon={<ListChecks size={15} />} label={t('settings.company.dhl.shipmentsLive', 'Sendungen (live)')} value={String(status?.shipments_live ?? 0)} />
          <Stat icon={<ShoppingCart size={15} />} label={t('settings.company.dhl.shipmentsTotal', 'Sendungen gesamt')} value={String(status?.shipments_total ?? 0)} />
          <button type="button" className="modal-btn modal-btn--ghost" onClick={runTest} disabled={testing}
            style={{ justifyContent: 'center', gap: 6 }}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {testing
              ? t('settings.company.dhl.testing', 'Erstelle …')
              : t('settings.company.dhl.testLabel', 'Test-Label erstellen')}
          </button>
        </div>
      </div>

      {lastTest && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: lastTest.is_test ? '#eff6ff' : '#ecfdf5',
          border: `1px solid ${lastTest.is_test ? '#bfdbfe' : '#a7f3d0'}`,
        }}>
          <div style={{ fontSize: 12, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Truck size={14} />
            <strong>{lastTest.is_test
              ? t('settings.company.dhl.mockTracking', 'Mock-Tracking')
              : t('settings.company.dhl.liveTracking', 'Live-Tracking')}:</strong>
            <code style={{ fontFamily: 'var(--font-mono)' }}>{lastTest.tracking}</code>
          </div>
        </div>
      )}

      {status?.last_error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
          borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca',
        }}>
          <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
            <strong>{t('settings.company.dhl.errorTitle', 'Letzter DHL-Fehler')}</strong>
            {' '}({relTime(status.last_error_at, t)})
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>{status.last_error}</div>
          </div>
        </div>
      )}

      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 14px', borderRadius: 10, border: '1px solid var(--clr-border)', cursor: 'pointer',
      }}>
        <span style={{ fontSize: 13, color: '#334155' }}>
          <strong>{t('settings.company.dhl.testModeLabel', 'Test-Modus')}</strong>
          {' — '}{t('settings.company.dhl.testModeLabelDesc', 'kein echtes DHL-Label, nur Mock-Tracking')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving && <Loader2 size={14} className="animate-spin text-gray-400" />}
          <input type="checkbox" checked={testMode} disabled={status === null || saving}
            onChange={(e) => toggle(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
        </span>
      </label>
    </Card>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel__header">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{icon}</span>
          <h3 className="panel__title">{title}</h3>
        </div>
      </div>
      <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function FieldText({ label, value, mono, copy, readOnly }: { label: string; value: string; mono?: boolean; copy?: boolean; readOnly?: boolean }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input
          type="text" defaultValue={value} readOnly={readOnly} key={value}
          className="modal-input"
          style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, paddingRight: copy ? 36 : undefined }}
        />
        {copy && (
          <button type="button" onClick={() => navigator.clipboard?.writeText(value)}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
            <Copy size={15} />
          </button>
        )}
      </div>
    </label>
  );
}

/** Lagerplatz-Verteilung: live (letzter Pulpo-Pull) vs. Sidebar (Cache).
 *  Weichen die beiden ab, ist der Cache veraltet — genau das macht „Geister-
 *  Listen" wie CW3/CW7 sichtbar, die in Pulpo längst nicht mehr existieren. */
function LocationCompare({ live, cache }: { live: Record<string, number>; cache: Record<string, number> }) {
  const { t } = useTranslation();
  const keys = Array.from(new Set([...Object.keys(live), ...Object.keys(cache)])).sort();
  const mismatch = keys.some((k) => (live[k] ?? 0) !== (cache[k] ?? 0));
  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--clr-border)', background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <MapPin size={14} style={{ color: '#64748b' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{t('settings.company.pulpo.locations.title')}</span>
        {mismatch && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>
            {t('settings.company.pulpo.locations.mismatch')}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {keys.map((k) => {
          const l = live[k] ?? 0;
          const c = cache[k] ?? 0;
          const stale = l !== c;
          return (
            <span key={k} title={t('settings.company.pulpo.locations.tooltip', { live: l, cache: c })}
              style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 8,
                background: stale ? '#fff7ed' : '#ecfdf5',
                border: `1px solid ${stale ? '#fed7aa' : '#a7f3d0'}`,
                color: stale ? '#9a3412' : '#065f46',
              }}>
              {k}: {l}{stale ? ` ${t('settings.company.pulpo.locations.cacheSuffix', { count: c })}` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: '#94a3b8' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      </div>
    </div>
  );
}

function QuickLink({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      border: '1px solid var(--clr-border)', borderRadius: 12, background: '#fff', cursor: 'pointer', textAlign: 'left',
    }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
      </div>
      <ChevronRight size={16} style={{ color: '#cbd5e1' }} />
    </button>
  );
}

function Feature({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: '1px solid #e0e7ff' }}>
      <div style={{ color: '#6366f1', display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 18 }}>{value}</div>
    </div>
  );
}
