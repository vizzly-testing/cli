export default function StatusBadge({
  icon: Icon,
  label,
  colorClass = 'gray',
}) {
  let colorClasses = {
    green: 'bg-green-500/20 border-green-500/30 text-green-400',
    red: 'bg-red-500/20 border-red-500/30 text-red-400',
    yellow: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    gray: 'bg-gray-500/20 border-gray-500/30 text-gray-400',
  };

  return (
    <div
      className={`rounded-lg px-3 py-1.5 border flex items-center space-x-2 ${colorClasses[colorClass]}`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
