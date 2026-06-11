import { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, Info, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface Notice {
  id: string;
  severity: string;
  days_left: number;
  title: string;
  message: string;
}

// Color escalation: info (blau) → warning (gelb, dunkler je weniger Tage) → critical (rot).
function colorFor(n: Notice): string {
  if (n.severity === 'critical' || n.days_left <= 1) return '#dc2626';
  if (n.severity === 'warning') {
    // 7 Tage = gelb, 2 Tage = orange/rot — linear dunkler
    const d = Math.max(2, Math.min(7, n.days_left));
    const tcol = (7 - d) / 5; // 0..1
    const r = Math.round(0xea + (0xdc - 0xea) * tcol);
    const g = Math.round(0xb3 + (0x26 - 0xb3) * tcol);
    const b = Math.round(0x08 + (0x26 - 0x08) * tcol);
    return `rgb(${r},${g},${b})`;
  }
  return '#2563eb';
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.getNotifications()
      .then((r) => { if (!cancelled) setNotices(r.notifications ?? []); })
      .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const count = notices.length;
  // Badge nimmt die dringendste Farbe.
  const badgeColor = notices.length
    ? notices.map(colorFor).sort((a, b) => (a === '#dc2626' ? -1 : b === '#dc2626' ? 1 : 0))[0]
    : '#94a3b8';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn-icon" aria-label={t('notifications.title')} onClick={() => setOpen((v) => !v)} style={{ position: 'relative' }}>
        <Bell size={18} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 99, background: badgeColor, color: '#fff',
            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{count}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 41,
            width: 340, maxHeight: 420, overflowY: 'auto',
            background: '#fff', border: '1px solid var(--clr-border)', borderRadius: 12,
            boxShadow: '0 14px 40px rgba(15,23,42,0.18)',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--clr-border)', fontWeight: 600, fontSize: 14 }}>
              {t('notifications.title')}
            </div>
            {count === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--clr-text-muted)', fontSize: 13 }}>
                {t('notifications.empty')}
              </div>
            ) : notices.map((n) => {
              const c = colorFor(n);
              const Icon = n.severity === 'critical' ? Trash2 : n.severity === 'warning' ? AlertTriangle : Info;
              return (
                <div key={n.id} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--clr-border)', borderLeft: `4px solid ${c}` }}>
                  <span style={{ color: c, flexShrink: 0, marginTop: 1 }}><Icon size={16} /></span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--clr-text-secondary, #475569)', marginTop: 2, lineHeight: 1.45 }}>{n.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
