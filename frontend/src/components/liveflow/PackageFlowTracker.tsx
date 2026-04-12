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
  { id: 'scan', label: 'Scanned', technicalCode: 'ENQ', icon: <ScanBarcode size={15} />, status: 'pending' },
  { id: 'enter', label: 'Entered', technicalCode: 'IND', icon: <LogIn size={15} />, status: 'pending' },
  { id: 'measure', label: 'Measured', technicalCode: 'ACK', icon: <Ruler size={15} />, status: 'pending' },
  { id: 'wrap', label: 'Wrapped', technicalCode: '', icon: <Box size={15} />, status: 'pending' },
  { id: 'label', label: 'Labeled', technicalCode: 'LAB', icon: <Tag size={15} />, status: 'pending' },
  { id: 'complete', label: 'Completed', technicalCode: 'END', icon: <CheckCircle size={15} />, status: 'pending' },
];

interface PackageFlowTrackerProps {
  steps?: FlowStep[];
  showTechnical?: boolean;
  onStepClick?: (step: FlowStep) => void;
}

const styles = {
  pending:   { dot: 'border-gray-200 bg-white text-gray-300', line: 'bg-gray-200', text: 'text-gray-400' },
  active:    { dot: 'border-blue-400 bg-blue-50 text-blue-500 shadow-sm', line: 'bg-gray-200', text: 'text-gray-900 font-medium' },
  completed: { dot: 'border-emerald-400 bg-emerald-50 text-emerald-500', line: 'bg-emerald-300', text: 'text-gray-600' },
  failed:    { dot: 'border-red-300 bg-red-50 text-red-500', line: 'bg-red-200', text: 'text-red-600 font-medium' },
  skipped:   { dot: 'border-gray-200 bg-gray-50 text-gray-300', line: 'bg-gray-200', text: 'text-gray-400 line-through' },
};

export default function PackageFlowTracker({ steps = defaultSteps, showTechnical = false, onStepClick }: PackageFlowTrackerProps) {
  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Package Journey</h3>
      </div>
      <div className="px-6 py-6">
        <div className="flex items-start">
          {steps.map((step, idx) => {
            const s = styles[step.status];
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.id} className="flex items-start flex-1 min-w-0">
                <div
                  className={`flex flex-col items-center flex-shrink-0 ${onStepClick ? 'cursor-pointer' : ''}`}
                  style={{ width: 72 }}
                  onClick={() => onStepClick?.(step)}
                >
                  <div className={`w-10 h-10 rounded-xl border-[1.5px] flex items-center justify-center transition-all ${s.dot}`}>
                    {step.status === 'completed' ? <Check size={16} strokeWidth={2.5} /> :
                     step.status === 'failed' ? <XCircle size={16} /> : step.icon}
                  </div>
                  <p className={`text-xs mt-2.5 text-center leading-tight ${s.text}`}>{step.label}</p>
                  {showTechnical && step.technicalCode && (
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{step.technicalCode}</p>
                  )}
                  {step.timestamp && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{step.timestamp}</p>
                  )}
                </div>
                {!isLast && (
                  <div className="flex-1 flex items-center px-1" style={{ paddingTop: 18 }}>
                    <div className={`h-px w-full transition-all ${s.line}`} />
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
