import { ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { BrowserIcon } from '@vizzly-testing/bear-den/review';
import { getReviewMetadata } from './review.js';

export function ReviewProperties({ comparison, variants, onNavigate }) {
  let metadata = getReviewMetadata(comparison);
  let candidates = variants.map(variant => ({
    variant,
    metadata: getReviewMetadata(variant),
  }));
  return (
    <div className="review-properties">
      {Object.entries(metadata).map(([key, value]) => {
        // Keep as many other capture properties as possible when switching.
        let target = null;
        let bestMatches = -1;
        for (let candidate of candidates) {
          let candidateValue = candidate.metadata[key];
          if (candidateValue == null || candidateValue === value) continue;
          let matches = Object.entries(candidate.metadata).filter(
            ([otherKey, otherValue]) =>
              otherKey !== key && metadata[otherKey] === otherValue
          ).length;
          if (matches > bestMatches) {
            target = candidate;
            bestMatches = matches;
          }
        }
        let Property = target ? 'button' : 'span';
        return (
          <Property
            className={
              target
                ? 'review-property review-property-trigger'
                : 'review-property'
            }
            key={key}
            onClick={target ? () => onNavigate(target.variant) : undefined}
            title={
              target
                ? `Switch ${key}: ${value} → ${target.metadata[key]}`
                : `${key}: ${value}`
            }
            type={target ? 'button' : undefined}
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {key === 'browser' ? (
                <BrowserIcon browser={value} className="h-4 w-4" />
              ) : key === 'viewport' ? (
                <ComputerDesktopIcon className="h-4 w-4" />
              ) : (
                <span className="text-[var(--bd-text-muted)]">
                  {key.replaceAll('_', ' ')}
                </span>
              )}
              <span className={key === 'viewport' ? 'font-mono' : ''}>
                {String(value)}
              </span>
            </span>
          </Property>
        );
      })}
    </div>
  );
}
