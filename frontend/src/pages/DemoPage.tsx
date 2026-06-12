/**
 * DemoPage — kompletter Test-Durchlauf ohne Lager, ohne Maschine, ohne echte
 * Pulpo-Packliste und ohne echte DHL-Sendung. Man füllt Testprodukt +
 * Testempfänger aus, klickt „Test-Durchlauf starten", und das Backend spielt
 * ENQ→IND→ACK→LAB1→END gegen den eigenen Gateway-Port. Ergebnis: ein
 * Testauftrag läuft durch und es entsteht ein gerendertes Test-Label mit genau
 * diesen Daten — sichtbar über „Alle Infos".
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/layout/Topbar';
import PackageDetailsModal from '../components/PackageDetailsModal';
import { api, type DemoStatus, type DemoRunRequest, type DemoRunResult } from '../services/api';
import {
  FlaskConical, Play, Trash2, AlertTriangle, CheckCircle2, XCircle,
  Truck, Eye, Loader2, RefreshCw,
} from 'lucide-react';

const DEFAULTS: DemoRunRequest = {
  product_name: 'Test-Artikel Promanal',
  product_sku: 'TEST-SKU-001',
  product_ean: '4000000000017',
  product_image_url: '',
  quantity: 1,
  barcode: '',
  recipient: {
    name: 'Erika Mustermann', company: 'ePerformances GmbH',
    street: 'Teststraße', house_nr: '42', zip: '10115', city: 'Berlin',
    country: 'DEU', email: 'test@example.com', phone: '030 1234567',
  },
  weight_g: 500, length_mm: 200, width_mm: 150, height_mm: 80,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--clr-text-muted)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--clr-border)', borderRadius: 8,
  fontSize: 13, background: '#fff', width: '100%',
};

export default function DemoPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [form, setForm] = useState<DemoRunRequest>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoRunResult | null>(null);
  const [err, setErr] = useState('');
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);

  const loadStatus = async () => {
    try { setStatus(await api.demoStatus()); } catch (e) { /* ignore */ }
  };
  useEffect(() => { loadStatus(); }, []);

  const testModeOn = status?.pulpo_test_mode && status?.dhl_test_mode;

  const enableTestMode = async () => {
    setEnabling(true);
    try {
      await api.setPulpoSettings(true);
      await api.setDhlSettings(true);
      await loadStatus();
    } finally { setEnabling(false); }
  };

  const run = async () => {
    setRunning(true); setErr(''); setResult(null);
    try {
      const res = await api.demoRun(form);
      setResult(res);
      if (!res.ok && res.error) setErr(res.error);
      await loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  };

  const cleanup = async () => {
    if (!confirm(t('demo.cleanupConfirm', 'Alle Testdaten (Testaufträge, Test-Labels, Test-Status) wirklich löschen?'))) return;
    setRunning(true); setErr('');
    try {
      await api.demoCleanup();
      setResult(null);
      await loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  };

  const setR = (k: keyof DemoRunRequest['recipient'], v: string) =>
    setForm((f) => ({ ...f, recipient: { ...f.recipient, [k]: v } }));

  return (
    <>
      <Topbar title={t('demo.title', 'Demo / Test')} subtitle={t('demo.subtitle', 'Kompletter Durchlauf ohne Maschine')} />
      <div style={{ padding: 22, maxWidth: 1100, margin: '0 auto' }}>
        {/* Hinweis-Banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
          background: testModeOn ? '#ecfdf5' : '#fffbeb',
          border: `1px solid ${testModeOn ? '#a7f3d0' : '#fde68a'}`, marginBottom: 18,
        }}>
          <FlaskConical size={20} color={testModeOn ? '#059669' : '#b45309'} />
          <div style={{ flex: 1, fontSize: 13 }}>
            {testModeOn ? (
              <><b>Test-Modus aktiv.</b> Es entstehen keine echten Daten — kein echter Pulpo-Schreibzugriff, keine echte DHL-Sendung. Gateway-Port {status?.gateway_port}.</>
            ) : (
              <><b>Test-Modus ist NICHT vollständig aktiv.</b> Der Demo-Durchlauf braucht Pulpo- UND DHL-Test-Modus.</>
            )}
          </div>
          {!testModeOn && (
            <button type="button" onClick={enableTestMode} disabled={enabling}
              style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700, background: '#b45309', color: '#fff', border: 'none' }}>
              {enabling ? '…' : 'Test-Modus aktivieren'}
            </button>
          )}
          <button type="button" onClick={loadStatus} title="Status aktualisieren"
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
          {/* Testprodukt */}
          <div style={{ border: '1px solid var(--clr-border)', borderRadius: 12, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Testprodukt & Auftrag</h3>
            <Field label="Produktname">
              <input style={inputStyle} value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="SKU">
                <input style={inputStyle} value={form.product_sku}
                  onChange={(e) => setForm({ ...form, product_sku: e.target.value })} />
              </Field>
              <Field label="EAN (nur Artikel/Bild)">
                <input style={inputStyle} value={form.product_ean}
                  onChange={(e) => setForm({ ...form, product_ean: e.target.value })} />
              </Field>
            </div>
            <Field label="Produktbild-URL (optional)">
              <input style={inputStyle} placeholder="https://…" value={form.product_image_url}
                onChange={(e) => setForm({ ...form, product_image_url: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Menge">
                <input type="number" min={1} style={inputStyle} value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Karton-Scan (auto, isoliert)">
                <input style={inputStyle} placeholder="DEMO-… (automatisch)" value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </Field>
            </div>
            <h4 style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--clr-text-muted)' }}>Maße & Gewicht</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <Field label="L (mm)"><input type="number" style={inputStyle} value={form.length_mm} onChange={(e) => setForm({ ...form, length_mm: Number(e.target.value) || 0 })} /></Field>
              <Field label="B (mm)"><input type="number" style={inputStyle} value={form.width_mm} onChange={(e) => setForm({ ...form, width_mm: Number(e.target.value) || 0 })} /></Field>
              <Field label="H (mm)"><input type="number" style={inputStyle} value={form.height_mm} onChange={(e) => setForm({ ...form, height_mm: Number(e.target.value) || 0 })} /></Field>
              <Field label="Gewicht (g)"><input type="number" style={inputStyle} value={form.weight_g} onChange={(e) => setForm({ ...form, weight_g: Number(e.target.value) || 0 })} /></Field>
            </div>
          </div>

          {/* Empfänger */}
          <div style={{ border: '1px solid var(--clr-border)', borderRadius: 12, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Test-Lieferadresse (kommt aufs Label)</h3>
            <Field label="Name"><input style={inputStyle} value={form.recipient.name} onChange={(e) => setR('name', e.target.value)} /></Field>
            <Field label="Firma (optional)"><input style={inputStyle} value={form.recipient.company} onChange={(e) => setR('company', e.target.value)} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Field label="Straße"><input style={inputStyle} value={form.recipient.street} onChange={(e) => setR('street', e.target.value)} /></Field>
              <Field label="Nr."><input style={inputStyle} value={form.recipient.house_nr} onChange={(e) => setR('house_nr', e.target.value)} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <Field label="PLZ"><input style={inputStyle} value={form.recipient.zip} onChange={(e) => setR('zip', e.target.value)} /></Field>
              <Field label="Ort"><input style={inputStyle} value={form.recipient.city} onChange={(e) => setR('city', e.target.value)} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <Field label="Land (ISO-3)"><input style={inputStyle} value={form.recipient.country} onChange={(e) => setR('country', e.target.value)} /></Field>
              <Field label="E-Mail"><input style={inputStyle} value={form.recipient.email} onChange={(e) => setR('email', e.target.value)} /></Field>
            </div>
            <Field label="Telefon"><input style={inputStyle} value={form.recipient.phone} onChange={(e) => setR('phone', e.target.value)} /></Field>
          </div>
        </div>

        {/* Aktionen */}
        <div style={{ display: 'flex', gap: 12, marginTop: 18, alignItems: 'center' }}>
          <button type="button" onClick={run} disabled={running || !testModeOn}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px',
              borderRadius: 10, border: 'none', cursor: running || !testModeOn ? 'not-allowed' : 'pointer',
              background: testModeOn ? '#2563eb' : '#94a3b8', color: '#fff', fontWeight: 700, fontSize: 14,
            }}>
            {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            Test-Durchlauf starten
          </button>
          <button type="button" onClick={cleanup} disabled={running}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 10, border: '1px solid var(--clr-border)', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#dc2626' }}>
            <Trash2 size={15} /> Testdaten löschen{status?.open_test_orders ? ` (${status.open_test_orders})` : ''}
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} /> {err}
          </div>
        )}

        {/* Ergebnis */}
        {result && (
          <div style={{ marginTop: 18, border: '1px solid var(--clr-border)', borderRadius: 12, padding: 18, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {result.ok ? <CheckCircle2 size={22} color="#059669" /> : <XCircle size={22} color="#dc2626" />}
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {result.ok ? 'Durchlauf erfolgreich' : 'Durchlauf nicht vollständig'}
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13, marginBottom: 14 }}>
              <div><span style={{ color: 'var(--clr-text-muted)' }}>Referenz</span><div style={{ fontWeight: 700 }}>{result.reference_id || '—'}</div></div>
              <div><span style={{ color: 'var(--clr-text-muted)' }}>Scan-Barcode</span><div style={{ fontWeight: 700 }}>{result.barcode}</div></div>
              <div><span style={{ color: 'var(--clr-text-muted)' }}>Packauftrag</span><div style={{ fontWeight: 700 }}>{result.packing_order}</div></div>
              <div><span style={{ color: 'var(--clr-text-muted)' }}>Status</span><div style={{ fontWeight: 700 }}>{result.order_state?.state || '—'}</div></div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: 'var(--clr-text-muted)' }}><Truck size={12} /> DHL-Test-Tracking</span>
                <div style={{ fontWeight: 700 }}>{result.shipment?.tracking_number || '— (kein Label erzeugt)'}</div>
              </div>
            </div>
            {result.shipment?.has_label && result.reference_id && (
              <button type="button" onClick={() => setShowDetails(result.reference_id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                <Eye size={15} /> Label & alle Infos ansehen
              </button>
            )}
          </div>
        )}
      </div>

      {showDetails && (
        <PackageDetailsModal referenceId={showDetails} onClose={() => setShowDetails(null)} />
      )}
    </>
  );
}
