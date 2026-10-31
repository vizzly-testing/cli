import {
  ExclamationTriangleIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

export default function SmartImage({ src, alt, className, style, onClick }) {
  let [status, setStatus] = useState(src ? 'loading' : 'missing');

  useEffect(() => {
    if (!src) {
      setStatus('missing');
      return;
    }
    setStatus('loading');
  }, [src]);

  if (status === 'missing') {
    return (
      <div
        className="flex items-center justify-center bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded min-h-[200px]"
        style={style}
      >
        <div className="text-[var(--text-tertiary)] text-center">
          <PhotoIcon className="w-12 h-12 mx-auto mb-3" />
          <div className="text-sm">No {alt.toLowerCase()} available</div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="flex items-center justify-center bg-[var(--accent-danger-muted)] border border-[color-mix(in_srgb,var(--accent-danger)_28%,transparent)] rounded min-h-[200px]"
        style={style}
      >
        <div className="text-[var(--accent-danger)] text-center">
          <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3" />
          <div className="text-sm">Failed to load {alt.toLowerCase()}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1 font-mono break-all px-4">
            {src}
          </div>
        </div>
      </div>
    );
  }

  let handleKeyDown = null;
  if (onClick) {
    handleKeyDown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(e);
      }
    };
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    />
  );
}
