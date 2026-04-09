// ── Number formatting ──────────────────────────────────────────────────────
export const formatILS = (amount, options = {}) => {
  if (amount === null || amount === undefined) return '—'
  const abs = Math.abs(amount)
  const formatted = new Intl.NumberFormat('he-IL', {
    maximumFractionDigits: 0,
    ...options,
  }).format(abs)
  const sign = amount < 0 ? '-' : ''
  return `\u202A${sign}₪${formatted}\u202C`
}

export const formatILSShort = (amount) => {
  if (amount === null || amount === undefined) return '—'
  const abs = Math.abs(amount)
  let str
  if (abs >= 1000000) {
    str = (abs / 1000000).toFixed(1) + 'M'
  } else if (abs >= 1000) {
    str = Math.round(abs / 1000) + 'K'
  } else {
    str = String(Math.round(abs))
  }
  return `\u202A${amount < 0 ? '-' : ''}₪${str}\u202C`
}

// ── Date formatting ────────────────────────────────────────────────────────
export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

export const formatMonthYear = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

// ── Date helpers ───────────────────────────────────────────────────────────
export const daysUntil = (dateStr) => {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

export const urgencyLabel = (days) => {
  if (days === null) return { label: 'ללא תאריך', color: 'gray' }
  if (days < 0)      return { label: 'עבר', color: 'red' }
  if (days === 0)    return { label: 'היום!', color: 'green' }
  if (days <= 3)     return { label: `${days} ימים`, color: 'green' }
  if (days <= 7)     return { label: `${days} ימים`, color: 'orange' }
  if (days <= 30)    return { label: `${days} ימים`, color: 'blue' }
  return { label: `${days} ימים`, color: 'gray' }
}

export const urgencyClass = (days) => {
  if (days === null) return 'bg-gray-100 text-gray-500'
  if (days < 0)      return 'bg-red-100 text-red-600'
  if (days <= 3)     return 'bg-green-100 text-green-700 pulse-urgent'
  if (days <= 7)     return 'bg-orange-100 text-orange-700'
  if (days <= 30)    return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-500'
}

// ── Loan helpers ───────────────────────────────────────────────────────────
export const calcEndDate = (startDateStr, durationMonths) => {
  if (!startDateStr || !durationMonths) return null
  const d = new Date(startDateStr)
  d.setMonth(d.getMonth() + durationMonths)
  return d.toISOString().slice(0, 10)
}

export const calcRemainingMonths = (startDateStr, durationMonths) => {
  if (!startDateStr || !durationMonths) return null
  const end = new Date(calcEndDate(startDateStr, durationMonths))
  const today = new Date()
  const diff = (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth())
  return Math.max(0, diff)
}

export const calcLoanProgress = (startDateStr, durationMonths) => {
  if (!startDateStr || !durationMonths) return 0
  const start = new Date(startDateStr)
  const today = new Date()
  const elapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
  return Math.min(100, Math.round((elapsed / durationMonths) * 100))
}
