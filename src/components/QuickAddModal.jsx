import { useState } from 'react'
import useStore from '../store/useStore'

const ACTIONS = [
  { id: 'friend_loan',    icon: '🤝', label: 'הלוואה מחבר',      desc: 'קיבלתי כסף ואחזיר בתאריך' },
  { id: 'future_income',  icon: '💰', label: 'הכנסה צפויה',       desc: 'כסף שאקבל בתאריך מסוים' },
  { id: 'future_payment', icon: '📤', label: 'תשלום עתידי',       desc: 'הוצאה חד-פעמית עתידית' },
  { id: 'update_debt',    icon: '📝', label: 'עדכון חוב',         desc: 'שנה יתרת חוב קיים' },
  { id: 'update_balance', icon: '🏦', label: 'עדכון יתרה',        desc: 'תקן יתרת חשבון' },
  { id: 'offset',         icon: '⚖️', label: 'קיזוז חובות',       desc: 'חיוב מקזז חיוב' },
  { id: 'split_income',   icon: '✂️', label: 'פיצול הכנסה',       desc: 'חלק כסף בין חשבונות' },
  { id: 'transfer',       icon: '↔️', label: 'העברה בין חשבונות', desc: 'הזז כסף בין חשבונות' },
  { id: 'change_date',    icon: '📅', label: 'שינוי תאריך',       desc: 'דחה או הקדם אירוע' },
  { id: 'past_event',     icon: '⚡', label: 'אירוע שכבר קרה',    desc: 'הכנסה/הוצאה לא מתוכננת' },
  { id: 'reminder',       icon: '🔔', label: 'תזכורת ידנית',      desc: 'תזכורת לתאריך מסוים' },
  { id: 'update_loan',    icon: '🏠', label: 'עדכון הלוואה',      desc: 'שנה ריבית, יתרה או תשלום' },
]

const F = ({ label, children }) => (
  <div className="mb-4">
    <label className="block text-xs text-gray-500 mb-1">{label}</label>
    {children}
  </div>
)
const Inp = (props) => (
  <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400" {...props} />
)
const Sel = ({ children, ...props }) => (
  <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-400" {...props}>{children}</select>
)

