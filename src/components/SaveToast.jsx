import { useEffect, useState } from 'react'
import useSaveStatus from '../lib/saveStatus'

// Global toast that reacts to save status from saveStatus store.
// 'saved' → green, auto-dismiss after 1.5s.
// 'failed' → red, persistent until next save.
// 'stale' → orange, persistent.
export default function SaveToast() {
  const { status, message } = useSaveStatus()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'idle') { setVisible(false); return }
    if (status === 'saving') { setVisible(false); return }
    setVisible(true)
    if (status === 'saved') {
      const t = setTimeout(() => setVisible(false), 1500)
      return () => clearTimeout(t)
    }
  }, [status])

  if (!visible) return null

  const styles = {
    saved:  { bg: 'bg-green-600',  icon: '✓', text: message || 'נשמר' },
    failed: { bg: 'bg-red-600',    icon: '⚠', text: message || 'שמירה נכשלה' },
    stale:  { bg: 'bg-orange-600', icon: '⚠', text: message || 'מצב הענן חדש יותר — רענן' },
  }[status] || { bg: 'bg-gray-700', icon: '', text: message }

  return (
    <div
      onClick={() => setVisible(false)}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 ${styles.bg} text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 cursor-pointer`}
      style={{ direction: 'rtl' }}
    >
      <span>{styles.icon}</span>
      <span>{styles.text}</span>
    </div>
  )
}
