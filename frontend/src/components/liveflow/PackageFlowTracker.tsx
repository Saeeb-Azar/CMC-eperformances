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
    circle: 'bg-gray-50 border-gray-200 text-gray-400',
    line: 'bg-gray-200',
    text: 'text-gray-400',
  },
  active: {
    circle: 'bg-blue-50 border-blue-400 text-blue-600 ring-4 ring-blue-50 shadow-sm',
    line: 'bg-gray-200',
    text: 'text-blue-700 font-semibold',
  },
  completed: {
    circle: 'bg-emerald-50 border-emerald-400 text-emerald-600',
    line: 'bg-emerald-400',
    text: 'text-emerald-700 font-medium',
  },
  failed: {
    circle: 'bg-red-50 border-red-400 text-red-600 ring-4 ring-red-50',
    line: 'bg-red-300',
    text: 'text-red-700 font-semibold',
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
    <div className="bg-white border border-gray-200 rounded-2xl px-8 py-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-8">
        Package Journey
      </h3>

      <div className="flex items-start">
        {steps.map((step, idx) => {
          const styles = statusStyles[step.status];
          const isLast = idx === steps.length - 1;
          const failedIcon = step.status === 'failed';

          return (
            <div key={step.id} className="flex items-start flex-1 min-w-0">
              {/* Step column */}
              <div
                className={`flex flex-col items-center flex-shrink-0 ${onStepClick ? 'cursor-pointer' : ''}`}
                style={{ width: 80 }}
                onClick={() => onStepClick?.(step)}
              >
                {/* Circle */}
                <div
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${styles.circle}`}
                >
                  {failedIcon ? <XCircle size={20} /> : step.icon}
                </div>

                {/* Label */}
                <p className={`text-sm mt-3 text-center leading-tight transition-colors ${styles.text}`}>
                  {step.label}
                </p>

                {/* Technical code */}
                {showTechnical && step.technicalCode && (
                  <p className="text-[10px] text-gray-400 font-mono mt-1">
                    {step.technicalCode}
                  </p>
                )}

                {/* Timestamp */}
                {step.timestamp && (
                  <p className="text-[11px] text-gray-400 mt-1">{step.timestamp}</p>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 flex items-center px-1" style={{ paddingTop: 22 }}>
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
