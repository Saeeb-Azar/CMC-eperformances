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
}> = {
  idle:      { title: 'Waiting for next package', desc: 'Machine is ready. Place an item on the conveyor.', icon: <Clock size={20} />, accent: 'border-l-zinc-300' },
  scanning:  { title: 'Barcode is being scanned', desc: 'Reading barcode and looking up the order.', icon: <ScanBarcode size={20} />, accent: 'border-l-blue-500' },
  entering:  { title: 'Package entered the machine', desc: 'Item accepted and moving on the conveyor belt.', icon: <Package size={20} />, accent: 'border-l-blue-500' },
  measuring: { title: 'Package is being measured', desc: '3D sensor recording dimensions (L x W x H).', icon: <Ruler size={20} />, accent: 'border-l-violet-500' },
  wrapping:  { title: 'Box is being created', desc: 'Cardboard cut, folded, item packed.', icon: <Box size={20} />, accent: 'border-l-blue-500' },
  labeling:  { title: 'Shipping label is being printed', desc: 'Generating and applying shipping label.', icon: <Tag size={20} />, accent: 'border-l-blue-500' },
  verifying: { title: 'Label is being verified', desc: 'Exit scanner checking label match.', icon: <Loader size={20} className="animate-spin" />, accent: 'border-l-amber-500' },
  completed: { title: 'Package completed successfully', desc: 'Verified and ready for shipping.', icon: <CheckCircle size={20} />, accent: 'border-l-green-600' },
  rejected:  { title: 'Package was rejected', desc: 'Could not be processed, diverted to reject area.', icon: <XCircle size={20} />, accent: 'border-l-red-500' },
  error:     { title: 'An error occurred', desc: 'Something went wrong during processing.', icon: <XCircle size={20} />, accent: 'border-l-red-500' },
};

export default function LiveActivityCard({ state, barcode, detail, elapsedSeconds }: LiveActivityCardProps) {
  const c = config[state];

  return (
    <div className={`bg-white border border-zinc-200 rounded-lg border-l-[3px] ${c.accent}`}>
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="text-zinc-400 mt-0.5 flex-shrink-0">{c.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900 leading-snug">{c.title}</h2>
          <p className="text-sm text-zinc-500 mt-1">{detail || c.desc}</p>
          {(barcode || (elapsedSeconds && elapsedSeconds > 0)) && (
            <div className="flex items-center gap-3 mt-3">
              {barcode && (
                <code className="text-xs text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded font-mono">
                  {barcode}
                </code>
              )}
              {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
                <span className="text-xs text-zinc-400">{elapsedSeconds}s elapsed</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
