import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';

export type StationStatus = 'pending' | 'active' | 'passed' | 'failed';
export type StationId = 'scanner' | 'induction' | 'sensor' | 'wrapper' | 'labeler' | 'exit';

export const STATIONS: readonly StationId[] = [
  'scanner', 'induction', 'sensor', 'wrapper', 'labeler', 'exit',
] as const;

const EVENT_BY_STATION: Record<StationId, string> = {
  scanner: 'ENQ',
  induction: 'IND',
  sensor: 'ACK',
  wrapper: '—',
  labeler: 'LAB1',
  exit: 'END',
};

interface Props {
  stations: Record<StationId, StationStatus>;
  removed: boolean;
}

export default function PackageStations({ stations, removed }: Props) {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
      {STATIONS.map((id, idx) => {
        const status = stations[id];
        const isLast = idx === STATIONS.length - 1;
        const dotStyle = dotStyles(status, removed);
        const lineColor = lineStyles(status, stations[STATIONS[idx + 1]]);

        return (
          <div key={id} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 56 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1.5px solid ${dotStyle.border}`,
                  background: dotStyle.bg,
                  color: dotStyle.fg,
                  transition: 'all 0.2s',
                  animation: status === 'active' && !removed ? 'pulse 1.4s infinite' : undefined,
                  boxShadow: status === 'active' && !removed ? `0 0 0 4px ${dotStyle.bg}` : undefined,
                }}
              >
                {status === 'passed' && <Check size={12} strokeWidth={3} />}
                {status === 'failed' && <X size={12} strokeWidth={3} />}
                {status === 'active' && (
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: dotStyle.fg }} />
                )}
              </div>
              <span
                title={`${t(`simulator.station.${id}`)} (${EVENT_BY_STATION[id]})`}
                style={{
                  fontSize: 9.5,
                  marginTop: 4,
                  textAlign: 'center',
                  color: dotStyle.label,
                  fontWeight: status === 'active' ? 600 : 400,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: '100%',
                }}
              >
                {t(`simulator.station.${id}`)}
              </span>
            </div>
            {!isLast && (
              <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                <div style={{ height: 1.5, width: '100%', background: lineColor, transition: 'background 0.2s' }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function dotStyles(status: StationStatus, removed: boolean) {
  if (removed && status !== 'pending') {
    return { border: '#dc2626', bg: '#fee2e2', fg: '#991b1b', label: '#991b1b' };
  }
  switch (status) {
    case 'passed':
      return { border: '#10b981', bg: '#d1fae5', fg: '#047857', label: '#475569' };
    case 'active':
      return { border: '#2563eb', bg: '#dbeafe', fg: '#1d4ed8', label: '#1d4ed8' };
    case 'failed':
      return { border: '#ef4444', bg: '#fee2e2', fg: '#991b1b', label: '#991b1b' };
    default:
      return { border: '#cbd5e1', bg: '#ffffff', fg: '#94a3b8', label: '#94a3b8' };
  }
}

function lineStyles(curr: StationStatus, next: StationStatus | undefined): string {
  if (curr === 'passed' && next && next !== 'pending') return '#10b981';
  if (curr === 'failed') return '#fca5a5';
  return '#e2e8f0';
}
