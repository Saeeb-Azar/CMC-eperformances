import { useState } from 'react';
import { Eye, Code, ScanBarcode, Printer, Wifi, AlertTriangle } from 'lucide-react';
import TopStatusBar from '../components/liveflow/TopStatusBar';
import LiveActivityCard from '../components/liveflow/LiveActivityCard';
import PackageFlowTracker, { type FlowStep } from '../components/liveflow/PackageFlowTracker';
import LiveEventFeed, { type LiveEvent } from '../components/liveflow/LiveEventFeed';
import ErrorPanel, { type ErrorItem } from '../components/liveflow/ErrorPanel';
import MachineHealthPanel from '../components/liveflow/MachineHealthPanel';

// --- Demo data (will be replaced by real-time WebSocket data) ---

const demoSteps: FlowStep[] = [
  { id: 'scan', label: 'Scanned', technicalCode: 'ENQ', icon: <ScanBarcode size={18} />, status: 'completed', timestamp: '14:32:01' },
  { id: 'enter', label: 'Entered', technicalCode: 'IND', icon: <ScanBarcode size={18} />, status: 'completed', timestamp: '14:32:04' },
  { id: 'measure', label: 'Measured', technicalCode: 'ACK', icon: <ScanBarcode size={18} />, status: 'completed', timestamp: '14:32:12' },
  { id: 'wrap', label: 'Wrapped', technicalCode: '', icon: <ScanBarcode size={18} />, status: 'completed' },
  { id: 'label', label: 'Labeled', technicalCode: 'LAB', icon: <ScanBarcode size={18} />, status: 'active', timestamp: '14:32:30' },
  { id: 'complete', label: 'Completed', technicalCode: 'END', icon: <ScanBarcode size={18} />, status: 'pending' },
];

const demoEvents: LiveEvent[] = [
  { id: '1', message: 'Shipping label is being printed for package', technicalCode: 'LAB1', severity: 'info', timestamp: '14:32:30', barcode: '4062196101493', referenceId: 'ref-0487' },
  { id: '2', message: 'Dimensions recorded: 350 x 200 x 150 mm', technicalCode: 'ACK', severity: 'success', timestamp: '14:32:12', referenceId: 'ref-0487' },
  { id: '3', message: 'Package approved by system', technicalCode: 'ACK', severity: 'success', timestamp: '14:32:12', referenceId: 'ref-0487' },
  { id: '4', message: 'Package entered the machine', technicalCode: 'IND', severity: 'info', timestamp: '14:32:04', referenceId: 'ref-0487' },
  { id: '5', message: 'Barcode scanned for package 4062196101493', technicalCode: 'ENQ', severity: 'info', timestamp: '14:32:01', barcode: '4062196101493', referenceId: 'ref-0487' },
  { id: '6', message: 'Package completed successfully', technicalCode: 'END', severity: 'success', timestamp: '14:31:45', referenceId: 'ref-0486' },
  { id: '7', message: 'Label verified and applied', technicalCode: 'END', severity: 'success', timestamp: '14:31:44', referenceId: 'ref-0486' },
  { id: '8', message: 'Connection active', technicalCode: 'HBT', severity: 'info', timestamp: '14:31:30' },
  { id: '9', message: 'Package rejected \u2014 dimensions exceed maximum', technicalCode: 'ACK', severity: 'warning', timestamp: '14:29:15', barcode: '8711319002345', referenceId: 'ref-0484' },
  { id: '10', message: 'Barcode scanned for package 8711319002345', technicalCode: 'ENQ', severity: 'info', timestamp: '14:29:10', barcode: '8711319002345', referenceId: 'ref-0484' },
];

const demoErrors: ErrorItem[] = [
  {
    id: '1',
    title: 'Label verification failed',
    description: 'The printed label could not be verified by the exit scanner. The package was diverted to the reject bin.',
    barcode: 'M320001',
    referenceId: 'ref-0482',
    timestamp: '14:25',
    severity: 'error',
  },
  {
    id: '2',
    title: 'Package too large for machine',
    description: 'The 3D sensor measured dimensions exceeding the allowed maximum. The item was automatically diverted.',
    barcode: '8711319002345',
    referenceId: 'ref-0484',
    timestamp: '14:29',
    severity: 'warning',
  },
];

const healthIndicators = [
  { label: 'Connection', status: 'healthy' as const, icon: <Wifi size={16} /> },
  { label: 'Scanner', status: 'healthy' as const, icon: <ScanBarcode size={16} /> },
  { label: 'Label Printer', status: 'healthy' as const, icon: <Printer size={16} /> },
  { label: 'Error Count', status: 'warning' as const, icon: <AlertTriangle size={16} /> },
];

// --- Page ---

export default function LiveFlowPage() {
  const [viewMode, setViewMode] = useState<'operator' | 'technical'>('operator');

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Top Status Bar */}
      <TopStatusBar
        machineState="running"
        connectionActive={true}
        activeBarcode="4062196101493"
        currentStep="Labeling"
        statusMessage="Packaging in progress"
      />

      <div className="p-6 space-y-5">
        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">CMC Live Flow</h2>
            <p className="text-sm text-text-secondary mt-0.5">Real-time packaging monitor</p>
          </div>
          <div className="flex items-center bg-surface rounded-lg border border-border p-0.5">
            <button
              onClick={() => setViewMode('operator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'operator'
                  ? 'bg-sidebar text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Eye size={13} />
              Operator
            </button>
            <button
              onClick={() => setViewMode('technical')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'technical'
                  ? 'bg-sidebar text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Code size={13} />
              Technical
            </button>
          </div>
        </div>

        {/* Live Activity Card - primary focus */}
        <LiveActivityCard
          state="labeling"
          barcode="4062196101493"
          detail="Generating shipping label via DHL. The label will be printed and applied automatically."
          elapsedSeconds={29}
        />

        {/* Package Flow Tracker */}
        <PackageFlowTracker
          steps={demoSteps}
          showTechnical={viewMode === 'technical'}
        />

        {/* Bottom: Event Feed + Sidebar */}
        <div className="grid grid-cols-3 gap-5">
          {/* Event Feed - 2 columns */}
          <div className="col-span-2">
            <LiveEventFeed events={demoEvents} />
          </div>

          {/* Right sidebar: Health + Errors */}
          <div className="space-y-5">
            <MachineHealthPanel
              machineName="CW-001 Main Hall"
              indicators={healthIndicators}
              packagesTotal={487}
              packagesSuccess={461}
              packagesRejected={22}
              uptimePercent={98.7}
            />
            <ErrorPanel errors={demoErrors} />
          </div>
        </div>
      </div>
    </div>
  );
}
