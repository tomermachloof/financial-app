import { Routes, Route } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import BottomNav    from './components/BottomNav'
import Dashboard    from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import LoansPage    from './pages/LoansPage'
import IncomePage   from './pages/IncomePage'
import AccountsPage from './pages/AccountsPage'
import useLiveRates from './hooks/useLiveRates'
import QuickAddModal from './components/QuickAddModal'
import useStore from './store/useStore'
import { saveState } from './lib/supabase'

function useCloudSync() {
  const state = useStore()
  const timerRef = useRef(null)
  const isFirst = useRef(true)
  const stateRef = useRef(state)
  stateRef.current = state

  // Save on every state change (debounced)
  // But NEVER save if cloud hasn't loaded yet (prevents empty state from overwriting cloud)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const delay = isFirst.current ? 5000 : 2000
    isFirst.current = false
    timerRef.current = setTimeout(() => {
      const s = stateRef.current
      // Safety: don't save to cloud if state looks empty/fresh (no lastSaved = never synced)
      if (!s.lastSaved && (s.confirmedEvents || []).length === 0) {
        console.log('[CloudSync] skipping save — state looks fresh/empty, waiting for cloud load')
        return
      }
      saveState(s)
    }, delay)
    return () => clearTimeout(timerRef.current)
  }, [state])

  // Also save every 2 minutes regardless of changes
  useEffect(() => {
    const interval = setInterval(() => {
      saveState(stateRef.current)
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
}

export default function App() {
  useLiveRates()
  useCloudSync()
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  return (
    <>
      <BottomNav />
      <Routes>
        <Route path="/"         element={<Dashboard    />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/loans"    element={<LoansPage    />} />
        <Route path="/income"   element={<IncomePage   />} />
        <Route path="/accounts" element={<AccountsPage />} />
      </Routes>
      {showQuickAdd && <QuickAddModal onClose={() => setShowQuickAdd(false)} />}
      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-20 left-4 z-40 w-14 h-14 bg-blue-600 rounded-full shadow-xl flex items-center justify-center text-white text-3xl font-light active:scale-90 transition-transform"
        style={{ boxShadow: '0 4px 20px rgba(37,99,235,0.4)' }}
      >
        ＋
      </button>
    </>
  )
}
