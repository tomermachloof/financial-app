// ── Core financial calculations ────────────────────────────────────────────

/**
 * מחשב כמה תשלומים בוצעו עד היום
 * כלל: תשלום ראשון = יום החיוב בחודש שאחרי חודש ההתחלה.
 * אם יום החיוב נופל פחות מ-15 יום אחרי תחילת ההלוואה — מקדמים חודש.
 */
const calcPaymentsMade = (startDate, chargeDay, durationMonths) => {
  const today = new Date()
  const start = new Date(startDate)
  const day   = chargeDay || 1

  let payDate = new Date(start.getFullYear(), start.getMonth() + 1, day)
  const daysDiff = (payDate - start) / (1000 * 60 * 60 * 24)
  if (daysDiff < 15) payDate.setMonth(payDate.getMonth() + 1)

  let count = 0
  while (payDate <= today && count < durationMonths) {
    count++
    payDate.setMonth(payDate.getMonth() + 1)
  }
  return count
}

/**
 * מחשב יתרת קרן להלוואת שפיצר
 * B(n) = P × [(1+r)^N − (1+r)^n] / [(1+r)^N − 1]
 * מחזיר null אם חסר מידע, ומחזיר אובייקט missingFields אם חסרים שדות.
 */
export const calcRemainingBalance = (loan) => {
  // balanceOverride — עדיפות ראשונה: המשתמש אישר/עדכן ידנית
  if (loan.balanceOverride != null) {
    return { balance: loan.balanceOverride, missing: [], isOverride: true }
  }

  // לוח סילוקין קיים — יתרת קרן ישירות מהלוח
  if (loan.paymentSchedule?.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0]
    const pastPayments = loan.paymentSchedule.filter(p => p.date && p.date <= todayStr)

    if (pastPayments.length >= loan.paymentSchedule.length) return { balance: 0, missing: [], fromSchedule: true }

    // אם יש remainingBalance בלוח — נשתמש בו ישירות
    if (pastPayments.length > 0 && pastPayments[pastPayments.length - 1].remainingBalance != null) {
      return { balance: Math.round(pastPayments[pastPayments.length - 1].remainingBalance), missing: [], fromSchedule: true }
    }

    // אם אין תשלומים שעברו — היתרה היא הסכום המקורי
    if (pastPayments.length === 0) {
      return { balance: loan.totalAmount || 0, missing: [], fromSchedule: true }
    }

    // fallback — אם אין remainingBalance, חשב לפי סכום התשלומים שנשארו
    const futurePayments = loan.paymentSchedule.filter(p => p.date && p.date > todayStr)
    const remaining = futurePayments.reduce((s, p) => s + (p.amount || 0), 0)
    return { balance: Math.max(0, Math.round(remaining)), missing: [], fromSchedule: true }
  }

  const missing = []
  if (!loan.startDate)    missing.push('תאריך התחלה')
  if (!loan.totalAmount)  missing.push('סכום הלוואה')
  if (!loan.durationMonths) missing.push('מספר תשלומים')
  if (missing.length) return { balance: null, missing }

  const { totalAmount, startDate, chargeDay, durationMonths, interestRate } = loan
  const n = calcPaymentsMade(startDate, chargeDay, durationMonths)
  const N = durationMonths

  if (n >= N) return { balance: 0, missing: [] }

  // ריבית 0% — קרן שווה פשוטה
  if (!interestRate || interestRate === 0) {
    const principalPerPayment = totalAmount / N
    return { balance: Math.max(0, Math.round(totalAmount - n * principalPerPayment)), missing: [] }
  }

  // שפיצר עם ריבית
  const r = (interestRate / 100) / 12
  const factor = Math.pow(1 + r, N)
  const factorN = Math.pow(1 + r, n)
  const balance = totalAmount * (factor - factorN) / (factor - 1)
  return { balance: Math.max(0, Math.round(balance)), missing: [] }
}

/**
 * סך יתרות עו"ש (נזילות)
 */
export const calcTotalLiquidity = (accounts, usdRate) =>
  accounts.reduce((sum, a) => {
    if (a.currency === 'USD') return sum + (a.usdBalance || 0) * (usdRate || 3.61)
    return sum + (a.balance || 0)
  }, 0)

/**
 * מחשב ערך ₪ של חוב לפי מטבע
 */
