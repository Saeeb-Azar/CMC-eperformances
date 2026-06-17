/**
 * PackageDetailsModal — „Alle Infos"-Vollbildansicht zu einem Paket.
 *
 * Bündelt LIVE alles Relevante an einem Ort, damit man sofort sieht, wenn was
 * schiefläuft: DHL (Tracking + Label-Vorschau), Pulpo (PA-Nr, Verkaufsauftrag,
 * Empfängeradresse, Artikel), Produktbilder aus weclapp.
 */
import { useEffect, useState } from 'react';
import { X, Truck, Package, MapPin, FileText, RefreshCw } from 'lucide-react';
import { api, productImageUrl, type PackageDetails } from '../services/api';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: 13, alignItems: 'baseline' }}>
      <span style={{ minWidth: 130, color: 'var(--clr-text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

function Card({ icon, title, accent, children }: {
  icon: React.ReactNode; title: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--clr-border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: accent, color: '#fff', fontWeight: 700, fontSize: 14 }}>
        {icon} {title}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

export default function PackageDetailsModal({ referenceId, stateId, onClose }: {
  referenceId: string; stateId?: string | null; onClose: () => void;
}) {
  const [d, setD] = useState<PackageDetails | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Bevorzugt über die EINDEUTIGE State-ID (stabiler Join); sonst ref.
        const res = stateId
          ? await api.getPackageDetailsByState(stateId)
          : await api.getPackageDetails(referenceId);
        if (!cancelled) { setD(res); setErr(''); }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 2500); // live
    return () => { cancelled = true; clearInterval(id); };
  }, [referenceId, stateId]);

  const pulpo = d?.pulpo, dhl = d?.dhl, order = d?.order;
  // Empfänger bevorzugt aus dem OrderState (= genau die ans Label gegangene
  // ship_to, persistiert) — sonst aus dem Pulpo-Block (Fallback).
  const rcpt = (order?.recipient && order.recipient.name) ? order.recipient : pulpo?.recipient;
  const labelSrc = dhl?.label_b64
    ? `data:${dhl.label_format === 'ZPL2' ? 'text/plain' : 'application/pdf'};base64,${dhl.label_b64}`
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          margin: 'auto', width: '100%', maxWidth: 1200, height: '92vh',
          background: 'var(--clr-bg, #f8fafc)', borderRadius: 16, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--clr-border)', background: '#fff' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              Alle Infos · {referenceId}
              {order?.state && (
                <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8' }}>
                  {order.state}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={11} /> Live · Barcode {d?.barcode || '—'}
            </div>
          </div>
          <button type="button" onClick={onClose} title="Schließen"
            style={{ display: 'inline-flex', padding: 8, borderRadius: 10, border: '1px solid var(--clr-border)', background: '#fff', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {err && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
              Fehler beim Laden: {err}
            </div>
          )}
          {loading && !d ? (
            <div style={{ color: 'var(--clr-text-muted)', padding: 20 }}>Lade Details…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
              {/* Linke Spalte: Pulpo + Empfänger + Artikel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card icon={<Package size={16} />} title="Pulpo / Auftrag" accent="#7c3aed">
                  <Row label="Packauftrag (PA)" value={pulpo?.packing_order_number} />
                  <Row label="Verkaufsauftrag" value={pulpo?.sales_order_number} />
                  <Row label="Versandart" value={pulpo?.shipment_method} />
                  <Row label="Pulpo-Status" value={pulpo?.state} />
                  {!pulpo && <div style={{ fontSize: 12, color: '#b45309' }}>Kein Pulpo-Auftrag zum Barcode gefunden.</div>}
                </Card>

                <Card icon={<MapPin size={16} />} title="Empfänger (Label)" accent="#0891b2">
                  <Row label="Name" value={rcpt?.name} />
                  {rcpt?.company && <Row label="Firma" value={rcpt.company} />}
                  <Row label="Straße" value={[rcpt?.street, rcpt?.house_nr].filter(Boolean).join(' ')} />
                  {rcpt?.street2 && <Row label="Zusatz" value={rcpt.street2} />}
                  <Row label="PLZ / Ort" value={[rcpt?.zip, rcpt?.city].filter(Boolean).join(' ')} />
                  <Row label="Land" value={rcpt?.country} />
                  <Row label="E-Mail" value={rcpt?.email} />
                  <Row label="Telefon" value={rcpt?.phone} />
                </Card>

                <Card icon={<Package size={16} />} title={`Artikel (${pulpo?.items?.length ?? 0})`} accent="#059669">
                  {(pulpo?.items ?? []).length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>Keine Artikel.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pulpo!.items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px', border: '1px solid var(--clr-border)', borderRadius: 10 }}>
                          {it.ean ? (
                            <img src={productImageUrl(it.ean)} alt="" width={48} height={48}
                              style={{ objectFit: 'contain', borderRadius: 8, background: '#f1f5f9', flexShrink: 0 }}
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                          ) : <div style={{ width: 48, height: 48, background: '#f1f5f9', borderRadius: 8 }} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{it.name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
                              SKU {it.sku || '—'} · EAN {it.ean || '—'} · {it.quantity}×
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Rechte Spalte: DHL + Status + Label-Vorschau */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card icon={<Truck size={16} />} title="DHL / Versand" accent="#ca8a04">
                  <Row label="Tracking-Nr" value={dhl?.tracking_number} />
                  <Row label="Carrier" value={dhl?.carrier} />
                  <Row label="Produkt" value={dhl?.product} />
                  <Row label="Gedruckt am" value={dhl?.printed_at ? new Date(dhl.printed_at).toLocaleString() : 'noch nicht'} />
                  {dhl?.print_error && <Row label="Druckfehler" value={<span style={{ color: '#dc2626' }}>{dhl.print_error}</span>} />}
                  {dhl?.is_test && <Row label="Hinweis" value={<span style={{ color: '#b45309' }}>TEST-Sendung</span>} />}
                  {!dhl && <div style={{ fontSize: 12, color: '#b45309' }}>Noch kein DHL-Label/Shipment.</div>}
                </Card>

                <Card icon={<Package size={16} />} title="Maschine / Status" accent="#475569">
                  <Row label="Status" value={order?.state} />
                  <Row
                    label="Maße (L×B×H)"
                    value={
                      order?.dimensions && (order.dimensions.length_mm || order.dimensions.width_mm || order.dimensions.height_mm)
                        ? `${order.dimensions.length_mm ?? '?'}×${order.dimensions.width_mm ?? '?'}×${order.dimensions.height_mm ?? '?'} mm`
                        : '—'
                    }
                  />
                  <Row label="Gewicht" value={(order?.weight_g ?? dhl?.weight_g) ? `${order?.weight_g ?? dhl?.weight_g} g` : '—'} />
                  {order?.rejection_reason && <Row label="Reject-Grund" value={<span style={{ color: '#dc2626' }}>{order.rejection_reason}</span>} />}
                  {d?.plausibility?.warn && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
                      ⚠ {d.plausibility.note}
                      {d.plausibility.expected_weight_g != null && (
                        <span> (erwartet ~{d.plausibility.expected_weight_g} g)</span>
                      )}
                    </div>
                  )}
                </Card>

                {order?.pulpo_order_id && (
                  <Card icon={<Package size={16} />} title="Pulpo-Abschluss (Rückschreiben)" accent={order?.pulpo_replay_state === 'FAILED' ? '#dc2626' : order?.pulpo_replay_state === 'DONE' ? '#059669' : '#64748b'}>
                    <Row label="Status" value={
                      <span style={{
                        fontWeight: 700,
                        color: order?.pulpo_replay_state === 'FAILED' ? '#dc2626'
                          : order?.pulpo_replay_state === 'DONE' ? '#059669' : '#475569',
                      }}>{order?.pulpo_replay_state || 'NONE'}</span>
                    } />
                    <Row label="Pulpo-Auftrag" value={order?.pulpo_order_id} />
                    {order?.pulpo_box_id && <Row label="Box-ID" value={order.pulpo_box_id} />}
                    {order?.pulpo_replay_error && (
                      <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>Fehler beim Pulpo-Rückschreiben (roher Body):</div>
                        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {order.pulpo_replay_error}
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                <Card icon={<FileText size={16} />} title="Label-Vorschau" accent="#1d4ed8">
                  {labelSrc && dhl?.label_format !== 'ZPL2' ? (
                    <iframe title="Label" src={labelSrc}
                      style={{ width: '100%', height: 360, border: '1px solid var(--clr-border)', borderRadius: 8, background: '#fff' }} />
                  ) : dhl?.has_label ? (
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
                      Label vorhanden ({dhl?.label_format}) — Vorschau nur für PDF.
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>Noch kein Label.</div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
