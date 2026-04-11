import { ScanBarcode, LogIn, Ruler, Box, Tag, CheckCircle, XCircle } from 'lucide-react';

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
  { id: 'scan', label: 'Scanned', technicalCode: 'ENQ', icon: <ScanBarcode size={18} />, status: 'pending' },
  { id: 'enter', label: 'Entered', technicalCode: 'IND', icon: <LogIn size={18} />, status: 'pending' },
  { id: 'measure', label: 'Measured', technicalCode: 'ACK', icon: <Ruler size={18} />, status: 'pending' },
  { id: 'wrap', label: 'Wrapped', technicalCode: '', icon: <Box size={18} />, status: 'pending' },
  { id: 'label', label: 'Labeled', technicalCode: 'LAB', icon: <Tag size={18} />, status: 'pending' },
  { id: 'complete', label: 'Completed', technicalCode: 'END', icon: <CheckCircle size={18} />, status: 'pending' },
];

interface PackageFlowTrackerProps {
  steps?: FlowStep[];
  showTechnical?: boolean;
  onStepClick?: (step: FlowStep) => void;
}

const statusStyles = {
  pending: {
    circle: 'bg-gray-100 border-gray-200 text-gray-400',
    line: 'bg-gray-200',
    text: 'text-text-muted',
  },
  active: {
    circle: 'bg-blue-100 border-blue-300 text-blue-600 ring-4 ring-blue-100 shadow-sm',
    line: 'bg-gray-200',
    text: 'text-blue-700 font-medium',
  },
  completed: {
    circle: 'bg-emerald-100 border-emerald-300 text-emerald-600',
    line: 'bg-emerald-400',
    text: 'text-emerald-700',
  },
  failed: {
    circle: 'bg-red-100 border-red-300 text-red-600 ring-4 ring-red-100',
    line: 'bg-red-300',
    text: 'text-red-700 font-medium',
  },
  skipped: {
    circle: 'bg-gray-50 border-gray-200 text-gray-300',
    line: 'bg-gray-200',
    text: 'text-gray-400 line-through',
  },
};

export default function PackageFlowTracker({
  steps = defaultSteps,
  showTechnical = false,
  onStepClick,
}: PackageFlowTrackerProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-secondary">Package Journey</h3>
      </div>

      <div className="flex items-start justify-between mt-6">
        {steps.map((step, idx) => {
          const styles = statusStyles[step.status];
          const isLast = idx === steps.length - 1;
          const failedIcon = step.status === 'failed';

          return (
            <div key={step.id} className="flex items-start flex-1">
              {/* Step */}
              <div
                className={`flex flex-col items-center ${onStepClick ? 'cursor-pointer' : ''}`}
                onClick={() => onStepClick?.(step)}
              >
                {/* Circle */}
                <div
                  className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${styles.circle}`}
                >
                  {failedIcon ? <XCircle size={18} /> : step.icon}
                </div>

                {/* Label */}
                <p className={`text-xs mt-2.5 text-center transition-colors ${styles.text}`}>
                  {step.label}
                </p>

                {/* Technical code */}
                {showTechnical && step.technicalCode && (
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">
                    {step.technicalCode}
                  </p>
                )}

                {/* Timestamp */}
                {step.timestamp && (
                  <p className="text-[10px] text-text-muted mt-0.5">{step.timestamp}</p>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 flex items-center pt-5 px-2">
                  <div className={`h-0.5 w-full rounded-full transition-all duration-500 ${styles.line}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
