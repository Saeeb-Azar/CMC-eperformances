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
  bgClass: string;
  iconBgClass: string;
  pulse: boolean;
}> = {
  idle: {
    title: 'Waiting for next package',
    description: 'The machine is ready. Place an item on the conveyor to begin.',
    icon: <Clock size={32} />,
    bgClass: 'bg-gray-50 border-gray-200',
    iconBgClass: 'bg-gray-100 text-gray-400',
    pulse: false,
  },
  scanning: {
    title: 'Barcode is being scanned',
    description: 'Reading the barcode and looking up the order in the system.',
    icon: <ScanBarcode size={32} />,
    bgClass: 'bg-blue-50 border-blue-200',
    iconBgClass: 'bg-blue-100 text-blue-600',
    pulse: true,
  },
  entering: {
    title: 'Package entered the machine',
    description: 'The item has been accepted and is now on the conveyor belt.',
    icon: <Package size={32} />,
    bgClass: 'bg-indigo-50 border-indigo-200',
    iconBgClass: 'bg-indigo-100 text-indigo-600',
    pulse: true,
  },
  measuring: {
    title: 'Package is being measured',
    description: 'The 3D sensor is recording the dimensions (length, width, height).',
    icon: <Ruler size={32} />,
    bgClass: 'bg-violet-50 border-violet-200',
    iconBgClass: 'bg-violet-100 text-violet-600',
    pulse: true,
  },
  wrapping: {
    title: 'Box is being created',
    description: 'The cardboard is being cut, folded, and the item is being packed.',
    icon: <Box size={32} />,
    bgClass: 'bg-cyan-50 border-cyan-200',
    iconBgClass: 'bg-cyan-100 text-cyan-600',
    pulse: true,
  },
  labeling: {
    title: 'Shipping label is being printed',
    description: 'Generating and applying the shipping label to the package.',
    icon: <Tag size={32} />,
    bgClass: 'bg-teal-50 border-teal-200',
    iconBgClass: 'bg-teal-100 text-teal-600',
    pulse: true,
  },
  verifying: {
    title: 'Label is being verified',
    description: 'The exit scanner is checking if the printed label matches.',
    icon: <Loader size={32} className="animate-spin" />,
    bgClass: 'bg-amber-50 border-amber-200',
    iconBgClass: 'bg-amber-100 text-amber-600',
    pulse: true,
  },
  completed: {
    title: 'Package completed successfully',
    description: 'Everything verified. The package is ready for shipping.',
    icon: <CheckCircle size={32} />,
    bgClass: 'bg-emerald-50 border-emerald-200',
    iconBgClass: 'bg-emerald-100 text-emerald-600',
    pulse: false,
  },
  rejected: {
    title: 'Package was rejected',
    description: 'The package could not be processed and was diverted.',
    icon: <XCircle size={32} />,
    bgClass: 'bg-red-50 border-red-200',
    iconBgClass: 'bg-red-100 text-red-600',
    pulse: false,
  },
  error: {
    title: 'An error occurred',
    description: 'Something went wrong during processing.',
    icon: <XCircle size={32} />,
    bgClass: 'bg-red-50 border-red-200',
    iconBgClass: 'bg-red-100 text-red-600',
    pulse: false,
  },
};

export default function LiveActivityCard({ state, barcode, detail, elapsedSeconds }: LiveActivityCardProps) {
  const config = activityConfig[state];

  return (
    <div className={`rounded-2xl border-2 p-8 transition-all duration-500 ${config.bgClass}`}>
      <div className="flex items-start gap-6">
        {/* Icon */}
        <div className={`p-4 rounded-2xl ${config.iconBgClass} ${config.pulse ? 'animate-pulse' : ''}`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-semibold text-text-primary leading-tight">
            {config.title}
          </h2>
          <p className="text-base text-text-secondary mt-2">
            {detail || config.description}
          </p>

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-4">
            {barcode && (
              <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary bg-white/60 px-3 py-1 rounded-lg">
                <ScanBarcode size={14} />
                <span className="font-mono">{barcode}</span>
              </span>
            )}
            {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary bg-white/60 px-3 py-1 rounded-lg">
                <Clock size={14} />
                {elapsedSeconds}s elapsed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
