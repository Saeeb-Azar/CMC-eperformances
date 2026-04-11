import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'default' | 'success' | 'danger' | 'warning' | 'info';
}

const colorMap = {
  default: 'bg-surface-tertiary text-text-secondary',
  success: 'bg-green-50 text-accent',
  danger: 'bg-red-50 text-danger',
  warning: 'bg-amber-50 text-warning',
  info: 'bg-blue-50 text-info',
};

export default function StatCard({ label, value, sub, icon, color = 'default' }: StatCardProps) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 flex items-start gap-4">
      <div className={`p-3 rounded-lg ${colorMap[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-2xl font-semibold text-text-primary mt-1">{value}</p>
        {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
      </div>
    </div>
  );
}