const debtILS = (debt, rates) => {
  if (debt.currency === 'EUR') return (debt.originalAmount || 0) * (rates?.eur || 3.6283)
  if (debt.currency === 'USD') return (debt.originalAmount || 0) * (rates?.usd || 3.61)
  return debt.amount || 0
}

/**
 * סך נכסים (כולל חסכונות, השקעות)
 */
const invILS = (inv, rates) => {
  if (inv.currency === 'EUR') return (inv.originalAmount || 0) * (rates?.eur || 3.6283)
  if (inv.currency === 'USD') return (inv.originalAmount || 0) * (rates?.usd || 3.61)
  return inv.value || 0
}

export const calcTotalAssets = (accounts, investments, debts, rates) => {
  const liquid   = accounts.reduce((s, a) => {
    if (a.currency === 'USD') return s + (a.usdBalance || 0) * (rates?.usd || 3.61)
    return s + (a.balance || 0)
  }, 0)
  const invested = investments.reduce((s, i) => s + invILS(i, rates), 0)
  const owedToUs = debts.filter(d => d.type === 'owed_to_us').reduce((s, d) => s + debtILS(d, rates), 0)
  return liquid + invested + owedToUs
}

/**
 * סך התחייבויות
 */
export const calcTotalLiabilities = (loans, debts, rates) => {
  const loanTotal = loans.filter(l => !l.paidByFriend).reduce((s, l) => {
    const { balance } = calcRemainingBalance(l)
    return s + (balance ?? l.balanceOverride ?? l.totalAmount ?? 0)
  }, 0)
  const weOwe     = debts.filter(d => d.type === 'we_owe').reduce((s, d) => s + debtILS(d, rates), 0)
  return loanTotal + weOwe
}

/**
 * הון נטו
 */
export const calcNetWorth = (accounts, investments, loans, debts, rates) =>
  calcTotalAssets(accounts, investments, debts, rates) - calcTotalLiabilities(loans, debts, rates)

/**
 * סך יציאות חודשיות (הלוואות + הוצאות)
 */
export const calcMonthlyOut = (loans, expenses, usdRate) => {
  const rate = usdRate || 3.61
  const today = new Date()
  const mKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const loanPayments    = loans.reduce((s, l) => {
    const base = (l.monthlyAmounts && l.monthlyAmounts[mKey] != null) ? l.monthlyAmounts[mKey]
      : (() => { const sch = (l.paymentSchedule || []).find(p => p.date && p.date.startsWith(mKey)); return sch ? sch.amount : (l.monthlyPayment || 0) })()
    const hasSchedule = (l.paymentSchedule || []).some(p => p.date && p.date.startsWith(mKey))
    return s + base + (hasSchedule && !(l.monthlyAmounts && l.monthlyAmounts[mKey] != null) ? 0 : (l.extras || []).reduce((e, x) => e + x.amount, 0))
  }, 0)
  const expensePayments = expenses.reduce((s, e) => {
    if (e.currency === 'USD') {
      const amt = (e.monthlyAmounts && e.monthlyAmounts[mKey] != null) ? e.monthlyAmounts[mKey] : (e.usdAmount || 0)
      return s + amt * rate
    }
    const amt = (e.monthlyAmounts && e.monthlyAmounts[mKey] != null) ? e.monthlyAmounts[mKey] : (e.amount || 0)
    return s + amt
  }, 0)
  return loanPayments + expensePayments
}

/**
 * סך הכנסות חוזרות חודשיות (שכירויות)
 */
export const calcMonthlyIn = (rentalIncome, usdRate) => {
  const rate = usdRate || 3.61
  const today = new Date()
  const mKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  return rentalIncome.reduce((s, r) => {
    if (r.currency === 'USD') {
      const amt = (r.monthlyAmounts && r.monthlyAmounts[mKey] != null) ? r.monthlyAmounts[mKey] : (r.usdAmount || 0)
      return s + amt * rate
    }
    const amt = (r.monthlyAmounts && r.monthlyAmounts[mKey] != null) ? r.monthlyAmounts[mKey] : (r.amount || 0)
    return s + amt
  }, 0)
}

/**
 * בטוח להוציא החודש
 * = נזילות נוכחית − תשלומים שעוד לא ירדו החודש
 */
