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
export default function TimePicker({ value, onChange, placeholder = 'בחר שעה', defaultHint = null, label = null, onPicked = null, triggerOpen = false, onOpenHandled = null }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (triggerOpen) {
      setOpen(true)
      onOpenHandled?.()
    }
  }, [triggerOpen])
  const [period, setPeriod] = useState('am')
  const scrollRef = useRef(null)
  const pressStartedOnBackdropRef = useRef(false)

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

  // Scroll to top when switching periods
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [period])

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
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
          style={{ animation: 'tpBackdropIn 0.2s ease-out', touchAction: 'none' }}
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
          {/* Sheet — positioned at bottom on mobile */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              animation: 'tpSheetIn 0.35s cubic-bezier(.22,1,.36,1)',
              transformOrigin: 'bottom center',
              touchAction: 'pan-y',
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '85dvh',
              display: 'flex',
              flexDirection: 'column',
            }}
            className="bg-white border-t border-gray-200 rounded-t-3xl shadow-2xl sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:mx-auto sm:my-auto sm:top-1/2 sm:-translate-y-1/2 sm:w-[380px] sm:rounded-2xl sm:border"
          >
            {/* Fixed header + tabs */}
            <div className="shrink-0 p-4 pb-3 space-y-3">
              <div className="flex justify-between items-center">
                <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="text-xs text-gray-400">
                  נקה
                </button>
                <p className="text-base font-bold text-gray-800">{displayLabel}</p>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 font-semibold">
                  סגור
                </button>
              </div>

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
            </div>

            {/* Scrollable grid — explicit max-height, no flex dependency */}
            <div
              ref={scrollRef}
              style={{
                maxHeight: 'calc(85dvh - 160px)',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
                overflowY: 'scroll',
              }}
              className="px-4"
            >
              <div className="grid grid-cols-4 gap-2" dir="rtl">
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
              {/* Bottom spacer — large enough for safe area + ensures last row visible */}
              <div style={{ height: 'calc(120px + env(safe-area-inset-bottom, 0px))' }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
