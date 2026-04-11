const stateStyles: Record<string, string> = {
  ASSIGNED: 'bg-blue-50 text-blue-700 border-blue-200',
  INDUCTED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SCANNED: 'bg-purple-50 text-purple-700 border-purple-200',
  LABELED: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  EJECTED: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETED: 'bg-gray-50 text-gray-500 border-gray-200',
  RUNNING: 'bg-green-50 text-green-700 border-green-200',
  STOP: 'bg-gray-50 text-gray-500 border-gray-200',
  PAUSE: 'bg-amber-50 text-amber-700 border-amber-200',
  ERROR: 'bg-red-50 text-red-700 border-red-200',
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = stateStyles[status] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {status}
    </span>
  );
}
