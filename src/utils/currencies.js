// מטבעות — רשימה מלאה, שמות בעברית, סמלים והמרה ל-₪

const TOP = ['ILS', 'USD', 'EUR']

const safe = (fn, fallback) => { try { return fn() } catch { return fallback } }

const ALL_CODES = safe(
  () => Intl.supportedValuesOf('currency'),
  ['ILS', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'CNY', 'RUB', 'TRY', 'AED', 'THB', 'INR', 'MXN', 'BRL', 'PLN', 'CZK', 'HUF', 'SEK', 'NOK', 'DKK', 'ZAR', 'EGP', 'JOD'],
)

const names = safe(() => new Intl.DisplayNames(['he'], { type: 'currency' }), null)

export const currencyName = (code) => safe(() => names?.of(code), code) || code

export const currencySymbol = (code) =>
  safe(() => {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency')
    return part?.value || code
  }, code)

// אפשרויות ל-Select: ₪ / $ / € בראש, אחר כך כל השאר לפי שם בעברית
export const CURRENCY_OPTIONS = (() => {
  const rest = ALL_CODES.filter(c => !TOP.includes(c)).sort((a, b) => currencyName(a).localeCompare(currencyName(b), 'he'))
  return [...TOP, ...rest].map(code => ({ value: code, label: `${currencyName(code)} (${code})` }))
})()

export const isForeign = (code) => !!code && code !== 'ILS'

// שער ל-₪ ליחידה אחת של מטבע. rates = { eur, usd, all }
export const rateToILS = (code, rates) => {
  if (!code || code === 'ILS') return 1
  if (code === 'USD') return rates?.usd || rates?.all?.USD || 3.61
  if (code === 'EUR') return rates?.eur || rates?.all?.EUR || 3.6283
  return rates?.all?.[code] || 0
}

export const toILS = (amount, code, rates) => (amount || 0) * rateToILS(code, rates)

export const formatMoney = (amount, code) =>
  safe(
    () => new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(amount || 0),
    `${amount || 0} ${code}`,
  )

// חשבון בנק בשקלים (ברירת מחדל כשאין מטבע)
export const isIlsAccount = (a) => !a?.currency || a.currency === 'ILS'
// חשבון במטבע זר שאינו דולר (הדולר נשאר עם usdBalance הישן)
export const isOtherFxAccount = (a) => !!a?.currency && a.currency !== 'ILS' && a.currency !== 'USD'
// יתרה של חשבון במטבעו המקורי
export const accountBalance = (a) =>
  a?.currency === 'USD' ? (a.usdBalance || 0) : isOtherFxAccount(a) ? (a.foreignBalance || 0) : (a?.balance || 0)
