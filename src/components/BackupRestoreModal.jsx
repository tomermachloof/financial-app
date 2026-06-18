import { useEffect, useState } from 'react'
import { listSnapshots, restoreFromSnapshot } from '../lib/supabase'

// המרת id של גיבוי לתווית קריאה
function snapLabel(id) {
  if (id.startsWith('snap_pre_')) {
    const ts = Number(id.slice('snap_pre_'.length))
    const d = new Date(ts)
    return { kind: 'pre', title: 'נקודה לפני שחזור', sub: isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL') }
  }
  // snap_YYYY-MM-DD
  const date = id.slice('snap_'.length)
  const [y, m, dd] = date.split('-').map(Number)
  const dObj = new Date(y, (m || 1) - 1, dd || 1)
  const title = isNaN(dObj.getTime())
    ? date
    : dObj.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return { kind: 'day', title, sub: '' }
}

export default function BackupRestoreModal({ onClose }) {
  const [list, setList] = useState(null)        // null = טוען
  const [busy, setBusy] = useState(false)        // שחזור בתהליך
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    listSnapshots().then(setList).catch(() => setList([]))
  }, [])

  const doRestore = async (id) => {
    setBusy(true)
    try {
      await restoreFromSnapshot(id)
      // טעינה-מחדש כדי שהאפליקציה תיטען נקי מהמצב המשוחזר
      window.location.reload()
    } catch (e) {
      alert('שחזור נכשל: ' + (e?.message || e))
      setBusy(false)
      setConfirmId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={busy ? undefined : onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">🛟 גיבויים ושחזור</h2>
          <button onClick={onClose} disabled={busy} className="text-gray-400 text-2xl leading-none disabled:opacity-40">×</button>
        </div>

        {busy ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-3xl animate-pulse">⏳</p>
            <p className="font-semibold text-gray-800">משחזר…</p>
            <p className="text-xs text-gray-500">רגע, טוען מחדש את המצב</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <p className="text-xs text-gray-500 mb-1">
              בחר נקודה לשחזור. לפני כל שחזור נשמר אוטומטית גיבוי של המצב הנוכחי — כך תמיד אפשר לחזור אחורה.
            </p>
            {list === null && <p className="text-center text-gray-400 py-6 text-sm">טוען…</p>}
            {list && list.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">אין עדיין גיבויים</p>}
            {list && list.map(snap => {
              const { kind, title, sub } = snapLabel(snap.id)
              const isConfirm = confirmId === snap.id
              return (
                <div key={snap.id} className={`rounded-2xl border p-3 ${kind === 'pre' ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{title}</p>
                      {sub && <p className="text-xs text-gray-400">{sub}</p>}
                      {kind === 'pre' && <p className="text-[11px] text-amber-600">נשמר אוטומטית לפני שחזור</p>}
                    </div>
                    {isConfirm ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => doRestore(snap.id)} className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">אישור</button>
                        <button onClick={() => setConfirmId(null)} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">בטל</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmId(snap.id)} className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0">שחזר</button>
                    )}
                  </div>
                  {isConfirm && (
                    <p className="text-[11px] text-red-500 mt-2">
                      פעולה זו תחליף את כל הנתונים הנוכחיים במצב מ־{title}. (המצב הנוכחי ייגבה קודם.)
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
