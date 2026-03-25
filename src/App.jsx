import { Routes, Route } from 'react-router-dom'
import BottomNav    from './components/BottomNav'
import Dashboard    from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import LoansPage    from './pages/LoansPage'
import IncomePage   from './pages/IncomePage'
import AccountsPage from './pages/AccountsPage'
import useLiveRates from './hooks/useLiveRates'

export default function App() {
  useLiveRates()
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
