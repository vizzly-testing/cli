import SmartImage from '../../ui/smart-image.jsx';

export default function SideBySideViewer({ comparison }) {
  return (
    <div className="flex flex-col md:flex-row gap-3 md:gap-4 p-2 md:p-0">
      <div className="flex-1 text-center">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 mb-2">
          <span className="text-xs md:text-sm font-medium text-blue-400">
            Baseline
          </span>
        </div>
        <SmartImage
          src={comparison.baseline}
          alt="Baseline"
          className="max-w-full h-auto rounded border border-gray-600"
        />
      </div>
      <div className="flex-1 text-center">
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 mb-2">
          <span className="text-xs md:text-sm font-medium text-green-400">
            Current
          </span>
        </div>
        <SmartImage
          src={comparison.current}
          alt="Current"
          className="max-w-full h-auto rounded border border-gray-600"
        />
      </div>
    </div>
  );
}
