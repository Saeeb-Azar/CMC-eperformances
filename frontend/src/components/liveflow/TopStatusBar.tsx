import { Wifi, WifiOff, Activity, AlertCircle, Pause, Square } from 'lucide-react';

export type MachineState = 'running' | 'idle' | 'error' | 'paused' | 'offline';

interface TopStatusBarProps {
  machineState: MachineState;
  connectionActive: boolean;
  activeBarcode: string | null;
  currentStep: string | null;
  statusMessage: string;
}

const stateConfig: Record<MachineState, { label: string; color: string; icon: React.ReactNode }> = {
  running: { label: 'Running', color: 'text-emerald-400', icon: <Activity size={12} /> },
  idle:    { label: 'Idle', color: 'text-gray-400', icon: <Pause size={12} /> },
  error:   { label: 'Error', color: 'text-red-400', icon: <AlertCircle size={12} /> },
  paused:  { label: 'Paused', color: 'text-amber-400', icon: <Pause size={12} /> },
  offline: { label: 'Offline', color: 'text-gray-500', icon: <Square size={12} /> },
};

export default function TopStatusBar({ machineState, connectionActive, activeBarcode, currentStep, statusMessage }: TopStatusBarProps) {
  const s = stateConfig[machineState];
  return (
    <div className="bg-gray-900 h-9 flex items-center justify-between px-6 text-xs">
      <div className="flex items-center gap-5">
        <span className={`flex items-center gap-1.5 ${s.color}`}>{s.icon} <span className="font-medium">{s.label}</span></span>
        <span className="flex items-center gap-1.5 text-gray-500">
          {connectionActive ? <Wifi size={11} className="text-emerald-400" /> : <WifiOff size={11} className="text-red-400" />}
          {connectionActive ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <span className="text-gray-400">{statusMessage}</span>
      <div className="flex items-center gap-4 text-gray-500">
        {currentStep && <span>{currentStep}</span>}
        {activeBarcode && <code className="font-mono text-gray-300">{activeBarcode}</code>}
      </div>
    </div>
  );
}
