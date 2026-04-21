import { useState, useEffect } from 'react'
import Backdrop from '../components/Backdrop'
import useStore from '../store/useStore'
import MiniCalendar from '../components/MiniCalendar'
import DayOfMonthPicker from '../components/DayOfMonthPicker'
import QuickAddModal from '../components/QuickAddModal'
import IncomeEditModal from '../components/IncomeEditModal'
import PartialPaymentModal from '../components/PartialPaymentModal'
import {
  calcTotalLiquidity, calcNetWorth, calcSafeToSpend,
  calcMonthlyOut, calcMonthlyIn, getUpcomingEvents, calcRemainingBalance,
} from '../utils/calculations'
import { formatILS, formatDateShort, daysUntil } from '../utils/formatters'
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from '../lib/pushNotifications'

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
  const { accounts, investments, loans, expenses, rentalIncome, futureIncome, debts, eurRate, usdRate, confirmedEvents, confirmEvent, unconfirmEvent, updateDebt, discountTransferDone, confirmDiscountTransfer, undoDiscountTransfer, friendReminders, setFriendReminderSent, undoFriendReminderSent, setFriendMoneyReceived, undoFriendMoneyReceived, updateExpenseMonthlyAmount, updateExpenseMonthlyAccount, updateLoan, updateExpense, updateRentalIncome, updateFutureIncome, updateLoanMonthlyAmount, updateLoanMonthlyAccount, updateRentalMonthlyAmount, updateRentalMonthlyAccount, reminders, doneReminder, doneReminderMonth, undoneReminder, undoneReminderMonth, deleteReminder, updateReminder, updateInvestment, updateAccount, deleteFutureIncome, deleteExpense, deleteRentalIncome, dismissedEvents, dismissEvent } = useStore()

  const [rangeDays, setRangeDays] = useState(14)
  const [filterType, setFilterType] = useState('all') // 'all' | 'income' | 'expense'
  const [filterCurrency, setFilterCurrencyState] = useState(() => localStorage.getItem('dash_filterCurrency') || 'all')
  const setFilterCurrency = v => { setFilterCurrencyState(v); localStorage.setItem('dash_filterCurrency', v) }
  const [showAlert, setShowAlert] = useState(false)
  const [showAccountsModal, setShowAccountsModal] = useState(null) // null | 'ILS' | 'USD'
  const [showNetWorthModal, setShowNetWorthModal] = useState(false)
  const [showAllReminders, setShowAllReminders] = useState(false)
  const [showDataModal, setShowDataModal] = useState(false)
  const [dataTab, setDataTab] = useState('reminders')
  const [incomeEditItem, setIncomeEditItem] = useState(null)
  const [editingRemId, setEditingRemId] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [invUpdateRem, setInvUpdateRem] = useState(null) // { remId, invId, newValue }
  const [pushStatus, setPushStatus] = useState('loading')
  const [partialItem, setPartialItem] = useState(null) // { id, _type, currency, accountId, ... }
  const [accountPickerFor, setAccountPickerFor] = useState(null) // event whose source account is being changed
  const [peeking, setPeeking] = useState(false) // long-press peek at tomorrow's events
  const [editingAccId, setEditingAccId] = useState(null) // account id currently being edited inline
  const [accBalDraft, setAccBalDraft] = useState('')
  const [permPrompt, setPermPrompt] = useState(null) // { type: 'account'|'amount', event, value, callback }

  useEffect(() => { getPushStatus().then(setPushStatus) }, [])

  const handleTogglePush = async () => {
    if (pushStatus === 'subscribed') {
      await unsubscribeFromPush()
      setPushStatus('unsubscribed')
    } else {
      const result = await subscribeToPush()
      if (result.ok) setPushStatus('subscribed')
      else alert('שגיאה: ' + result.error)
    }
  }


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

  const cleanId = (s) => String(s || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
  const isConfirmed  = (id, dateStr) => confirmedEvents.some(e => cleanId(e.id) === cleanId(id) && e.date === dateStr)
  const accountMap   = Object.fromEntries(accounts.map(a => [a.id, a.name]))

  const handleEditEvent = (event) => {
    const baseId = event.id.replace(/_ro$/, '').replace(/_m\d+$/, '')
    let item, type, action, form
    if (event.type === 'loan') {
      item = loans.find(l => l.id === baseId); type = 'loan'; action = 'update_loan'
      if (item) form = { loanId: item.id, field: 'monthlyPayment', value: String(item.monthlyPayment || ''), chargeDay: String(item.chargeDay || '') }
    } else if (event.type === 'expense') {
      item = expenses.find(e => e.id === baseId); type = 'expense'; action = 'income_expense'
      if (item) form = { freq: 'monthly', kind: 'expense', name: item.name, amount: String(item.currency === 'USD' ? (item.usdAmount || '') : (item.amount || '')), chargeDay: item.chargeDay, accountId: item.accountId || '', destAccountId: item.destAccountId || '' }
    } else if (event.type === 'rental') {
      item = rentalIncome.find(r => r.id === baseId); type = 'rental'; action = 'income_expense'
      if (item) form = { freq: 'monthly', kind: 'income', name: item.name, amount: String(item.usdAmount || item.amount || ''), chargeDay: item.chargeDay, accountId: item.accountId || '' }
    } else if (event.type === 'future') {
      item = futureIncome.find(f => f.id === baseId); type = 'future'
      if (item) {
        const isFriendReceive = item.name?.startsWith('הלוואה מ')
        const isFriendRepay   = item.name?.startsWith('החזר ל')
        if (isFriendReceive || isFriendRepay) {
          action = 'friend_loan'
          const lenderName   = isFriendReceive ? item.name.slice('הלוואה מ'.length) : item.name.slice('החזר ל'.length)
          const receiveEntry = isFriendReceive ? item : futureIncome.find(f => f.name === `הלוואה מ${lenderName}`)
          const repayEntry   = isFriendRepay   ? item : futureIncome.find(f => f.name === `החזר ל${lenderName}`)
          const debtEntry    = debts.find(d => d.name === lenderName && d.type === 'we_owe')
          form = {
            lenderName,
            amount:         String(receiveEntry?.amount || Math.abs(item.amount || 0)),
            receivedDate:   receiveEntry?.expectedDate || '',
            repayDate:      repayEntry?.expectedDate   || '',
            accountId:      receiveEntry?.accountId || item.accountId || '',
            repayAccountId: repayEntry?.accountId  || '',
            _receiveId:     receiveEntry?.id,
            _repayId:       repayEntry?.id,
            _debtId:        debtEntry?.id,
          }
        } else {
          action = 'income_expense'
          form = { freq: 'once', kind: item.isPayment ? 'expense' : 'income', name: item.name, amount: String(Math.abs(item.amount || 0)), date: item.expectedDate || '', accountId: item.accountId || '' }
        }
      }
    }
    if (item) setEditTarget({ type, item, action, form })
  }

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

  // Fetch 31 days back to catch any unconfirmed past event (income OR expense)
  const allRaw = getUpcomingEvents(loans, expenses, rentalIncome, futureIncome, rangeDays, usdRate, 31)

  // Per-account running balances (native currency)
  const runningAccBal = {}
  accounts.forEach(a => {
    runningAccBal[a.id] = a.currency === 'USD' ? (a.usdBalance || 0) : (a.balance || 0)
  })

  // Running balances — USD events affect USD account, ILS events affect ILS account
  // חשוב: רק אירועי הווה/עתיד משפיעים על היתרה המרוצה.
  // אירועי עבר לא — אם אושרו, כבר ירדו מהיתרה ברגע האישור;
  // אם לא אושרו, הם רק תזכורת ולא דורסים את יתרת החשבון שהמשתמש עדכן ידנית.
  let runningILS = ilsLiquidity
  let runningUSD = usdLiquidity
  const allEvents = allRaw.map(e => {
    const d = new Date(e.date); d.setHours(0,0,0,0)
    const dateStr = d.toISOString().split('T')[0]
    const isPast = dateStr < todayStr
    if (!isPast) {
      runningUSD += usdDelta(e)
      if (!isFriendLoan(e)) runningILS += ilsDelta(e)
    }
    const accountName = e.accountId ? accountMap[e.accountId] : null

    // Per-account sufficiency check (only for outgoing charges, skip confirmed, skip past)
    let accountStatus = null
    const evDelta = calcDelta(e)
    const alreadyConfirmed = isConfirmed(e.id, dateStr)
    if (!isPast && !alreadyConfirmed && e.accountId && evDelta !== 0) {
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

  const isDismissed = (id, date) => (dismissedEvents || []).some(d => cleanId(d.id) === cleanId(id) && d.date === date)

  // Rolled-over: ALL past unconfirmed events (income AND expenses) — stay until user confirms
  const rolledOver = allEvents
    .filter(e => e.dateStr < todayStr && !isConfirmed(e.id, e.dateStr) && !isDismissed(e.id, e.dateStr))
    .map(e => ({ ...e, date: today, dateStr: todayStr, rolledOver: true, originalDateStr: e.dateStr, originalDate: e.date, id: e.id + '_ro' }))

  const todayEvents = [
    ...rolledOver,
    ...allEvents.filter(e => e.dateStr === todayStr && !isConfirmed(e.id, todayStr)),
  ].filter(e => !isDismissed(e.id, todayStr))
  // Confirmed-today list: a confirmation only appears on the exact day it
  // was clicked. Once the day advances, it disappears — regardless of whether
  // the underlying event was rolled over from the past or was today itself.
  const isConfirmedToday = (id, dateStr) => confirmedEvents.some(e =>
    cleanId(e.id) === cleanId(id) && e.date === dateStr && e.confirmedOn === todayStr
  )
  const isConfirmedRoToday = (id, origDateStr) => confirmedEvents.some(e =>
    cleanId(e.id) === cleanId(id) && e.date === origDateStr && e._ro && e.confirmedOn === todayStr
  )
  const confirmedRolledOver = allEvents
    .filter(e => e.dateStr < todayStr && isConfirmedRoToday(e.id, e.dateStr))
    .map(e => ({ ...e, date: today, dateStr: todayStr, _confirmedRo: true, originalDateStr: e.dateStr }))
  const confirmedToday = [
    ...allEvents.filter(e => e.dateStr === todayStr && isConfirmedToday(e.id, todayStr)),
    ...confirmedRolledOver,
  ].filter(e => !isDismissed(e.id, todayStr))
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
          <div className="flex items-center gap-3">
            {pushStatus !== 'loading' && pushStatus !== 'unsupported' && (
              <button
                onClick={handleTogglePush}
                title={pushStatus === 'subscribed' ? 'בטל התראות' : 'הפעל התראות לטלפון'}
                className="focus:outline-none active:scale-90 transition-transform"
              >
                <span className="text-2xl">{pushStatus === 'subscribed' ? '📲' : '🔕'}</span>
              </button>
            )}
            <button onClick={() => setShowAlert(v => !v)} className="relative focus:outline-none active:scale-90 transition-transform">
              <span className="text-2xl">🔔</span>
              {alertCount > 0 && (
                <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {alertCount}
                </span>
              )}
            </button>
          </div>
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
        {(() => {
          return (
          <Section title="היום" icon="⚡" subtitle={today.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })} toolbar={<button onClick={() => setShowDataModal(true)} className="text-xs text-blue-300 font-normal active:opacity-60">נתונים</button>}>
            {/* Today's reminders */}
            {(reminders || []).filter(r => {
              if (r.type === 'monthly') {
                const monthKey = thisMonthKey
                return r.day === today.getDate() && !(r.doneMonths || []).includes(monthKey)
              }
              return !r.done && r.date === todayStr
            }).map(r => (
              <div key={r.id} className="bg-yellow-50">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-400" />
                    <div>
                      {r.invId ? (() => {
                        const inv = investments.find(i => i.id === r.invId)
                        return (<>
                          <p className="text-sm font-medium text-gray-800">🔔 {inv ? `עדכון סכום ${inv.name}` : r.text}</p>
                          {r.type === 'monthly' && <p className="text-xs text-gray-400">חוזרת בכל {r.day} לחודש</p>}
                          {r.text && <p className="text-xs text-gray-400">{r.text}</p>}
                        </>)
                      })() : (<>
                        <p className="text-sm font-medium text-gray-800">🔔 {r.text}</p>
                        {r.type === 'monthly' && <p className="text-xs text-gray-400">חוזרת בכל {r.day} לחודש</p>}
                      </>)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (r.invId) {
                          setInvUpdateRem({ remId: r.id, invId: r.invId, newValue: '' })
                        } else {
                          r.type === 'monthly' ? doneReminderMonth(r.id, thisMonthKey) : doneReminder(r.id)
                        }
                      }}
                      className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-lg font-medium"
                    >✓</button>
                    <button onClick={() => deleteReminder(r.id)} className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium">מחק</button>
                  </div>
                </div>
              </div>
            ))}
            {visibleToday.map(e => (
              <EventRow
                key={e.id}
                event={e}
                highlight
                onEdit={() => handleEditEvent(e)}
                onShowAccounts={() => setShowAccountsModal(e.currency === 'USD' ? 'USD' : 'ILS')}
                onAccountEdit={() => setAccountPickerFor(e)}
                onAmountEdit={(e.type === 'expense' || e.type === 'loan' || e.type === 'rental') ? (newAmt) => {
                  const baseId = cleanId(e.id)
                  const targetDateStr = e.rolledOver ? e.originalDateStr : e.dateStr || todayStr
                  const mKey = targetDateStr.slice(0, 7)
                  const absAmt = Math.abs(newAmt)
                  // future income handled separately — always permanent
                  if (e.type === 'expense' && e.category === 'credit') {
                    // Credit card — always one-time (existing behavior)
                    updateExpenseMonthlyAmount(baseId, mKey, absAmt)
                    return
                  }
                  setPermPrompt({
                    type: 'amount',
                    event: e,
                    value: absAmt,
                    applyPermanent: () => {
                      if (e.type === 'loan') {
                        const loan = loans.find(l => l.id === baseId)
                        const upd = { monthlyPayment: absAmt }
                        // Also update future paymentSchedule entries so the change takes effect
                        if (loan?.paymentSchedule?.length) {
                          upd.paymentSchedule = loan.paymentSchedule.map(p =>
                            p.date && p.date >= mKey ? { ...p, amount: absAmt } : p
                          )
                        }
                        updateLoan(baseId, upd)
                      }
                      else if (e.type === 'expense') updateExpense(baseId, { amount: absAmt })
                      else if (e.type === 'rental')  updateRentalIncome(baseId, { amount: absAmt })
                    },
                    applyOneTime: () => {
                      if (e.type === 'loan')         updateLoanMonthlyAmount(baseId, mKey, absAmt)
                      else if (e.type === 'expense') updateExpenseMonthlyAmount(baseId, mKey, absAmt)
                      else if (e.type === 'rental')  updateRentalMonthlyAmount(baseId, mKey, absAmt)
                    },
                  })
                } : undefined}
                onPartial={(e.type === 'rental' || e.type === 'future') ? () => {
                  const baseId = cleanId(e.id)
                  const src = e.type === 'rental' ? rentalIncome.find(r => r.id === baseId) : futureIncome.find(f => f.id === baseId)
                  if (src) setPartialItem({ ...src, _type: e.type === 'rental' ? 'rental' : 'future' })
                } : undefined}
                onConfirm={() => {
                  const id      = e.rolledOver ? e.id.replace('_ro','') : e.id
                  const dateStr = e.rolledOver ? e.originalDateStr : todayStr
                  const delta   = calcDelta(e)
                  confirmEvent(id, dateStr, e.accountId || null, delta, e.currency === 'USD', e.rolledOver, e.destAccountId || null)
                  if (e.debtId) {
                    const debt = debts.find(d => d.id === e.debtId)
                    if (debt) updateDebt(e.debtId, { amount: Math.max(0, (debt.amount || 0) - Math.abs(e.amount)) })
                  }
                }}
                onDelete={() => {
                  if (e.type === 'future') deleteFutureIncome(e.id)
                  else dismissEvent(e.id, todayStr)
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
                onEdit={() => handleEditEvent(e)}
                onShowAccounts={() => setShowAccountsModal(e.currency === 'USD' ? 'USD' : 'ILS')}
                onUnconfirm={() => unconfirmEvent(e.id, e._confirmedRo ? e.originalDateStr : todayStr)}
                onDelete={() => {
                  unconfirmEvent(e.id, e._confirmedRo ? e.originalDateStr : todayStr)
                  if (e.type === 'future') deleteFutureIncome(e.id)
                  else dismissEvent(e.id, todayStr)
                }}
              />
            ))}
            {/* הצצה למחר — כפתור בלחיצה ממושכת */}
            {(() => {
              const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
              const tomorrowStr = tomorrow.toISOString().split('T')[0]
              const tomorrowMonthKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}`
              const tomorrowDay = tomorrow.getDate()
              const tomorrowLabel = tomorrow.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })

              const tomorrowReminders = (reminders || []).filter(r => {
                if (r.type === 'monthly') {
                  return r.day === tomorrowDay && !(r.doneMonths || []).includes(tomorrowMonthKey)
                }
                return !r.done && r.date === tomorrowStr
              })
              const tomorrowEvents = allEvents.filter(e =>
                e.dateStr === tomorrowStr && !isConfirmed(e.id, tomorrowStr) && !isDismissed(e.id, tomorrowStr)
              )
              const totalTomorrow = tomorrowReminders.length + tomorrowEvents.length

              const stop = () => setPeeking(false)
              return (
                <div className="px-4 py-3 bg-white">
                  <button
                    type="button"
                    onPointerDown={() => setPeeking(true)}
                    onPointerUp={stop}
                    onPointerLeave={stop}
                    onPointerCancel={stop}
                    onContextMenu={ev => ev.preventDefault()}
                    className="w-full py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-semibold active:bg-indigo-100 select-none"
                    style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                  >
                    👁 החזק להצצה למחר
                  </button>
                  {peeking && (
                    <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50 overflow-hidden">
                      <div className="px-3 py-2 text-xs font-semibold text-indigo-700 border-b border-indigo-100">
                        מחר · {tomorrowLabel}
                      </div>
                      {totalTomorrow === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-500">אין אירועים מחר ✓</div>
                      ) : (
                        <div className="divide-y divide-indigo-100">
                          {tomorrowReminders.map(r => (
                            <div key={r.id + '_peek'} className="px-3 py-2">
                              <p className="text-sm text-gray-800">🔔 {r.text}</p>
                              {r.type === 'monthly' && <p className="text-xs text-gray-400">חוזרת בכל {r.day} לחודש</p>}
                            </div>
                          ))}
                          {tomorrowEvents.map(e => {
                            const isIncomePeek = (e.amount || 0) > 0
                            const amountTxt = e.currency === 'USD'
                              ? `${isIncomePeek ? '+' : '-'}$${new Intl.NumberFormat('en').format(Math.abs(Math.round(e.usdGross || e.usdAmount || e.amount || 0)))}`
                              : formatILS(e.amount, { signed: isIncomePeek })
                            const emoji = e.type === 'loan' ? '💳' : e.type === 'rental' ? '💰' : e.type === 'future' ? (isIncomePeek ? '💰' : '💸') : '💸'
                            return (
                              <div key={e.id + '_peek'} className="px-3 py-2 flex items-center justify-between">
                                <div>
                                  <p className="text-sm text-gray-800">{emoji} {e.name}</p>
                                  {e.accountName && <p className="text-xs text-blue-400">{e.accountName}</p>}
                                </div>
                                <span dir="ltr" className={`text-sm font-bold whitespace-nowrap ${isIncomePeek ? 'text-green-600' : 'text-red-500'}`}>{amountTxt}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </Section>
          )
        })()}

        {/* Upcoming events */}
        {visibleSoon.length > 0 && (
          <Section
            title={`${RANGE_OPTIONS.find(o => o.days === rangeDays)?.label} הקרובים`}
            icon="📅"
            toolbar={
              <div className="flex gap-1.5 items-center">
                {/* טווח — לחיצה מחליפה */}
                <button
                  onClick={() => {
                    const opts = [14, 30, 90]
                    setRangeDays(opts[(opts.indexOf(rangeDays) + 1) % opts.length])
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-white text-xs font-bold shadow active:scale-90 transition-transform ${
                    rangeDays === 14 ? 'bg-blue-600' : rangeDays === 30 ? 'bg-purple-600' : 'bg-yellow-500'
                  }`}
                  title={RANGE_OPTIONS.find(o => o.days === rangeDays)?.label}
                >
                  {rangeDays === 14 ? '14' : rangeDays === 30 ? '30' : '90'}
                </button>
                {/* סוג — לחיצה מחליפה */}
                <button
                  onClick={() => {
                    const opts = ['all', 'income', 'expense']
                    setFilterType(opts[(opts.indexOf(filterType) + 1) % opts.length])
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-sm shadow active:scale-90 transition-transform ${
                    filterType === 'income' ? 'bg-green-500 text-white' :
                    filterType === 'expense' ? 'bg-red-500 text-white' :
                    'bg-gray-600 text-white'
                  }`}
                  title={filterType === 'all' ? 'הכל' : filterType === 'income' ? 'הכנסות' : 'הוצאות'}
                >
                  {filterType === 'income' ? '💚' : filterType === 'expense' ? '🔴' : '🔄'}
                </button>
                {/* מטבע — לחיצה מחליפה */}
                <button
                  onClick={() => {
                    const opts = ['all', 'ILS', 'USD']
                    setFilterCurrency(opts[(opts.indexOf(filterCurrency) + 1) % opts.length])
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold shadow active:scale-90 transition-transform ${
                    filterCurrency === 'ILS' ? 'bg-blue-600 text-white' :
                    filterCurrency === 'USD' ? 'bg-green-600 text-white' :
                    'bg-gray-600 text-white'
                  }`}
                  title={filterCurrency === 'all' ? 'הכל' : filterCurrency}
                >
                  {filterCurrency === 'ILS' ? '₪' : filterCurrency === 'USD' ? '$' : '🌐'}
                </button>
              </div>
            }
          >
            {visibleSoon.map(e => <EventRow key={e.id} event={e} onEdit={() => handleEditEvent(e)} onShowAccounts={() => setShowAccountsModal(e.currency === 'USD' ? 'USD' : 'ILS')} onAccountEdit={() => setAccountPickerFor(e)} />)}
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
          <Backdrop
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black bg-opacity-40"
            style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
            onClose={() => setShowAccountsModal(null)}
          >
            <div className="relative bg-white rounded-t-2xl w-full shadow-xl max-h-[80vh] flex flex-col" style={{ animation: 'modalSlideUp 0.35s cubic-bezier(.22,1,.36,1)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">
                  {isUSDModal ? '💵 יתרות חשבונות דולריים' : '💳 יתרות חשבונות שקליים'}
                </h3>
                <button onClick={() => setShowAccountsModal(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto divide-y divide-gray-50 scroll-right">
                {filtered.map(a => {
                  const bal = isUSDModal ? (a.usdBalance || 0) : (a.balance || 0)
                  const isEditing = editingAccId === a.id
                  const saveBal = () => {
                    const v = parseFloat(accBalDraft)
                    if (!isNaN(v)) {
                      updateAccount(a.id, isUSDModal ? { usdBalance: v } : { balance: v })
                    }
                    setEditingAccId(null); setAccBalDraft('')
                  }
                  return (
                    <div
                      key={a.id}
                      onClick={() => {
                        if (isEditing) return
                        setEditingAccId(a.id)
                        setAccBalDraft(String(bal))
                      }}
                      className="flex items-center justify-between px-4 py-2.5 active:bg-gray-50 cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.name}</p>
                        <p className="text-xs text-gray-400">{a.bank} · {a.owner}</p>
                      </div>
                      <div className="text-left" onClick={e => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={accBalDraft}
                              onChange={ev => setAccBalDraft(ev.target.value)}
                              autoFocus
                              onKeyDown={ev => { if (ev.key === 'Enter') saveBal(); if (ev.key === 'Escape') { setEditingAccId(null); setAccBalDraft('') } }}
                              className="w-24 text-left border-2 border-blue-300 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:border-blue-500"
                              dir="ltr"
                            />
                            <button onClick={saveBal} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg font-medium">✓</button>
                          </div>
                        ) : (
                          <>
                            <p className={`text-sm font-bold ${bal < 0 ? 'text-red-500' : 'text-gray-800'}`}>
                              {isUSDModal
                                ? `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(bal)}`
                                : formatILS(bal)}
                            </p>
                            {isUSDModal && <p className="text-xs text-gray-400">{formatILS(Math.round(bal * usdRate))}</p>}
                          </>
                        )}
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
          </Backdrop>
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
        const debtILS2     = d => d.currency === 'EUR' ? (d.originalAmount||0)*eurRate : d.currency === 'USD' ? (d.originalAmount||0)*usdRate : (d.amount||0)
        const owedToUs     = debts.filter(d => d.type === 'owed_to_us').reduce((s, d) => s + debtILS2(d), 0)
        const totalAssets  = ilsAccTotal + usdAccTotal + invTotal + owedToUs

        const friendLoans    = loans.filter(l => l.paidByFriend)
        const regularLoans   = loans.filter(l => !l.paidByFriend)
        const mortgageLoans  = regularLoans.filter(l => l.type === 'mortgage')
        const nonMortLoans   = regularLoans.filter(l => l.type !== 'mortgage')
        const getLoanBal     = l => { const { balance } = calcRemainingBalance(l); return balance ?? l.balanceOverride ?? l.totalAmount ?? 0 }
        const mortgagesTotal = mortgageLoans.reduce((s, l) => s + getLoanBal(l), 0)
        const loansTotal     = regularLoans.reduce((s, l) => s + getLoanBal(l), 0)
        const weOwe          = debts.filter(d => d.type === 'we_owe').reduce((s, d) => s + debtILS2(d), 0)
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
          <Backdrop
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black bg-opacity-40"
            style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
            onClose={() => setShowNetWorthModal(false)}
          >
            <div className="relative bg-white rounded-t-2xl w-full shadow-xl max-h-[85vh] flex flex-col" style={{ animation: 'modalSlideUp 0.35s cubic-bezier(.22,1,.36,1)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">📊 חישוב הון נטו</h3>
                <button onClick={() => setShowNetWorthModal(false)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto px-4 py-2 scroll-right">

                {/* Assets */}
                <p className="text-xs font-bold text-green-600 mt-2 mb-1">נכסים</p>
                <Row label="חשבונות ₪" value={ilsAccTotal} indent />
                <Row label="חשבונות $" value={usdAccTotal} sub={`$${new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(usdLiquidity)} @ ${usdRate}`} indent />
                {investments.map(i => {
                  const sub = i.currency === 'EUR'
                    ? `€${(i.originalAmount||0).toLocaleString()} @ ₪${eurRate}`
                    : i.currency === 'USD'
                      ? `$${(i.originalAmount||0).toLocaleString()} @ ₪${usdRate}`
                      : null
                  return <Row key={i.id} label={i.name} value={invILS(i)} sub={sub} indent />
                })}
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
          </Backdrop>
        )
      })()}

      {/* Investment update popup */}
      {invUpdateRem && (() => {
        const inv = investments.find(i => i.id === invUpdateRem.invId)
        const isFx = inv?.currency === 'EUR' || inv?.currency === 'USD'
        const symbol = inv?.currency === 'EUR' ? '€' : inv?.currency === 'USD' ? '$' : '₪'
        const curVal = inv ? (isFx ? inv.originalAmount : inv.value) : null
        const rem = (reminders||[]).find(r => r.id === invUpdateRem.remId)
        const confirmUpdate = () => {
          const val = parseFloat(invUpdateRem.newValue)
          if (!isNaN(val) && val > 0) {
            if (isFx) updateInvestment(invUpdateRem.invId, { originalAmount: val })
            else      updateInvestment(invUpdateRem.invId, { value: val })
          }
          if (rem?.type === 'monthly') doneReminderMonth(invUpdateRem.remId, thisMonthKey)
          else doneReminder(invUpdateRem.remId)
          setInvUpdateRem(null)
        }
        return (
          <Backdrop
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40"
            style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
            onClose={() => setInvUpdateRem(null)}
          >
            <div className="bg-white w-full max-w-sm rounded-3xl mx-4 p-6" style={{ animation: 'modalPopIn 0.35s cubic-bezier(.22,1,.36,1)' }}>
              <p className="font-bold text-gray-800 text-base mb-1">📈 {inv?.name}</p>
              {curVal != null && <p className="text-xs text-gray-400 mb-4">שווי נוכחי: {symbol}{Number(curVal).toLocaleString()}</p>}
              <label className="text-xs text-gray-500 block mb-1">שווי עדכני ({symbol})</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 mb-4"
                value={invUpdateRem.newValue}
                onChange={ev => setInvUpdateRem(r => ({ ...r, newValue: ev.target.value }))}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setInvUpdateRem(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500">ביטול</button>
                <button onClick={confirmUpdate} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold">עדכן ✓</button>
              </div>
            </div>
          </Backdrop>
        )
      })()}

      {/* All Reminders Modal */}
      {showAllReminders && (
        <Backdrop
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40"
          style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
          onClose={() => setShowAllReminders(false)}
        >
          <div className="bg-white w-full max-w-md rounded-3xl mx-4 scroll-right" style={{ maxHeight: '80vh', overflowY: 'auto', animation: 'modalPopIn 0.35s cubic-bezier(.22,1,.36,1)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <span className="font-bold text-gray-800 text-base">📋 כל התזכורות</span>
              <button onClick={() => setShowAllReminders(false)} className="text-gray-400 text-2xl font-light leading-none w-8 text-center">×</button>
            </div>
            <div className="divide-y divide-gray-50 pb-4">
              {(reminders || []).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">אין תזכורות</p>
              )}
              {(reminders || []).map(r => {
                const isMonthly = r.type === 'monthly'
                const isDoneToday = isMonthly
                  ? (r.doneMonths || []).includes(thisMonthKey)
                  : r.done
                const isEditing = editingRemId === r.id
                if (isEditing) {
                  return (
                    <div key={r.id} className="px-4 py-3 bg-yellow-50 space-y-2">
                      <input
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                        value={editDraft.text ?? r.text}
                        onChange={ev => setEditDraft(d => ({ ...d, text: ev.target.value }))}
                      />
                      {isMonthly ? (
                        <DayOfMonthPicker
                          value={String(editDraft.day ?? r.day ?? '')}
                          onChange={v => setEditDraft(d => ({ ...d, day: v }))}
                        />
                      ) : (
                        <MiniCalendar
                          value={editDraft.date ?? r.date ?? ''}
                          onChange={v => setEditDraft(d => ({ ...d, date: v }))}
                        />
                      )}
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setEditingRemId(null); setEditDraft({}) }}
                          className="text-xs text-gray-400 px-3 py-1.5 rounded-lg border border-gray-200"
                        >ביטול</button>
                        <button
                          onClick={() => {
                            const updates = { text: editDraft.text ?? r.text }
                            if (isMonthly) updates.day = parseInt(editDraft.day ?? r.day)
                            else updates.date = editDraft.date ?? r.date
                            updateReminder(r.id, updates)
                            setEditingRemId(null); setEditDraft({})
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium"
                        >שמור</button>
                      </div>
                    </div>
                  )
                }
                const toggleDone = () => {
                  if (isMonthly) {
                    const next = isDoneToday
                      ? (r.doneMonths || []).filter(m => m !== thisMonthKey)
                      : [...(r.doneMonths || []), thisMonthKey]
                    updateReminder(r.id, { doneMonths: next })
                  } else {
                    updateReminder(r.id, { done: !r.done })
                  }
                }
                return (
                  <div key={r.id} className={`flex items-center justify-between px-4 py-3 transition-opacity ${isDoneToday ? 'opacity-40' : ''}`}>
                    <button onClick={toggleDone} className="flex items-center gap-3 text-right flex-1">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDoneToday ? 'bg-gray-300' : 'bg-yellow-400'}`} />
                      <div>
                        {r.invId ? (() => {
                          const inv = investments.find(i => i.id === r.invId)
                          return (<>
                            <p className={`text-sm text-gray-800 ${isDoneToday ? '' : 'font-medium'}`}>🔔 {inv ? `עדכון סכום ${inv.name}` : r.text}</p>
                            {isMonthly && <p className="text-xs text-gray-400">חוזרת בכל {r.day} לחודש</p>}
                            {r.text && <p className="text-xs text-gray-400">{r.text}</p>}
                          </>)
                        })() : (<>
                          <p className={`text-sm text-gray-800 ${isDoneToday ? '' : 'font-medium'}`}>🔔 {r.text}</p>
                          <p className="text-xs text-gray-400">
                            {isMonthly
                              ? `חוזרת בכל ${r.day} לחודש`
                              : r.date
                                ? new Date(r.date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
                                : ''}
                          </p>
                        </>)}
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingRemId(r.id); setEditDraft({}) }}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium"
                      >ערוך</button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteReminder(r.id) }}
                        className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium"
                      >מחק</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Backdrop>
      )}
      {showDataModal && (() => {
        const pendingFuture  = futureIncome.filter(f => f.status === 'pending')
        const isOutgoing     = f => f.isPayment || (f.amount || 0) < 0 || f.name?.startsWith('החזר ל')
        const futureOutgoing = pendingFuture.filter(isOutgoing)
        const futureIncoming = pendingFuture.filter(f => !isOutgoing(f))
        const tabs = [
          { key: 'reminders',      label: '🔔 תזכורות',            count: reminders.length },
          { key: 'futureIncoming', label: '💚 הכנסות חד פעמיות',  count: futureIncoming.length },
          { key: 'futureOutgoing', label: '🔴 חיובים חד פעמיים',  count: futureOutgoing.length },
          { key: 'income',         label: '💚 הכנסות קבועות',     count: rentalIncome.length },
          { key: 'expenses',       label: '🔴 חיובים קבועים',     count: expenses.length },
        ]
        return (
          <Backdrop
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40"
            style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
            onClose={() => setShowDataModal(false)}
          >
            <div className="bg-white w-full max-w-md rounded-3xl mx-4 scroll-right" style={{ maxHeight: '80vh', overflowY: 'auto', animation: 'modalPopIn 0.35s cubic-bezier(.22,1,.36,1)' }}>
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <span className="font-bold text-gray-800 text-base">📋 נתונים</span>
                <button onClick={() => setShowDataModal(false)} className="text-gray-400 text-2xl font-light leading-none w-8 text-center">×</button>
              </div>
              <div className="flex border-b border-gray-100 overflow-x-auto">
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setDataTab(tab.key)}
                    className={`flex-shrink-0 text-xs py-2.5 px-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
                      dataTab === tab.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'
                    }`}>
                    {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
                  </button>
                ))}
              </div>
              <div className="divide-y divide-gray-50 pb-4">
                {dataTab === 'expenses' && (
                  expenses.length === 0
                    ? <p className="text-center text-sm text-gray-400 py-8">אין חיובים קבועים</p>
                    : expenses.map(item => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.currency === 'USD' ? `$${(item.usdAmount||0).toLocaleString()}` : `₪${(item.amount||0).toLocaleString()}`} • יום {item.chargeDay}{item.accountId ? ` • ${accounts.find(a=>a.id===item.accountId)?.name||''}` : ''}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditTarget({ type: 'expense', item, action: 'income_expense', form: { freq: 'monthly', kind: 'expense', name: item.name, amount: String(item.currency === 'USD' ? (item.usdAmount||'') : (item.amount||'')), chargeDay: item.chargeDay, accountId: item.accountId||'', destAccountId: item.destAccountId||'' } }) }}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">ערוך</button>
                          <button onClick={() => deleteExpense(item.id)}
                            className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium">מחק</button>
                        </div>
                      </div>
                    ))
                )}
                {dataTab === 'income' && (
                  rentalIncome.length === 0
                    ? <p className="text-center text-sm text-gray-400 py-8">אין הכנסות קבועות</p>
                    : rentalIncome.map(item => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.currency === 'USD' ? `$${item.usdAmount}` : `₪${(item.amount||0).toLocaleString()}`} • יום {item.chargeDay}{item.accountId ? ` • ${accounts.find(a=>a.id===item.accountId)?.name||''}` : ''}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditTarget({ type: 'rental', item, action: 'income_expense', form: { freq: 'monthly', kind: 'income', name: item.name, amount: String(item.usdAmount||item.amount||''), chargeDay: item.chargeDay, accountId: item.accountId||'' } }) }}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">ערוך</button>
                          <button onClick={() => deleteRentalIncome(item.id)}
                            className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium">מחק</button>
                        </div>
                      </div>
                    ))
                )}
                {(dataTab === 'futureIncoming' || dataTab === 'futureOutgoing') && (() => {
                  const items = dataTab === 'futureIncoming' ? futureIncoming : futureOutgoing
                  const emptyMsg = dataTab === 'futureIncoming' ? 'אין הכנסות חד פעמיות' : 'אין חיובים חד פעמיים'
                  if (items.length === 0) return <p className="text-center text-sm text-gray-400 py-8">{emptyMsg}</p>
                  return items.map(item => {
                    const isFriendReceive = item.name?.startsWith('הלוואה מ')
                    const isFriendRepay   = item.name?.startsWith('החזר ל')
                    let editT
                    if (isFriendReceive || isFriendRepay) {
                      const lenderName   = isFriendReceive ? item.name.slice('הלוואה מ'.length) : item.name.slice('החזר ל'.length)
                      const receiveEntry = isFriendReceive ? item : futureIncome.find(f => f.name === `הלוואה מ${lenderName}`)
                      const repayEntry   = isFriendRepay   ? item : futureIncome.find(f => f.name === `החזר ל${lenderName}`)
                      const debtEntry    = debts.find(d => d.name === lenderName && d.type === 'we_owe')
                      editT = { type: 'future', item, action: 'friend_loan', form: { lenderName, amount: String(receiveEntry?.amount || Math.abs(item.amount||0)), receivedDate: receiveEntry?.expectedDate||'', repayDate: repayEntry?.expectedDate||'', accountId: receiveEntry?.accountId||item.accountId||'', repayAccountId: repayEntry?.accountId||'', _receiveId: receiveEntry?.id, _repayId: repayEntry?.id, _debtId: debtEntry?.id } }
                    } else {
                      editT = { type: 'future', item, action: 'income_expense', form: { freq: 'once', kind: item.isPayment ? 'expense' : 'income', name: item.name, amount: String(Math.abs(item.amount||0)), date: item.expectedDate||'', accountId: item.accountId||'' } }
                    }
                    const dotColor = dataTab === 'futureIncoming' ? 'bg-green-500' : 'bg-red-400'
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-400">₪{Math.abs(item.amount||0).toLocaleString()} • {item.expectedDate || 'ללא תאריך'}{item.accountId ? ` • ${accounts.find(a=>a.id===item.accountId)?.name||''}` : ''}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { item.sessions?.length > 0 ? setIncomeEditItem(item) : setEditTarget(editT) }}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">ערוך</button>
                          <button onClick={() => deleteFutureIncome(item.id)}
                            className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium">מחק</button>
                        </div>
                      </div>
                    )
                  })
                })()}
                {dataTab === 'reminders' && (
                  reminders.length === 0
                    ? <p className="text-center text-sm text-gray-400 py-8">אין תזכורות</p>
                    : reminders.map(r => {
                      const isMonthly   = r.type === 'monthly'
                      const isDoneToday = isMonthly ? (r.doneMonths||[]).includes(thisMonthKey) : r.done
                      const isEditing   = editingRemId === r.id
                      if (isEditing) return (
                        <div key={r.id} className="px-4 py-3 bg-yellow-50 space-y-2">
                          <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            value={editDraft.text ?? r.text} onChange={ev => setEditDraft(d => ({ ...d, text: ev.target.value }))} />
                          {isMonthly
                            ? <DayOfMonthPicker value={String(editDraft.day ?? r.day ?? '')} onChange={v => setEditDraft(d => ({ ...d, day: v }))} />
                            : <MiniCalendar value={editDraft.date ?? r.date ?? ''} onChange={v => setEditDraft(d => ({ ...d, date: v }))} />}
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setEditingRemId(null); setEditDraft({}) }} className="text-xs text-gray-400 px-3 py-1.5 rounded-lg border border-gray-200">ביטול</button>
                            <button onClick={() => { const u = { text: editDraft.text ?? r.text }; if (isMonthly) u.day = parseInt(editDraft.day ?? r.day); else u.date = editDraft.date ?? r.date; updateReminder(r.id, u); setEditingRemId(null); setEditDraft({}) }} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium">שמור</button>
                          </div>
                        </div>
                      )
                      return (
                        <div key={r.id} className={`flex items-center justify-between px-4 py-3 transition-opacity ${isDoneToday ? 'opacity-40 cursor-pointer' : ''}`}
                          onClick={isDoneToday ? () => isMonthly ? undoneReminderMonth(r.id, thisMonthKey) : undoneReminder(r.id) : undefined}>
                          <div className="flex items-center gap-3 flex-1 text-right">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDoneToday ? 'bg-gray-300' : 'bg-yellow-400'}`} />
                            <div>
                              <p className={`text-sm text-gray-800 ${isDoneToday ? '' : 'font-medium'}`}>🔔 {r.invId ? (() => { const inv = investments.find(i => i.id === r.invId); return inv ? `עדכון סכום ${inv.name}` : r.text })() : r.text}</p>
                              <p className="text-xs text-gray-400">{isMonthly ? `חוזרת בכל ${r.day} לחודש` : r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : ''}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={e => { e.stopPropagation(); setEditingRemId(r.id); setEditDraft({}) }} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">ערוך</button>
                            <button onClick={e => { e.stopPropagation(); deleteReminder(r.id) }} className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium">מחק</button>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </Backdrop>
        )
      })()}
      {incomeEditItem && <IncomeEditModal item={incomeEditItem} onClose={() => setIncomeEditItem(null)} />}
      {editTarget && <QuickAddModal editTarget={editTarget} onClose={() => setEditTarget(null)} />}
      {partialItem && <PartialPaymentModal item={partialItem} onClose={() => setPartialItem(null)} />}

      {/* Account picker — change source bank account on an event's underlying item */}
      {accountPickerFor && (() => {
        const ev = accountPickerFor
        const isUSD = ev.currency === 'USD'
        const list = accounts.filter(a => isUSD ? a.currency === 'USD' : a.currency !== 'USD')
        const baseId = cleanId(ev.id)
        const currentId = ev.accountId || null
        const pick = (newId) => {
          // future income is always permanent (one-time item)
          if (ev.type === 'future') {
            updateFutureIncome(baseId, { accountId: newId })
            setAccountPickerFor(null)
            return
          }
          // Recurring items — ask permanent or one-time
          setPermPrompt({
            type: 'account',
            event: ev,
            value: newId,
            applyPermanent: () => {
              if (ev.type === 'loan')         updateLoan(baseId,         { accountId: newId })
              else if (ev.type === 'expense') updateExpense(baseId,      { accountId: newId })
              else if (ev.type === 'rental')  updateRentalIncome(baseId, { accountId: newId })
            },
            applyOneTime: () => {
              const targetDateStr = ev.rolledOver ? ev.originalDateStr : ev.dateStr || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`
              const mKey = targetDateStr.slice(0, 7)
              if (ev.type === 'loan')         updateLoanMonthlyAccount(baseId, mKey, newId)
              else if (ev.type === 'expense') updateExpenseMonthlyAccount(baseId, mKey, newId)
              else if (ev.type === 'rental')  updateRentalMonthlyAccount(baseId, mKey, newId)
            },
          })
          setAccountPickerFor(null)
        }
        return (
          <Backdrop
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black bg-opacity-40"
            style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
            onClose={() => setAccountPickerFor(null)}
          >
            <div className="relative bg-white rounded-t-2xl w-full shadow-xl max-h-[80vh] flex flex-col" style={{ animation: 'modalSlideUp 0.35s cubic-bezier(.22,1,.36,1)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">
                  {isUSD ? '💵 בחר חשבון דולרי' : '💳 בחר חשבון שקלי'}
                </h3>
                <button onClick={() => setAccountPickerFor(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-50">
                {ev.name} — השינוי יחול על כל החיובים הבאים. היסטוריה קיימת לא משתנה.
              </div>
              <div className="overflow-y-auto divide-y divide-gray-50">
                {list.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">אין חשבונות במטבע הזה</p>
                )}
                {list.map(a => {
                  const bal = isUSD ? (a.usdBalance || 0) : (a.balance || 0)
                  const isCurrent = a.id === currentId
                  return (
                    <button
                      key={a.id}
                      onClick={() => pick(a.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 ${isCurrent ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {isCurrent && <span className="text-blue-500 text-sm">✓</span>}
                        <span className="text-sm font-medium text-gray-800">{a.name}</span>
                      </div>
                      <span className="text-xs text-gray-400" dir="ltr">
                        {isUSD ? `$${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(bal)}` : formatILS(bal)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </Backdrop>
        )
      })()}

      {/* Permanent vs one-time prompt */}
      {permPrompt && (
        <Backdrop
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-40"
          style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
          onClose={() => setPermPrompt(null)}
        >
          <div className="relative bg-white rounded-2xl w-[85%] max-w-sm shadow-xl p-5" style={{ animation: 'modalPopIn 0.35s cubic-bezier(.22,1,.36,1)' }}>
            <h3 className="font-bold text-gray-800 text-base text-center mb-1">
              {permPrompt.type === 'account' ? 'שינוי חשבון' : 'שינוי סכום'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              {permPrompt.event.name}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { permPrompt.applyPermanent(); setPermPrompt(null) }}
                className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm active:bg-blue-600"
              >
                שינוי קבוע
              </button>
              <button
                onClick={() => { permPrompt.applyOneTime(); setPermPrompt(null) }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm active:bg-gray-200"
              >
                חד-פעמי
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              {permPrompt.type === 'account'
                ? 'קבוע = כל החיובים העתידיים. חד-פעמי = רק החודש הזה.'
                : 'קבוע = הסכום ישתנה לצמיתות. חד-פעמי = רק החודש הזה.'}
            </p>
          </div>
        </Backdrop>
      )}
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

function EventRow({ event, highlight, confirmed, onConfirm, onUnconfirm, onShowAccounts, onDelete, onEdit, onPartial, onAmountEdit, onAccountEdit }) {
  const days = daysUntil(event.date instanceof Date ? event.date.toISOString() : String(event.date))
  const isIncome = event.amount > 0
  const c = colorMap[event.color] || colorMap.gray
  const isUSD = event.currency === 'USD'
  const balanceNegative = isUSD ? event.balanceAfterUSD < 0 : event.balanceAfter < 0
  const [editingAmount, setEditingAmount] = useState(false)
  const [amountDraft, setAmountDraft] = useState('')
  const canEditAmount = !confirmed && !!onAmountEdit
  const startEditAmount = () => {
    if (!canEditAmount) return
    setAmountDraft(String(Math.abs(Math.round(event.amount || 0))))
    setEditingAmount(true)
  }
  const commitEditAmount = () => {
    const parsed = parseInt(amountDraft, 10)
    if (!isNaN(parsed) && parsed >= 0) onAmountEdit(parsed)
    setEditingAmount(false)
  }

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
              {event.rolledOver && <span className="text-orange-400 text-xs ml-1">↩ {(() => { const orig = event.originalDate instanceof Date ? event.originalDate : new Date(event.originalDateStr); const yest = new Date(); yest.setDate(yest.getDate()-1); yest.setHours(0,0,0,0); return orig.toDateString() === yest.toDateString() ? 'הועבר מאתמול' : `הועבר מ-${orig.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}` })()}</span>}
              {event.name}
            </p>
            <p className="text-xs text-gray-400">
              {dayLabel}{event.note ? ` · ${event.note}` : ''}
              {event.accountName && (
                !confirmed && onAccountEdit ? (
                  <> · <button
                    type="button"
                    onClick={onAccountEdit}
                    className="text-blue-400 underline decoration-dotted underline-offset-2 active:opacity-60"
                    title="לחץ לשינוי חשבון המקור"
                  >{event.accountName}</button></>
                ) : (
                  <span className="text-blue-400"> · {event.accountName}</span>
                )
              )}
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
          <div className="text-left flex-shrink-0">
            {editingAmount ? (
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={amountDraft}
                onChange={ev => setAmountDraft(ev.target.value)}
                onBlur={commitEditAmount}
                onKeyDown={ev => {
                  if (ev.key === 'Enter') { ev.preventDefault(); commitEditAmount() }
                  else if (ev.key === 'Escape') { ev.preventDefault(); setEditingAmount(false) }
                }}
                className="w-24 text-left border border-indigo-300 rounded-lg px-2 py-1 text-sm font-bold text-gray-700 focus:outline-none focus:border-indigo-500 bg-white"
                dir="ltr"
              />
            ) : (
              <button
                type="button"
                onClick={canEditAmount ? startEditAmount : undefined}
                dir="ltr"
                className={`text-sm font-bold whitespace-nowrap ${isIncome ? 'text-green-600' : 'text-red-500'} ${canEditAmount ? 'underline decoration-dotted underline-offset-2 active:opacity-60' : ''}`}
                title={canEditAmount ? 'לחץ לעריכת הסכום לחודש הזה' : ''}
              >
                {isUSD ? usdDisplay : formatILS(event.amount, { signed: isIncome })}
              </button>
            )}
            {isUSD && event.usdDeductions && (
              <p className="text-xs">
                <span className="bg-yellow-200 text-yellow-800 font-semibold px-1 rounded text-xs">({event.usdDeductions})</span>
              </p>
            )}
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-500 transition-colors flex-shrink-0 text-sm"
            >
              ✎
            </button>
          )}
          {onPartial && !confirmed && (
            <button
              onClick={onPartial}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-orange-100 hover:text-orange-600 transition-colors flex-shrink-0 text-sm"
              title="תשלום חלקי"
            >
              ½
            </button>
          )}
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
          {onDelete && (
            <button
              onClick={onDelete}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors flex-shrink-0"
              title="מחק אירוע"
            >
              ✕
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
