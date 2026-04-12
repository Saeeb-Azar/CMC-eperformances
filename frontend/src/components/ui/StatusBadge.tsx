import { useTranslation } from 'react-i18next';

const stateMap: Record<string, string> = {
  ASSIGNED: 'badge badge--info',
  INDUCTED: 'badge badge--accent',
  SCANNED: 'badge badge--accent',
  LABELED: 'badge badge--info',
  COMPLETED: 'badge badge--success',
  FAILED: 'badge badge--danger',
  EJECTED: 'badge badge--warning',
  DELETED: 'badge badge--neutral',
  RUNNING: 'badge badge--success',
  STOP: 'badge badge--neutral',
  PAUSE: 'badge badge--warning',
  ERROR: 'badge badge--danger',
};

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  return (
    <span className={stateMap[status] || 'badge badge--neutral'}>
      {t(`status.${status}`, status)}
    </span>
  );
}
