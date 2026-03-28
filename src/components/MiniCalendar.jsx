import { useState, useMemo } from 'react'

const DAYS_HE   = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

export default function MiniCalendar({ value, onChange, hasError }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]
  const [viewYear, setViewYear]   = useState(() => value ? parseInt(value.slice(0,4)) : today.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.slice(5,7)) - 1 : today.getMonth())

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1) } else setViewMonth(m => m-1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1) } else setViewMonth(m => m+1) }

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1).getDay()
    const total = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < first; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    return cells
  }, [viewYear, viewMonth])

  return (
    <div className={`rounded-2xl border ${hasError ? 'border-red-400' : 'border-gray-200'} overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 active:bg-gray-200">›</button>
        <span className="text-sm font-semibold text-gray-700">{MONTHS_HE[viewMonth]} {viewYear}</span>
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 active:bg-gray-200">‹</button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {DAYS_HE.map(d => (
          <div key={d} className="py-1 text-xs text-gray-400 font-medium">{d}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={'e'+i} />
          const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const isSelected = dateStr === value
          const isToday    = dateStr === todayStr
          return (
            <button
              key={dateStr}
              onClick={() => onChange(dateStr)}
              className={`m-0.5 rounded-lg text-sm py-1 font-medium transition-colors
                ${isSelected ? 'bg-blue-600 text-white' :
                  isToday    ? 'bg-blue-50 text-blue-600 font-bold' :
                               'text-gray-700 active:bg-gray-100'}`}
            >
              {d}
            </button>
          )
        })}
      </div>
      {value && (
        <div className="px-3 py-2 border-t border-gray-100 text-center text-xs text-blue-600 font-medium">
          {new Date(value + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}
    </div>
  )
}
