import React from 'react';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import './StatCard.css';

export default function StatCard({
  title,
  value,
  change,
  trend = 'neutral', // 'up' | 'down' | 'warning' | 'neutral'
  subtitle,
  icon: Icon,
  variant = 'forest', // 'forest' | 'wood' | 'amber' | 'blue' | 'emerald' | 'danger'
  onClick
}) {
  const isClickable = Boolean(onClick);

  return (
    <div 
      className={`stat-card stat-card--${variant} ${isClickable ? 'stat-card--clickable' : ''}`}
      onClick={onClick}
      onKeyDown={isClickable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="stat-card__header">
        <span className="stat-card__title">{title}</span>
        {Icon && (
          <div className="stat-card__icon-wrap">
            <Icon size={20} />
          </div>
        )}
      </div>

      <div className="stat-card__body">
        <div className="stat-card__value">{value}</div>
      </div>

      <div className="stat-card__footer">
        {change !== undefined && change !== null && (
          <div className={`stat-card__badge stat-card__badge--${trend}`}>
            {trend === 'up' && <TrendingUp size={13} />}
            {trend === 'down' && <TrendingDown size={13} />}
            {trend === 'warning' && <AlertCircle size={13} />}
            <span>{typeof change === 'number' ? `${change > 0 ? '+' : ''}${change}%` : change}</span>
          </div>
        )}
        {subtitle && <span className="stat-card__subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}
