/**
 * Health Ring Component
 * Observatory Design System
 *
 * SVG-based radial progress indicator
 */

import { useEffect, useState } from 'react';

export function HealthRing({
  value = 0,
  label,
  size = 120,
  strokeWidth = 8,
  className = '',
}) {
  const [displayValue, setDisplayValue] = useState(0);

  // Animate the value on mount/change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const start = displayValue;
    const end = Math.min(100, Math.max(0, value));
    const duration = 1000;
    const startTime = window.performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - (1 - progress) ** 3;
      const current = start + (end - start) * eased;

      setDisplayValue(Math.round(current));

      if (progress < 1) {
        window.requestAnimationFrame(animate);
      }
    }

    window.requestAnimationFrame(animate);
  }, [value, displayValue]);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayValue / 100) * circumference;

  // Color based on value
  const colorClass =
    displayValue >= 80
      ? 'health-ring__progress--success'
      : displayValue >= 50
        ? 'health-ring__progress--warning'
        : 'health-ring__progress--danger';

  return (
    <div
      className={`health-ring ${className}`}
      style={{
        width: size,
        height: size,
        '--ring-size': `${size}px`,
        '--ring-stroke': `${strokeWidth}px`,
      }}
    >
      <svg
        className="health-ring__svg"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          className="health-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        {/* Progress arc */}
        <circle
          className={`health-ring__progress ${colorClass}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="health-ring__value">
        <span className="health-ring__percentage">{displayValue}%</span>
        {label && <span className="health-ring__label">{label}</span>}
      </div>
    </div>
  );
}