export const calcSafeToSpend = (accounts, loans, expenses, usdRate) => {
  const rate = usdRate || 3.61
  const today = new Date()
  const todayDay = today.getDate()
  const liquidity = calcTotalLiquidity(accounts, usdRate)

  const remainingLoans = loans
    .filter(l => l.chargeDay && l.chargeDay > todayDay)
    .reduce((s, l) => s + (l.monthlyPayment || 0), 0)

  const remainingExpenses = expenses
    .filter(e => e.chargeDay && e.chargeDay > todayDay)
    .reduce((s, e) => {
      if (e.currency === 'USD') return s + (e.usdAmount || 0) * rate
      return s + (e.amount || 0)
    }, 0)

  // הוצאות ללא תאריך ספציפי — נחשיב אותן כעתידות
  const undatedExpenses = expenses
    .filter(e => !e.chargeDay)
    .reduce((s, e) => {
      if (e.currency === 'USD') return s + (e.usdAmount || 0) * rate
      return s + (e.amount || 0)
    }, 0)

  return liquidity - remainingLoans - remainingExpenses - undatedExpenses
}

/**
 * אירועים לחודש נתון (לכאלנדר)
 * מחזיר מערך מאוחד עם תאריך ביום החודש
 */
export const getMonthEvents = (year, month, loans, expenses, rentalIncome, futureIncome, usdRate = 3.61) => {
  const events = []

  // הלוואות
  loans.forEach(l => {
    if (!l.chargeDay) return

    // חשב תאריך סיום אם יש מידע מספיק
    // הלוואה עם לוח סילוקין — תמיד להציג (עד שהמשתמש מוחק)
    if (l.startDate && l.durationMonths && !l.paymentSchedule?.length) {
      const start    = new Date(l.startDate)
      const firstPay = new Date(start.getFullYear(), start.getMonth() + 1, l.chargeDay)
      if ((firstPay - start) / 86400000 < 15) firstPay.setMonth(firstPay.getMonth() + 1)
      const endDate = new Date(firstPay.getFullYear(), firstPay.getMonth() + l.durationMonths - 1, l.chargeDay)
      // אם החודש המבוקש אחרי תאריך הסיום — לא להציג
      const requestedDate = new Date(year, month - 1, l.chargeDay)
      if (requestedDate > endDate) return
    }

    const isUSD     = l.currency === 'USD'
    const extrasAmt = (l.extras || []).reduce((s, x) => s + x.amount, 0)
    // monthlyAmounts (user override) → paymentSchedule → monthlyPayment
    const mKey      = `${year}-${String(month).padStart(2, '0')}`
    const basePay   = (l.monthlyAmounts && l.monthlyAmounts[mKey] != null) ? l.monthlyAmounts[mKey]
      : (() => { const s = (l.paymentSchedule || []).find(p => p.date && p.date.startsWith(mKey)); return s ? s.amount : ((l.monthlyPayment || 0) + extrasAmt) })()
    const amt       = isUSD ? basePay * usdRate : basePay
    const ev        = { id: l.id, day: l.chargeDay, name: l.name, amount: -amt, type: 'loan', color: 'red' }
    if (isUSD) { ev.currency = 'USD'; ev.usdAmount = basePay }
    // monthlyAccounts override — per-month account
    if (l.monthlyAccounts && l.monthlyAccounts[mKey]) ev.accountId = l.monthlyAccounts[mKey]
    else if (l.accountId)  ev.accountId       = l.accountId
    if (l.effectiveAmount != null) ev.effectiveAmount = l.effectiveAmount
    if (l.noBalanceEffect) ev.noBalanceEffect  = true
    if (l.paidViaCredit)   ev.paidViaCredit    = true
    if (l.paidByFriend)    ev.paidByFriend     = true
    if (l.note)            ev.note             = l.note
    events.push(ev)
  })

  // הוצאות קבועות
  expenses.forEach(e => {
    if (e.chargeDay) {
      const isUSD = e.currency === 'USD'
      const mKey  = `${year}-${String(month).padStart(2, '0')}`
      const baseAmt = isUSD ? (e.usdAmount || 0) * usdRate
        : ((e.monthlyAmounts && e.monthlyAmounts[mKey] != null) ? e.monthlyAmounts[mKey] : (e.amount || 0))
      const amt   = baseAmt
      const ev    = { id: e.id, day: e.chargeDay, name: e.name, amount: -amt, type: 'expense', color: 'red' }
      if (isUSD) { ev.currency = 'USD'; ev.usdAmount = e.usdAmount; ev.usdDeductions = e.usdDeductions; ev.usdGross = e.usdGross }
      if (e.note)            ev.note            = e.note
      // monthlyAccounts override — per-month account
      if (e.monthlyAccounts && e.monthlyAccounts[mKey]) ev.accountId = e.monthlyAccounts[mKey]
      else if (e.accountId)  ev.accountId       = e.accountId
      if (e.destAccountId)   ev.destAccountId   = e.destAccountId
      if (e.noBalanceEffect) ev.noBalanceEffect  = true
      if (e.paidViaCredit)   ev.paidViaCredit    = true
      events.push(ev)
    }
  })

  // הכנסות שכירות
  rentalIncome.forEach(r => {
    if (r.chargeDay) {
      const isUSD = r.currency === 'USD'
      const rAmtKey = `${year}-${String(month).padStart(2, '0')}`
      const amt   = isUSD ? (r.usdAmount || 0) * usdRate
        : ((r.monthlyAmounts && r.monthlyAmounts[rAmtKey] != null) ? r.monthlyAmounts[rAmtKey] : (r.amount || 0))
      const ev    = { id: r.id, day: r.chargeDay, name: r.name, amount: amt, type: 'rental', color: 'green' }
      if (isUSD) { ev.currency = 'USD'; ev.usdAmount = r.usdAmount }
      // monthlyAccounts override — per-month account
      const rMKey = `${year}-${String(month).padStart(2, '0')}`
      if (r.monthlyAccounts && r.monthlyAccounts[rMKey]) ev.accountId = r.monthlyAccounts[rMKey]
      else if (r.accountId)  ev.accountId       = r.accountId
      if (r.noBalanceEffect) ev.noBalanceEffect  = true
      if (r.note)            ev.note             = r.note
      events.push(ev)
    }
  })

  // הכנסות עתידיות / תשלומים חד-פעמיים לחודש זה
  futureIncome.forEach(f => {
    if (f.expectedDate && f.status === 'pending') {
      const d = new Date(f.expectedDate)
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const isPayment = f.isPayment || (f.amount || 0) < 0
        events.push({
          id: f.id, day: d.getDate(), name: f.name,
          amount: f.amount || 0, type: isPayment ? 'expense' : 'future',
          color: isPayment ? 'red' : 'blue',
        })
      }
    }
  })

  return events.sort((a, b) => a.day - b.day)
}

