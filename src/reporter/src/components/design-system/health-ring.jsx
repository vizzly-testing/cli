/**
 * Health Ring Component
 * Observatory Design System
 *
 * Radial progress indicator for health scores
 */

import { useEffect, useState } from 'react';

export function HealthRing({
  value = 0,
  label = '',
  size = 120,
  strokeWidth = 8,
  animated = true,
  showValue = true,
  className = '',
}) {
  let [displayValue, setDisplayValue] = useState(animated ? 0 : value);

  useEffect(() => {
    if (!animated) {
      setDisplayValue(value);
      return;
    }

    let start = 0;
    let end = value;
    let duration = 1000;
    let startTime = null;

    let animate = timestamp => {
      if (!startTime) startTime = timestamp;
      let progress = Math.min((timestamp - startTime) / duration, 1);
      let eased = 1 - (1 - progress) ** 3;
      setDisplayValue(Math.round(start + (end - start) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, animated]);

  let radius = (size - strokeWidth) / 2;
  let circumference = radius * 2 * Math.PI;
  let offset = circumference - (displayValue / 100) * circumference;

  let getColor = () => {
    if (value >= 80) return 'var(--accent-success)';
    if (value >= 50) return 'var(--accent-warning)';
    return 'var(--accent-danger)';
  };

  let stroke = getColor();

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Glow filter */}
        <defs>
          <filter
            id={`glow-${size}`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--vz-border-subtle)"
          strokeWidth={strokeWidth}
        />

        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: animated
              ? 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'none',
          }}
        />
      </svg>

      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-semibold text-[var(--text-primary)]"
            style={{ fontSize: size * 0.22 }}
          >
            {displayValue}%
          </span>
          {label && (
            <span
              className="text-[var(--text-muted)] uppercase tracking-wider font-medium"
              style={{ fontSize: size * 0.08 }}
            >
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
