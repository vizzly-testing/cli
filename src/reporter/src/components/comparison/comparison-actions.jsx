import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function ComparisonActions({
  onAccept,
  onReject,
  disabled = false,
}) {
  return (
    <div className="flex gap-2">
      {/* Accept button - full width on mobile */}
      <button
        type="button"
        className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-600 text-white text-sm font-medium px-4 py-3 md:py-2 rounded-lg md:rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        onClick={onAccept}
        disabled={disabled}
        title="Accept these changes as the new baseline"
      >
        <CheckIcon className="w-5 h-5 md:w-4 md:h-4" />
        <span>Accept</span>
      </button>
      {/* Reject button - full width on mobile */}
      <button
        type="button"
        className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-600 text-slate-300 hover:text-white text-sm font-medium px-4 py-3 md:py-2 rounded-lg md:rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        onClick={onReject}
        disabled={disabled}
        title="Keep the current baseline (reject changes)"
      >
        <XMarkIcon className="w-5 h-5 md:w-4 md:h-4" />
        <span>Reject</span>
      </button>
    </div>
  );
}
