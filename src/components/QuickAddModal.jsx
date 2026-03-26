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

const F = ({ label, name, errors, children }) => {
  const hasErr = errors?.includes(name)
  return (
    <div className="mb-4">
      <label className="block text-xs mb-1">
        <span className={hasErr ? 'text-red-500' : 'text-gray-500'}>{label}</span>
        {hasErr && <span className="text-red-500 mr-1"> *</span>}
      </label>
      {children}
    </div>
  )
}

const Inp = ({ err, ...props }) => (
  <input
    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${err ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-blue-400'}`}
    {...props}
  />
)

const Sel = ({ err, children, ...props }) => (
  <select
    className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none ${err ? 'border-red-400' : 'border-gray-200 focus:border-blue-400'}`}
    {...props}
  >
    {children}
  </select>
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

  const [step, setStep]     = useState('pick')
  const [form, setForm]     = useState({})
  const [splits, setSplits] = useState([{ accountId: '', amount: '' }])
  const [saved, setSaved]   = useState(false)
  const [errors, setErrors] = useState([])

  const fv = (key) => form[key] ?? ''
  const sv = (key, val) => { setForm(prev => ({ ...prev, [key]: val })); setErrors(prev => prev.filter(e => e !== key)) }
  const e  = (key) => errors.includes(key)

  const ilsAccounts = accounts.filter(a => a.currency !== 'USD')
  const todayStr    = new Date().toISOString().split('T')[0]

  const pick = (id) => { setForm({}); setSplits([{ accountId: '', amount: '' }]); setSaved(false); setErrors([]); setStep(id) }

  const flash = () => { setSaved(true); setTimeout(() => { setSaved(false); setStep('pick') }, 900) }

  const fail = (...fields) => { setErrors(fields); return false }

  const handleSave = () => {
    setErrors([])
    switch (step) {

      case 'friend_loan': {
        const amount = parseFloat(fv('amount'))
        const errs = []
        if (!fv('lenderName')) errs.push('lenderName')
        if (!amount)           errs.push('amount')
        if (!fv('repayDate'))  errs.push('repayDate')
        if (errs.length) { setErrors(errs); return }
        const receivedDate = fv('receivedDate') || todayStr
        addDebt({ name: fv('lenderName'), amount, type: 'we_owe', expectedDate: fv('repayDate'), notes: 'הלוואה אישית' })
        addFutureIncome({ name: `הלוואה מ${fv('lenderName')}`, amount, expectedDate: receivedDate, accountId: fv('accountId') || null })
        addFutureIncome({ name: `החזר ל${fv('lenderName')}`, amount: -amount, expectedDate: fv('repayDate'), isPayment: true, accountId: fv('accountId') || null })
        flash(); break
      }

      case 'future_income': {
        const amount = parseFloat(fv('amount'))
        const errs = []
        if (!fv('name')) errs.push('name')
        if (!amount)     errs.push('amount')
        if (errs.length) { setErrors(errs); return }
        addFutureIncome({ name: fv('name'), amount, expectedDate: fv('expectedDate') || null, accountId: fv('accountId') || null })
        flash(); break
      }

      case 'future_payment': {
        const amount = parseFloat(fv('amount'))
        const errs = []
        if (!fv('name'))         errs.push('name')
        if (!amount)             errs.push('amount')
        if (!fv('expectedDate')) errs.push('expectedDate')
        if (errs.length) { setErrors(errs); return }
        addFutureIncome({ name: fv('name'), amount: -amount, expectedDate: fv('expectedDate'), isPayment: true, accountId: fv('accountId') || null })
        flash(); break
      }

      case 'update_debt': {
        const amount = parseFloat(fv('newAmount'))
        const errs = []
        if (!fv('debtId'))   errs.push('debtId')
        if (isNaN(amount))   errs.push('newAmount')
        if (errs.length) { setErrors(errs); return }
        updateDebt(fv('debtId'), { amount })
        flash(); break
      }

      case 'update_balance': {
        const val = parseFloat(fv('newBalance'))
        const errs = []
        if (!fv('accountId'))  errs.push('accountId')
        if (isNaN(val))        errs.push('newBalance')
        if (errs.length) { setErrors(errs); return }
        const acc = accounts.find(a => a.id === fv('accountId'))
        if (acc.currency === 'USD') updateAccount(fv('accountId'), { usdBalance: val })
        else                        updateAccount(fv('accountId'), { balance: val })
        flash(); break
      }

      case 'offset': {
        const amount = parseFloat(fv('offsetAmount'))
        const errs = []
        if (!fv('debtAId'))  errs.push('debtAId')
        if (!fv('debtBId'))  errs.push('debtBId')
        if (!amount)         errs.push('offsetAmount')
        if (errs.length) { setErrors(errs); return }
        const dA = debts.find(d => d.id === fv('debtAId'))
        const dB = debts.find(d => d.id === fv('debtBId'))
        if (dA) updateDebt(fv('debtAId'), { amount: Math.max(0, (dA.amount || 0) - amount) })
        if (dB) updateDebt(fv('debtBId'), { amount: Math.max(0, (dB.amount || 0) - amount) })
        flash(); break
      }

      case 'split_income': {
        const valid = splits.filter(s => s.accountId && parseFloat(s.amount) > 0)
        if (!valid.length) { setErrors(['splits']); return }
        valid.forEach(s => {
          const acc = accounts.find(a => a.id === s.accountId)
          if (acc) updateAccount(s.accountId, { balance: (acc.balance || 0) + parseFloat(s.amount) })
        })
        flash(); break
      }

      case 'transfer': {
        const amount = parseFloat(fv('amount'))
        const errs = []
        if (!fv('fromId'))                        errs.push('fromId')
        if (!fv('toId'))                          errs.push('toId')
        if (!amount)                              errs.push('amount')
        if (fv('fromId') && fv('fromId') === fv('toId')) errs.push('toId')
        if (errs.length) { setErrors(errs); return }
        const from = accounts.find(a => a.id === fv('fromId'))
        const to   = accounts.find(a => a.id === fv('toId'))
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
        const errs = []
        if (!fv('itemId'))  errs.push('itemId')
        if (!fv('newDate')) errs.push('newDate')
        if (errs.length) { setErrors(errs); return }
        updateFutureIncome(fv('itemId'), { expectedDate: fv('newDate') })
        flash(); break
      }

      case 'past_event': {
        const amount = parseFloat(fv('amount'))
        const errs = []
        if (!fv('accountId')) errs.push('accountId')
        if (!amount)          errs.push('amount')
        if (errs.length) { setErrors(errs); return }
        const acc = accounts.find(a => a.id === fv('accountId'))
        const delta = fv('eventType') === 'expense' ? -amount : amount
        updateAccount(fv('accountId'), { balance: (acc.balance || 0) + delta })
        flash(); break
      }

      case 'reminder': {
        const errs = []
        if (!fv('text')) errs.push('text')
        if (!fv('date')) errs.push('date')
        if (errs.length) { setErrors(errs); return }
        addReminder({ text: fv('text'), date: fv('date') })
        flash(); break
      }

      case 'update_loan': {
        const val = parseFloat(fv('value'))
        const errs = []
        if (!fv('loanId')) errs.push('loanId')
        if (isNaN(val))    errs.push('value')
        if (errs.length) { setErrors(errs); return }
        updateLoan(fv('loanId'), { [fv('field') || 'balanceOverride']: val })
        flash(); break
      }

      default: break
    }
  }

  const renderForm = () => {
    switch (step) {

      case 'friend_loan': return (<>
        <F label="שם המלווה" name="lenderName" errors={errors}>
          <Inp err={e('lenderName')} value={fv('lenderName')} onChange={ev => sv('lenderName', ev.target.value)} />
        </F>
        <F label="סכום (₪)" name="amount" errors={errors}>
          <Inp err={e('amount')} type="number" value={fv('amount')} onChange={ev => sv('amount', ev.target.value)} />
        </F>
        <F label="תאריך קבלה" name="receivedDate" errors={errors}>
          <Inp type="date" value={fv('receivedDate') || todayStr} onChange={ev => sv('receivedDate', ev.target.value)} />
        </F>
        <F label="תאריך החזר" name="repayDate" errors={errors}>
          <Inp err={e('repayDate')} type="date" value={fv('repayDate')} onChange={ev => sv('repayDate', ev.target.value)} />
        </F>
        <F label="לאיזה חשבון נכנס הכסף" name="accountId" errors={errors}>
          <Sel value={fv('accountId')} onChange={ev => sv('accountId', ev.target.value)}>
            <option value="">לא מקושר לחשבון</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'future_income': return (<>
        <F label="שם" name="name" errors={errors}>
          <Inp err={e('name')} value={fv('name')} onChange={ev => sv('name', ev.target.value)} />
        </F>
        <F label="סכום (₪)" name="amount" errors={errors}>
          <Inp err={e('amount')} type="number" value={fv('amount')} onChange={ev => sv('amount', ev.target.value)} />
        </F>
        <F label="תאריך צפוי (אופציונלי)" name="expectedDate" errors={errors}>
          <Inp type="date" value={fv('expectedDate')} onChange={ev => sv('expectedDate', ev.target.value)} />
        </F>
        <F label="חשבון" name="accountId" errors={errors}>
          <Sel value={fv('accountId')} onChange={ev => sv('accountId', ev.target.value)}>
            <option value="">לא מקושר</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'future_payment': return (<>
        <F label="שם" name="name" errors={errors}>
          <Inp err={e('name')} value={fv('name')} onChange={ev => sv('name', ev.target.value)} />
        </F>
        <F label="סכום (₪)" name="amount" errors={errors}>
          <Inp err={e('amount')} type="number" value={fv('amount')} onChange={ev => sv('amount', ev.target.value)} />
        </F>
        <F label="תאריך" name="expectedDate" errors={errors}>
          <Inp err={e('expectedDate')} type="date" value={fv('expectedDate')} onChange={ev => sv('expectedDate', ev.target.value)} />
        </F>
        <F label="חשבון" name="accountId" errors={errors}>
          <Sel value={fv('accountId')} onChange={ev => sv('accountId', ev.target.value)}>
            <option value="">לא מקושר</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'update_debt': {
        const sel = debts.find(d => d.id === fv('debtId'))
        return (<>
          <F label="חוב" name="debtId" errors={errors}>
            <Sel err={e('debtId')} value={fv('debtId')} onChange={ev => { sv('debtId', ev.target.value); sv('newAmount', debts.find(d => d.id === ev.target.value)?.amount ?? '') }}>
              <option value="">בחר חוב</option>
              {debts.map(d => <option key={d.id} value={d.id}>{d.name} — ₪{(d.amount || 0).toLocaleString()}</option>)}
            </Sel>
          </F>
          {sel && <p className="text-xs text-gray-400 -mt-2 mb-4">יתרה נוכחית: ₪{(sel.amount || 0).toLocaleString()}</p>}
          <F label="יתרה חדשה (₪)" name="newAmount" errors={errors}>
            <Inp err={e('newAmount')} type="number" value={fv('newAmount')} onChange={ev => sv('newAmount', ev.target.value)} />
          </F>
        </>)
      }

      case 'update_balance': {
        const sel = accounts.find(a => a.id === fv('accountId'))
        const cur = sel ? (sel.currency === 'USD' ? sel.usdBalance : sel.balance) : null
        return (<>
          <F label="חשבון" name="accountId" errors={errors}>
            <Sel err={e('accountId')} value={fv('accountId')} onChange={ev => {
              const a = accounts.find(x => x.id === ev.target.value)
              sv('accountId', ev.target.value)
              sv('newBalance', a ? String(a.currency === 'USD' ? (a.usdBalance ?? '') : (a.balance ?? '')) : '')
            }}>
              <option value="">בחר חשבון</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency === 'USD' ? '$' : '₪'}{((a.currency === 'USD' ? a.usdBalance : a.balance) || 0).toLocaleString()})</option>)}
            </Sel>
          </F>
          {sel && <p className="text-xs text-gray-400 -mt-2 mb-4">יתרה נוכחית: {sel.currency === 'USD' ? '$' : '₪'}{(cur || 0).toLocaleString()}</p>}
          <F label={`יתרה חדשה (${sel?.currency === 'USD' ? '$' : '₪'})`} name="newBalance" errors={errors}>
            <Inp err={e('newBalance')} type="number" value={fv('newBalance')} onChange={ev => sv('newBalance', ev.target.value)} />
          </F>
        </>)
      }

      case 'offset': return (<>
        <F label="חוב א׳ (יקוזז)" name="debtAId" errors={errors}>
          <Sel err={e('debtAId')} value={fv('debtAId')} onChange={ev => sv('debtAId', ev.target.value)}>
            <option value="">בחר</option>
            {debts.map(d => <option key={d.id} value={d.id}>{d.name} — ₪{(d.amount || 0).toLocaleString()}</option>)}
          </Sel>
        </F>
        <F label="חוב ב׳ (יקוזז)" name="debtBId" errors={errors}>
          <Sel err={e('debtBId')} value={fv('debtBId')} onChange={ev => sv('debtBId', ev.target.value)}>
            <option value="">בחר</option>
            {debts.map(d => <option key={d.id} value={d.id}>{d.name} — ₪{(d.amount || 0).toLocaleString()}</option>)}
          </Sel>
        </F>
        <F label="סכום קיזוז (₪)" name="offsetAmount" errors={errors}>
          <Inp err={e('offsetAmount')} type="number" value={fv('offsetAmount')} onChange={ev => sv('offsetAmount', ev.target.value)} />
        </F>
      </>)

      case 'split_income': return (<>
        {errors.includes('splits') && <p className="text-xs text-red-500 mb-2">* יש למלא לפחות חשבון אחד עם סכום</p>}
        {splits.map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <select
              className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
              value={s.accountId}
              onChange={ev => { const ns = [...splits]; ns[i] = { ...ns[i], accountId: ev.target.value }; setSplits(ns) }}
            >
              <option value="">חשבון</option>
              {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input
              type="number"
              className="w-28 border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none"
              value={s.amount}
              onChange={ev => { const ns = [...splits]; ns[i] = { ...ns[i], amount: ev.target.value }; setSplits(ns) }}
            />
            {splits.length > 1 && <button onClick={() => setSplits(splits.filter((_, j) => j !== i))} className="text-red-400 text-xl leading-none">×</button>}
          </div>
        ))}
        <button onClick={() => setSplits([...splits, { accountId: '', amount: '' }])} className="text-blue-500 text-sm mt-1">+ הוסף חשבון</button>
      </>)

      case 'transfer': {
        const from = accounts.find(a => a.id === fv('fromId'))
        const compatible = fv('fromId') ? accounts.filter(a => a.id !== fv('fromId') && a.currency === (from?.currency || 'ILS')) : accounts
        return (<>
          <F label="מחשבון" name="fromId" errors={errors}>
            <Sel err={e('fromId')} value={fv('fromId')} onChange={ev => { sv('fromId', ev.target.value); sv('toId', '') }}>
              <option value="">בחר</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency === 'USD' ? `$${(a.usdBalance||0).toLocaleString()}` : `₪${(a.balance||0).toLocaleString()}`})</option>)}
            </Sel>
          </F>
          <F label="לחשבון" name="toId" errors={errors}>
            <Sel err={e('toId')} value={fv('toId')} onChange={ev => sv('toId', ev.target.value)}>
              <option value="">בחר</option>
              {compatible.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Sel>
          </F>
          <F label="סכום" name="amount" errors={errors}>
            <Inp err={e('amount')} type="number" value={fv('amount')} onChange={ev => sv('amount', ev.target.value)} />
          </F>
        </>)
      }

      case 'change_date': {
        const pending = futureIncome.filter(fi => fi.status === 'pending' && fi.expectedDate)
        return (<>
          <F label="אירוע" name="itemId" errors={errors}>
            <Sel err={e('itemId')} value={fv('itemId')} onChange={ev => {
              const item = futureIncome.find(x => x.id === ev.target.value)
              sv('itemId', ev.target.value)
              sv('newDate', item?.expectedDate || '')
            }}>
              <option value="">בחר אירוע</option>
              {pending.map(p => <option key={p.id} value={p.id}>{p.name} — {p.expectedDate}</option>)}
            </Sel>
          </F>
          <F label="תאריך חדש" name="newDate" errors={errors}>
            <Inp err={e('newDate')} type="date" value={fv('newDate')} onChange={ev => sv('newDate', ev.target.value)} />
          </F>
        </>)
      }

      case 'past_event': return (<>
        <F label="סוג" name="eventType" errors={errors}>
          <Sel value={fv('eventType') || 'income'} onChange={ev => sv('eventType', ev.target.value)}>
            <option value="income">הכנסה</option>
            <option value="expense">הוצאה</option>
          </Sel>
        </F>
        <F label="תיאור (אופציונלי)" name="name" errors={errors}>
          <Inp value={fv('name')} onChange={ev => sv('name', ev.target.value)} />
        </F>
        <F label="סכום (₪)" name="amount" errors={errors}>
          <Inp err={e('amount')} type="number" value={fv('amount')} onChange={ev => sv('amount', ev.target.value)} />
        </F>
        <F label="חשבון" name="accountId" errors={errors}>
          <Sel err={e('accountId')} value={fv('accountId')} onChange={ev => sv('accountId', ev.target.value)}>
            <option value="">בחר חשבון</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'reminder': return (<>
        <F label="תזכורת" name="text" errors={errors}>
          <Inp err={e('text')} value={fv('text')} onChange={ev => sv('text', ev.target.value)} />
        </F>
        <F label="תאריך" name="date" errors={errors}>
          <Inp err={e('date')} type="date" value={fv('date')} onChange={ev => sv('date', ev.target.value)} />
        </F>
      </>)

      case 'update_loan': {
        const selLoan  = loans.find(l => l.id === fv('loanId'))
        const fieldKey = fv('field') || 'balanceOverride'
        const currentVal = selLoan ? (fieldKey === 'balanceOverride' ? selLoan.balanceOverride : fieldKey === 'monthlyPayment' ? selLoan.monthlyPayment : selLoan.interestRate) : null
        return (<>
          <F label="הלוואה" name="loanId" errors={errors}>
            <Sel err={e('loanId')} value={fv('loanId')} onChange={ev => sv('loanId', ev.target.value)}>
              <option value="">בחר</option>
              {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Sel>
          </F>
          <F label="שדה לעדכון" name="field" errors={errors}>
            <Sel value={fieldKey} onChange={ev => { sv('field', ev.target.value); sv('value', '') }}>
              <option value="balanceOverride">יתרת הלוואה</option>
              <option value="monthlyPayment">תשלום חודשי</option>
              <option value="interestRate">ריבית (%)</option>
            </Sel>
          </F>
          {selLoan && currentVal != null && <p className="text-xs text-gray-400 -mt-2 mb-4">ערך נוכחי: {fieldKey === 'interestRate' ? `${currentVal}%` : `₪${Number(currentVal).toLocaleString()}`}</p>}
          <F label="ערך חדש" name="value" errors={errors}>
            <Inp err={e('value')} type="number" value={fv('value')} onChange={ev => sv('value', ev.target.value)} />
          </F>
        </>)
      }

      default: return null
    }
  }

  const action = ACTIONS.find(a => a.id === step)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-40"
      onClick={ev => { if (ev.target === ev.currentTarget) onClose() }}
    >
      <div className="bg-white w-full max-w-md rounded-t-3xl" style={{ maxHeight: '88vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          {step !== 'pick'
            ? <button onClick={() => pick('pick') || setStep('pick')} className="text-blue-500 text-sm font-medium">← חזרה</button>
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
