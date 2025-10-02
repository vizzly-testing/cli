import { ChartBarIcon } from '@heroicons/react/24/outline';
import { calculatePassRate } from '../../utils/comparison-helpers.js';

export default function DashboardStats({ summary, baseline }) {
  if (!summary) return null;

  let passRate = calculatePassRate(summary);

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-8 mb-8">
      <h1 className="text-3xl font-bold text-white mb-8 flex items-center">
        <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mr-4">
          <ChartBarIcon className="w-6 h-6 text-amber-400" />
        </div>
        Visual Comparison Report
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-white mb-2">
            {summary.total}
          </div>
          <div className="text-sm text-gray-400 uppercase tracking-wider">
            Total Screenshots
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-green-400 mb-2">
            {summary.passed}
          </div>
          <div className="text-sm text-gray-400 uppercase tracking-wider">
            Passed
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-amber-400 mb-2">
            {summary.failed}
          </div>
          <div className="text-sm text-gray-400 uppercase tracking-wider">
            Failed
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-300 mb-2">
            {passRate}%
          </div>
          <div className="text-sm text-gray-400 uppercase tracking-wider">
            Pass Rate
          </div>
        </div>
      </div>

      {baseline && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            <span className="font-medium">Baseline:</span> {baseline}
          </div>
        </div>
      )}
    </div>
  );
}
