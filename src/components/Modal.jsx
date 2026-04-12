import { useEffect, useRef } from 'react'

export default function Modal({ title, onClose, onSave, children }) {
  // Track whether a drag-select started inside the modal body.
  // If it did, we must NOT close even if the user releases on the backdrop.
  const pressStartedOnBackdropRef = useRef(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Enter → save. In textarea: only Shift+Enter saves; plain Enter = newline.
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || !onSave) return
    const tag = e.target?.tagName
    if (tag === 'TEXTAREA' && !e.shiftKey) return
    // בשדות אחרים (input, select) — תמיד שמור
    e.preventDefault()
    onSave()
  }

  const handleBackdropPointerDown = (e) => {
    pressStartedOnBackdropRef.current = e.target === e.currentTarget
  }
  const handleBackdropPointerUp = (e) => {
    // Close only when both press-down AND release happened on the backdrop itself.
    if (pressStartedOnBackdropRef.current && e.target === e.currentTarget) {
      onClose()
    }
    pressStartedOnBackdropRef.current = false
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-5 pb-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onMouseDown={handleBackdropPointerDown}
      onMouseUp={handleBackdropPointerUp}
      onTouchStart={handleBackdropPointerDown}
      onTouchEnd={handleBackdropPointerUp}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden mt-20" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 p-4 scroll-right">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Reusable form field components ────────────────────────────────────────

export function Field({ label, children, hint }) {
  return (
    <div className="mb-4 overflow-hidden">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export function Input({ value, onChange, type = 'text', placeholder, min, step, style }) {
  // בשדה תאריך — פתיחת בוחר התאריכים בלחיצה בכל מקום על השדה (לא רק על האייקון)
  const handleClick = (e) => {
    if (type === 'date' && typeof e.currentTarget.showPicker === 'function') {
      try { e.currentTarget.showPicker() } catch {}
    }
  }
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      onClick={handleClick}
      onFocus={handleClick}
      placeholder={placeholder}
      min={min}
      step={step}
      className="w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
      style={{ maxWidth: '100%', boxSizing: 'border-box', WebkitAppearance: 'none', ...style }}
    />
  )
}

export function Select({ value, onChange, options }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full min-w-0 max-w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 box-border"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Textarea({ value, onChange, placeholder }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none"
    />
  )
}

export function SaveButton({ onClick, label = 'שמור' }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl mt-2 transition-colors"
    >
      {label}
    </button>
  )
}

export function DeleteButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full border border-red-200 text-red-500 hover:bg-red-50 font-medium py-2.5 rounded-xl mt-2 transition-colors text-sm"
    >
      מחק
    </button>
  )
}
