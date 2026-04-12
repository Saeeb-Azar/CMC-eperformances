import { Package, CheckCircle, XCircle, Loader, ScanBarcode, Ruler, Box, Tag, Clock } from 'lucide-react';

export type ActivityState =
  | 'idle'
  | 'scanning'
  | 'entering'
  | 'measuring'
  | 'wrapping'
  | 'labeling'
  | 'verifying'
  | 'completed'
  | 'rejected'
  | 'error';

interface LiveActivityCardProps {
  state: ActivityState;
  barcode?: string;
  detail?: string;
  elapsedSeconds?: number;
}

const activityConfig: Record<ActivityState, {
  title: string;
  description: string;
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  iconBg: string;
  pulse: boolean;
}> = {
  idle: {
    title: 'Waiting for next package',
    description: 'The machine is ready. Place an item on the conveyor to begin.',
    icon: <Clock size={28} />,
    borderColor: 'border-gray-200',
    bgColor: 'bg-white',
    iconBg: 'bg-gray-100 text-gray-400',
    pulse: false,
  },
  scanning: {
    title: 'Barcode is being scanned',
    description: 'Reading the barcode and looking up the order in the system.',
    icon: <ScanBarcode size={28} />,
    borderColor: 'border-blue-300',
    bgColor: 'bg-blue-50/50',
    iconBg: 'bg-blue-100 text-blue-600',
    pulse: true,
  },
  entering: {
    title: 'Package entered the machine',
    description: 'The item has been accepted and is now on the conveyor belt.',
    icon: <Package size={28} />,
    borderColor: 'border-indigo-300',
    bgColor: 'bg-indigo-50/50',
    iconBg: 'bg-indigo-100 text-indigo-600',
    pulse: true,
  },
  measuring: {
    title: 'Package is being measured',
    description: 'The 3D sensor is recording the dimensions (length, width, height).',
    icon: <Ruler size={28} />,
    borderColor: 'border-violet-300',
    bgColor: 'bg-violet-50/50',
    iconBg: 'bg-violet-100 text-violet-600',
    pulse: true,
  },
  wrapping: {
    title: 'Box is being created',
    description: 'The cardboard is being cut, folded, and the item is being packed.',
    icon: <Box size={28} />,
    borderColor: 'border-cyan-300',
    bgColor: 'bg-cyan-50/50',
    iconBg: 'bg-cyan-100 text-cyan-600',
    pulse: true,
  },
  labeling: {
    title: 'Shipping label is being printed',
    description: 'Generating and applying the shipping label to the package.',
    icon: <Tag size={28} />,
    borderColor: 'border-teal-300',
    bgColor: 'bg-teal-50/50',
    iconBg: 'bg-teal-100 text-teal-600',
    pulse: true,
  },
  verifying: {
    title: 'Label is being verified',
    description: 'The exit scanner is checking if the printed label matches.',
    icon: <Loader size={28} className="animate-spin" />,
    borderColor: 'border-amber-300',
    bgColor: 'bg-amber-50/50',
    iconBg: 'bg-amber-100 text-amber-600',
    pulse: true,
  },
  completed: {
    title: 'Package completed successfully',
    description: 'Everything verified. The package is ready for shipping.',
    icon: <CheckCircle size={28} />,
    borderColor: 'border-emerald-300',
    bgColor: 'bg-emerald-50/50',
    iconBg: 'bg-emerald-100 text-emerald-600',
    pulse: false,
  },
  rejected: {
    title: 'Package was rejected',
    description: 'The package could not be processed and was diverted.',
    icon: <XCircle size={28} />,
    borderColor: 'border-red-300',
    bgColor: 'bg-red-50/50',
    iconBg: 'bg-red-100 text-red-600',
    pulse: false,
  },
  error: {
    title: 'An error occurred',
    description: 'Something went wrong during processing.',
    icon: <XCircle size={28} />,
    borderColor: 'border-red-300',
    bgColor: 'bg-red-50/50',
    iconBg: 'bg-red-100 text-red-600',
    pulse: false,
  },
};

export default function LiveActivityCard({ state, barcode, detail, elapsedSeconds }: LiveActivityCardProps) {
  const config = activityConfig[state];

  return (
    <div className={`rounded-2xl border-2 transition-all duration-500 ${config.borderColor} ${config.bgColor}`}>
      <div className="px-8 py-7 flex items-start gap-6">
        {/* Icon */}
        <div className={`p-4 rounded-2xl flex-shrink-0 ${config.iconBg} ${config.pulse ? 'animate-pulse' : ''}`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">
            {config.title}
          </h2>
          <p className="text-base text-gray-500 mt-2 leading-relaxed">
            {detail || config.description}
          </p>

          {/* Meta */}
          {(barcode || (elapsedSeconds !== undefined && elapsedSeconds > 0)) && (
            <div className="flex items-center gap-3 mt-4">
              {barcode && (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
                  <ScanBarcode size={14} className="text-gray-400" />
                  <span className="font-mono">{barcode}</span>
                </span>
              )}
              {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
                  <Clock size={14} className="text-gray-400" />
                  {elapsedSeconds}s elapsed
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
