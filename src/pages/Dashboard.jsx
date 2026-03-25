import { useState, useEffect } from 'react'
import useStore from '../store/useStore'
import {
  calcTotalLiquidity, calcNetWorth, calcSafeToSpend,
  calcMonthlyOut, calcMonthlyIn, getUpcomingEvents, calcRemainingBalance,
} from '../utils/calculations'
import { formatILS, formatDateShort, daysUntil } from '../utils/formatters'

const colorMap = {
  red:    { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-400'    },
  green:  { bg: 'bg-green-50',  text: 'text-green-600',  dot: 'bg-green-500'  },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   dot: 'bg-blue-400'   },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', dot: 'bg-orange-400' },
}

const RANGE_OPTIONS = [
  { days: 14,  label: '14 יום' },
  { days: 30,  label: '30 יום' },
  { days: 90,  label: '3 חודשים' },
]

export default function Dashboard() {
  const { accounts, investments, loans, expenses, rentalIncome, futureIncome, debts, eurRate, usdRate, confirmedEvents, confirmEvent, unconfirmEvent, discountTransferDone, confirmDiscountTransfer, undoDiscountTransfer, friendReminders, setFriendReminderSent, undoFriendReminderSent, setFriendMoneyReceived, undoFriendMoneyReceived, updateExpenseMonthlyAmount } = useStore()

  const [rangeDays, setRangeDays] = useState(14)
  const [filterType, setFilterType] = useState('all') // 'all' | 'income' | 'expense'
  const [filterCurrency, setFilterCurrencyState] = useState(() => localStorage.getItem('dash_filterCurrency') || 'all')
  const setFilterCurrency = v => { setFilterCurrencyState(v); localStorage.setItem('dash_filterCurrency', v) }
  const [showAlert, setShowAlert] = useState(false)
  const [showAccountsModal, setShowAccountsModal] = useState(null) // null | 'ILS' | 'USD'
  const [showNetWorthModal, setShowNetWorthModal] = useState(false)
  const [ccDraft, setCCDraft] = useState({}) // local edits before saving
  const [ccSaved, setCCSaved] = useState(false)
  const [ccEditing, setCCEditing] = useState(false)

  const liquidity    = calcTotalLiquidity(accounts, usdRate)
  const ilsLiquidity = accounts.filter(a => a.currency !== 'USD').reduce((s, a) => s + (a.balance || 0), 0)
  const usdLiquidity = accounts.filter(a => a.currency === 'USD').reduce((s, a) => s + (a.usdBalance || 0), 0)
  const rates        = { eur: eurRate, usd: usdRate }
  const netWorth     = calcNetWorth(accounts, investments, loans, debts, rates)
  const mortgageTotal = loans.filter(l => l.type === 'mortgage').reduce((s, l) => {
    const { balance } = calcRemainingBalance(l)
    return s + (balance ?? l.balanceOverride ?? l.totalAmount ?? 0)
  }, 0)
  const netWorthNoMortgage = netWorth + mortgageTotal
  const safeToSpend  = calcSafeToSpend(accounts, loans, expenses, usdRate)
  const monthlyOut   = calcMonthlyOut(loans, expenses, usdRate)
  const monthlyIn    = calcMonthlyIn(rentalIncome, usdRate)
  const monthlyNet   = monthlyIn - monthlyOut

  const today        = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr     = today.toISOString().split('T')[0]
  const yesterday    = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const isConfirmed  = (id, dateStr) => confirmedEvents.some(e => e.id === id && e.date === dateStr)
  const accountMap   = Object.fromEntries(accounts.map(a => [a.id, a.name]))

  const CC_IDS        = ['e_cc1', 'e_cc2', 'e_cc3']
  const ccExpenses    = expenses.filter(e => CC_IDS.includes(e.id))
  const CC_CHARGE_DAY = 10
  const allCCSaved    = ccExpenses.length === 3 && ccExpenses.every(e => e.monthlyAmounts?.[thisMonthKey] != null)
  const showCCWidget  = today.getDate() >= CC_CHARGE_DAY - 1 && today.getDate() <= CC_CHARGE_DAY

  const ccChargeDate    = new Date(today.getFullYear(), today.getMonth(), CC_CHARGE_DAY)
  const ccChargeDateStr = ccChargeDate.toISOString().split('T')[0]
  const allCCPaid       = ccExpenses.length > 0 && ccExpenses.every(e => isConfirmed(e.id, ccChargeDateStr))
  const ccMonthLabel    = `אשראי ${today.toLocaleDateString('he-IL', { month: 'long' })}`
  const confirmCCRolledOver = () => ccExpenses.forEach(e => {
    const amt = e.monthlyAmounts?.[thisMonthKey] ?? e.amount
    confirmEvent(e.id, yesterdayStr, e.accountId, -amt, false, true)
  })

  const getCCValue = (id) => {
    if (ccDraft[id] !== undefined) return ccDraft[id]
    const stored = expenses.find(e => e.id === id)?.monthlyAmounts?.[thisMonthKey]
    return stored != null ? String(stored) : ''
  }
  const saveCCAmounts = () => {
    // Compute final amounts (draft > stored > default)
    const finalAmounts = {}
    ccExpenses.forEach(e => {
      const draft  = ccDraft[e.id]
      const stored = e.monthlyAmounts?.[thisMonthKey]
      const parsed = draft !== undefined ? parseInt(draft, 10) : null
      finalAmounts[e.id] = (parsed != null && !isNaN(parsed) && parsed >= 0) ? parsed
                         : stored != null ? stored
                         : e.amount
    })
    // Save monthly amounts only — deduction happens on charge day via normal event flow
    ccExpenses.forEach(e => updateExpenseMonthlyAmount(e.id, thisMonthKey, finalAmounts[e.id]))
    setCCDraft({})
    setCCEditing(false)
  }
  const ccTotal = ccExpenses.reduce((s, e) => {
    const stored = e.monthlyAmounts?.[thisMonthKey]
    const draft  = ccDraft[e.id]
    const val = draft !== undefined ? (parseInt(draft, 10) || 0)
              : stored != null     ? stored
              : (e.amount || 0)
    return s + val
  }, 0)

  // ── Discount transfer reminder ─────────────────────────────────────────
  const DISCOUNT_IDS    = ['ba9', 'ba10']
  const TRANSFER_DAY    = 1
  const TRANSFER_AMOUNT = 12000
  const REMINDER_DAYS   = 2

  const nextFirst = (() => {
    const d = new Date(today)
    d.setDate(TRANSFER_DAY)
    if (today.getDate() >= TRANSFER_DAY) d.setMonth(d.getMonth() + 1)
    return d
  })()
  const discountMonthKey  = `${nextFirst.getFullYear()}-${String(nextFirst.getMonth() + 1).padStart(2, '0')}`
  const discountDone      = (discountTransferDone || []).includes(discountMonthKey)
  const daysUntilTransfer = Math.ceil((nextFirst - today) / 86400000)

  // Events from today until the 20th — to compute each account's free balance
  const eventsUntil20 = getUpcomingEvents(loans, expenses, rentalIncome, futureIncome, daysUntilTransfer, usdRate, 0)

  const discountSourceAccounts = accounts
    .filter(a => a.currency !== 'USD' && !DISCOUNT_IDS.includes(a.id))
    .map(a => {
      const charges = eventsUntil20
        .filter(e => e.accountId === a.id && e.amount < 0 && !e.noBalanceEffect && !e.paidViaCredit)
        .reduce((s, e) => s + Math.abs(e.effectiveAmount != null ? e.effectiveAmount : e.amount), 0)
      const freeBalance = (a.balance || 0) - charges
      return { id: a.id, name: a.name, balance: a.balance || 0, charges, freeBalance }
    })
    .filter(a => a.freeBalance > 0)
    .sort((a, b) => b.freeBalance - a.freeBalance)

  // Friend loan IDs — hardcoded so balance forecast is never affected regardless of stored state
  const FRIEND_LOAN_IDS = ['l17', 'l18']
  const isFriendLoan  = (e) => e.paidByFriend || FRIEND_LOAN_IDS.some(id => e.id === id || e.id.startsWith(id + '_'))

  // Delta to apply to account when confirming (0 for noBalanceEffect / paidViaCredit / paidByFriend)
  const calcDelta = (e) => {
    if (e.noBalanceEffect || e.paidViaCredit || isFriendLoan(e) || !e.accountId) return 0
    if (e.currency === 'USD') return e.amount >= 0 ? (e.usdAmount || 0) : -(e.usdAmount || 0)
    if (e.effectiveAmount != null) return e.amount >= 0 ? e.effectiveAmount : -e.effectiveAmount
    return e.amount
  }

  // Effective ILS delta for running balance forecast
  const ilsDelta = (e) => {
    if (e.currency === 'USD' || e.noBalanceEffect || e.paidViaCredit || isFriendLoan(e)) return 0
    if (e.effectiveAmount != null) return e.amount >= 0 ? e.effectiveAmount : -e.effectiveAmount
    return e.amount
  }
  const usdDelta = (e) => {
    if (e.currency !== 'USD' || e.noBalanceEffect) return 0
    return e.amount >= 0 ? (e.usdAmount || 0) : -(e.usdAmount || 0)
  }

  // Compute danger date — first ILS balance goes negative (always 90-day look-ahead)
  // CC expenses excluded — they're estimates confirmed separately on charge day
  const CC_IDS_DANGER = ['e_cc1', 'e_cc2', 'e_cc3']
  const danger90Raw = getUpcomingEvents(loans.filter(l => !l.paidByFriend), expenses.filter(e => !CC_IDS_DANGER.includes(e.id)), rentalIncome, futureIncome, 90, usdRate, 0)
  let _runILS = ilsLiquidity
  let _runUSD = usdLiquidity
  let ilsDangerEvent = null
  let usdDangerEvent = null
  for (const e of danger90Raw) {
    _runUSD += usdDelta(e)
    _runILS += ilsDelta(e)
    if (!usdDangerEvent && _runUSD < 0) usdDangerEvent = { ...e, balanceAfterUSD: _runUSD }
    if (!ilsDangerEvent && _runILS < 0) ilsDangerEvent = { ...e, balanceAfter: _runILS }
  }

  // Fetch from yesterday to catch unconfirmed rollover events
  const allRaw = getUpcomingEvents(loans, expenses, rentalIncome, futureIncome, rangeDays, usdRate, 1)

  // Per-account running balances (native currency)
  const runningAccBal = {}
  accounts.forEach(a => {
    runningAccBal[a.id] = a.currency === 'USD' ? (a.usdBalance || 0) : (a.balance || 0)
  })

  // Running balances — USD events affect USD account, ILS events affect ILS account
  let runningILS = ilsLiquidity
  let runningUSD = usdLiquidity
  const allEvents = allRaw.map(e => {
    const d = new Date(e.date); d.setHours(0,0,0,0)
    const dateStr = d.toISOString().split('T')[0]
    runningUSD += usdDelta(e)
    if (!isFriendLoan(e)) runningILS += ilsDelta(e)
    const accountName = e.accountId ? accountMap[e.accountId] : null

    // Per-account sufficiency check (only for outgoing charges, skip confirmed)
    let accountStatus = null
    const evDelta = calcDelta(e)
    const alreadyConfirmed = isConfirmed(e.id, dateStr)
    if (!alreadyConfirmed && e.accountId && evDelta !== 0) {
      const bal = runningAccBal[e.accountId] ?? 0
      const balAfter = bal + evDelta
      if (evDelta < 0) {
        accountStatus = balAfter >= 0
          ? { ok: true,  balAfter }
          : { ok: false, needed: Math.ceil(Math.abs(balAfter)) }
      }
      runningAccBal[e.accountId] = balAfter
    }

    return { ...e, balanceAfter: runningILS, balanceAfterUSD: runningUSD, dateStr, accountName, accountStatus }
  })

  // Rolled-over: yesterday's unconfirmed events → show today
  const rolledOver = allEvents
    .filter(e => e.dateStr === yesterdayStr && !isConfirmed(e.id, yesterdayStr))
    .map(e => ({ ...e, date: today, dateStr: todayStr, rolledOver: true, id: e.id + '_ro' }))

  const todayEvents = [
    ...rolledOver,
    ...allEvents.filter(e => e.dateStr === todayStr && !isConfirmed(e.id, todayStr)),
  ]
  const isConfirmedRo = (id) => confirmedEvents.some(e => e.id === id && e.date === yesterdayStr && e._ro)
  const confirmedRolledOver = allEvents
    .filter(e => e.dateStr === yesterdayStr && isConfirmedRo(e.id))
    .map(e => ({ ...e, date: today, dateStr: todayStr, _confirmedRo: true }))
  const confirmedToday = [
    ...allEvents.filter(e => e.dateStr === todayStr && isConfirmed(e.id, todayStr)),
    ...confirmedRolledOver,
  ]
  const soonEvents = allEvents.filter(e => e.dateStr > todayStr)

  const isIncome  = e => e.type === 'rental' || e.type === 'future'
  const isExpense = e => e.type === 'expense' || e.type === 'loan'
  const applyFilter = arr => {
    let res = filterType === 'income'  ? arr.filter(isIncome)  :
              filterType === 'expense' ? arr.filter(isExpense) : arr
    if (filterCurrency === 'ILS') res = res.filter(e => e.currency !== 'USD')
    if (filterCurrency === 'USD') res = res.filter(e => e.currency === 'USD')
    return res
  }

  const visibleToday     = todayEvents
  const visibleConfirmed = confirmedToday
  const visibleSoon      = applyFilter(soonEvents)

  // Friend payments that reminder was sent but money not received yet — show in היום section
  const friendPendingPayments = loans.filter(l => l.paidByFriend).flatMap(loan => {
    const nextCharge = (() => { const d = new Date(today); d.setDate(loan.chargeDay); if (today.getDate() > loan.chargeDay) d.setMonth(d.getMonth() + 1); return d })()
    const monthKey = `${nextCharge.getFullYear()}-${String(nextCharge.getMonth() + 1).padStart(2, '0')}`
    const rec = (friendReminders || []).find(r => r.loanId === loan.id && r.monthKey === monthKey)
    if (!rec?.reminderSent || rec?.moneyReceived) return []
    return [{ loan, monthKey, nextCharge }]
  })

  // Notifications count — badge only when danger date is within 7 days
  const dangerDaysLeft = ilsDangerEvent
    ? daysUntil(ilsDangerEvent.date instanceof Date ? ilsDangerEvent.date.toISOString() : String(ilsDangerEvent.date))
    : null
  const alertCount = (dangerDaysLeft !== null && dangerDaysLeft <= 7) ? 1 : 0

  return (
    <div className="page-content">
      {/* Header */}
      <div className="bg-blue-600 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-xl font-bold">שלום תומר 👋</h1>
            <p className="text-blue-200 text-sm">
              {today.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button onClick={() => setShowAlert(v => !v)} className="relative focus:outline-none active:scale-90 transition-transform">
            <span className="text-2xl">🔔</span>
            {alertCount > 0 && (
              <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {alertCount}
              </span>
            )}
          </button>
        </div>

        {/* key metric */}
        <div className="bg-white bg-opacity-20 rounded-2xl p-3 flex items-center justify-between">
          <button onClick={() => setShowAccountsModal('ILS')} className="text-right active:opacity-70 transition-opacity">
            <p className="text-xs text-blue-200 font-medium">💳 נזילות נוכחית ›</p>
            <p className="text-lg font-bold text-white">{formatILS(ilsLiquidity)}</p>
            <p className="text-xs text-blue-300">חשבונות ₪</p>
          </button>
          <div className="w-px h-14 bg-white bg-opacity-30 mx-2" />
          <button onClick={() => setShowAccountsModal('USD')} className="text-left active:opacity-70 transition-opacity">
            <p className="text-xs text-blue-200 font-medium">💵 דולרים ›</p>
            <p className="text-lg font-bold text-white">${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(usdLiquidity)}</p>
            <p className="text-xs text-blue-300">{formatILS(usdLiquidity * usdRate)}</p>
            <button onClick={e => { e.stopPropagation(); setShowNetWorthModal(true) }} className="text-left active:opacity-70 mt-1">
              <p className="text-xs text-blue-200">📊 הון נטו (ללא משכנתא) ›</p>
              <p className={`text-base font-bold ${netWorthNoMortgage >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatILS(netWorthNoMortgage)}</p>
              <p className={`text-xs ${netWorth >= 0 ? 'text-green-400' : 'text-red-400'} opacity-70`}>כולל משכנתא: {formatILS(netWorth)}</p>
            </button>
          </button>
        </div>
      </div>

      {/* Alert panel */}
      {showAlert && (
        <div className="mx-4 mt-3 rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">🔔 תחזית נזילות</span>
            <button onClick={() => setShowAlert(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <div className="p-4 space-y-3">
            {/* ILS danger */}
            {ilsDangerEvent ? (
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xs text-red-400 mb-1">⚠️ יתרה שקלית תרד לשלילי</p>
                <p className="text-sm font-bold text-red-600">
                  {ilsDangerEvent.date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-red-500 mt-0.5">אחרי: {ilsDangerEvent.name}</p>
                <p className="text-xs text-red-400">יתרה צפויה: {formatILS(ilsDangerEvent.balanceAfter)}</p>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-green-500">✅ יתרה שקלית</p>
                <p className="text-sm font-bold text-green-600">חיובית ב-90 הימים הקרובים</p>
              </div>
            )}
            {/* USD danger */}
            {usdDangerEvent ? (
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xs text-red-400 mb-1">⚠️ יתרה דולרית תרד לשלילי</p>
                <p className="text-sm font-bold text-red-600">
                  {usdDangerEvent.date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-red-500 mt-0.5">אחרי: {usdDangerEvent.name}</p>
                <p className="text-xs text-red-400">יתרה צפויה: ${Math.round(usdDangerEvent.balanceAfterUSD)}</p>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-green-500">✅ יתרה דולרית</p>
                <p className="text-sm font-bold text-green-600">חיובית ב-90 הימים הקרובים</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">

        {/* Discount transfer reminder — 2 days before the 1st */}
        {(daysUntilTransfer <= REMINDER_DAYS || discountDone) && <div className={`card overflow-hidden ${!discountDone ? 'border border-blue-200' : ''}`}>
          <div className={`flex items-center justify-between px-4 py-2.5 ${discountDone ? 'bg-green-50' : daysUntilTransfer <= 3 ? 'bg-red-50' : daysUntilTransfer <= 7 ? 'bg-orange-50' : 'bg-blue-50'}`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{discountDone ? '✅' : '🏦'}</span>
              <div>
                <p className={`text-xs font-bold ${discountDone ? 'text-green-700' : daysUntilTransfer <= 3 ? 'text-red-600' : daysUntilTransfer <= 7 ? 'text-orange-600' : 'text-blue-700'}`}>
                  העברה חודשית לדיסקונט — ₪{(TRANSFER_AMOUNT * 2).toLocaleString()}
                </p>
                <p className={`text-xs ${discountDone ? 'text-green-500' : 'text-gray-400'}`}>
                  {discountDone
                    ? `✓ בוצע לחודש ${nextFirst.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}`
                    : daysUntilTransfer === 0
                      ? `⚡ היום! · ${nextFirst.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`
                      : `עוד ${daysUntilTransfer} ימים · ${nextFirst.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`
                  }
                </p>
              </div>
            </div>
            {discountDone
              ? <button onClick={() => undoDiscountTransfer(discountMonthKey)} className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-lg">↩ בטל</button>
              : <button onClick={() => confirmDiscountTransfer(discountMonthKey)} className="text-xs bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg active:opacity-70">✓ בוצע</button>
            }
          </div>
          {!discountDone && (
            <div className="px-4 py-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded-xl p-2 text-center">
                  <p className="text-gray-400">דיסקונט תומר</p>
                  <p className="font-bold text-gray-700">{formatILS(TRANSFER_AMOUNT)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-2 text-center">
                  <p className="text-gray-400">דיסקונט יעל</p>
                  <p className="font-bold text-gray-700">{formatILS(TRANSFER_AMOUNT)}</p>
                </div>
              </div>
              {discountSourceAccounts.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">💡 מומלץ להעביר מ:</p>
                  {discountSourceAccounts.slice(0, 3).map((a, i) => (
                    <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        {i === 0 && <span className="text-xs bg-green-100 text-green-700 font-bold px-1.5 rounded">מומלץ</span>}
                        <span className="text-xs text-gray-700 font-medium">{a.name}</span>
                      </div>
                      <div className="text-left">
                        <span className={`text-xs font-bold ${a.freeBalance >= TRANSFER_AMOUNT * 2 ? 'text-green-600' : a.freeBalance >= TRANSFER_AMOUNT ? 'text-orange-500' : 'text-red-500'}`}>
                          {formatILS(Math.round(a.freeBalance))} פנוי
                        </span>
                        {a.charges > 0 && <p className="text-xs text-gray-300">אחרי חיובים: {formatILS(Math.round(a.charges))}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {discountSourceAccounts.length === 0 && (
                <p className="text-xs text-red-400 text-center py-1">⚠️ אין חשבון עם יתרה פנויה מספיקה</p>
              )}
            </div>
          )}
        </div>}

        {/* Credit card monthly amounts widget — visible only up to charge day */}
        {ccExpenses.length > 0 && showCCWidget && (() => {
          const showConfirmed = allCCSaved && !ccEditing

          if (showConfirmed) {
            // ── Locked state ─────────────────────────────────────────────
            return (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-green-50">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💳</span>
                    <div>
                      <p className="text-xs font-bold text-green-700">✓ {ccMonthLabel} — שולם</p>
                      <p className="text-xs text-green-500">סה״כ: {formatILS(ccTotal)}</p>
                    </div>
                  </div>
                  <button onClick={() => setCCEditing(true)} className="text-xs text-gray-400 border border-gray-200 bg-white px-2 py-1 rounded-lg active:opacity-70">✏️ ערוך</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {ccExpenses.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                      <p className="text-sm font-medium text-gray-700">{e.name}</p>
                      <p className="text-sm font-bold text-green-600">{formatILS(e.monthlyAmounts?.[thisMonthKey] ?? e.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          // ── Input state ─────────────────────────────────────────────────
          const hasDraft = Object.keys(ccDraft).length > 0
          return (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50">
                <div className="flex items-center gap-2">
                  <span className="text-base">💳</span>
                  <div>
                    <p className="text-xs font-bold text-indigo-700">חיובי אשראי — {today.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</p>
                    <p className="text-xs text-indigo-400">סה״כ: {formatILS(ccTotal)}</p>
                  </div>
                </div>
                {ccSaved && <span className="text-xs text-green-600 font-semibold">✓ נשמר</span>}
              </div>
              <div className="divide-y divide-gray-50">
                {ccExpenses.map(e => {
                  const stored = e.monthlyAmounts?.[thisMonthKey]
                  const val    = getCCValue(e.id)
                  return (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{e.name}</p>
                        <p className="text-xs text-gray-400">
                          {stored != null ? `עודכן · ברירת מחדל: ${formatILS(e.amount)}` : `ברירת מחדל: ${formatILS(e.amount)}`}
                        </p>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={val}
                        placeholder={String(e.amount)}
                        onChange={ev => setCCDraft(d => ({ ...d, [e.id]: ev.target.value }))}
                        className="w-24 text-left border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-700 focus:outline-none focus:border-indigo-400"
                        dir="ltr"
                      />
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-400">סה״כ: {formatILS(ccTotal)}</p>
                <button onClick={saveCCAmounts} className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl active:opacity-70 active:scale-95 transition-all">
                  ✓ אשר סכומים
                </button>
              </div>
            </div>
          )
        })()}

        {/* Friend loan reminders */}
        {loans.filter(l => l.paidByFriend).map(loan => {
          const nextCharge = (() => {
            const d = new Date(today)
            d.setDate(loan.chargeDay)
            if (today.getDate() > loan.chargeDay) d.setMonth(d.getMonth() + 1)
            return d
          })()
          const daysLeft  = Math.ceil((nextCharge - today) / 86400000)
          const monthKey  = `${nextCharge.getFullYear()}-${String(nextCharge.getMonth() + 1).padStart(2, '0')}`
          const rec       = (friendReminders || []).find(r => r.loanId === loan.id && r.monthKey === monthKey)
          const reminderSent  = rec?.reminderSent  || false
          const moneyReceived = rec?.moneyReceived || false
          const showCard  = (daysLeft <= (loan.reminderDaysBefore ?? 2) && !moneyReceived) || moneyReceived
          if (!showCard) return null

          const extras    = (loan.extras || [])
          const extrasTotal = extras.reduce((s, x) => s + x.amount, 0)
          const totalAmount = loan.monthlyPayment + extrasTotal

          return (
            <div key={loan.id} className={`card overflow-hidden border ${moneyReceived ? 'border-green-200' : daysLeft === 0 ? 'border-red-200' : 'border-orange-200'}`}>
              <div className={`flex items-center justify-between px-4 py-2.5 ${moneyReceived ? 'bg-green-50' : daysLeft === 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
                <div>
                  <p className={`text-xs font-bold ${moneyReceived ? 'text-green-700' : daysLeft === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    💬 תזכורת ל{loan.friendName} — {loan.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {moneyReceived
                      ? '✓ הכסף התקבל'
                      : daysLeft === 0
                        ? `⚡ היום! · ${nextCharge.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`
                        : `עוד ${daysLeft} ימים · ${nextCharge.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`
                    }
                  </p>
                </div>
                {moneyReceived
                  ? <button onClick={() => undoFriendMoneyReceived(loan.id, monthKey)} className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-lg">↩</button>
                  : <div className="flex gap-1.5">
                      <button
                        onClick={() => reminderSent ? undoFriendReminderSent(loan.id, monthKey) : setFriendReminderSent(loan.id, monthKey)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${reminderSent ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200'}`}
                      >
                        {reminderSent ? '✉️ נשלח' : '✉️ שלח'}
                      </button>
                      {!reminderSent && (
                        <button
                          onClick={() => setFriendMoneyReceived(loan.id, monthKey, totalAmount, loan.accountId)}
                          className="text-xs bg-green-600 text-white font-semibold px-2.5 py-1.5 rounded-lg"
                        >
                          ✓ התקבל
                        </button>
                      )}
                    </div>
                }
              </div>
              {/* Amount breakdown */}
              <div className="px-4 py-2.5 border-t border-gray-100">
                <div className="flex items-end justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-gray-400">{loan.name}: <span className="font-medium text-gray-600">{formatILS(loan.monthlyPayment)}</span></p>
                    {extras.map(x => (
                      <p key={x.name} className="text-xs text-gray-400">{x.name} ({x.remainingPayments} תשלומים): <span className="font-medium text-gray-600">{formatILS(x.amount)}</span></p>
                    ))}
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-400">סה״כ להעביר</p>
                    <p className="text-lg font-bold text-gray-800">{formatILS(totalAmount)}</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Today's events */}
        {(visibleToday.length > 0 || visibleConfirmed.length > 0 || friendPendingPayments.length > 0) && (() => {
          const ccAllRolledOver = !showCCWidget && CC_IDS.every(id => visibleToday.some(e => e.id === id + '_ro'))
          const ccRoPaid        = ccExpenses.length > 0 && ccExpenses.every(e => isConfirmed(e.id, yesterdayStr))
          const ccTodayEvents   = CC_IDS.map(id => visibleToday.find(e => e.id === id)).filter(Boolean)
          const ccAllToday      = ccTodayEvents.length === CC_IDS.length && !ccExpenses.every(e => isConfirmed(e.id, todayStr))
          const confirmCCToday  = () => ccTodayEvents.forEach(e => {
            confirmEvent(e.id, todayStr, e.accountId, calcDelta(e), e.currency === 'USD', false)
          })
          return (
          <Section title="היום" icon="⚡" subtitle={today.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}>
            {/* CC confirm-all banner — charge day */}
            {ccAllToday && (
              <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                <div>
                  <p className="text-xs font-bold text-indigo-700">💳 {ccMonthLabel}</p>
                  <p className="text-xs text-indigo-400">סה״כ: {formatILS(ccTotal)}</p>
                </div>
                <button onClick={confirmCCToday} className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl active:opacity-70">✓ אשר הכל</button>
              </div>
            )}
            {/* CC rolled-over confirm-all banner */}
            {ccAllRolledOver && !ccRoPaid && (
              <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                <div>
                  <p className="text-xs font-bold text-indigo-700">💳 חיובי אשראי מאתמול</p>
                  <p className="text-xs text-indigo-400">סה״כ: {formatILS(ccTotal)}</p>
                </div>
                <button onClick={confirmCCRolledOver} className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl active:opacity-70">✓ אשר הכל</button>
              </div>
            )}
            {visibleToday.map(e => (
              <EventRow
                key={e.id}
                event={e}
                highlight
                onShowAccounts={() => setShowAccountsModal(e.currency === 'USD' ? 'USD' : 'ILS')}
                onConfirm={() => {
                  const id      = e.rolledOver ? e.id.replace('_ro','') : e.id
                  const dateStr = e.rolledOver ? yesterdayStr : todayStr
                  const delta   = calcDelta(e)
                  confirmEvent(id, dateStr, e.accountId || null, delta, e.currency === 'USD', e.rolledOver)
                }}
              />
            ))}
            {friendPendingPayments.map(({ loan, monthKey, nextCharge }) => (
              <div key={loan.id + '_friend'} className="flex items-center justify-between px-4 py-3 bg-blue-50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{loan.name}</p>
                    <p className="text-xs text-gray-400">
                      ממתין להעברה מ{loan.friendName} · {nextCharge.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-green-600">+{formatILS(loan.monthlyPayment)}</span>
                  <button
                    onClick={() => setFriendMoneyReceived(loan.id, monthKey, loan.monthlyPayment, loan.accountId)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-green-100 hover:text-green-600 transition-colors flex-shrink-0"
                  >
                    ✓
                  </button>
                </div>
              </div>
            ))}
            {visibleConfirmed.map(e => (
              <EventRow
                key={e.id + '_done'}
                event={e}
                confirmed
                onShowAccounts={() => setShowAccountsModal(e.currency === 'USD' ? 'USD' : 'ILS')}
                onUnconfirm={() => unconfirmEvent(e.id, e._confirmedRo ? yesterdayStr : todayStr)}
              />
            ))}
          </Section>
          )
        })()}

        {/* Upcoming events */}
        {visibleSoon.length > 0 && (
          <Section
            title={`${RANGE_OPTIONS.find(o => o.days === rangeDays)?.label} הקרובים`}
            icon="📅"
            toolbar={
              <div className="flex gap-1 items-center">
                {RANGE_OPTIONS.map(o => (
                  <button
                    key={o.days}
                    onClick={() => setRangeDays(o.days)}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors
                      ${rangeDays === o.days ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                  >
                    {o.label}
                  </button>
                ))}
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                {[
                  { v: 'all',     label: 'הכל', active: 'bg-gray-700 text-white',  inactive: 'text-gray-400' },
                  { v: 'income',  label: '💚',   active: 'bg-green-500 text-white', inactive: 'text-gray-400' },
                  { v: 'expense', label: '🔴',   active: 'bg-red-500 text-white',   inactive: 'text-gray-400' },
                ].map(o => (
                  <button
                    key={o.v}
                    onClick={() => setFilterType(o.v)}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors
                      ${filterType === o.v ? o.active : o.inactive}`}
                  >
                    {o.label}
                  </button>
                ))}
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                {[
                  { v: 'all', label: '🌐', active: 'bg-gray-700 text-white', inactive: 'text-gray-400' },
                  { v: 'ILS', label: '₪',  active: 'bg-blue-600 text-white', inactive: 'text-gray-400' },
                  { v: 'USD', label: '$',  active: 'bg-green-600 text-white', inactive: 'text-gray-400' },
                ].map(o => (
                  <button
                    key={o.v}
                    onClick={() => setFilterCurrency(o.v)}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors
                      ${filterCurrency === o.v ? o.active : o.inactive}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            }
          >
            {visibleSoon.map(e => <EventRow key={e.id} event={e} onShowAccounts={() => setShowAccountsModal(e.currency === 'USD' ? 'USD' : 'ILS')} />)}
          </Section>
        )}

        {visibleToday.length === 0 && visibleConfirmed.length === 0 && visibleSoon.length === 0 && (
          <div className="card p-6 text-center text-gray-400">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-sm">אין אירועים קרובים</p>
          </div>
        )}

      </div>

      {/* Accounts balance modal */}
      {showAccountsModal && (() => {
        const isUSDModal = showAccountsModal === 'USD'
        const filtered = accounts
          .filter(a => isUSDModal ? a.currency === 'USD' : a.currency !== 'USD')
          .slice().sort((a, b) => {
            const balA = isUSDModal ? (a.usdBalance || 0) : (a.balance || 0)
            const balB = isUSDModal ? (b.usdBalance || 0) : (b.balance || 0)
            return balB - balA
          })
        const total = filtered.reduce((s, a) => s + (isUSDModal ? (a.usdBalance || 0) : (a.balance || 0)), 0)
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowAccountsModal(null)}>
            <div className="absolute inset-0 bg-black bg-opacity-40" />
            <div className="relative bg-white rounded-t-2xl w-full shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">
                  {isUSDModal ? '💵 יתרות חשבונות דולריים' : '💳 יתרות חשבונות שקליים'}
                </h3>
                <button onClick={() => setShowAccountsModal(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto divide-y divide-gray-50">
                {filtered.map(a => {
                  const bal = isUSDModal ? (a.usdBalance || 0) : (a.balance || 0)
                  return (
                    <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.name}</p>
                        <p className="text-xs text-gray-400">{a.bank} · {a.owner}</p>
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${bal < 0 ? 'text-red-500' : 'text-gray-800'}`}>
                          {isUSDModal
                            ? `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(bal)}`
                            : formatILS(bal)}
                        </p>
                        {isUSDModal && <p className="text-xs text-gray-400">{formatILS(Math.round(bal * usdRate))}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs text-gray-400">סה״כ</span>
                <span className="text-sm font-bold text-gray-800">
                  {isUSDModal
                    ? `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(total)} · ${formatILS(Math.round(total * usdRate))}`
                    : formatILS(total)}
                </span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Net worth modal */}
      {showNetWorthModal && (() => {
        const invILS = i => {
          if (i.currency === 'EUR') return (i.originalAmount || 0) * eurRate
          if (i.currency === 'USD') return (i.originalAmount || 0) * usdRate
          return i.value || 0
        }
        const ilsAccounts  = accounts.filter(a => a.currency !== 'USD')
        const usdAccounts  = accounts.filter(a => a.currency === 'USD')
        const ilsAccTotal  = ilsAccounts.reduce((s, a) => s + (a.balance || 0), 0)
        const usdAccTotal  = usdAccounts.reduce((s, a) => s + (a.usdBalance || 0) * usdRate, 0)
        const invTotal     = investments.reduce((s, i) => s + invILS(i), 0)
        const owedToUs     = debts.filter(d => d.type === 'owed_to_us').reduce((s, d) => s + (d.amount || 0), 0)
        const totalAssets  = ilsAccTotal + usdAccTotal + invTotal + owedToUs

        const friendLoans    = loans.filter(l => l.paidByFriend)
        const regularLoans   = loans.filter(l => !l.paidByFriend)
        const mortgageLoans  = regularLoans.filter(l => l.type === 'mortgage')
        const nonMortLoans   = regularLoans.filter(l => l.type !== 'mortgage')
        const getLoanBal     = l => { const { balance } = calcRemainingBalance(l); return balance ?? l.balanceOverride ?? l.totalAmount ?? 0 }
        const mortgagesTotal = mortgageLoans.reduce((s, l) => s + getLoanBal(l), 0)
        const loansTotal     = regularLoans.reduce((s, l) => s + getLoanBal(l), 0)
        const weOwe          = debts.filter(d => d.type === 'we_owe').reduce((s, d) => s + (d.amount || 0), 0)
        const totalLiab      = loansTotal + weOwe
        const totalLiabNoMort = totalLiab - mortgagesTotal

        const Row = ({ label, value, sub, indent, bold, color }) => (
          <div className={`flex items-center justify-between py-2 ${indent ? 'pr-4' : ''} border-b border-gray-50`}>
            <p className={`text-sm ${bold ? 'font-bold text-gray-800' : indent ? 'text-gray-500' : 'text-gray-700'}`}>{label}</p>
            <div className="text-left">
              <p className={`text-sm font-semibold ${color || (value >= 0 ? 'text-gray-800' : 'text-red-500')}`}>{formatILS(value)}</p>
              {sub && <p className="text-xs text-gray-400">{sub}</p>}
            </div>
          </div>
        )

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowNetWorthModal(false)}>
            <div className="absolute inset-0 bg-black bg-opacity-40" />
            <div className="relative bg-white rounded-t-2xl w-full shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">📊 חישוב הון נטו</h3>
                <button onClick={() => setShowNetWorthModal(false)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto px-4 py-2">

                {/* Assets */}
                <p className="text-xs font-bold text-green-600 mt-2 mb-1">נכסים</p>
                <Row label="חשבונות ₪" value={ilsAccTotal} indent />
                <Row label="חשבונות $" value={usdAccTotal} sub={`$${new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(usdLiquidity)} @ ${usdRate}`} indent />
                {investments.map(i => (
                  <Row key={i.id} label={i.name} value={invILS(i)} indent />
                ))}
                {debts.filter(d => d.type === 'owed_to_us').map(d => (
                  <Row key={d.id} label={`חייבים לנו — ${d.name}`} value={d.amount || 0} indent />
                ))}
                <Row label="סה״כ נכסים" value={totalAssets} bold color="text-green-600" />

                {/* Liabilities */}
                <p className="text-xs font-bold text-red-500 mt-3 mb-1">התחייבויות</p>
                {nonMortLoans.map(l => (
                  <Row key={l.id} label={l.name} value={-getLoanBal(l)} indent />
                ))}
                {mortgageLoans.map(l => (
                  <Row key={l.id} label={`🏠 ${l.name}`} value={-getLoanBal(l)} indent color="text-orange-500" />
                ))}
                {debts.filter(d => d.type === 'we_owe').map(d => (
                  <Row key={d.id} label={`אנחנו חייבים — ${d.name}`} value={-(d.amount || 0)} indent />
                ))}
                <Row label="סה״כ התחייבויות" value={-totalLiab} bold color="text-red-500" />

                {friendLoans.length > 0 && (
                  <>
                    <p className="text-xs text-gray-400 mt-2 mb-1">* לא נכלל בחישוב (אליעזר משלם)</p>
                    {friendLoans.map(l => (
                      <Row key={l.id} label={l.name} value={-getLoanBal(l)} indent color="text-gray-400" />
                    ))}
                  </>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-800">הון נטו ללא משכנתא</span>
                  <span className={`text-xl font-bold ${netWorthNoMortgage >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatILS(netWorthNoMortgage)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">כולל משכנתא</span>
                  <span className={`text-sm font-semibold ${netWorth >= 0 ? 'text-green-500' : 'text-red-400'}`}>{formatILS(netWorth)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function MetricCard({ label, value, sub, icon, light, highlight }) {
  return (
    <div className={`rounded-2xl p-3 ${light ? 'bg-white bg-opacity-20' : 'bg-white'} ${highlight ? 'border-2 border-red-400' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs text-white font-medium">{label}</span>
      </div>
      <p className={`text-lg font-bold ${highlight ? 'text-red-300' : 'text-white'}`}>{value}</p>
      <p className="text-xs text-blue-200">{sub}</p>
    </div>
  )
}

function Section({ title, icon, subtitle, toolbar, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50">
        <span>{icon}</span>
        <h3 className="font-semibold text-gray-700 text-sm">{title}</h3>
        {subtitle && <span className="text-xs text-gray-400 mr-1">{subtitle}</span>}
        {toolbar && <div className="mr-auto">{toolbar}</div>}
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function EventRow({ event, highlight, confirmed, onConfirm, onUnconfirm, onShowAccounts }) {
  const days = daysUntil(event.date instanceof Date ? event.date.toISOString() : String(event.date))
  const isIncome = event.amount > 0
  const c = colorMap[event.color] || colorMap.gray
  const isUSD = event.currency === 'USD'
  const balanceNegative = isUSD ? event.balanceAfterUSD < 0 : event.balanceAfter < 0

  let dayLabel = ''
  if (days === 0) dayLabel = 'היום'
  else if (days === 1) dayLabel = 'מחר'
  else dayLabel = formatDateShort(event.date instanceof Date ? event.date.toISOString() : String(event.date))

  const usdDisplayNum = event.usdGross || event.usdAmount
  const usdDisplay = isUSD
    ? `${isIncome ? '+' : '-'}$${new Intl.NumberFormat('en').format(usdDisplayNum)}`
    : null

  return (
    <div className={`px-4 py-3 ${confirmed ? 'bg-green-50 opacity-60' : highlight ? 'bg-yellow-50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
          <div>
            <p className="text-sm font-medium text-gray-800">
              {event.rolledOver && <span className="text-orange-400 text-xs ml-1">↩ הועבר מאתמול</span>}
              {event.name}
            </p>
            <p className="text-xs text-gray-400">
              {dayLabel}{event.note ? ` · ${event.note}` : ''}
              {event.accountName && <span className="text-blue-400"> · {event.accountName}</span>}
            </p>
            {event.accountStatus && (
              event.accountStatus.ok ? (
                <p className="text-xs text-green-500 mt-0.5">
                  ✓ יש מספיק — יתרה אחרי:{' '}
                  {event.currency === 'USD'
                    ? `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(event.accountStatus.balAfter)}`
                    : formatILS(event.accountStatus.balAfter)}
                </p>
              ) : (
                <button onClick={onShowAccounts} className="text-right mt-0.5 active:opacity-70">
                  <p className="text-xs text-red-500 font-semibold">
                    ⚠️ חסר{' '}
                    {event.currency === 'USD'
                      ? `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(event.accountStatus.needed)}`
                      : formatILS(event.accountStatus.needed)}
                    {' '}— צריך להעביר לחשבון ›
                  </p>
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-left">
            <p className={`text-sm font-bold ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
              {isUSD ? usdDisplay : `${isIncome ? '+' : ''}${formatILS(event.amount)}`}
            </p>
            {isUSD && event.usdDeductions && (
              <p className="text-xs">
                <span className="bg-yellow-200 text-yellow-800 font-semibold px-1 rounded text-xs">({event.usdDeductions})</span>
              </p>
            )}
          </div>
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-green-100 hover:text-green-600 transition-colors flex-shrink-0"
            >
              ✓
            </button>
          )}
          {onUnconfirm && (
            <button
              onClick={onUnconfirm}
              className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 hover:bg-red-100 hover:text-red-400 transition-colors flex-shrink-0"
              title="בטל אישור"
            >
              ↩
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-end mt-1">
        {(event.noBalanceEffect || event.paidViaCredit) ? (
          <span className="text-xs text-gray-300 italic">ללא השפעה על יתרה</span>
        ) : (
          <span className={`text-xs font-medium ${isUSD
            ? (event.balanceAfterUSD >= 0 ? 'text-green-500' : 'text-red-500')
            : (event.balanceAfter   >= 0 ? 'text-green-500' : 'text-red-500')}`}>
            {isUSD ? (
              <>
                <span style={{ fontSize: '0.6rem' }}>💵</span>
                {' '}${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(event.balanceAfterUSD)}
              </>
            ) : `יתרה: ${formatILS(event.balanceAfter)}`}
            {balanceNegative && ' ⚠️'}
          </span>
        )}
      </div>
    </div>
  )
}
