import { useState } from 'react'
import useStore from '../store/useStore'
import { getMonthEvents } from '../utils/calculations'
import { formatILS } from '../utils/formatters'
import Backdrop from '../components/Backdrop'

const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

const getEventIcon = (e) => {
  const name = e.name
  if (name.includes('אשראי'))                          return '💳'
  if (name.includes('משכנתא'))                         return '🏠'
  if (name.includes('רוגובין'))                        return '📸'
  if (name.includes('שכירות') || e.type === 'rental')  return '🏠'
  if (name.includes('טלפון') || name.includes('קייס'))               return '📱'
  if (name.includes('טסלה') || name.toLowerCase().includes('tesla') || name.includes('רכב')) return '🚗'
  if (name.includes('הלוואה') || name.includes('קרן') || name.includes('גמל') || name.includes('פניקס') || name.includes('עוגן') || name.includes('דיסקונט') || e.type === 'loan') return '💸'
  if (e.type === 'future')                             return '💰'
  return '📤'
}

export default function CalendarPage() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [detail, setDetail] = useState(null) // null | 'in-ils' | 'out-ils' | 'in-usd' | 'out-usd'

  const { loans, expenses, rentalIncome, futureIncome, usdRate } = useStore()
  const events = getMonthEvents(year, month, loans, expenses, rentalIncome, futureIncome, usdRate)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Group by day
  const byDay = events.reduce((acc, e) => {
    if (!acc[e.day]) acc[e.day] = []
    acc[e.day].push(e)
    return acc
  }, {})

  // Separate ILS and USD totals — include paidByFriend (אליעזר) in totals
  const ilsEvents  = events.filter(e => !e.currency)
  const usdEvents  = events.filter(e => e.currency === 'USD')
  const ilsOut     = ilsEvents.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0)
  const ilsIn      = ilsEvents.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const usdOut     = usdEvents.filter(e => e.amount < 0).reduce((s, e) => s + (e.usdAmount || 0), 0)
  const usdIn      = usdEvents.filter(e => e.amount > 0).reduce((s, e) => s + (e.usdAmount || 0), 0)

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

  const fmtUSD = (n) => `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n)}`

  return (
    <div className="page-content">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 text-lg font-bold hover:bg-blue-200 active:bg-blue-300 active:scale-90 transition-all">
            ‹
          </button>
          <h2 className="text-lg font-bold text-gray-800">
            {MONTHS_HE[month - 1]} {year}
          </h2>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 text-lg font-bold hover:bg-blue-200 active:bg-blue-300 active:scale-90 transition-all">
            ›
          </button>
        </div>

        {/* ILS totals */}
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <button onClick={() => setDetail('out-ils')} className="bg-red-50 rounded-xl py-2 active:opacity-70 text-center w-full">
            <p className="text-xs text-red-400">יוצא ₪ ›</p>
            <p className="font-bold text-red-600 text-sm">{formatILS(Math.abs(ilsOut))}</p>
          </button>
          <button onClick={() => setDetail('in-ils')} className="bg-green-50 rounded-xl py-2 active:opacity-70 text-center w-full">
            <p className="text-xs text-green-500">נכנס ₪ ›</p>
            <p className="font-bold text-green-600 text-sm">{formatILS(ilsIn)}</p>
          </button>
          <div className={`rounded-xl py-2 ${ilsIn + ilsOut >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-400">נטו ₪</p>
            <p className={`font-bold text-sm ${ilsIn + ilsOut >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {formatILS(ilsIn + ilsOut)}
            </p>
          </div>
        </div>

        {/* USD totals */}
        {(usdIn > 0 || usdOut > 0) && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <button onClick={() => setDetail('out-usd')} className="bg-red-50 rounded-xl py-1.5 active:opacity-70 text-center w-full">
              <p className="text-xs text-red-400">יוצא $ ›</p>
              <p className="font-bold text-red-500 text-sm">{fmtUSD(usdOut)}</p>
            </button>
            <button onClick={() => setDetail('in-usd')} className="bg-green-50 rounded-xl py-1.5 active:opacity-70 text-center w-full">
              <p className="text-xs text-green-500">נכנס $ ›</p>
              <p className="font-bold text-green-600 text-sm">{fmtUSD(usdIn)}</p>
            </button>
            <div className={`rounded-xl py-1.5 ${usdIn - usdOut >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-400">נטו $</p>
              <p className={`font-bold text-sm ${usdIn - usdOut >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {usdIn - usdOut >= 0 ? '+' : '-'}{fmtUSD(Math.abs(usdIn - usdOut))}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-3">
        {Object.keys(byDay).sort((a, b) => Number(a) - Number(b)).map(day => {
          const dayEvents = byDay[day]
          const isToday   = isCurrentMonth && Number(day) === today.getDate()
          const isPast    = isCurrentMonth && Number(day) < today.getDate()

          return (
            <div key={day} className={`card overflow-hidden ${isPast ? 'opacity-60' : ''}`}>
              <div className={`flex items-center gap-3 px-4 py-2 ${isToday ? 'bg-blue-600' : 'bg-gray-50'} border-b border-gray-100`}>
                <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-600'}`}>
                  {isToday ? '⚡ ' : ''}{day} ל{MONTHS_HE[month - 1]}
                </span>
                <div className="flex gap-1 mr-auto">
                  {dayEvents.map(e => (
                    <span
                      key={e.id}
                      className={`w-2 h-2 rounded-full ${
                        e.color === 'red'   ? 'bg-red-400' :
                        e.color === 'green' ? 'bg-green-500' :
                        e.color === 'blue'  ? 'bg-blue-400' : 'bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {dayEvents.map(e => {
                  const isUSD    = e.currency === 'USD'
                  const isIncome = e.amount >= 0
                  const dispAmt  = isUSD
                    ? `${isIncome ? '+' : '-'}$${new Intl.NumberFormat('en').format(e.usdGross || e.usdAmount)}`
                    : `${isIncome ? '+' : ''}${formatILS(e.amount)}`

                  return (
                    <div key={e.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-base">{getEventIcon(e)}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{e.name}</p>
                          <p className="text-xs text-gray-400">
                            {e.type === 'loan'    ? 'הלוואה' :
                             e.type === 'expense' ? 'הוצאה קבועה' :
                             e.type === 'rental'  ? 'הכנסת שכירות' :
                             'הכנסה צפויה'}
                            {e.paidByFriend ? ' · משלם אליעזר' : ''}
                            {e.note ? ` · ${e.note}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <span className={`text-sm font-bold ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                          {dispAmt}
                        </span>
                        {isUSD && e.usdDeductions && (
                          <p className="text-xs">
                            <span className="bg-yellow-200 text-yellow-800 font-semibold px-1 rounded text-xs">({e.usdDeductions})</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {events.length === 0 && (
          <div className="card p-8 text-center text-gray-400">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">אין אירועים עם תאריך לחודש זה</p>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detail && (() => {
        const isUSD = detail.endsWith('usd')
        const isIn  = detail.startsWith('in')
        const filtered = events.filter(e =>
          (e.currency === 'USD') === isUSD && (isIn ? e.amount >= 0 : e.amount < 0)
        )
        const title = `${isIn ? 'נכנס' : 'יוצא'} ${isUSD ? '$' : '₪'} — ${MONTHS_HE[month-1]} ${year}`
        return (
          <Backdrop
            className="fixed inset-0 z-[60] flex flex-col justify-end bg-black bg-opacity-30"
            onClose={() => setDetail(null)}
          >
            <div className="relative bg-white rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col">
              <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl ${isIn ? 'bg-green-500' : 'bg-red-500'}`}>
                <h3 className="font-bold text-white text-sm">{title}</h3>
                <button onClick={() => setDetail(null)} className="text-white text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto divide-y divide-gray-100 scroll-right">
                {filtered.map(e => {
                  const amt = isUSD
                    ? `${isIn ? '+' : '-'}$${new Intl.NumberFormat('en').format(e.usdGross || e.usdAmount)}`
                    : `${isIn ? '+' : ''}${formatILS(e.amount)}`
                  return (
                    <div key={e.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{e.name}</p>
                        <p className="text-xs text-gray-400">
                          {e.day} ל{MONTHS_HE[month-1]}
                          {e.note ? ` · ${e.note}` : ''}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${isIn ? 'text-green-600' : 'text-red-500'}`}>{amt}</p>
                        {isUSD && e.usdDeductions && (
                          <p className="text-xs text-yellow-700 bg-yellow-100 px-1 rounded">{e.usdDeductions}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className={`px-4 py-3 border-t border-gray-100 text-center`}>
                <p className={`text-sm font-bold ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                  סה״כ:{' '}
                  {isUSD
                    ? fmtUSD(filtered.reduce((s, e) => s + (e.usdAmount || 0), 0))
                    : formatILS(Math.abs(filtered.reduce((s, e) => s + e.amount, 0)))}
                </p>
              </div>
            </div>
          </Backdrop>
        )
      })()}
    </div>
  )
}
