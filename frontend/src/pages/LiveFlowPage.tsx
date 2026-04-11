import { ScanBarcode, Printer, Wifi, AlertTriangle } from 'lucide-react';
import Topbar from '../components/layout/Topbar';
import LiveActivityCard from '../components/liveflow/LiveActivityCard';
import PackageFlowTracker, { type FlowStep } from '../components/liveflow/PackageFlowTracker';
import LiveEventFeed, { type LiveEvent } from '../components/liveflow/LiveEventFeed';
import ErrorPanel, { type ErrorItem } from '../components/liveflow/ErrorPanel';
import MachineHealthPanel from '../components/liveflow/MachineHealthPanel';

// --- Demo data ---
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
  { id: '9', message: 'Package rejected — dimensions exceed maximum', technicalCode: 'ACK', severity: 'warning', timestamp: '14:29:15', barcode: '8711319002345', referenceId: 'ref-0484' },
];

const demoErrors: ErrorItem[] = [
  { id: '1', title: 'Label verification failed', description: 'The printed label barcode could not be verified by the exit scanner. Package was diverted to reject bin.', barcode: 'M320001', referenceId: 'ref-0482', timestamp: '14:25', severity: 'error' },
  { id: '2', title: 'Package too large', description: 'Item dimensions exceed maximum allowed size. Automatically diverted after 3D measurement.', barcode: '8711319002345', referenceId: 'ref-0484', timestamp: '14:29', severity: 'warning' },
];

const healthIndicators = [
  { label: 'Connection', status: 'healthy' as const, icon: <Wifi size={16} /> },
  { label: 'Scanner', status: 'healthy' as const, icon: <ScanBarcode size={16} /> },
  { label: 'Label Printer', status: 'healthy' as const, icon: <Printer size={16} /> },
  { label: 'Errors Today', status: 'warning' as const, icon: <AlertTriangle size={16} /> },
];

export default function LiveFlowPage() {
  return (
    <div>
      <Topbar
        title="CMC Live Flow"
        liveStatus="Packaging in progress"
        showViewToggle
      />

      <div className="page-content stack-5">
        {/* Hero: What is happening now? */}
        <LiveActivityCard
          state="labeling"
          barcode="4062196101493"
          detail="Generating and applying shipping label via DHL. The box has been wrapped and is at the labeler station."
          elapsedSeconds={29}
        />

        {/* Package journey */}
        <PackageFlowTracker steps={demoSteps} showTechnical={false} />

        {/* Bottom grid: Feed + Side panels */}
        <div className="grid-2-1 gap-5">
          {/* Event Feed */}
          <LiveEventFeed events={demoEvents} />

          {/* Side: Health + Issues */}
          <div className="stack-5">
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
