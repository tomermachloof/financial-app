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

// שמירה מיידית לענן אחרי כל פעולה — מונע אובדן נתונים בסגירת דף
function immediateCloudSave() {
  setTimeout(() => {
    import('../lib/supabase').then(({ saveState }) => {
      saveState(useStore.getState())
    })
  }, 0)
}

const useStore = create(
  persist(
    (set, get) => ({
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
      loanOrder: [],  // array of loan IDs for custom sort
      discountTransferDone: [], // array of 'YYYY-MM' strings
      friendReminders: [],    // array of { loanId, monthKey, reminderSent, moneyReceived, _delta, _accountId }
      setLoanOrder: (order) => { set({ loanOrder: order }); immediateCloudSave() },
      confirmDiscountTransfer: (monthKey, sourceAccountId, discountAccountId, amount) => {
        set(s => {
          const entry = { monthKey, discountAccountId, sourceAccountId, amount }
          const discountTransferDone = [...(s.discountTransferDone || []), entry]
          if (!sourceAccountId) return { discountTransferDone }
          const accounts = s.accounts.map(a => {
            if (a.id === sourceAccountId) return { ...a, balance: (a.balance || 0) - amount }
            if (a.id === discountAccountId) return { ...a, balance: (a.balance || 0) + amount }
            return a
          })
          return { discountTransferDone, accounts }
        }); immediateCloudSave()
      },
      undoDiscountTransfer: (monthKey, discountAccountId) => {
        set(s => {
          const entry = (s.discountTransferDone || []).find(e =>
            typeof e !== 'string' && e.monthKey === monthKey && e.discountAccountId === discountAccountId
          )
          const discountTransferDone = (s.discountTransferDone || []).filter(e =>
            typeof e === 'string' ? e !== monthKey : !(e.monthKey === monthKey && e.discountAccountId === discountAccountId)
          )
          if (!entry || !entry.sourceAccountId) return { discountTransferDone }
          const accounts = s.accounts.map(a => {
            if (a.id === entry.sourceAccountId) return { ...a, balance: (a.balance || 0) + entry.amount }
            if (a.id === discountAccountId) return { ...a, balance: (a.balance || 0) - entry.amount }
            return a
          })
          return { discountTransferDone, accounts }
        }); immediateCloudSave()
      },
      setFriendReminderSent: (loanId, monthKey) => {
        set(s => {
          const existing = (s.friendReminders || []).find(r => r.loanId === loanId && r.monthKey === monthKey)
          if (existing) return { friendReminders: s.friendReminders.map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, reminderSent: true } : r) }
          return { friendReminders: [...(s.friendReminders || []), { loanId, monthKey, reminderSent: true, moneyReceived: false }] }
        }); immediateCloudSave()
      },
      undoFriendReminderSent: (loanId, monthKey) => {
        set(s => ({ friendReminders: (s.friendReminders || []).map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, reminderSent: false } : r) })); immediateCloudSave()
      },
      setFriendMoneyReceived: (loanId, monthKey, amount, accountId) => {
        set(s => {
          const existing = (s.friendReminders || []).find(r => r.loanId === loanId && r.monthKey === monthKey)
          const newReminders = existing
            ? s.friendReminders.map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, moneyReceived: true, moneyReceivedDate: new Date().toISOString().split('T')[0], _delta: amount, _accountId: accountId } : r)
            : [...(s.friendReminders || []), { loanId, monthKey, reminderSent: true, moneyReceived: true, moneyReceivedDate: new Date().toISOString().split('T')[0], _delta: amount, _accountId: accountId }]
          if (!accountId || !amount) return { friendReminders: newReminders }
          const acc = s.accounts.find(a => a.id === accountId)
          const isUSD = acc?.currency === 'USD'
          const accounts = s.accounts.map(a => a.id !== accountId ? a : isUSD
            ? { ...a, usdBalance: (a.usdBalance || 0) + amount }
            : { ...a, balance: (a.balance || 0) + amount })
          return { friendReminders: newReminders, accounts }
        }); immediateCloudSave()
      },
      undoFriendMoneyReceived: (loanId, monthKey) => {
        set(s => {
          const rec = (s.friendReminders || []).find(r => r.loanId === loanId && r.monthKey === monthKey)
          const newReminders = (s.friendReminders || []).map(r => r.loanId === loanId && r.monthKey === monthKey ? { ...r, moneyReceived: false, _delta: null, _accountId: null } : r)
          if (!rec?._accountId || !rec?._delta) return { friendReminders: newReminders }
          const acc = s.accounts.find(a => a.id === rec._accountId)
          const isUSD = acc?.currency === 'USD'
          const accounts = s.accounts.map(a => a.id !== rec._accountId ? a : isUSD
            ? { ...a, usdBalance: (a.usdBalance || 0) - rec._delta }
            : { ...a, balance: (a.balance || 0) - rec._delta })
          return { friendReminders: newReminders, accounts }
        }); immediateCloudSave()
      },

      // ── Accounts ──────────────────────────────
      updateAccount: (id, updates) => {
        set(s => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, ...updates } : a) })); immediateCloudSave()
      },
      addAccount: (account) => {
        set(s => ({ accounts: [...s.accounts, { ...account, id: 'ba' + Date.now() }] })); immediateCloudSave()
      },
      deleteAccount: (id) => {
        set(s => ({ accounts: s.accounts.filter(a => a.id !== id) })); immediateCloudSave()
      },

      // ── Investments ───────────────────────────
      updateInvestment: (id, updates) => {
        set(s => ({ investments: s.investments.map(i => i.id === id ? { ...i, ...updates } : i) })); immediateCloudSave()
      },
      addInvestment: (inv) => {
        set(s => ({ investments: [...s.investments, { ...inv, id: 'inv' + Date.now() }] })); immediateCloudSave()
      },
      deleteInvestment: (id) => {
        set(s => ({ investments: s.investments.filter(i => i.id !== id) })); immediateCloudSave()
      },

      // ── Loans ─────────────────────────────────
      updateLoan: (id, updates) => {
        set(s => ({ loans: s.loans.map(l => l.id === id ? { ...l, ...updates, _updatedAt: Date.now() } : l) })); immediateCloudSave()
      },
      addLoan: (loan) => {
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
        }); immediateCloudSave()
      },
      deleteLoan: (id) => {
        set(s => ({ loans: s.loans.filter(l => l.id !== id) })); immediateCloudSave()
      },

      // ── Expenses ──────────────────────────────
      updateExpense: (id, updates) => {
        set(s => ({ expenses: s.expenses.map(e => e.id === id ? { ...e, ...updates } : e) })); immediateCloudSave()
      },
      updateExpenseMonthlyAmount: (id, monthKey, amount) => {
        set(s => ({
          expenses: s.expenses.map(e => e.id !== id ? e : {
            ...e,
            monthlyAmounts: { ...(e.monthlyAmounts || {}), [monthKey]: amount }
          })
        })); immediateCloudSave()
      },
      updateRentalMonthlyAmount: (id, monthKey, amount) => {
        set(s => ({
          rentalIncome: s.rentalIncome.map(r => r.id !== id ? r : {
            ...r,
            monthlyAmounts: { ...(r.monthlyAmounts || {}), [monthKey]: amount }
          })
        })); immediateCloudSave()
      },
      updateLoanMonthlyAmount: (id, monthKey, amount) => {
        set(s => ({
          loans: s.loans.map(l => l.id !== id ? l : {
            ...l,
            monthlyAmounts: { ...(l.monthlyAmounts || {}), [monthKey]: amount }
          })
        })); immediateCloudSave()
      },
      addExpense: (expense) => {
        set(s => ({ expenses: [...s.expenses, { ...expense, id: 'e' + Date.now() }] })); immediateCloudSave()
      },
      deleteExpense: (id) => {
        set(s => ({ expenses: s.expenses.filter(e => e.id !== id) })); immediateCloudSave()
      },

      // ── Rental Income ─────────────────────────
      updateRentalIncome: (id, updates) => {
        set(s => ({ rentalIncome: s.rentalIncome.map(r => r.id === id ? { ...r, ...updates } : r) })); immediateCloudSave()
      },
      addRentalIncome: (item) => {
        set(s => ({ rentalIncome: [...s.rentalIncome, { ...item, id: 'r' + Date.now() }] })); immediateCloudSave()
      },
      deleteRentalIncome: (id) => {
        set(s => ({ rentalIncome: s.rentalIncome.filter(r => r.id !== id) })); immediateCloudSave()
      },

      addRentalPayment: (rentalId, amount, accountId) => {
        const s = get()
        const item = s.rentalIncome.find(r => r.id === rentalId)
        if (!item) return
        const isUSD = item.currency === 'USD'
        const payment = { id: 'pay' + Date.now(), amount, accountId, date: new Date().toISOString().split('T')[0] }
        const payments = [...(item.payments || []), payment]
        set({ rentalIncome: s.rentalIncome.map(r => r.id !== rentalId ? r : { ...r, payments }) })
        if (accountId && amount) {
          set(prev => ({
            accounts: prev.accounts.map(a =>
              a.id !== accountId ? a : isUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) + amount }
                : { ...a, balance: (a.balance || 0) + amount }
            )
          }))
        }
        immediateCloudSave()
      },
      removeRentalPayment: (rentalId, paymentId) => {
        const s = get()
        const item = s.rentalIncome.find(r => r.id === rentalId)
        if (!item) return
        const isUSD = item.currency === 'USD'
        const payment = (item.payments || []).find(p => p.id === paymentId)
        const payments = (item.payments || []).filter(p => p.id !== paymentId)
        set({ rentalIncome: s.rentalIncome.map(r => r.id !== rentalId ? r : { ...r, payments }) })
        if (payment?.accountId && payment?.amount) {
          set(prev => ({
            accounts: prev.accounts.map(a =>
              a.id !== payment.accountId ? a : isUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) - payment.amount }
                : { ...a, balance: (a.balance || 0) - payment.amount }
            )
          }))
        }
        immediateCloudSave()
      },

      // ── Future Income ─────────────────────────
      updateFutureIncome: (id, updates) => {
        set(s => ({ futureIncome: s.futureIncome.map(f => f.id === id ? { ...f, ...updates } : f) })); immediateCloudSave()
      },
      addFutureIncome: (item) => {
        set(s => ({ futureIncome: [...s.futureIncome, { ...item, id: 'fi' + Date.now(), status: 'pending' }] })); immediateCloudSave()
      },
      deleteFutureIncome: (id) => {
        set(s => ({ futureIncome: s.futureIncome.filter(f => f.id !== id) })); immediateCloudSave()
      },
      markIncomeReceived: (id, accountId) => {
        set(s => {
          const item = s.futureIncome.find(f => f.id === id)
          if (!item) return s
          const isUSD = item.currency === 'USD'
          const gross = isUSD ? (item.usdAmount || item.amount || 0) : (item.amount || 0)
          const amt   = item.agentCommission ? Math.round(gross * 0.85) : gross
          const accId = accountId || item.accountId || null
          const newFI = s.futureIncome.map(f =>
            f.id === id ? { ...f, status: 'received', receivedDate: new Date().toISOString(), _receivedAmt: amt, _receivedAccId: accId, _isUSD: isUSD } : f
          )
          if (!accId || !amt) return { futureIncome: newFI }
          const accounts = s.accounts.map(a =>
            a.id !== accId ? a : isUSD
              ? { ...a, usdBalance: (a.usdBalance || 0) + amt }
              : { ...a, balance: (a.balance || 0) + amt }
          )
          return { futureIncome: newFI, accounts }
        }); immediateCloudSave()
      },
      markIncomePending: (id) => {
        set(s => {
          const item = s.futureIncome.find(f => f.id === id)
          if (!item) return s
          const isUSD = item._isUSD || item.currency === 'USD'
          const newFI = s.futureIncome.map(f =>
            f.id === id ? { ...f, status: 'pending', receivedDate: null, _receivedAmt: null, _receivedAccId: null, _isUSD: null } : f
          )
          if (!item._receivedAccId || !item._receivedAmt) return { futureIncome: newFI }
          const accounts = s.accounts.map(a =>
            a.id !== item._receivedAccId ? a : isUSD
              ? { ...a, usdBalance: (a.usdBalance || 0) - item._receivedAmt }
              : { ...a, balance: (a.balance || 0) - item._receivedAmt }
          )
          return { futureIncome: newFI, accounts }
        }); immediateCloudSave()
      },
      addIncomePayment: (incomeId, amount, accountId) => {
        const s = get()
        const item = s.futureIncome.find(f => f.id === incomeId)
        if (!item) return
        const isUSD = item.currency === 'USD'
        const total = isUSD ? (item.usdAmount || item.amount || 0) : (item.amount || 0)
        const payment = { id: 'pay' + Date.now(), amount, accountId, date: new Date().toISOString().split('T')[0] }
        const payments = [...(item.payments || []), payment]
        const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0)
        const remaining = total - totalReceived
        const newStatus = remaining <= 0 ? 'received' : 'pending'
        set({ futureIncome: s.futureIncome.map(f =>
          f.id !== incomeId ? f : { ...f, payments, status: newStatus }
        ) })
        if (accountId && amount) {
          set(prev => ({
            accounts: prev.accounts.map(a =>
              a.id !== accountId ? a : isUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) + amount }
                : { ...a, balance: (a.balance || 0) + amount }
            )
          }))
        }
        immediateCloudSave()
      },
      removeIncomePayment: (incomeId, paymentId) => {
        const s = get()
        const item = s.futureIncome.find(f => f.id === incomeId)
        if (!item) return
        const isUSD = item.currency === 'USD'
        const total = isUSD ? (item.usdAmount || item.amount || 0) : (item.amount || 0)
        const payment = (item.payments || []).find(p => p.id === paymentId)
        const payments = (item.payments || []).filter(p => p.id !== paymentId)
        const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0)
        const remaining = total - totalReceived
        set({ futureIncome: s.futureIncome.map(f =>
          f.id !== incomeId ? f : { ...f, payments, status: remaining > 0 ? 'pending' : 'received' }
        ) })
        if (payment?.accountId && payment?.amount) {
          set(prev => ({
            accounts: prev.accounts.map(a =>
              a.id !== payment.accountId ? a : isUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) - payment.amount }
                : { ...a, balance: (a.balance || 0) - payment.amount }
            )
          }))
        }
        immediateCloudSave()
      },
      addWorkSession: (incomeId, session) => {
        set(s => ({ futureIncome: s.futureIncome.map(f => {
          if (f.id !== incomeId) return f
          const sessions = [...(f.sessions || []), { ...session, id: 'ws' + Date.now() }]
          return { ...f, sessions, amount: sessions.reduce((sum, ws) => sum + (ws.amount || 0), 0) }
        })})); immediateCloudSave()
      },
      deleteWorkSession: (incomeId, sessionId) => {
        set(s => ({ futureIncome: s.futureIncome.map(f => {
          if (f.id !== incomeId) return f
          const sessions = (f.sessions || []).filter(ws => ws.id !== sessionId)
          return { ...f, sessions, amount: sessions.reduce((sum, ws) => sum + (ws.amount || 0), 0) }
        })})); immediateCloudSave()
      },

      // ── Debts ─────────────────────────────────
      updateDebt: (id, updates) => {
        set(s => ({ debts: s.debts.map(d => d.id === id ? { ...d, ...updates } : d) })); immediateCloudSave()
      },
      addDebt: (debt) => {
        set(s => ({ debts: [...s.debts, { ...debt, id: 'd' + Date.now() }] })); immediateCloudSave()
      },
      deleteDebt: (id) => {
        set(s => ({ debts: s.debts.filter(d => d.id !== id) })); immediateCloudSave()
      },

      // ── Dismissed Events (hidden from today without deleting) ────────────
      dismissedEvents: [], // [{ id, date }]
      dismissEvent: (id, date) => {
        set(s => ({ dismissedEvents: [...(s.dismissedEvents || []), { id: id.replace(/_m\d+$/, ''), date }] })); immediateCloudSave()
      },

      // ── Reminders ─────────────────────────────
      reminders: [],
      addReminder: (reminder) => {
        set(s => ({ reminders: [...(s.reminders || []), { ...reminder, id: 'rem' + Date.now(), done: false }] })); immediateCloudSave()
      },
      updateReminder: (id, updates) => {
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, ...updates } : r) })); immediateCloudSave()
      },
      deleteReminder: (id) => {
        set(s => ({ reminders: (s.reminders || []).filter(r => r.id !== id) })); immediateCloudSave()
      },
      doneReminder: (id) => {
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, done: true } : r) })); immediateCloudSave()
      },
      undoneReminder: (id) => {
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, done: false } : r) })); immediateCloudSave()
      },
      // monthly reminder: dismiss for current month only
      doneReminderMonth: (id, monthKey) => {
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, doneMonths: [...(r.doneMonths || []), monthKey] } : r) })); immediateCloudSave()
      },
      undoneReminderMonth: (id, monthKey) => {
        set(s => ({ reminders: (s.reminders || []).map(r => r.id === id ? { ...r, doneMonths: (r.doneMonths || []).filter(m => m !== monthKey) } : r) })); immediateCloudSave()
      },

      // ── Financial Tasks ──────────────────────
      tasks: [],
      addTask: (task) => {
        set(s => ({ tasks: [...(s.tasks || []), { ...task, id: 'task' + Date.now(), done: false }] })); immediateCloudSave()
      },
      updateTask: (id, updates) => {
        set(s => ({ tasks: (s.tasks || []).map(t => t.id === id ? { ...t, ...updates } : t) })); immediateCloudSave()
      },
      deleteTask: (id) => {
        set(s => ({ tasks: (s.tasks || []).filter(t => t.id !== id) })); immediateCloudSave()
      },
      completeTask: (id, monthKey) => {
        set(s => ({ tasks: (s.tasks || []).map(t => t.id === id
          ? t.freq === 'monthly'
            ? { ...t, doneMonths: [...(t.doneMonths || []), monthKey] }
            : { ...t, done: true }
          : t
        ) })); immediateCloudSave()
      },
      uncompleteTask: (id, monthKey) => {
        set(s => ({ tasks: (s.tasks || []).map(t => t.id === id
          ? t.freq === 'monthly'
            ? { ...t, doneMonths: (t.doneMonths || []).filter(m => m !== monthKey) }
            : { ...t, done: false }
          : t
        ) })); immediateCloudSave()
      },

      // ── Confirmed Events ──────────────────────
      confirmedEvents: [],
      confirmEvent: (id, date, accountId, delta, isUSD, ro, destAccountId) => {
        set(s => {
          const confirmedAt = new Date().toISOString().split('T')[0]
          const normalizedId = id.replace(/_m\d+$/, '')
          const newConfirmed = [...s.confirmedEvents, { id: normalizedId, date, accountId, delta, isUSD, confirmedAt, ...(ro ? { _ro: true } : {}), ...(destAccountId ? { destAccountId } : {}) }]
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
              const destAcc = accounts.find(a => a.id === destAccountId)
              const destIsUSD = destAcc?.currency === 'USD'
              accounts = accounts.map(a => a.id !== destAccountId ? a : destIsUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) + credit }
                : { ...a, balance: (a.balance || 0) + credit })
            }
          }
          // Sync loan balance — reduce balanceOverride by payment amount
          const loanBaseId = id.replace(/_ro$/, '').replace(/_m\d+$/, '')
          const matchedLoan = s.loans.find(l => l.id === loanBaseId)
          let loans = s.loans
          if (matchedLoan) {
            const payment = matchedLoan.monthlyPayment || 0
            const currentBal = matchedLoan.balanceOverride ?? matchedLoan.totalAmount ?? 0
            loans = s.loans.map(l => l.id !== loanBaseId ? l : { ...l, balanceOverride: Math.max(0, currentBal - payment) })
          }
          return { confirmedEvents: newConfirmed, accounts, investments, loans }
        }); immediateCloudSave()
      },
      unconfirmEvent: (id, date) => {
        set(s => {
          const nId = id.replace(/_m\d+$/, '')
          const ev = s.confirmedEvents.find(e => e.id === nId && e.date === date)
          const newConfirmed = s.confirmedEvents.filter(e => !(e.id === nId && e.date === date))
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
              const destAcc = accounts.find(a => a.id === ev.destAccountId)
              const destIsUSD = destAcc?.currency === 'USD'
              accounts = accounts.map(a => a.id !== ev.destAccountId ? a : destIsUSD
                ? { ...a, usdBalance: (a.usdBalance || 0) - credit }
                : { ...a, balance: (a.balance || 0) - credit })
            }
          }
          // Sync loan balance — restore balanceOverride on unconfirm
          const loanBaseId = id.replace(/_ro$/, '').replace(/_m\d+$/, '')
          const matchedLoan = s.loans.find(l => l.id === loanBaseId)
          let loans = s.loans
          if (matchedLoan && matchedLoan.balanceOverride != null) {
            const payment = matchedLoan.monthlyPayment || 0
            loans = s.loans.map(l => l.id !== loanBaseId ? l : { ...l, balanceOverride: (l.balanceOverride || 0) + payment })
          }
          return { confirmedEvents: newConfirmed, accounts, investments, loans }
        }); immediateCloudSave()
      },

      // ── Settings ──────────────────────────────
      setPrimeRate: (rate) => { set({ primeRate: rate }); immediateCloudSave() },
      setEurRate:   (rate) => { set({ eurRate: rate }); immediateCloudSave() },
      setUsdRate:   (rate) => { set({ usdRate: rate }); immediateCloudSave() },
      setRatesLastFetched: (ts) => set({ ratesLastFetched: ts }),
      clearShlioConfirmed: () => {
        set(s => {
          const shlioEntries = (s.confirmedEvents || []).filter(e => e.id === 'r5')
          if (shlioEntries.length === 0) return s
          const totalUSD = shlioEntries.reduce((sum, e) => sum + (e.delta || 1050), 0)
          const newConfirmed = s.confirmedEvents.filter(e => e.id !== 'r5')
          const accounts = s.accounts.map(a =>
            a.id !== 'ba12' ? a : { ...a, usdBalance: (a.usdBalance || 0) - totalUSD }
          )
          return { confirmedEvents: newConfirmed, accounts }
        }); immediateCloudSave()
      },
    }),
    {
      name: 'financial-app-v14',
      version: 45,
      migrate: (state) => {
        // ── v19: accountId fields + e1→e1a/e1b split ──────────────────────
        // רק שדות מבניים (לא ניתנים לעריכה) — אף פעם לא לדרוס נתונים שהמשתמש יכול לשנות
        const loanUpdates = {
          'l1':  { accountId: 'ba8', effectiveAmount: 4400 },
          'l2':  { accountId: 'ba6' }, 'l3':  { accountId: 'ba6' },
          'l4':  { accountId: 'ba1' }, 'l5':  { accountId: 'ba2' },
          'l6':  { accountId: 'ba6' }, 'l7':  { accountId: 'ba6' },
          'l8':  { accountId: 'ba6' }, 'l9':  { accountId: 'ba2' },
          'l12': { accountId: 'ba1' }, 'l15': { accountId: 'ba12' },
          'l16': { accountId: 'ba12' },
        }
        // רק שדות מבניים — לא דורסים סכומים, יום חיוב, או נתונים שהמשתמש יכול לשנות
        const expenseUpdates = {
          'e2':    { paidViaCredit: true },
          'e4':    { accountId: 'ba5' }, 'e5':  { accountId: 'ba2' },
          'e9':    { accountId: 'ba4' }, 'e7':  { accountId: 'ba12' },
          'e8':    { accountId: 'ba12' }, 'e10': { accountId: 'ba5' },
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
            return [...existing, ...toAdd]
          })(),
          futureIncome: (() => {
            const existing = (state.futureIncome || [])
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
              ...(!ids.includes('e_cc4') ? [{ id: 'e_cc4', name: 'כרטיס מזרחי',           amount: 3000,  chargeDay: 2,  category: 'credit', accountId: 'ba8', note: 'תומר מזרחי',    monthlyAmounts: {} }] : []),
              ...(!ids.includes('e9')  ? [{ id: 'e9',  name: 'קופת גמל אביגיל', amount: 1500, chargeDay: 15, category: 'savings', accountId: 'ba2', note: 'תומר בינלאומי' }] : []),
              ...(!ids.includes('e7')  ? [{ id: 'e7',  name: 'שכירות West Knoll', amount: 0, usdAmount: 3300, currency: 'USD', chargeDay: 1, category: 'rent', accountId: 'ba12', note: 'Chase Business' }] : []),
              ...(!ids.includes('e10') ? [{ id: 'e10', name: 'רונן רואה חשבון', amount: 531, chargeDay: 6, category: 'business', accountId: 'ba5', note: 'בינלאומי עסקי יעל' }] : []),
              ...(!ids.includes('e8')  ? [{ id: 'e8',  name: 'יוסף — טסלה וחשבונות', amount: 0, usdAmount: 1250, usdDeductions: '-$425 -$67', currency: 'USD', chargeDay: 1, category: 'transport', accountId: 'ba12', note: 'Chase Business' }] : []),
            ]
            return existing
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
            const DELETED_LOAN_IDS = ['l13', 'l10', 'l11']
            const base = (state.loans || []).filter(l => !DELETED_LOAN_IDS.includes(l.id))
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
            const cleaned = (state.confirmedEvents || []).map(e => {
              const base = e.delta !== undefined ? e : { ...e, accountId: null, delta: 0, isUSD: false }
              // Normalize _m suffix — strip iteration markers so IDs stay stable
              return { ...base, id: (base.id || '').replace(/_m\d+$/, '') }
            })
            // Deduplicate after normalization
            const seen = new Set()
            return cleaned.filter(e => {
              const key = `${e.id}_${e.date}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
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
  if (!s.friendReminders) s.friendReminders = []
  if (!s.confirmedEvents) s.confirmedEvents = []

  // Keep user-edited loans intact. Only add missing canonical loans, don't overwrite existing values.
  const existingLoans = s.loans || []
  const loanIds = new Set(existingLoans.map(l => l.id))
  const defaultLoansToAdd = [
    { id: 'l15', name: 'יוסף — טלפון', totalAmount: 1498.8, monthlyPayment: 62.45, chargeDay: 15, durationMonths: 24, interestRate: 0, interestType: 'fixed', startDate: '2025-08-15', owner: 'תומר', type: 'loan', currency: 'USD', accountId: 'ba12', note: 'Chase Business' },
    { id: 'l16', name: 'יוסף — קייס', totalAmount: 48.96, monthlyPayment: 4.08, chargeDay: 15, durationMonths: 12, interestRate: 0, interestType: 'fixed', startDate: '2025-08-15', owner: 'תומר', type: 'loan', currency: 'USD', accountId: 'ba12', note: 'Chase Business' },
    { id: 'l17', name: 'אליעזר — פועלים', totalAmount: 250000, monthlyPayment: 11082, chargeDay: 20, durationMonths: 24, interestRate: 6.0, interestType: 'prime+0.5', startDate: '2026-01-07', owner: 'תומר', type: 'loan', accountId: 'ba1', note: 'תומר פועלים', paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2, balanceOverride: 230526, extras: [{ name: 'שעון', amount: 3700, remainingPayments: 7 }] },
    { id: 'l18', name: 'אליעזר — בינלאומי', totalAmount: 200400, monthlyPayment: 13901, chargeDay: 1, durationMonths: 16, interestRate: 6.0, interestType: 'prime+0.5', startDate: '2026-01-16', owner: 'תומר', type: 'loan', accountId: 'ba2', note: 'תומר בינלאומי', paidByFriend: true, friendName: 'אליעזר', reminderDaysBefore: 2, balanceOverride: 188251 },
  ]
  s.loans = [...existingLoans, ...defaultLoansToAdd.filter(l => !loanIds.has(l.id))]

  // v43: תיקון שער יורו שגוי שנשמר בענן — מאכץ שיעור נכון מבנק ישראל
  s.eurRate = 3.6283
  s.ratesLastFetched = Date.now()

  return s
}

export default useStore
