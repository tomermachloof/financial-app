export default function DayOfMonthPicker({ value, onChange, hasError }) {
  const selected = value ? parseInt(value) : null
  return (
    <div className={`rounded-2xl border ${hasError ? 'border-red-400' : 'border-gray-200'} overflow-hidden`}>
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-center">
        <span className="text-sm font-semibold text-gray-700">בחר יום בחודש</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 p-2">
        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
          <button
            key={d}
            onClick={() => onChange(String(d))}
            className={`rounded-lg text-sm py-1.5 font-medium transition-colors
              ${selected === d ? 'bg-blue-600 text-white' : 'text-gray-700 active:bg-gray-100'}`}
          >
            {d}
          </button>
        ))}
      </div>
      {selected && (
        <div className="px-3 py-2 border-t border-gray-100 text-center text-xs text-blue-600 font-medium">
          חוזרת בכל {selected} לחודש
        </div>
      )}
    </div>
  )
}
