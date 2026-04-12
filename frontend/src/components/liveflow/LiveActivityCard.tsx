import { Package, CheckCircle, XCircle, Loader, ScanBarcode, Ruler, Box, Tag, Clock } from 'lucide-react';

export type ActivityState =
  | 'idle' | 'scanning' | 'entering' | 'measuring'
  | 'wrapping' | 'labeling' | 'verifying'
  | 'completed' | 'rejected' | 'error';

interface LiveActivityCardProps {
  state: ActivityState;
  barcode?: string;
  detail?: string;
  elapsedSeconds?: number;
}

const config: Record<ActivityState, {
  title: string;
  desc: string;
  icon: React.ReactNode;
  accent: string;
  iconColor: string;
}> = {
  idle:      { title: 'Waiting for next package', desc: 'Machine is ready. Place an item on the conveyor to begin.', icon: <Clock size={22} />, accent: '', iconColor: 'text-gray-400' },
  scanning:  { title: 'Barcode is being scanned', desc: 'Reading barcode and looking up the order.', icon: <ScanBarcode size={22} />, accent: 'hero-panel__accent--active', iconColor: 'text-blue-500' },
  entering:  { title: 'Package entered the machine', desc: 'Item accepted and moving on the conveyor belt.', icon: <Package size={22} />, accent: 'hero-panel__accent--active', iconColor: 'text-blue-500' },
  measuring: { title: 'Package is being measured', desc: '3D sensor recording dimensions (L x W x H).', icon: <Ruler size={22} />, accent: 'hero-panel__accent--active', iconColor: 'text-violet-500' },
  wrapping:  { title: 'Box is being created', desc: 'Cardboard cut, folded, and item packed.', icon: <Box size={22} />, accent: 'hero-panel__accent--active', iconColor: 'text-blue-500' },
  labeling:  { title: 'Shipping label is being printed', desc: 'Generating and applying shipping label.', icon: <Tag size={22} />, accent: 'hero-panel__accent--active', iconColor: 'text-blue-500' },
  verifying: { title: 'Label is being verified', desc: 'Exit scanner checking label match.', icon: <Loader size={22} className="animate-spin" />, accent: 'hero-panel__accent--warning', iconColor: 'text-amber-500' },
  completed: { title: 'Package completed successfully', desc: 'Verified and ready for shipping.', icon: <CheckCircle size={22} />, accent: 'hero-panel__accent--success', iconColor: 'text-emerald-500' },
  rejected:  { title: 'Package was rejected', desc: 'Could not be processed, diverted to reject area.', icon: <XCircle size={22} />, accent: 'hero-panel__accent--danger', iconColor: 'text-red-500' },
  error:     { title: 'An error occurred', desc: 'Something went wrong during processing.', icon: <XCircle size={22} />, accent: 'hero-panel__accent--danger', iconColor: 'text-red-500' },
};

export default function LiveActivityCard({ state, barcode, detail, elapsedSeconds }: LiveActivityCardProps) {
  const c = config[state];

  return (
    <div className="hero-panel">
      <div className={`hero-panel__accent ${c.accent}`} />
      <div className="flex items-start gap-5 px-6 py-5">
        <div className={`mt-0.5 ${c.iconColor}`}>{c.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{c.title}</h2>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{detail || c.desc}</p>
          {(barcode || (elapsedSeconds && elapsedSeconds > 0)) && (
            <div className="flex items-center gap-3 mt-4">
              {barcode && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-md">
                  <ScanBarcode size={12} className="text-gray-400" />
                  <span className="font-mono">{barcode}</span>
                </span>
              )}
              {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
                <span className="text-xs text-gray-400">{elapsedSeconds}s elapsed</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
