import { Wifi, WifiOff, AlertCircle, Pause, Square, Activity } from 'lucide-react';

export type MachineState = 'running' | 'idle' | 'error' | 'paused' | 'offline';

interface TopStatusBarProps {
  machineState: MachineState;
  connectionActive: boolean;
  activeBarcode: string | null;
  currentStep: string | null;
  statusMessage: string;
}

const stateLabel: Record<MachineState, { label: string; color: string; icon: React.ReactNode }> = {
  running: { label: 'Running', color: 'text-green-600', icon: <Activity size={12} /> },
  idle:    { label: 'Idle',    color: 'text-zinc-400',  icon: <Pause size={12} /> },
  error:   { label: 'Error',   color: 'text-red-500',   icon: <AlertCircle size={12} /> },
  paused:  { label: 'Paused',  color: 'text-amber-500', icon: <Pause size={12} /> },
  offline: { label: 'Offline', color: 'text-zinc-400',  icon: <Square size={12} /> },
};

export default function TopStatusBar({ machineState, connectionActive, activeBarcode, currentStep, statusMessage }: TopStatusBarProps) {
  const st = stateLabel[machineState];

  return (
    <div className="bg-zinc-900 text-white h-8 flex items-center justify-between px-5 text-xs">
      <div className="flex items-center gap-4">
        <span className={`flex items-center gap-1.5 ${st.color}`}>
          {st.icon}
          <span className="font-medium">{st.label}</span>
        </span>
        <span className="flex items-center gap-1.5 text-zinc-400">
          {connectionActive ? <Wifi size={11} /> : <WifiOff size={11} className="text-red-400" />}
          {connectionActive ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <span className="text-zinc-300">{statusMessage}</span>
      <div className="flex items-center gap-4 text-zinc-400">
        {currentStep && <span className="text-zinc-500">{currentStep}</span>}
        {activeBarcode && <code className="font-mono text-zinc-300">{activeBarcode}</code>}
      </div>
    </div>
  );
}
