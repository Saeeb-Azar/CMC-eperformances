import { Package, CheckCircle, XCircle, Loader, ScanBarcode, Ruler, Box, Tag, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  accent: string;
  iconColor: string;
}> = {
  idle:      { titleKey: 'liveFlow.activity.idle',      descKey: 'liveFlow.activity.idleDesc',      icon: <Clock size={22} />,       accent: '',                                    iconColor: 'text-gray-400' },
  scanning:  { titleKey: 'liveFlow.activity.scanning',  descKey: 'liveFlow.activity.scanningDesc',  icon: <ScanBarcode size={22} />, accent: 'hero-panel__accent--active',          iconColor: 'text-blue-500' },
  entering:  { titleKey: 'liveFlow.activity.entering',  descKey: 'liveFlow.activity.enteringDesc',  icon: <Package size={22} />,     accent: 'hero-panel__accent--active',          iconColor: 'text-blue-500' },
  measuring: { titleKey: 'liveFlow.activity.measuring', descKey: 'liveFlow.activity.measuringDesc', icon: <Ruler size={22} />,       accent: 'hero-panel__accent--active',          iconColor: 'text-violet-500' },
  wrapping:  { titleKey: 'liveFlow.activity.wrapping',  descKey: 'liveFlow.activity.wrappingDesc',  icon: <Box size={22} />,         accent: 'hero-panel__accent--active',          iconColor: 'text-blue-500' },
  labeling:  { titleKey: 'liveFlow.activity.labeling',  descKey: 'liveFlow.activity.labelingDesc',  icon: <Tag size={22} />,         accent: 'hero-panel__accent--active',          iconColor: 'text-blue-500' },
  verifying: { titleKey: 'liveFlow.activity.verifying', descKey: 'liveFlow.activity.verifyingDesc', icon: <Loader size={22} className="animate-spin" />, accent: 'hero-panel__accent--warning', iconColor: 'text-amber-500' },
  completed: { titleKey: 'liveFlow.activity.completed', descKey: 'liveFlow.activity.completedDesc', icon: <CheckCircle size={22} />, accent: 'hero-panel__accent--success',         iconColor: 'text-emerald-500' },
  rejected:  { titleKey: 'liveFlow.activity.rejected',  descKey: 'liveFlow.activity.rejectedDesc',  icon: <XCircle size={22} />,     accent: 'hero-panel__accent--danger',          iconColor: 'text-red-500' },
  error:     { titleKey: 'liveFlow.activity.error',     descKey: 'liveFlow.activity.errorDesc',     icon: <XCircle size={22} />,     accent: 'hero-panel__accent--danger',          iconColor: 'text-red-500' },
};

export default function LiveActivityCard({ state, barcode, detail, elapsedSeconds }: LiveActivityCardProps) {
  const { t } = useTranslation();
  const c = config[state];

  return (
    <div className="hero-panel">
      <div className={`hero-panel__accent ${c.accent}`} />
      <div className="flex items-start gap-5 px-8 py-6">
        <div className={`mt-0.5 ${c.iconColor}`}>{c.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{t(c.titleKey)}</h2>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{detail || t(c.descKey)}</p>
          {(barcode || (elapsedSeconds && elapsedSeconds > 0)) && (
            <div className="flex items-center gap-3 mt-4">
              {barcode && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-md">
                  <ScanBarcode size={12} className="text-gray-400" />
                  <span className="font-mono">{barcode}</span>
                </span>
              )}
              {elapsedSeconds !== undefined && elapsedSeconds > 0 && (
                <span className="text-xs text-gray-400">{elapsedSeconds}{t('liveFlow.elapsed')}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