/**
 * תשלומים ב-X הימים הקרובים
 */
export const getUpcomingEvents = (loans, expenses, rentalIncome, futureIncome, days = 14, usdRate = 3.61, daysBack = 0) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startFrom = new Date(today)
  startFrom.setDate(startFrom.getDate() - daysBack)
  const limit = new Date(today)
  limit.setDate(limit.getDate() + days)

  const events = []
  const currentYear  = startFrom.getFullYear()
  const currentMonth = startFrom.getMonth() + 1
  const todayDay     = today.getDate()

  // Track which income items already had payments subtracted (first visible occurrence only)
  const paymentsApplied = new Set()

  // Iterate through every month within the range
  const addRecurring = (items, isIncome) => {
    items.forEach(item => {
      const chargeDay = item.chargeDay
      if (!chargeDay) return

      const isLoan    = item.monthlyPayment !== undefined
      const isUSD     = item.currency === 'USD'
      const extrasAmt = (!isIncome && isLoan) ? (item.extras || []).reduce((s, x) => s + x.amount, 0) : 0
      const totalPay  = (item.monthlyPayment || 0) + extrasAmt
      const usdUnitAmount = isLoan ? totalPay : (item.usdAmount || 0)

      let baseAmount
      if (isIncome) {
        baseAmount = isUSD ? usdUnitAmount * usdRate : (item.amount || 0)
      } else {
        baseAmount = isUSD ? -(usdUnitAmount * usdRate) : (isLoan ? -totalPay : -(item.amount || 0))
      }

      const type  = isIncome ? 'rental' : (isLoan ? 'loan' : 'expense')
      const color = isIncome ? 'green' : 'red'

      // Pre-compute start/end dates for finite-duration loans/items
      let loanStartDate = null
      let loanEndDate = null
      if (!isIncome && isLoan && item.startDate) {
        if (item.paymentSchedule?.length) {
          // הלוואה עם לוח סילוקין — לא מגבילים עם startDate/endDate
          // התשלומים מוגדרים בלוח, ההלוואה תופיע תמיד
        } else {
          const start = new Date(item.startDate)
          const firstPay = new Date(start.getFullYear(), start.getMonth() + 1, chargeDay)
          if ((firstPay - start) / 86400000 < 15) firstPay.setMonth(firstPay.getMonth() + 1)
          loanStartDate = firstPay
          if (item.durationMonths) {
            loanEndDate = new Date(firstPay.getFullYear(), firstPay.getMonth() + item.durationMonths - 1, chargeDay)
          }
        }
      }

      // Walk month by month from current month until we pass the limit
      let year  = currentYear
      let month = currentMonth - 1 // 0-based for Date constructor
      let iteration = 0
      while (iteration < 24) { // safety cap
        const d = new Date(year, month, chargeDay)
        if (d > limit) break
        if (loanEndDate && d > loanEndDate) break
        if (loanStartDate && d < loanStartDate) { month++; iteration++; continue }
        if (d >= startFrom) {
          const suffix = iteration === 0 ? '' : `_m${iteration}`
          let eventAmount = baseAmount
          let monthlyOverride = false
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          // monthlyAmounts = user manual override → highest priority
          // paymentSchedule = amortization table → second priority
          // baseAmount (monthlyPayment / amount) → default
          if (item.monthlyAmounts && item.monthlyAmounts[mKey] != null) {
            const ovr = item.monthlyAmounts[mKey]
            monthlyOverride = true
            if (isIncome) {
              eventAmount = isUSD ? ovr * usdRate : ovr
            } else {
              eventAmount = isUSD ? -(ovr * usdRate) : -ovr
            }
          } else {
            const scheduled = (item.paymentSchedule || []).find(p => p.date && p.date.startsWith(mKey))
            if (scheduled) {
              monthlyOverride = true
              eventAmount = isIncome ? scheduled.amount : -scheduled.amount
            }
          }
          // For income with partial payments — subtract received amounts (first visible occurrence only)
          let eventUsdAmount = monthlyOverride && isUSD ? item.monthlyAmounts[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] : usdUnitAmount
          if (isIncome && !paymentsApplied.has(item.id) && (item.payments || []).length > 0) {
            paymentsApplied.add(item.id)
            const received = item.payments.reduce((s, p) => s + p.amount, 0)
            if (isUSD) {
              const remaining = (item.usdAmount || 0) - received
              eventAmount = remaining * usdRate
              eventUsdAmount = remaining
            } else {
              eventAmount = (item.amount || 0) - received
            }
          }
          const event = { id: item.id + suffix, name: item.name, amount: eventAmount, date: d, type, color }
          if (isUSD) {
            event.usdAmount = eventUsdAmount
            event.currency = 'USD'
            if (item.usdGross)      event.usdGross      = item.usdGross
            if (item.usdDeductions) event.usdDeductions = item.usdDeductions
          }
          if (item.note)            event.note            = item.note
          // monthlyAccounts override — per-month account
          if (item.monthlyAccounts && item.monthlyAccounts[mKey]) event.accountId = item.monthlyAccounts[mKey]
          else if (item.accountId)  event.accountId       = item.accountId
          if (item.destAccountId)   event.destAccountId   = item.destAccountId
          if (item.noBalanceEffect) event.noBalanceEffect  = true
          if (item.paidViaCredit)   event.paidViaCredit    = true
          if (item.paidByFriend)    event.paidByFriend     = true
          if (item.effectiveAmount != null) event.effectiveAmount = item.effectiveAmount
          if (item.debtId)          event.debtId          = item.debtId
          if (item.category)        event.category        = item.category
          events.push(event)
        }
        month++
        if (month > 11) { month = 0; year++ }
        iteration++
      }
    })
  }

  addRecurring(loans, false)
  addRecurring(expenses, false)
  addRecurring(rentalIncome, true)

  // One-time future income / payments
  futureIncome.forEach(f => {
    if (f.status === 'pending' && f.expectedDate) {
      const d = new Date(f.expectedDate)
      d.setHours(0, 0, 0, 0)
      if (d >= startFrom && d <= limit) {
        const isPayment = f.isPayment || (f.amount || 0) < 0
        const ev = { id: f.id, name: f.name, amount: f.amount || 0, date: d, type: isPayment ? 'expense' : 'future', color: isPayment ? 'red' : 'blue' }
        if (f.accountId) ev.accountId = f.accountId
        events.push(ev)
      }
    }
  })

  return events.sort((a, b) => a.date - b.date)
}
