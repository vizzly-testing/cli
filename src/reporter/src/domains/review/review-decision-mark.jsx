import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export function ReviewDecisionMark({ decision, small = false }) {
  if (decision !== 'approved' && decision !== 'rejected') return null;
  let approved = decision === 'approved';
  let Icon = approved ? CheckIcon : XMarkIcon;
  return (
    <span
      role="img"
      aria-label={approved ? 'Approved' : 'Rejected'}
      className="inline-flex shrink-0"
    >
      <Icon
        aria-hidden="true"
        className={`${small ? 'h-3 w-3' : 'h-4 w-4'} ${
          approved ? 'text-[var(--bd-success)]' : 'text-[var(--bd-danger)]'
        }`}
      />
    </span>
  );
}
