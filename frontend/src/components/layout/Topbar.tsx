import { Eye, Code, Bell } from 'lucide-react';
import { useState } from 'react';

interface TopbarProps {
  title: string;
  subtitle?: string;
  liveStatus?: string;
  showViewToggle?: boolean;
}

export default function Topbar({ title, subtitle, liveStatus, showViewToggle = false }: TopbarProps) {
  const [view, setView] = useState<'operator' | 'technical'>('operator');

  return (
    <div className="topbar">
      {/* Left */}
      <div className="topbar__left">
        <span className="topbar__title">{title}</span>
        {subtitle && <span className="topbar__subtitle">&middot; {subtitle}</span>}
      </div>

      {/* Center: live status */}
      {liveStatus && (
        <div className="topbar__center">
          <span className="topbar__live-dot" />
          <span className="topbar__live-text">{liveStatus}</span>
        </div>
      )}

      {/* Right */}
      <div className="topbar__right">
        {showViewToggle && (
          <div className="segmented">
            <button
              onClick={() => setView('operator')}
              className={`segmented__item ${view === 'operator' ? 'segmented__item--active' : ''}`}
            >
              <Eye size={13} /> Operator
            </button>
            <button
              onClick={() => setView('technical')}
              className={`segmented__item ${view === 'technical' ? 'segmented__item--active' : ''}`}
            >
              <Code size={13} /> Technical
            </button>
          </div>
        )}
        <button className="btn-icon" aria-label="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </div>
  );
}
