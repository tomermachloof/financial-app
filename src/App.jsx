import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import BottomNav    from './components/BottomNav'
import Dashboard    from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import LoansPage    from './pages/LoansPage'
import IncomePage   from './pages/IncomePage'
import AccountsPage from './pages/AccountsPage'
import useLiveRates from './hooks/useLiveRates'
import QuickAddModal from './components/QuickAddModal'
import SaveToast from './components/SaveToast'

export default function App() {
  useLiveRates()
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
      <SaveToast />
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
