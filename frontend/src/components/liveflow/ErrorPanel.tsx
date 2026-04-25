import { AlertTriangle, Clock, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ErrorItem {
  id: string;
  title: string;
  description: string;
  barcode?: string;
  referenceId?: string;
  timestamp: string;
  severity: 'warning' | 'error';
}

interface ErrorPanelProps { errors: ErrorItem[]; }

export default function ErrorPanel({ errors }: ErrorPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="dt-panel">
      <div className="dt-panel__header">
        <div>
          <h3 className="dt-panel__title">
            {t('liveFlow.issues')}
            {errors.length > 0 && <span className="dt-panel__count">· {errors.length}</span>}
          </h3>
        </div>
        <div className="dt-panel__spacer" />
        {errors.length > 0 && (
          <span className="badge badge--danger">{errors.length}</span>
        )}
      </div>

      {errors.length === 0 ? (
        <div className="dt-empty" style={{ padding: '40px 24px' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--clr-success)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--clr-text-secondary)' }}>{t('liveFlow.noIssues')}</p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', marginTop: 2 }}>
            {t('liveFlow.runningSmoothly')}
          </p>
        </div>
      ) : (
        <div>
          {errors.map((err, idx) => (
            <div
              key={err.id}
              className="group"
              style={{
                padding: '14px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                cursor: 'pointer',
                borderBottom: idx < errors.length - 1 ? '1px solid var(--clr-border-light)' : 'none',
                transition: 'background-color var(--dur-fast) var(--ease)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <AlertTriangle
                size={16}
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  color: err.severity === 'error' ? 'var(--clr-danger)' : 'var(--clr-warning)',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--clr-text)' }}>
                  {err.title}
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  {err.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  {err.barcode && (
                    <code style={{ fontSize: 11, color: 'var(--clr-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {err.barcode}
                    </code>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--clr-text-muted)' }}>
                    <Clock size={10} /> {err.timestamp}
                  </span>
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--clr-text-muted)', marginTop: 4, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
