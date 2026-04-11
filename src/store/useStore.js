import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  initialAccounts,
  initialInvestments,
  initialLoans,
  initialExpenses,
  initialRentalIncome,
  initialFutureIncome,
  initialDebts,
} from '../data/initialData'

const useStore = create(
  persist(
    (set) => ({
      accounts:     initialAccounts,
      investments:  initialInvestments,
      loans:        initialLoans,
      expenses:     initialExpenses,
      rentalIncome: initialRentalIncome,
      futureIncome: initialFutureIncome,
      debts:        initialDebts,
      primeRate:       5.5,
      eurRate:         3.6283,
      usdRate:         3.61,
      ratesLastFetched: null,
      lastSaved:       0,
      discountTransferDone: [], // array of 'YYYY-MM' strings
      friendReminders: [],    // array of { loanId, monthKey, reminderSent, moneyReceived, _delta, _accountId }
      confirmDiscountTransfer: (monthKey) =>
        set(s => ({ discountTransferDone: [...(s.discountTransferDone || []), monthKey] })),
      undoDiscountTransfer: (monthKey) =>
        set(s => ({ discountTransferDone: (s.discountTransferDone || []).filter(m => m !== monthKey) })),
      setFriendReminderSent: (loanId, monthKey) =>
        set(s => {
          const existing = (s.friendReminders || []).find(r => r.loanId === loanId && r.monthKey === monthKey)
          if (existing) return { friendReminders: s.friendReminders.map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, reminderSent: true } : r) }
          return { friendReminders: [...(s.friendReminders || []), { loanId, monthKey, reminderSent: true, moneyReceived: false }] }
        }),
      undoFriendReminderSent: (loanId, monthKey) =>
        set(s => ({ friendReminders: (s.friendReminders || []).map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, reminderSent: false } : r) })),
      setFriendMoneyReceived: (loanId, monthKey, amount, accountId) =>
        set(s => {
          const existing = (s.friendReminders || []).find(r => r.loanId === loanId && r.monthKey === monthKey)
          const newReminders = existing
            ? s.friendReminders.map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, moneyReceived: true, _delta: amount, _accountId: accountId } : r)
            : [...(s.friendReminders || []), { loanId, monthKey, reminderSent: true, moneyReceived: true, _delta: amount, _accountId: accountId }]
          if (!accountId || !amount) return { friendReminders: newReminders }
          const accounts = s.accounts.map(a => a.id !== accountId ? a : { ...a, balance: (a.balance || 0) + amount })
          return { friendReminders: newReminders, accounts }
        }),
      undoFriendMoneyReceived: (loanId, monthKey) =>
        set(s => {
          const rec = (s.friendReminders || []).find(r => r.loanId === loanId && r.monthKey === monthKey)
          const newReminders = (s.friendReminders || []).map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, moneyReceived: false, _delta: null, _accountId: null } : r)
          if (!rec?._accountId || !rec?._delta) return { friendReminders: newReminders }
          const accounts = s.accounts.map(a => a.id !== rec._accountId ? a : { ...a, balance: (a.balance || 0) - rec._delta })
          return { friendReminders: newReminders, accounts }
        }),

      // ── Accounts ──────────────────────────────
      updateAccount: (id, updates) =>
        set(s => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, ...updates } : a) })),
      addAccount: (account) =>
        set(s => ({ accounts: [...s.accounts, { ...account, id: 'ba' + Date.now() }] })),
      deleteAccount: (id) =>
        set(s => ({ accounts: s.accounts.filter(a => a.id !== id) })),

      // ── Investments ───────────────────────────
      updateInvestment: (id, updates) =>
        set(s => ({ investments: s.investments.map(i => i.id === id ? { ...i, ...updates } : i) })),
      addInvestment: (inv) =>
        set(s => ({ investments: [...s.investments, { ...inv, id: 'inv' + Date.now() }] })),
      deleteInvestment: (id) =>
        set(s => ({ investments: s.investments.filter(i => i.id !== id) })),

      // ── Loans ─────────────────────────────────
      updateLoan: (id, updates) =>
        set(s => ({ loans: s.loans.map(l => l.id === id ? { ...l, ...updates, _updatedAt: Date.now() } : l) })),
      addLoan: (loan) =>
        set(s => {
          const newState = { loans: [...s.loans, { ...loan, id: 'l' + Date.now() }] }
          if (loan.creditAccountId && loan.totalAmount) {
            const acc = s.accounts.find(a => a.id === loan.creditAccountId)
            const isUSD = acc?.currency === 'USD'
            newState.accounts = s.accounts.map(a =>
              a.id !== loan.creditAccountId ? a : isUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) + loan.totalAmount }
                : { ...a, balance: (a.balance || 0) + loan.totalAmount }
            )
          }
          return newState
        }),
      deleteLoan: (id, opts = {}) =>
        set(s => {
          const loan = s.loans.find(l => l.id === id)
          const newState = { loans: s.loans.filter(l => l.id !== id) }
          // Optional: reverse the original credit applied via addLoan (creditAccountId)
          if (opts.reverseCredit && loan && loan.creditAccountId && loan.totalAmount) {
            const acc = s.accounts.find(a => a.id === loan.creditAccountId)
            const isUSD = acc?.currency === 'USD'
            newState.accounts = s.accounts.map(a =>
              a.id !== loan.creditAccountId ? a : isUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) - loan.totalAmount }
                : { ...a, balance: (a.balance || 0) - loan.totalAmount }
            )
          }
          return newState
        }),

      // ── Expenses ──────────────────────────────
      updateExpense: (id, updates) =>
        set(s => ({ expenses: s.expenses.map(e => e.id === id ? { ...e, ...updates } : e) })),
      updateExpenseMonthlyAmount: (id, monthKey, amount) =>
        set(s => ({
          expenses: s.expenses.map(e => e.id !== id ? e : {
            ...e,
            monthlyAmounts: { ...(e.monthlyAmounts || {}), [monthKey]: amount }
          })
        })),
      addExpense: (expense) =>
        set(s => ({ expenses: [...s.expenses, { ...expense, id: 'e' + Date.now() }] })),
      deleteExpense: (id) =>
        set(s => ({
          expenses: s.expenses.filter(e => e.id !== id),
          // Hygiene: drop any lingering confirmedEvents entries pointing at this id
          confirmedEvents: (s.confirmedEvents || []).filter(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare !== id
          }),
        })),

      // ── Rental Income ─────────────────────────
      updateRentalIncome: (id, updates) =>
        set(s => ({ rentalIncome: s.rentalIncome.map(r => r.id === id ? { ...r, ...updates } : r) })),
      addRentalIncome: (item) =>
        set(s => ({ rentalIncome: [...s.rentalIncome, { ...item, id: 'r' + Date.now() }] })),
      deleteRentalIncome: (id) =>
        set(s => ({
          rentalIncome: s.rentalIncome.filter(r => r.id !== id),
          confirmedEvents: (s.confirmedEvents || []).filter(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare !== id
          }),
        })),

      // ── Future Income ─────────────────────────
      updateFutureIncome: (id, updates) =>
        set(s => ({ futureIncome: s.futureIncome.map(f => f.id === id ? { ...f, ...updates } : f) })),
      bubbleIncomeToTop: (id) =>
        set(s => {
          const item = s.futureIncome.find(f => f.id === id)
          if (!item) return s
          return { futureIncome: [item, ...s.futureIncome.filter(f => f.id !== id)] }
        }),
      addFutureIncome: (item) =>
        set(s => ({ futureIncome: [...s.futureIncome, { ...item, id: 'fi' + Date.now(), status: 'pending' }] })),
      deleteFutureIncome: (id) =>
        set(s => ({
          futureIncome: s.futureIncome.filter(f => f.id !== id),
          confirmedEvents: (s.confirmedEvents || []).filter(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare !== id
          }),
        })),
      markIncomeReceived: (id, accountId) =>
        set(s => {
          const item = s.futureIncome.find(f => f.id === id)
          if (!item) return s
          const gross = item.amount || 0
          const amt   = item.agentCommission ? Math.round(gross * 0.85) : gross
          const accId = accountId || item.accountId || null
          // Guard: if Dashboard already confirmed this item, skip the account credit
          const alreadyConfirmed = (s.confirmedEvents || []).some(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare === id
          })
          const newFI = s.futureIncome.map(f =>
            f.id === id ? { ...f, status: 'received', receivedDate: new Date().toISOString(), _receivedAmt: alreadyConfirmed ? 0 : amt, _receivedAccId: accId } : f
          )
          if (alreadyConfirmed || !accId || !amt) return { futureIncome: newFI }
          const accounts = s.accounts.map(a =>
            a.id !== accId ? a : { ...a, balance: (a.balance || 0) + amt }
          )
          return { futureIncome: newFI, accounts }
        }),
      markIncomePending: (id) =>
        set(s => {
          const item = s.futureIncome.find(f => f.id === id)
          if (!item) return s
          const newFI = s.futureIncome.map(f =>
            f.id === id ? { ...f, status: 'pending', receivedDate: null, _receivedAmt: null, _receivedAccId: null } : f
          )
          if (!item._receivedAccId || !item._receivedAmt) return { futureIncome: newFI }
          const accounts = s.accounts.map(a =>
            a.id !== item._receivedAccId ? a : { ...a, balance: (a.balance || 0) - item._receivedAmt }
          )
          return { futureIncome: newFI, accounts }
        }),
      // Partial payments on futureIncome — push a payment to payments[] and credit account
      addIncomePayment: (incomeId, amount, accountId) =>
        set(s => {
          const item = s.futureIncome.find(f => f.id === incomeId)
          if (!item || !amount) return s
          const payment = { id: 'pay' + Date.now(), amount, accountId, date: new Date().toISOString() }
          const newFI = s.futureIncome.map(f => f.id === incomeId ? { ...f, payments: [...(f.payments || []), payment] } : f)
          if (!accountId) return { futureIncome: newFI }
          const isUSD = item.currency === 'USD'
          const accounts = s.accounts.map(a => {
            if (a.id !== accountId) return a
            if (isUSD) return { ...a, usdBalance: (a.usdBalance || 0) + amount }
            return { ...a, balance: (a.balance || 0) + amount }
          })
          return { futureIncome: newFI, accounts }
        }),
      removeIncomePayment: (incomeId, paymentId) =>
        set(s => {
          const item = s.futureIncome.find(f => f.id === incomeId)
          if (!item) return s
          // Guard: don't allow removal if item was already confirmed — would cause double-credit reversal
          const isConfirmed = (s.confirmedEvents || []).some(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare === incomeId
          })
          if (isConfirmed) return s
          const payment = (item.payments || []).find(p => p.id === paymentId)
          if (!payment) return s
          const newFI = s.futureIncome.map(f => f.id === incomeId ? { ...f, payments: (f.payments || []).filter(p => p.id !== paymentId) } : f)
          if (!payment.accountId) return { futureIncome: newFI }
          const isUSD = item.currency === 'USD'
          const accounts = s.accounts.map(a => {
            if (a.id !== payment.accountId) return a
            if (isUSD) return { ...a, usdBalance: (a.usdBalance || 0) - payment.amount }
            return { ...a, balance: (a.balance || 0) - payment.amount }
          })
          return { futureIncome: newFI, accounts }
        }),
      // Partial payments on rentalIncome — same logic but on rentalIncome[]
      addRentalPayment: (rentalId, amount, accountId) =>
        set(s => {
          const item = s.rentalIncome.find(r => r.id === rentalId)
          if (!item || !amount) return s
          const payment = { id: 'pay' + Date.now(), amount, accountId, date: new Date().toISOString() }
          const newRental = s.rentalIncome.map(r => r.id === rentalId ? { ...r, payments: [...(r.payments || []), payment] } : r)
          if (!accountId) return { rentalIncome: newRental }
          const isUSD = item.currency === 'USD'
          const accounts = s.accounts.map(a => {
            if (a.id !== accountId) return a
            if (isUSD) return { ...a, usdBalance: (a.usdBalance || 0) + amount }
            return { ...a, balance: (a.balance || 0) + amount }
          })
          return { rentalIncome: newRental, accounts }
        }),
      removeRentalPayment: (rentalId, paymentId) =>
        set(s => {
          const item = s.rentalIncome.find(r => r.id === rentalId)
          if (!item) return s
          // Guard: don't allow removal if item was already confirmed for current month
          const isConfirmed = (s.confirmedEvents || []).some(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare === rentalId
          })
          if (isConfirmed) return s
          const payment = (item.payments || []).find(p => p.id === paymentId)
          if (!payment) return s
          const newRental = s.rentalIncome.map(r => r.id === rentalId ? { ...r, payments: (r.payments || []).filter(p => p.id !== paymentId) } : r)
          if (!payment.accountId) return { rentalIncome: newRental }
          const isUSD = item.currency === 'USD'
          const accounts = s.accounts.map(a => {
            if (a.id !== payment.accountId) return a
            if (isUSD) return { ...a, usdBalance: (a.usdBalance || 0) - payment.amount }
            return { ...a, balance: (a.balance || 0) - payment.amount }
          })
          return { rentalIncome: newRental, accounts }
        }),

      addWorkSession: (incomeId, session) =>
        set(s => ({ futureIncome: s.futureIncome.map(f => {
          if (f.id !== incomeId) return f
          const sessions = [...(f.sessions || []), { ...session, id: 'ws' + Date.now() }]
          return { ...f, sessions, amount: sessions.reduce((sum, ws) => sum + (ws.amount || 0), 0) }
        })})),
      deleteWorkSession: (incomeId, sessionId) =>
        set(s => ({ futureIncome: s.futureIncome.map(f => {
          if (f.id !== incomeId) return f
          const sessions = (f.sessions || []).filter(ws => ws.id !== sessionId)
          return { ...f, sessions, amount: sessions.reduce((sum, ws) => sum + (ws.amount || 0), 0) }
        })})),

      // ── Debts ─────────────────────────────────
      updateDebt: (id, updates) =>
        set(s => ({ debts: s.debts.map(d => d.id === id ? { ...d, ...updates } : d) })),
      addDebt: (debt) =>
        set(s => ({ debts: [...s.debts, { ...debt, id: 'd' + Date.now() }] })),
      deleteDebt: (id) =>
        set(s => ({ debts: s.debts.filter(d => d.id !== id) })),

      // ── Dismissed Events (hidden from today without deleting) ────────────
      dismissedEvents: [], // [{ id, date }]
      dismissEvent: (id, date) =>
        set(s => ({ dismissedEvents: [...(s.dismissedEvents || []), { id, date }] })),

      // ── Reminders ─────────────────────────────
      reminders: [],
      addReminder: (reminder) =>
        set(s => ({ reminders: [...(s.reminders || []), { ...reminder, id: 'rem' + Date.now(), done: false }] })),
      updateReminder: (id, updates) =>
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, ...updates } : r) })),
      deleteReminder: (id) =>
        set(s => ({ reminders: (s.reminders || []).filter(r => r.id !== id) })),
      doneReminder: (id) =>
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, done: true } : r) })),
      undoneReminder: (id) =>
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, done: false } : r) })),
      // monthly reminder: dismiss for current month only
      doneReminderMonth: (id, monthKey) =>
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, doneMonths: [...(r.doneMonths || []), monthKey] } : r) })),
      undoneReminderMonth: (id, monthKey) =>
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, doneMonths: (r.doneMonths || []).filter(m => m !== monthKey) } : r) })),

      // ── Confirmed Events ──────────────────────
      confirmedEvents: [],
      confirmEvent: (id, date, accountId, delta, isUSD, ro, destAccountId) =>
        set(s => {
          // Stamp the confirmation with the day the user actually clicked confirm,
          // in the same "dashboard date" format everything else uses. The Dashboard
          // uses this to hide rolled-over confirmations once the day advances.
          const _now = new Date(); _now.setHours(0, 0, 0, 0)
          const confirmedOn = _now.toISOString().split('T')[0]
          const newConfirmed = [...s.confirmedEvents, { id, date, accountId, delta, isUSD, confirmedOn, ...(ro ? { _ro: true } : {}), ...(destAccountId ? { destAccountId } : {}) }]
          if (!accountId || !delta) return { confirmedEvents: newConfirmed }
          let accounts = s.accounts.map(a => {
            if (a.id !== accountId) return a
            if (isUSD) return { ...a, usdBalance: (a.usdBalance || 0) + delta }
            return { ...a, balance: (a.balance || 0) + delta }
          })
          let investments = s.investments
          if (destAccountId) {
            const credit = Math.abs(delta)
            if (destAccountId.startsWith('inv:')) {
              const invId = destAccountId.slice(4)
              investments = s.investments.map(i => i.id !== invId ? i : { ...i, value: (i.value || 0) + credit })
            } else {
              accounts = accounts.map(a => a.id !== destAccountId ? a : { ...a, balance: (a.balance || 0) + credit })
            }
          }
          return { confirmedEvents: newConfirmed, accounts, investments }
        }),
      unconfirmEvent: (id, date) =>
        set(s => {
          const ev = s.confirmedEvents.find(e => e.id === id && e.date === date)
          const newConfirmed = s.confirmedEvents.filter(e => !(e.id === id && e.date === date))
          if (!ev || !ev.accountId || !ev.delta) return { confirmedEvents: newConfirmed }
          let accounts = s.accounts.map(a => {
            if (a.id !== ev.accountId) return a
            if (ev.isUSD) return { ...a, usdBalance: (a.usdBalance || 0) - ev.delta }
            return { ...a, balance: (a.balance || 0) - ev.delta }
          })
          let investments = s.investments
          if (ev.destAccountId) {
            const credit = Math.abs(ev.delta)
            if (ev.destAccountId.startsWith('inv:')) {
              const invId = ev.destAccountId.slice(4)
              investments = s.investments.map(i => i.id !== invId ? i : { ...i, value: (i.value || 0) - credit })
            } else {
              accounts = accounts.map(a => a.id !== ev.destAccountId ? a : { ...a, balance: (a.balance || 0) - credit })
            }
          }
          return { confirmedEvents: newConfirmed, accounts, investments }
        }),

      // ── Settings ──────────────────────────────
      setPrimeRate: (rate) => set({ primeRate: rate }),
      setEurRate:   (rate) => set({ eurRate: rate }),
      setUsdRate:   (rate) => set({ usdRate: rate }),
      setRatesLastFetched: (ts) => set({ ratesLastFetched: ts }),
      clearShlioConfirmed: () =>
        set(s => {
          const shlioEntries = (s.confirmedEvents || []).filter(e => e.id === 'r5')
          if (shlioEntries.length === 0) return s
          const totalUSD = shlioEntries.reduce((sum, e) => sum + (e.delta || 1050), 0)
          const newConfirmed = s.confirmedEvents.filter(e => e.id !== 'r5')
          const accounts = s.accounts.map(a =>
            a.id !== 'ba12' ? a : { ...a, usdBalance: (a.usdBalance || 0) - totalUSD }
          )
          return { confirmedEvents: newConfirmed, accounts }
        }),
    }),
    {
      name: 'financial-app-v14',
      version: 43,
      migrate: (state) => {
        // ── v19: accountId fields + e1→e1a/e1b split ──────────────────────
        const loanUpdates = {
          'l1':  { accountId: 'ba8', effectiveAmount: 4400 },
          'l2':  { accountId: 'ba6' }, 'l3':  { accountId: 'ba6' },
          'l4':  { accountId: 'ba1' }, 'l5':  { accountId: 'ba2' },
          'l6':  { accountId: 'ba6' }, 'l7':  { accountId: 'ba6' },
          'l8':  { accountId: 'ba6' }, 'l9':  { accountId: 'ba2' },
          'l10': { accountId: 'ba10' }, 'l11': { accountId: 'ba9' },
          'l1':  { balanceOverride: 640000 },
          'l12': { accountId: 'ba1' }, 'l15': { accountId: 'ba12' },
          'l16': { accountId: 'ba12' },
          'l17': { paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2, extras: [{ name: 'שעון', amount: 3700, remainingPayments: 7 }] },
          'l18': { paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2 },
        }
        const expenseUpdates = {
          'e2':    { paidViaCredit: true },
          'e4':    { accountId: 'ba5' }, 'e5':  { accountId: 'ba2' },
          'e9':    { accountId: 'ba4', note: 'יעל בינלאומי' }, 'e7':  { accountId: 'ba12' },
          'e8':    { accountId: 'ba12' }, 'e10': { accountId: 'ba5' },
          'e_cc1': { chargeDay: 10 },
          'e_cc2': { chargeDay: 10 },
          'e_cc3': { chargeDay: 10 },
        }
        const rentalUpdates = {
          'r1': { noBalanceEffect: true },
          'r2': { accountId: 'ba6' }, 'r3': { accountId: 'ba12' },
          'r4': { accountId: 'ba12' }, 'r5': { accountId: 'ba12' },
          'r6': { accountId: 'ba4' },
        }
        // הסר d1 ו-d3 מחובות, הסר inv7 ו-inv8 מהשקעות
        const cleanedDebts = (state.debts || [])
          .filter(d => d.id !== 'd1' && d.id !== 'd3')
          .map(d => {
            if (d.id === 'd3') return null // שליו הועבר
            return d
          })
          .filter(Boolean)

        // הוסף פקדון משתלה לחובות אם לא קיים
        const hasNursery = cleanedDebts.some(d => d.id === 'd3_nursery')
        const debtsWithNursery = hasNursery
          ? cleanedDebts
          : [...cleanedDebts, { id: 'd3_nursery', name: 'פקדון משתלה', amount: 21000, type: 'owed_to_us', expectedDate: null, notes: '' }]

        // הסר inv7 ו-inv8 מהשקעות
        const cleanedInvestments = (state.investments || [])
          .filter(i => i.id !== 'inv7' && i.id !== 'inv8')
          .map(i => {
            if (i.id === 'inv2') return { ...i, name: 'חיסכון טהור פניקס יעל', value: 301269 }
            if (i.id === 'inv4') return { ...i, name: 'קרן השתלמות מור יעל',   value: 182269 }
            return i
          })

        // הוסף גיא, שליו וקופת גמל אביגיל להשקעות אם לא קיימים
        const hasGuy    = cleanedInvestments.some(i => i.id === 'inv10')
        const hasShlio  = cleanedInvestments.some(i => i.id === 'inv11')
        const hasAvigail = cleanedInvestments.some(i => i.id === 'inv12')
        const investmentsWithFx = [
          ...cleanedInvestments,
          ...(!hasGuy     ? [{ id: 'inv10', name: 'גיא משה',        value: 0, type: 'cash',    owner: 'משותף', currency: 'EUR', originalAmount: 123600 }] : []),
          ...(!hasShlio   ? [{ id: 'inv11', name: 'שליו',            value: 0, type: 'cash',    owner: 'משותף', currency: 'USD', originalAmount: 42000  }] : []),
          ...(!hasAvigail ? [{ id: 'inv12', name: 'קופת גמל אביגיל', value: 0, type: 'savings', owner: 'יעל' }] : []),
        ]

        return {
          ...state,
          eurRate:         3.6283,
          usdRate:         (state.usdRate && state.usdRate >= 3.0) ? state.usdRate : 3.61, // USD rate נשמר כפי שנשלף מהבנק
          ratesLastFetched: Date.now(),
          debts: (() => {
            const ids = debtsWithNursery.map(d => d.id)
            if (!ids.includes('d6')) return [...debtsWithNursery, { id: 'd6', name: 'אמא — הלוואה 6000 + משכנתא מרץ', amount: 14325, type: 'we_owe', expectedDate: null, notes: '6,000 הלוואה + 7,500 משכנתא מרץ' }]
            return debtsWithNursery
          })(),
          investments: investmentsWithFx,
          accounts: (() => {
            const existing = state.accounts || []
            const ids = existing.map(a => a.id)
            const toAdd = [
              ...(!ids.includes('ba11') ? [{ id: 'ba11', name: 'Chase Personal (...3398)', bank: 'Chase', balance: 0, currency: 'USD', usdBalance: 991.44,  owner: 'יעל', type: 'checking' }] : []),
              ...(!ids.includes('ba12') ? [{ id: 'ba12', name: 'Chase Business (...1528)', bank: 'Chase', balance: 0, currency: 'USD', usdBalance: 3522.39, owner: 'יעל', type: 'business' }] : []),
            ]
            const withNew = [...existing, ...toAdd]
            // v26: fix ba12 balance
            const afterV26 = withNew.map(a => a.id === 'ba12' ? { ...a, usdBalance: 3522.39 } : a)
            // v33: restore balances for any CC confirmations that were recorded during testing
            const CC_IDS = ['e_cc1', 'e_cc2', 'e_cc3']
            const ccConfirmed = (state.confirmedEvents || []).filter(e => CC_IDS.includes(e.id) && e.delta && e.accountId)
            if (ccConfirmed.length === 0) return afterV26
            return afterV26.map(a => {
              const restore = ccConfirmed.filter(e => e.accountId === a.id).reduce((s, e) => s - e.delta, 0)
              return restore !== 0 ? { ...a, balance: (a.balance || 0) + restore } : a
            })
          })(),
          futureIncome: (() => {
            const existing = (state.futureIncome || []).map(f =>
              f.id === 'fi1' ? { ...f, expectedDate: '2026-05-01' } : f
            )
            const ids = existing.map(f => f.id)
            const toAdd = [
              { id: 'fi13', name: 'טיפול זוגי',  amount: 0, expectedDate: null, status: 'pending', notes: '', isWorkLog: true, sessions: [] },
              { id: 'fi14', name: 'הקלטות ניצן', amount: 0, expectedDate: null, status: 'pending', notes: '', isWorkLog: true, sessions: [] },
              { id: 'fi15', name: 'הטבח',         amount: 0, expectedDate: null, status: 'pending', notes: '', isWorkLog: true, sessions: [] },
              { id: 'fi16', name: 'תשלום לאמא — הלוואה + משכנתא', amount: -14325, expectedDate: '2026-05-01', status: 'pending', notes: 'ד6: 6,000 הלוואה + 7,500 משכנתא מרץ', isPayment: true },
            ].filter(f => !ids.includes(f.id))
            return [...existing, ...toAdd]
          })(),
          expenses: (() => {
            // v29: remove e1, e1a, e1b → replace with 3 separate credit card expenses
            let existing = (state.expenses || []).filter(e => e.id !== 'e1' && e.id !== 'e1a' && e.id !== 'e1b')
            const ids = existing.map(e => e.id)
            const toAdd = [
              ...(!ids.includes('e_cc1') ? [{ id: 'e_cc1', name: 'תומר פליי קארד',      amount: 10000, chargeDay: 10, category: 'credit', accountId: 'ba2', note: 'תומר בינלאומי', monthlyAmounts: {} }] : []),
              ...(!ids.includes('e_cc2') ? [{ id: 'e_cc2', name: 'אמריקן אקספרס תומר', amount: 10000, chargeDay: 10, category: 'credit', accountId: 'ba2', note: 'תומר בינלאומי', monthlyAmounts: {} }] : []),
              ...(!ids.includes('e_cc3') ? [{ id: 'e_cc3', name: 'יעל פליי קארד',       amount: 5000,  chargeDay: 10, category: 'credit', accountId: 'ba4', note: 'יעל בינלאומי',  monthlyAmounts: {} }] : []),
              ...(!ids.includes('e9')  ? [{ id: 'e9',  name: 'קופת גמל אביגיל', amount: 1500, chargeDay: 15, category: 'savings', accountId: 'ba2', note: 'תומר בינלאומי' }] : []),
              ...(!ids.includes('e7')  ? [{ id: 'e7',  name: 'שכירות West Knoll', amount: 0, usdAmount: 3300, currency: 'USD', chargeDay: 1, category: 'rent', accountId: 'ba12', note: 'Chase Business' }] : []),
              ...(!ids.includes('e10') ? [{ id: 'e10', name: 'רונן רואה חשבון', amount: 531, chargeDay: 6, category: 'business', accountId: 'ba5', note: 'בינלאומי עסקי יעל' }] : []),
              ...(!ids.includes('e8')  ? [{ id: 'e8',  name: 'יוסף — טסלה וחשבונות', amount: 0, usdAmount: 1250, usdDeductions: '-$425 -$67', currency: 'USD', chargeDay: 1, category: 'transport', accountId: 'ba12', note: 'Chase Business' }] : []),
            ]
            return existing
              .map(e => {
                if (e.id === 'e8') return { ...e, usdAmount: 1250, usdGross: undefined, usdDeductions: '-$425 -$67' }
                // v37: force CC expenses back to chargeDay 10 and clear test monthlyAmounts
                if (e.id === 'e_cc1') return { ...e, chargeDay: 10, amount: 20000, monthlyAmounts: {} }
                if (e.id === 'e_cc2') return { ...e, chargeDay: 10, amount: 1000,  monthlyAmounts: {} }
                if (e.id === 'e_cc3') return { ...e, chargeDay: 10, amount: 4000,  monthlyAmounts: {} }
                return e
              })
              .map(e => expenseUpdates[e.id] ? { ...e, ...expenseUpdates[e.id] } : e)
              .concat(toAdd.filter(t => !ids.includes(t.id)))
          })(),
          rentalIncome: (() => {
            const existing = state.rentalIncome || []
            const ids = existing.map(r => r.id)
            const toAdd = [
              ...(!ids.includes('r3') ? [{ id: 'r3', name: 'אופיר שוכרת West Knoll', amount: 0, usdAmount: 3500, currency: 'USD', chargeDay: 30, notes: '', accountId: 'ba12', note: 'Chase Business' }] : []),
              ...(!ids.includes('r4') ? [{ id: 'r4', name: 'Omri Tesla',             amount: 0, usdAmount: 980,  currency: 'USD', chargeDay: 1,  notes: '', accountId: 'ba12', note: 'Chase Business' }] : []),
              ...(!ids.includes('r5') ? [{ id: 'r5', name: 'שליו ריבית',    amount: 0, usdAmount: 1050, currency: 'USD', chargeDay: 24, notes: '', accountId: 'ba12', note: 'Chase Business' }] : []),
              ...(!ids.includes('r6') ? [{ id: 'r6', name: 'קצבת ילדים',   amount: 173, chargeDay: 17, notes: '', accountId: 'ba4', note: 'יעל בינלאומי' }] : []),
              ...(!ids.includes('r7') ? [{ id: 'r7', name: 'ליאת — החזר חוב', amount: 1000, chargeDay: 10, debtId: 'd2', note: 'מקזז מחוב ליאת' }] : []),
            ]
            return [...existing, ...toAdd]
              .map(r => rentalUpdates[r.id] ? { ...r, ...rentalUpdates[r.id] } : r)
          })(),
          friendReminders: state.friendReminders || [],
          loans: (() => {
            const base = (state.loans || []).filter(l => l.id !== 'l13').map(l => {
              if (l.id === 'l4')  return { ...l, totalAmount: 75000, monthlyPayment: 809, startDate: '2021-11-07' }
              if (l.id === 'l10') return { ...l, totalAmount: 30000, startDate: '2026-03-20' }
              if (l.id === 'l11') return { ...l, totalAmount: 30000, startDate: '2026-03-20' }
              if (l.id === 'l12') return { ...l, totalAmount: 40000, monthlyPayment: 666, chargeDay: 10, durationMonths: 60, interestRate: 0, startDate: '2024-02-28' }
              if (l.id === 'l3')  return { ...l, totalAmount: 100000, monthlyPayment: 1920, interestRate: 6.0, interestType: 'fixed', startDate: '2021-11-18' }
              if (l.id === 'l2')  return { ...l, totalAmount: null, monthlyPayment: 5793, durationMonths: null, startDate: null, balanceOverride: 530361 }
              if (l.id === 'l7')  return { ...l, balanceOverride: 30000 }
              if (l.id === 'l8')  return { ...l, balanceOverride: 30000 }
              return l
            })
            const ids = base.map(l => l.id)
            const toAdd = [
              ...(!ids.includes('l17') ? [{ id: 'l17', name: 'אליעזר — פועלים', totalAmount: 250000, monthlyPayment: 11082, chargeDay: 20, durationMonths: 24, interestRate: 6.0, interestType: 'prime+0.5', startDate: '2026-01-07', owner: 'תומר', type: 'loan', accountId: 'ba1', note: 'תומר פועלים', paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2, balanceOverride: 230526, extras: [{ name: 'שעון', amount: 3700, remainingPayments: 7 }] }] : []),
              ...(!ids.includes('l18') ? [{ id: 'l18', name: 'אליעזר — בינלאומי', totalAmount: 200400, monthlyPayment: 13901, chargeDay: 1, durationMonths: 16, interestRate: 6.0, interestType: 'prime+0.5', startDate: '2026-01-16', owner: 'תומר', type: 'loan', accountId: 'ba2', note: 'תומר בינלאומי', paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2, balanceOverride: 188251 }] : []),
              ...(!ids.includes('l15') ? [{ id: 'l15', name: 'יוסף — טלפון', totalAmount: 1498.8, monthlyPayment: 62.45, chargeDay: 15, durationMonths: 24, interestRate: 0, interestType: 'fixed', startDate: '2025-08-15', owner: 'תומר', type: 'loan', currency: 'USD', accountId: 'ba12', note: 'Chase Business' }] : []),
              ...(!ids.includes('l16') ? [{ id: 'l16', name: 'יוסף — קייס',  totalAmount: 48.96,  monthlyPayment: 4.08,  chargeDay: 15, durationMonths: 12, interestRate: 0, interestType: 'fixed', startDate: '2025-08-15', owner: 'תומר', type: 'loan', currency: 'USD', accountId: 'ba12', note: 'Chase Business' }] : []),
            ]
            return [...base, ...toAdd]
              .map(l => loanUpdates[l.id] ? { ...l, ...loanUpdates[l.id] } : l)
          })(),
          confirmedEvents: (() => {
            const cleaned = (state.confirmedEvents || []).map(e =>
              e.delta !== undefined ? e : { ...e, accountId: null, delta: 0, isUSD: false }
            )
            // v25: remove ALL r5 (שליו ריבית) confirmations
            // v33: remove any CC confirmations (test artifacts from chargeDay=26)
            const CC_IDS = ['e_cc1', 'e_cc2', 'e_cc3']
            return cleaned.filter(e => e.id !== 'r5' && !CC_IDS.includes(e.id))
          })(),
        }
      },
    }
  )
)

// Patch a cloud-loaded state to add any items introduced in migrations.
// Called in main.jsx after loadState(), because useStore.setState() bypasses migrate().
export function patchCloudState(state) {
  if (!state) return state
  let s = { ...state }

  // r7: ליאת — החזר חוב (v40)
  const rental = s.rentalIncome || []
  if (!rental.some(r => r.id === 'r7')) {
    s.rentalIncome = [...rental, { id: 'r7', name: 'ליאת — החזר חוב', amount: 1000, chargeDay: 10, debtId: 'd2', note: 'מקזז מחוב ליאת' }]
  }

  // inv12: קופת גמל אביגיל (v41)
  const invs = s.investments || []
  if (!invs.some(i => i.id === 'inv12')) {
    s.investments = [...invs, { id: 'inv12', name: 'קופת גמל אביגיל', value: 0, type: 'savings', owner: 'יעל' }]
  }

  if (!s.reminders) s.reminders = []
  if (!s.dismissedEvents) s.dismissedEvents = []

  // v43: תיקון שער יורו שגוי שנשמר בענן — מאכץ שיעור נכון מבנק ישראל
  s.eurRate = 3.6283
  s.ratesLastFetched = Date.now()

  return s
}

export default useStore
