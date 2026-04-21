import { useState, useEffect, useRef } from 'react'

// Inject animation keyframes once
if (typeof document !== 'undefined' && !document.getElementById('tp-anim')) {
  const s = document.createElement('style')
  s.id = 'tp-anim'
  s.textContent = `
    @keyframes tpBackdropIn { from { opacity:0; } to { opacity:1; } }
    @keyframes tpSheetIn {
      0%   { opacity:0; transform:scale(0.75) translateY(60px); }
      50%  { opacity:1; transform:scale(1.03) translateY(-4px); }
      100% { opacity:1; transform:scale(1) translateY(0); }
    }
  `
  document.head.appendChild(s)
}

// ── בוחר שעה בקפיצות של 5 דקות, עם לשוניות בוקר/ערב ─────────────
// value / onChange: 'HH:MM' בפורמט 24 שעות
// placeholder: טקסט כשאין ערך
// defaultHint: שעה מוצעת להבלטה כשהבוחר נפתח ללא ערך
// label: כותרת שתוצג בראש החלונית (למשל "תחילת צילומים")
// onPicked: callback אחרי בחירת שעה
// triggerOpen / onOpenHandled: פתיחה אוטומטית מבחוץ
export default function TimePicker({ value, onChange, placeholder = 'בחר שעה', defaultHint = null, label = null, onPicked = null, triggerOpen = false, onOpenHandled = null }) {
  const [open, setOpen] = useState(false)
  // Auto-open when triggerOpen flips to true
  useEffect(() => {
    if (triggerOpen) {
      setOpen(true)
      onOpenHandled?.()
    }
  }, [triggerOpen])
  // 'am' = 00:00–11:45 , 'pm' = 12:00–23:45
  const [period, setPeriod] = useState('am')
  const wrapRef = useRef(null)
  // Guard against closing when a drag-select started inside the picker
  const pressStartedOnBackdropRef = useRef(false)

  // When opening, pick the period that matches the current value OR the default hint
  useEffect(() => {
    if (!open) return
    const basis = value || defaultHint
    if (basis && /^\d{1,2}:\d{2}$/.test(basis)) {
      const h = parseInt(basis.split(':')[0], 10)
      setPeriod(h >= 12 ? 'pm' : 'am')
    } else {
      setPeriod('am')
    }
  }, [open, value, defaultHint])

  // בניית משבצות של 5 דקות עבור התקופה הנבחרת (144 משבצות לכל תקופה)
  const slots = []
  const startHour = period === 'am' ? 0 : 12
  const endHour = period === 'am' ? 12 : 24
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += 5) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      slots.push(`${hh}:${mm}`)
    }
  }

  const isSelected = (slot) => value === slot
  const isHint = (slot) => !value && defaultHint === slot

  const pick = (slot) => {
    onChange(slot)
    setOpen(false)
    onPicked?.(slot)
  }

  const displayLabel = label || 'בחר שעה'

  return (
    <>
      {/* Full-width clickable trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-xl border px-3 py-3 text-center transition-colors
          ${open ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white active:bg-gray-50'}
          ${value ? 'text-gray-800 font-semibold text-base' : 'text-gray-400 text-sm'}`}
      >
        {value || placeholder}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          style={{ animation: 'tpBackdropIn 0.2s ease-out' }}
          onMouseDown={e => { pressStartedOnBackdropRef.current = e.target === e.currentTarget }}
          onMouseUp={e => {
            if (pressStartedOnBackdropRef.current && e.target === e.currentTarget) setOpen(false)
            pressStartedOnBackdropRef.current = false
          }}
          onTouchStart={e => { pressStartedOnBackdropRef.current = e.target === e.currentTarget }}
          onTouchEnd={e => {
            if (pressStartedOnBackdropRef.current && e.target === e.currentTarget) setOpen(false)
            pressStartedOnBackdropRef.current = false
          }}
        >
          <div
            ref={wrapRef}
            onClick={e => e.stopPropagation()}
            className="w-full sm:w-[380px] bg-white border-t sm:border border-gray-200 sm:rounded-2xl rounded-t-3xl shadow-2xl p-4 space-y-3 max-h-[85vh] overflow-hidden flex flex-col"
            style={{ animation: 'tpSheetIn 0.35s cubic-bezier(.22,1,.36,1)', transformOrigin: 'bottom center' }}
          >
            {/* Header */}
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs text-gray-400"
              >
                נקה
              </button>
              <p className="text-base font-bold text-gray-800">{displayLabel}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-gray-500 font-semibold"
              >
                סגור
              </button>
            </div>

            {/* Period tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPeriod('am')}
                className={`py-3 rounded-xl text-sm font-bold transition-colors
                  ${period === 'am' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                <div>בוקר</div>
                <div className="text-[10px] opacity-80 font-normal">00:00 – 11:55</div>
              </button>
              <button
                type="button"
                onClick={() => setPeriod('pm')}
                className={`py-3 rounded-xl text-sm font-bold transition-colors
                  ${period === 'pm' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                <div>אחה״צ / ערב</div>
                <div className="text-[10px] opacity-80 font-normal">12:00 – 23:55</div>
              </button>
            </div>

            {/* Quarter-hour grid — 4 columns with big, tappable buttons */}
            <div className="grid grid-cols-4 gap-2 overflow-y-auto pb-2" dir="rtl">
              {slots.map(slot => {
                const sel = isSelected(slot)
                const hint = isHint(slot)
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => pick(slot)}
                    className={`py-3 rounded-xl text-sm font-bold transition-colors
                      ${sel
                        ? 'bg-green-600 text-white'
                        : hint
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                          : 'bg-gray-50 text-gray-700 active:bg-gray-200'}`}
                  >
                    {slot}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
