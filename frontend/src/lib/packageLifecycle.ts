// Shared CMC package lifecycle helpers — used by SimulatorPage and LiveFlowPage.
//
// Maps the wire-protocol events (ENQ/IND/ACK/LAB1/LAB2/END/REM) to:
//   1. The 6 physical stations from process docs Section 2
//   2. The 8 lifecycle states from process docs Section 4

import type { StationId, StationStatus } from '../components/simulator/PackageStations';

export type PackageState =
  | 'ASSIGNED' | 'INDUCTED' | 'SCANNED' | 'LABELED'
  | 'COMPLETED' | 'FAILED' | 'EJECTED' | 'DELETED';

// In-flight states use the blue family, success is green, terminal failures
// are red/orange, and removal is grey.
export const STATE_COLORS: Record<PackageState, { bg: string; fg: string; border: string }> = {
  ASSIGNED:  { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  INDUCTED:  { bg: '#e0e7ff', fg: '#4338ca', border: '#a5b4fc' },
  SCANNED:   { bg: '#cffafe', fg: '#0e7490', border: '#67e8f9' },
  LABELED:   { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  COMPLETED: { bg: '#d1fae5', fg: '#047857', border: '#6ee7b7' },
  FAILED:    { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  EJECTED:   { bg: '#ffedd5', fg: '#9a3412', border: '#fdba74' },
  DELETED:   { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
};

export function emptyStations(): Record<StationId, StationStatus> {
  return {
    scanner: 'pending', induction: 'pending', sensor: 'pending',
    wrapper: 'pending', labeler: 'pending', exit: 'pending',
  };
}

interface MinimalEvent {
  type: string;
  data?: Record<string, unknown>;
}

// Apply a single event to the station map. Later events also mark earlier
// stations as passed, so missing or out-of-order events still produce a
// sensible position trail. _RESPONSE echoes are ignored.
export function applyEventToStations(
  ev: MinimalEvent,
  stations: Record<StationId, StationStatus>,
): { rejected: boolean; removed: boolean } {
  const baseType = ev.type.replace(/_RESPONSE$/, '');
  if (ev.type !== baseType) return { rejected: false, removed: false };

  const d = ev.data;
  let rejected = false;
  let removed = false;

  switch (baseType) {
    case 'ENQ':
      stations.scanner = 'passed';
      break;
    case 'IND':
      stations.scanner = 'passed';
      stations.induction = 'passed';
      break;
    case 'ACK': {
      stations.scanner = 'passed';
      stations.induction = 'passed';
      const bad = d?.result === '0' || d?.result === 0 || d?.good === false;
      if (bad) {
        stations.sensor = 'failed';
        rejected = true;
      } else {
        stations.sensor = 'passed';
      }
      break;
    }
    case 'LAB1':
    case 'LAB2':
      stations.scanner = 'passed';
      stations.induction = 'passed';
      if (stations.sensor === 'pending') stations.sensor = 'passed';
      stations.wrapper = 'passed';
      stations.labeler = 'passed';
      break;
    case 'END': {
      const status = d?.status;
      const ok = status === '1' || status === 1 || d?.good === true;
      if (ok) stations.exit = 'passed';
      else { stations.exit = 'failed'; rejected = true; }
      break;
    }
    case 'REM':
      removed = true;
      break;
  }
  return { rejected, removed };
}

// Maps station progression to the documented lifecycle states (Section 4).
export function deriveState(
  stations: Record<StationId, StationStatus>,
  removed: boolean,
): PackageState {
  if (removed) return 'DELETED';
  if (stations.exit === 'failed') return 'EJECTED';
  if (stations.exit === 'passed') return 'COMPLETED';
  if (stations.sensor === 'failed') return 'EJECTED';
  if (stations.labeler === 'passed') return 'LABELED';
  if (stations.sensor === 'passed') return 'SCANNED';
  if (stations.induction === 'passed') return 'INDUCTED';
  return 'ASSIGNED';
}
