import { useState } from 'react'
import useStore from '../store/useStore'
import Modal, { Field, Input, SaveButton } from './Modal'
import { formatILS, formatDate } from '../utils/formatters'

// ── פקטורים להמרת בסיס לסכום בנק ולהפך ──
// פרויקטי הכנסה יכולים לסמן עמלת סוכן (15%) ומע״מ (18%).
// דמי שכירות לא משתמשים בפקטורים האלה — מתנהגים כמו מצב נטרלי.
const getFactors = (item, isRental) => {
  if (isRental || item?.currency === 'USD') return { commission: 1, vat: 1 }
  return {
    commission: item?.agentCommission ? 0.85 : 1,
    vat:        item?.addVat          ? 1.18 : 1,
  }
}

export default function PartialPaymentModal({ item: initialItem, onClose }) {
  const { accounts, futureIncome, rentalIncome, confirmedEvents, addIncomePayment, removeIncomePayment, addRentalPayment, removeRentalPayment } = useStore()

  const isRental = initialItem._type === 'rental'
  const isUSD    = initialItem.currency === 'USD'

  const liveItem = isRental
    ? rentalIncome.find(r => r.id === initialItem.id)
    : futureIncome.find(f => f.id === initialItem.id)
  const item = liveItem || initialItem

  const { commission, vat } = getFactors(item, isRental)
  const hasFlags = commission !== 1 || vat !== 1

  // הסכום הכולל של הפרויקט בבסיס (כמו שמופיע בעריכת הפרויקט)
  const totalBase     = isUSD ? (item.usdAmount || item.amount || 0) : (item.amount || 0)
  const payments      = item.payments || []
  // סך מה שהתקבל, בבסיס — זה המקזז את יתרת הפרויקט
  const receivedBase  = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const remainingBase = totalBase - receivedBase
  // הסכום שעדיין צפוי להיכנס לחשבון הבנק (ברוטו)
  const remainingBank = Math.round(remainingBase * commission * vat * 100) / 100

  const filteredAccounts = isUSD
    ? accounts.filter(a => a.currency === 'USD')
    : accounts.filter(a => a.currency !== 'USD')

  // ברירת המחדל בשדה — הסכום שצריך להיכנס לבנק להשלמת הפרויקט
  const [amount, setAmount]       = useState(String(remainingBank > 0 ? remainingBank : ''))
  const [accountId, setAccountId] = useState(initialItem.accountId || '')
  const [error, setError]         = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  const fmt = (v) => isUSD ? `$${(v || 0).toLocaleString()}` : formatILS(v || 0)

  // תצוגה מקדימה של החלק-בבסיס שיקוזז מיתרת הפרויקט
  const previewBase = (() => {
    const n = Number(amount)
    if (!n || n <= 0) return 0
    return Math.round((n / commission / vat) * 100) / 100
  })()

  const handleSave = () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) { setError('הזן סכום'); return }
    if (!accountId) { setError('בחר חשבון לזיכוי'); return }
    setError(null)
    if (isRental) addRentalPayment(item.id, amt, accountId)
    else addIncomePayment(item.id, amt, accountId)
    setJustSaved(true)
    setAmount('')
    setTimeout(() => setJustSaved(false), 1500)
  }

  const itemLocked = (confirmedEvents || []).some(e => {
    const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
    return bare === item.id
  })

  const handleRemove = (paymentId) => {
    if (itemLocked) {
      alert('הפריט כבר אושר בלוח הבית. בטל אישור לפני מחיקת תשלום חלקי.')
      return
    }
    if (isRental) removeRentalPayment(item.id, paymentId)
    else removeIncomePayment(item.id, paymentId)
  }

  return (
    <Modal title={`תשלום חלקי — ${item.name}`} onClose={onClose} onSave={handleSave}>
      <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1 mb-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">סכום הפרויקט (בסיס)</span>
          <span className="font-bold text-gray-800">{fmt(totalBase)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">התקבל עד כה (בסיס)</span>
          <span className="font-semibold text-green-600">{fmt(receivedBase)}</span>
        </div>
        <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
          <span className="text-gray-500">נותר (בסיס)</span>
          <span className={`font-bold ${remainingBase > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmt(remainingBase)}</span>
        </div>
        {hasFlags && (
          <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-200 mt-1 text-center">
            {item.agentCommission && 'עמלת סוכן 15%'}
            {item.agentCommission && item.addVat && ' · '}
            {item.addVat && 'מע״מ 18%'}
            {' — הסכום שיכנס לבנק להשלמה: '}
            <span className="font-semibold text-gray-600">{fmt(remainingBank)}</span>
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="space-y-1 mb-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">תשלומים שהתקבלו</p>
          {payments.map(p => {
            // תשלומים חדשים נושאים bankAmount (מה שנכנס לבנק). ישנים — רק amount.
            const shownBank = p.bankAmount != null ? p.bankAmount : p.amount
            const shownBase = p.amount
            const differs = hasFlags && p.bankAmount != null && Math.abs(shownBank - shownBase) > 0.5
            return (
              <div key={p.id} className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-green-700">{fmt(shownBank)}</span>
                    {differs && <span className="text-[10px] text-gray-400">(מהבסיס: {fmt(shownBase)})</span>}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {formatDate(p.date)}
                    {p.accountId && ' · ' + (accounts.find(a => a.id === p.accountId)?.name || '')}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(p.id) }}
                  disabled={itemLocked}
                  title={itemLocked ? 'בטל אישור בדשבורד לפני מחיקה' : ''}
                  className={`w-9 h-9 flex items-center justify-center text-lg font-bold rounded-full shrink-0 mr-1 ${itemLocked ? 'text-gray-300 bg-gray-100 cursor-not-allowed' : 'text-red-500 bg-red-50 active:bg-red-200'}`}
                  style={{ touchAction: 'manipulation' }}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {remainingBase <= 0 && receivedBase > 0 ? (
        <p className="text-center text-sm text-green-600 font-semibold py-2">התקבל במלואו</p>
      ) : (
        <>
          <Field
            label={`סכום שהתקבל בחשבון הבנק (${isUSD ? '$' : '₪'})`}
            hint={hasFlags && previewBase > 0
              ? `יקוזז מהפרויקט בבסיס: ${fmt(previewBase)}`
              : undefined}
          >
            <Input type="number" value={amount} onChange={v => { setAmount(v); setError(null) }} placeholder="0" />
          </Field>
          <Field label="חשבון לזיכוי">
            <select
              value={accountId}
              onChange={e => { setAccountId(e.target.value); setError(null) }}
              className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50 ${!accountId && error ? 'border-red-400' : 'border-gray-200'}`}
            >
              <option value="">בחר חשבון</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {error && <p className="text-sm text-red-500 text-center mb-1">{error}</p>}
          {justSaved && <p className="text-sm text-green-600 text-center mb-1 font-semibold">✓ נשמר וזוכה</p>}
          <SaveButton onClick={handleSave} label="שמור וזכה חשבון" />
        </>
      )}
    </Modal>
  )
}
