import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  color?: 'default' | 'success' | 'danger' | 'warning' | 'info';
}

const iconBg = {
  default: 'bg-gray-100 text-gray-500',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-red-50 text-red-500',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-blue-50 text-blue-600',
};

export default function StatCard({ label, value, sub, icon, color = 'default' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className={`stat-card__icon ${iconBg[color]}`}>{icon}</div>
      <div className="stat-card__content">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        {sub && <p className="stat-card__sub">{sub}</p>}
      </div>
    </div>
  );
}
