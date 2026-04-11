import { Wifi, WifiOff, Radio, AlertCircle, Pause, Square } from 'lucide-react';

export type MachineState = 'running' | 'idle' | 'error' | 'paused' | 'offline';

interface TopStatusBarProps {
  machineState: MachineState;
  connectionActive: boolean;
  activeBarcode: string | null;
  currentStep: string | null;
  statusMessage: string;
}

const stateConfig: Record<MachineState, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  running: {
    label: 'Running',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    icon: <Radio size={14} className="animate-pulse" />,
  },
  idle: {
    label: 'Idle',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    icon: <Pause size={14} />,
  },
  error: {
    label: 'Error',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    icon: <AlertCircle size={14} />,
  },
  paused: {
    label: 'Paused',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    icon: <Pause size={14} />,
  },
  offline: {
    label: 'Offline',
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    icon: <Square size={14} />,
  },
};

export default function TopStatusBar({
  machineState,
  connectionActive,
  activeBarcode,
  currentStep,
  statusMessage,
}: TopStatusBarProps) {
  const state = stateConfig[machineState];

  return (
    <div className="bg-sidebar text-white px-6 py-3 flex items-center justify-between">
      {/* Left: Machine state */}
      <div className="flex items-center gap-6">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${state.bg}`}>
          <span className={state.color}>{state.icon}</span>
          <span className={`text-sm font-medium ${state.color}`}>{state.label}</span>
        </div>

        <div className="flex items-center gap-2">
          {connectionActive ? (
            <Wifi size={14} className="text-emerald-400" />
          ) : (
            <WifiOff size={14} className="text-red-400" />
          )}
          <span className="text-xs text-text-on-dark-muted">
            {connectionActive ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Center: Status message */}
      <div className="text-center">
        <p className="text-sm font-medium text-text-on-dark">{statusMessage}</p>
      </div>

      {/* Right: Active package */}
      <div className="flex items-center gap-4">
        {currentStep && (
          <span className="text-xs text-text-on-dark-muted px-2.5 py-1 rounded-full bg-white/5">
            {currentStep}
          </span>
        )}
        {activeBarcode && (
          <div className="text-right">
            <p className="text-xs text-text-on-dark-muted">Active package</p>
            <p className="text-sm font-mono font-medium text-text-on-dark">{activeBarcode}</p>
          </div>
        )}
      </div>
    </div>
  );
}
