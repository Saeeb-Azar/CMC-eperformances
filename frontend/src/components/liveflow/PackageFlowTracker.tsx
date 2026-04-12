import { ScanBarcode, LogIn, Ruler, Box, Tag, CheckCircle, XCircle, Check } from 'lucide-react';

export interface FlowStep {
  id: string;
  label: string;
  technicalCode: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  timestamp?: string;
  detail?: string;
}

const defaultSteps: FlowStep[] = [
  { id: 'scan', label: 'Scanned', technicalCode: 'ENQ', icon: <ScanBarcode size={14} />, status: 'pending' },
  { id: 'enter', label: 'Entered', technicalCode: 'IND', icon: <LogIn size={14} />, status: 'pending' },
  { id: 'measure', label: 'Measured', technicalCode: 'ACK', icon: <Ruler size={14} />, status: 'pending' },
  { id: 'wrap', label: 'Wrapped', technicalCode: '', icon: <Box size={14} />, status: 'pending' },
  { id: 'label', label: 'Labeled', technicalCode: 'LAB', icon: <Tag size={14} />, status: 'pending' },
  { id: 'complete', label: 'Completed', technicalCode: 'END', icon: <CheckCircle size={14} />, status: 'pending' },
];

interface PackageFlowTrackerProps {
  steps?: FlowStep[];
  showTechnical?: boolean;
  onStepClick?: (step: FlowStep) => void;
}

const stepStyles = {
  pending:   { dot: 'border-zinc-200 bg-white text-zinc-300', line: 'bg-zinc-200', text: 'text-zinc-400' },
  active:    { dot: 'border-blue-500 bg-blue-500 text-white', line: 'bg-zinc-200', text: 'text-zinc-900 font-medium' },
  completed: { dot: 'border-green-600 bg-green-600 text-white', line: 'bg-green-600', text: 'text-zinc-600' },
  failed:    { dot: 'border-red-500 bg-red-500 text-white', line: 'bg-red-300', text: 'text-red-600 font-medium' },
  skipped:   { dot: 'border-zinc-200 bg-zinc-100 text-zinc-300', line: 'bg-zinc-200', text: 'text-zinc-400 line-through' },
};

export default function PackageFlowTracker({
  steps = defaultSteps,
  showTechnical = false,
  onStepClick,
}: PackageFlowTrackerProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg">
      <div className="px-5 py-3 border-b border-zinc-100">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Package Journey</h3>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-start">
          {steps.map((step, idx) => {
            const s = stepStyles[step.status];
            const isLast = idx === steps.length - 1;
            const isCompleted = step.status === 'completed';

            return (
              <div key={step.id} className="flex items-start flex-1 min-w-0">
                <div
                  className={`flex flex-col items-center flex-shrink-0 ${onStepClick ? 'cursor-pointer' : ''}`}
                  style={{ width: 64 }}
                  onClick={() => onStepClick?.(step)}
                >
                  {/* Dot */}
                  <div className={`w-8 h-8 rounded-md border-2 flex items-center justify-center transition-all ${s.dot}`}>
                    {isCompleted ? <Check size={14} strokeWidth={2.5} /> :
                     step.status === 'failed' ? <XCircle size={14} /> : step.icon}
                  </div>
                  {/* Label */}
                  <p className={`text-xs mt-2 text-center leading-tight ${s.text}`}>{step.label}</p>
                  {/* Tech code */}
                  {showTechnical && step.technicalCode && (
                    <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{step.technicalCode}</p>
                  )}
                  {/* Timestamp */}
                  {step.timestamp && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">{step.timestamp}</p>
                  )}
                </div>
                {/* Connector */}
                {!isLast && (
                  <div className="flex-1 flex items-center px-1" style={{ paddingTop: 14 }}>
                    <div className={`h-px w-full ${s.line}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
