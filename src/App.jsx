import { Routes, Route } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import BottomNav    from './components/BottomNav'
import Dashboard    from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import LoansPage    from './pages/LoansPage'
import IncomePage   from './pages/IncomePage'
import AccountsPage from './pages/AccountsPage'
import useLiveRates from './hooks/useLiveRates'
import useStore from './store/useStore'
import { saveState } from './lib/supabase'

function useCloudSync() {
  const state = useStore()
  const timerRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      saveState(state)
    }, 2000) // save 2 seconds after last change
    return () => clearTimeout(timerRef.current)
  }, [state])
}

export default function App() {
  useLiveRates()
  useCloudSync()
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
    </>
  )
}