export default function QuickAddModal({ onClose }) {
  const {
    accounts, debts, loans, futureIncome,
    addDebt, updateDebt,
    updateAccount,
    addFutureIncome, updateFutureIncome,
    updateLoan,
    addReminder,
  } = useStore()

  const [step, setStep] = useState('pick')
  const [form, setForm] = useState({})
  const [splits, setSplits] = useState([{ accountId: '', amount: '' }])
  const [saved, setSaved] = useState(false)

  const fv = (key) => form[key] ?? ''
  const sv = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const ilsAccounts = accounts.filter(a => a.currency !== 'USD')

  const pick = (id) => { setForm({}); setSplits([{ accountId: '', amount: '' }]); setSaved(false); setStep(id) }

  const flash = () => {
    setSaved(true)
    setTimeout(() => { setSaved(false); setStep('pick') }, 900)
  }

  const handleSave = () => {
    switch (step) {

      case 'friend_loan': {
        const amount = parseFloat(fv('amount'))
        if (!fv('lenderName') || !amount || !fv('repayDate')) return
        const receivedDate = fv('receivedDate') || new Date().toISOString().split('T')[0]
        // Debt we owe
        addDebt({ name: fv('lenderName'), amount, type: 'we_owe', expectedDate: fv('repayDate'), notes: 'הלוואה אישית' })
        // Receipt event (green plus) — user confirms it to update balance
        addFutureIncome({ name: `הלוואה מ${fv('lenderName')}`, amount, expectedDate: receivedDate, accountId: fv('accountId') || null })
        // Repayment event (red minus)
        addFutureIncome({ name: `החזר ל${fv('lenderName')}`, amount: -amount, expectedDate: fv('repayDate'), isPayment: true, accountId: fv('accountId') || null })
        flash(); break
      }

      case 'future_income': {
        const amount = parseFloat(fv('amount'))
        if (!fv('name') || !amount) return
        addFutureIncome({ name: fv('name'), amount, expectedDate: fv('expectedDate') || null, accountId: fv('accountId') || null })
        flash(); break
      }

      case 'future_payment': {
        const amount = parseFloat(fv('amount'))
        if (!fv('name') || !amount || !fv('expectedDate')) return
        addFutureIncome({ name: fv('name'), amount: -amount, expectedDate: fv('expectedDate'), isPayment: true, accountId: fv('accountId') || null })
        flash(); break
      }

      case 'update_debt': {
        const amount = parseFloat(fv('newAmount'))
        if (!fv('debtId') || isNaN(amount)) return
        updateDebt(fv('debtId'), { amount })
        flash(); break
      }

      case 'update_balance': {
        const acc = accounts.find(a => a.id === fv('accountId'))
        if (!acc || fv('newBalance') === '') return
        const val = parseFloat(fv('newBalance'))
        if (isNaN(val)) return
        if (acc.currency === 'USD') updateAccount(fv('accountId'), { usdBalance: val })
        else updateAccount(fv('accountId'), { balance: val })
        flash(); break
      }

      case 'offset': {
        const amount = parseFloat(fv('offsetAmount'))
        if (!fv('debtAId') || !fv('debtBId') || !amount) return
        const dA = debts.find(d => d.id === fv('debtAId'))
        const dB = debts.find(d => d.id === fv('debtBId'))
        if (dA) updateDebt(fv('debtAId'), { amount: Math.max(0, (dA.amount || 0) - amount) })
        if (dB) updateDebt(fv('debtBId'), { amount: Math.max(0, (dB.amount || 0) - amount) })
        flash(); break
      }

      case 'split_income': {
        const valid = splits.filter(s => s.accountId && parseFloat(s.amount) > 0)
        if (!valid.length) return
        valid.forEach(s => {
          const acc = accounts.find(a => a.id === s.accountId)
          if (acc) updateAccount(s.accountId, { balance: (acc.balance || 0) + parseFloat(s.amount) })
        })
        flash(); break
      }

      case 'transfer': {
        const amount = parseFloat(fv('amount'))
        if (!fv('fromId') || !fv('toId') || !amount || fv('fromId') === fv('toId')) return
        const from = accounts.find(a => a.id === fv('fromId'))
        const to   = accounts.find(a => a.id === fv('toId'))
        if (!from || !to) return
        if (from.currency === 'USD') {
          updateAccount(fv('fromId'), { usdBalance: (from.usdBalance || 0) - amount })
          updateAccount(fv('toId'),   { usdBalance: (to.usdBalance   || 0) + amount })
        } else {
          updateAccount(fv('fromId'), { balance: (from.balance || 0) - amount })
          updateAccount(fv('toId'),   { balance: (to.balance   || 0) + amount })
        }
        flash(); break
      }

      case 'change_date': {
        if (!fv('itemId') || !fv('newDate')) return
        updateFutureIncome(fv('itemId'), { expectedDate: fv('newDate') })
        flash(); break
      }

      case 'past_event': {
        const amount = parseFloat(fv('amount'))
        if (!fv('accountId') || !amount) return
        const acc = accounts.find(a => a.id === fv('accountId'))
        if (!acc) return
        const delta = fv('eventType') === 'expense' ? -amount : amount
        updateAccount(fv('accountId'), { balance: (acc.balance || 0) + delta })
        flash(); break
      }

      case 'reminder': {
        if (!fv('text') || !fv('date')) return
        addReminder({ text: fv('text'), date: fv('date') })
        flash(); break
      }

      case 'update_loan': {
        if (!fv('loanId') || fv('value') === '') return
        const val = parseFloat(fv('value'))
        if (isNaN(val)) return
        updateLoan(fv('loanId'), { [fv('field') || 'balanceOverride']: val })
        flash(); break
      }

      default: break
    }
  }

  const renderForm = () => {
    switch (step) {

      case 'friend_loan': return (<>
        <F label="שם המלווה"><Inp placeholder="לדוגמא: אליעזר" value={fv('lenderName')} onChange={e => sv('lenderName', e.target.value)} /></F>
        <F label="סכום (₪)"><Inp type="number" placeholder="20000" value={fv('amount')} onChange={e => sv('amount', e.target.value)} /></F>
        <F label="תאריך קבלה"><Inp type="date" value={fv('receivedDate') || new Date().toISOString().split('T')[0]} onChange={e => sv('receivedDate', e.target.value)} /></F>
        <F label="תאריך החזר"><Inp type="date" value={fv('repayDate')} onChange={e => sv('repayDate', e.target.value)} /></F>
        <F label="לאיזה חשבון נכנס הכסף">
          <Sel value={fv('accountId')} onChange={e => sv('accountId', e.target.value)}>
            <option value="">לא מקושר לחשבון</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'future_income': return (<>
        <F label="שם"><Inp placeholder="לדוגמא: סלקום תשלום" value={fv('name')} onChange={e => sv('name', e.target.value)} /></F>
        <F label="סכום (₪)"><Inp type="number" value={fv('amount')} onChange={e => sv('amount', e.target.value)} /></F>
        <F label="תאריך צפוי (אופציונלי)"><Inp type="date" value={fv('expectedDate')} onChange={e => sv('expectedDate', e.target.value)} /></F>
        <F label="חשבון">
          <Sel value={fv('accountId')} onChange={e => sv('accountId', e.target.value)}>
            <option value="">לא מקושר</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'future_payment': return (<>
        <F label="שם"><Inp placeholder="לדוגמא: החזר לאמא" value={fv('name')} onChange={e => sv('name', e.target.value)} /></F>
        <F label="סכום (₪)"><Inp type="number" value={fv('amount')} onChange={e => sv('amount', e.target.value)} /></F>
        <F label="תאריך"><Inp type="date" value={fv('expectedDate')} onChange={e => sv('expectedDate', e.target.value)} /></F>
        <F label="חשבון">
          <Sel value={fv('accountId')} onChange={e => sv('accountId', e.target.value)}>
            <option value="">לא מקושר</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'update_debt': {
        const sel = debts.find(d => d.id === fv('debtId'))
        return (<>
          <F label="חוב">
            <Sel value={fv('debtId')} onChange={e => { sv('debtId', e.target.value); sv('newAmount', debts.find(d => d.id === e.target.value)?.amount ?? '') }}>
              <option value="">בחר חוב</option>
              {debts.map(d => <option key={d.id} value={d.id}>{d.name} — ₪{(d.amount || 0).toLocaleString()}</option>)}
            </Sel>
          </F>
          {sel && <p className="text-xs text-gray-400 -mt-2 mb-4">יתרה נוכחית: ₪{(sel.amount || 0).toLocaleString()}</p>}
          <F label="יתרה חדשה (₪)"><Inp type="number" value={fv('newAmount')} onChange={e => sv('newAmount', e.target.value)} /></F>
        </>)
      }

      case 'update_balance': {
        const sel = accounts.find(a => a.id === fv('accountId'))
        const cur = sel ? (sel.currency === 'USD' ? sel.usdBalance : sel.balance) : null
        return (<>
          <F label="חשבון">
            <Sel value={fv('accountId')} onChange={e => {
              const a = accounts.find(x => x.id === e.target.value)
              sv('accountId', e.target.value)
              sv('newBalance', a ? String(a.currency === 'USD' ? (a.usdBalance ?? '') : (a.balance ?? '')) : '')
            }}>
              <option value="">בחר חשבון</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency === 'USD' ? '$' : '₪'}{((a.currency === 'USD' ? a.usdBalance : a.balance) || 0).toLocaleString()})</option>)}
            </Sel>
          </F>
          {sel && <p className="text-xs text-gray-400 -mt-2 mb-4">יתרה נוכחית: {sel.currency === 'USD' ? '$' : '₪'}{(cur || 0).toLocaleString()}</p>}
          <F label={`יתרה חדשה (${sel?.currency === 'USD' ? '$' : '₪'})`}><Inp type="number" value={fv('newBalance')} onChange={e => sv('newBalance', e.target.value)} /></F>
        </>)
      }

      case 'offset': return (<>
        <F label="חוב א׳ (יקוזז)">
          <Sel value={fv('debtAId')} onChange={e => sv('debtAId', e.target.value)}>
            <option value="">בחר</option>
            {debts.map(d => <option key={d.id} value={d.id}>{d.name} — ₪{(d.amount || 0).toLocaleString()}</option>)}
          </Sel>
        </F>
        <F label="חוב ב׳ (יקוזז)">
          <Sel value={fv('debtBId')} onChange={e => sv('debtBId', e.target.value)}>
            <option value="">בחר</option>
            {debts.map(d => <option key={d.id} value={d.id}>{d.name} — ₪{(d.amount || 0).toLocaleString()}</option>)}
          </Sel>
        </F>
        <F label="סכום קיזוז (₪)"><Inp type="number" value={fv('offsetAmount')} onChange={e => sv('offsetAmount', e.target.value)} /></F>
      </>)

      case 'split_income': return (<>
        <p className="text-xs text-gray-400 mb-3">הכנס כסף שקיבלת לכמה חשבונות</p>
        {splits.map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <select className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
              value={s.accountId}
              onChange={e => { const ns = [...splits]; ns[i] = { ...ns[i], accountId: e.target.value }; setSplits(ns) }}>
              <option value="">חשבון</option>
              {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="number" placeholder="₪" className="w-28 border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none"
              value={s.amount}
              onChange={e => { const ns = [...splits]; ns[i] = { ...ns[i], amount: e.target.value }; setSplits(ns) }} />
            {splits.length > 1 && <button onClick={() => setSplits(splits.filter((_, j) => j !== i))} className="text-red-400 text-xl leading-none">×</button>}
          </div>
        ))}
        <button onClick={() => setSplits([...splits, { accountId: '', amount: '' }])} className="text-blue-500 text-sm mt-1">+ הוסף חשבון</button>
      </>)

      case 'transfer': {
        const from = accounts.find(a => a.id === fv('fromId'))
        const compatible = fv('fromId') ? accounts.filter(a => a.id !== fv('fromId') && a.currency === (from?.currency || 'ILS')) : accounts
        return (<>
          <F label="מחשבון">
            <Sel value={fv('fromId')} onChange={e => { sv('fromId', e.target.value); sv('toId', '') }}>
              <option value="">בחר</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency === 'USD' ? `$${(a.usdBalance||0).toLocaleString()}` : `₪${(a.balance||0).toLocaleString()}`})</option>)}
            </Sel>
          </F>
          <F label="לחשבון">
            <Sel value={fv('toId')} onChange={e => sv('toId', e.target.value)}>
              <option value="">בחר</option>
              {compatible.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Sel>
          </F>
          <F label="סכום"><Inp type="number" value={fv('amount')} onChange={e => sv('amount', e.target.value)} /></F>
        </>)
      }

      case 'change_date': {
        const pending = futureIncome.filter(fi => fi.status === 'pending' && fi.expectedDate)
        return (<>
          <F label="אירוע">
            <Sel value={fv('itemId')} onChange={e => {
              const item = futureIncome.find(x => x.id === e.target.value)
              sv('itemId', e.target.value)
              sv('newDate', item?.expectedDate || '')
            }}>
              <option value="">בחר אירוע</option>
              {pending.map(p => <option key={p.id} value={p.id}>{p.name} — {p.expectedDate}</option>)}
            </Sel>
          </F>
          <F label="תאריך חדש"><Inp type="date" value={fv('newDate')} onChange={e => sv('newDate', e.target.value)} /></F>
        </>)
      }

      case 'past_event': return (<>
        <F label="סוג">
          <Sel value={fv('eventType') || 'income'} onChange={e => sv('eventType', e.target.value)}>
            <option value="income">הכנסה</option>
            <option value="expense">הוצאה</option>
          </Sel>
        </F>
        <F label="תיאור (אופציונלי)"><Inp placeholder="לדוגמא: תשלום מיוחד" value={fv('name')} onChange={e => sv('name', e.target.value)} /></F>
        <F label="סכום (₪)"><Inp type="number" value={fv('amount')} onChange={e => sv('amount', e.target.value)} /></F>
        <F label="חשבון">
          <Sel value={fv('accountId')} onChange={e => sv('accountId', e.target.value)}>
            <option value="">בחר חשבון</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'reminder': return (<>
        <F label="תזכורת"><Inp placeholder="לדוגמא: לשאול את אליעזר על ההחזר" value={fv('text')} onChange={e => sv('text', e.target.value)} /></F>
        <F label="תאריך"><Inp type="date" value={fv('date')} onChange={e => sv('date', e.target.value)} /></F>
      </>)

      case 'update_loan': {
        const selLoan = loans.find(l => l.id === fv('loanId'))
        const fieldKey = fv('field') || 'balanceOverride'
        const currentVal = selLoan ? (fieldKey === 'balanceOverride' ? selLoan.balanceOverride : fieldKey === 'monthlyPayment' ? selLoan.monthlyPayment : selLoan.interestRate) : null
        return (<>
          <F label="הלוואה">
            <Sel value={fv('loanId')} onChange={e => sv('loanId', e.target.value)}>
              <option value="">בחר</option>
              {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Sel>
          </F>
          <F label="שדה לעדכון">
            <Sel value={fieldKey} onChange={e => { sv('field', e.target.value); sv('value', '') }}>
              <option value="balanceOverride">יתרת הלוואה</option>
              <option value="monthlyPayment">תשלום חודשי</option>
              <option value="interestRate">ריבית (%)</option>
            </Sel>
          </F>
          {selLoan && currentVal != null && <p className="text-xs text-gray-400 -mt-2 mb-4">ערך נוכחי: {fieldKey === 'interestRate' ? `${currentVal}%` : `₪${Number(currentVal).toLocaleString()}`}</p>}
          <F label="ערך חדש"><Inp type="number" value={fv('value')} onChange={e => sv('value', e.target.value)} /></F>
        </>)
      }

      default: return null
    }
  }

  const action = ACTIONS.find(a => a.id === step)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full max-w-md rounded-t-3xl" style={{ maxHeight: '88vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          {step !== 'pick'
            ? <button onClick={() => setStep('pick')} className="text-blue-500 text-sm font-medium">← חזרה</button>
            : <span className="w-12" />
          }
          <span className="font-bold text-gray-800 text-base">
            {step === 'pick' ? '＋ הוסף נתון' : action?.label}
          </span>
          <button onClick={onClose} className="text-gray-400 text-2xl font-light leading-none w-8 text-center">×</button>
        </div>

        <div className="px-5 pb-6 pt-4">
          {step === 'pick' ? (
            <div className="grid grid-cols-2 gap-3">
              {ACTIONS.map(a => (
                <button
                  key={a.id}
                  onClick={() => pick(a.id)}
                  className="text-right bg-gray-50 rounded-2xl p-4 active:bg-blue-50 active:scale-95 transition-all border border-gray-100"
                >
                  <div className="text-2xl mb-1">{a.icon}</div>
                  <div className="text-sm font-semibold text-gray-800 leading-tight">{a.label}</div>
                  <div className="text-xs text-gray-400 mt-1 leading-tight">{a.desc}</div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mt-1">{renderForm()}</div>
              <button
                onClick={handleSave}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm mt-4 transition-all duration-200 ${
                  saved ? 'bg-green-500 text-white scale-95' : 'bg-blue-600 text-white active:opacity-80'
                }`}
              >
                {saved ? '✓ נשמר!' : 'שמור'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
