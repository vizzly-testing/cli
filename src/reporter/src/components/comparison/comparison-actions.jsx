import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function ComparisonActions({
  onAccept,
  onReject,
  disabled = false,
}) {
  return (
    <div className="flex gap-2">
      <button
        className="inline-flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onAccept}
        disabled={disabled}
        title="Accept these changes as the new baseline"
      >
        <CheckIcon className="w-4 h-4" />
        <span>Accept</span>
      </button>
      <button
        className="inline-flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-600 text-gray-300 hover:text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onReject}
        disabled={disabled}
        title="Keep the current baseline (reject changes)"
      >
        <XMarkIcon className="w-4 h-4" />
        <span>Reject</span>
      </button>
    </div>
  );
}
