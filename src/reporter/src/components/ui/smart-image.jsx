import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import useImageLoader from '../../hooks/use-image-loader.js';

export default function SmartImage({ src, alt, className, style, onClick }) {
  const status = useImageLoader(src);

  if (status === 'missing') {
    return (
      <div
        className="flex items-center justify-center bg-gray-700 border border-gray-600 rounded min-h-[200px]"
        style={style}
      >
        <div className="text-gray-400 text-center">
          <PhotoIcon className="w-12 h-12 mx-auto mb-3" />
          <div className="text-sm">No {alt.toLowerCase()} available</div>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div
        className="flex items-center justify-center bg-gray-700 border border-gray-600 rounded min-h-[200px]"
        style={style}
      >
        <div className="text-gray-400 text-center">
          <ArrowPathIcon className="w-8 h-8 mx-auto mb-3 animate-spin" />
          <div className="text-sm">Loading {alt.toLowerCase()}...</div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="flex items-center justify-center bg-gray-700 border border-red-500 rounded min-h-[200px]"
        style={style}
      >
        <div className="text-red-400 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3" />
          <div className="text-sm">Failed to load {alt.toLowerCase()}</div>
          <div className="text-xs text-gray-500 mt-1 font-mono break-all px-4">
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
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    />
  );
}
