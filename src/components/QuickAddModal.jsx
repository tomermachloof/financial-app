import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import MiniCalendar from './MiniCalendar'
import DayOfMonthPicker from './DayOfMonthPicker'

const ACTIONS = [
  { id: 'reminder',      icon: '🔔', label: 'תזכורת',            desc: 'חד-פעמית או חודשית חוזרת' },
  { id: 'income_expense', icon: '💸', label: 'הכנסה / הוצאה',    desc: 'חד פעמי או חוזר כל חודש' },
  { id: 'new_project',   icon: '🎬', label: 'פרויקט חדש',         desc: 'קולנוע, טלוויזיה, תיאטרון או מסחרי' },
  { id: 'edit_income',   icon: '📗', label: 'עריכת הכנסה',       desc: 'בחר פרויקט מתוך ההכנסות' },
  { id: 'new_loan',      icon: '➕', label: 'הלוואה חדשה',       desc: 'כולל גרירת לוח סילוקין' },
  { id: 'friend_loan',   icon: '🤝', label: 'הלוואה מחבר',      desc: 'קיבלתי כסף ואחזיר בתאריך' },
  { id: 'update_debt',   icon: '📝', label: 'עדכון חוב',         desc: 'שנה יתרת חוב קיים' },
  { id: 'update_balance',    icon: '🏦', label: 'עדכון יתרה',        desc: 'תקן יתרת חשבון' },
  { id: 'offset',            icon: '⚖️', label: 'קיזוז חובות',       desc: 'חיוב מקזז חיוב' },
  { id: 'split_income',      icon: '✂️', label: 'פיצול הכנסה',       desc: 'חלק כסף בין חשבונות' },
  { id: 'transfer',          icon: '↔️', label: 'העברה בין חשבונות', desc: 'הזז כסף בין חשבונות' },
  { id: 'update_loan',       icon: '🏠', label: 'עדכון הלוואה',      desc: 'שנה ריבית, יתרה או תשלום' },
  { id: 'update_investment',  icon: '📈', label: 'עדכון השקעה',      desc: 'עדכן שווי תיק, פנסיה או חיסכון' },
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

export default function QuickAddModal({ onClose, editTarget }) {
  const pressStartedOnBackdropRef = useRef(false)
  const navigate = useNavigate()
  const {
    accounts, debts, loans, futureIncome, investments,
    addDebt, updateDebt,
    updateAccount,
    addFutureIncome, updateFutureIncome,
    addRentalIncome, updateRentalIncome,
    updateLoan, updateLoanMonthlyAmount,
    updateInvestment,
    updateExpense, updateExpenseMonthlyAmount,
    addReminder,
    addExpense,
    updateRentalMonthlyAmount,
  } = useStore()

  const initForm = () => {
    if (!editTarget) return {}
    return editTarget.form || {}
  }

  const [step, setStep]     = useState(editTarget ? editTarget.action : 'pick')
  const [form, setForm]     = useState(initForm)
  const [splits, setSplits] = useState([{ accountId: '', amount: '' }])
  const [saved, setSaved]   = useState(false)
  const [errors, setErrors] = useState([])
  const [permPrompt, setPermPrompt] = useState(null) // { applyPermanent, applyOneTime, name }

  const fv = (key) => form[key] ?? ''
  const sv = (key, val) => { setForm(prev => ({ ...prev, [key]: val })); setErrors(prev => prev.filter(e => e !== key)) }
  const e  = (key) => errors.includes(key)

  const ilsAccounts = accounts.filter(a => a.currency !== 'USD')
  const todayStr    = new Date().toISOString().split('T')[0]

  const pick = (id) => {
    if (id === 'new_loan') {
      onClose()
      navigate('/loans', { state: { openAdd: true } })
      return
    }
    setForm({}); setSplits([{ accountId: '', amount: '' }]); setSaved(false); setErrors([]); setStep(id)
  }

  const pickIncomeForEdit = (item) => {
    onClose()
    navigate('/income', { state: { openEditId: item.id } })
  }

  const flash = () => { setSaved(true); setTimeout(() => { setSaved(false); if (editTarget) onClose(); else setStep('pick') }, 900) }

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
        if (!fv('accountId'))  errs.push('accountId')
        if (errs.length) { setErrors(errs); return }
        if (editTarget?.item) {
          const ef = editTarget.form
          const receivedDate = fv('receivedDate') || todayStr
          if (ef._receiveId) updateFutureIncome(ef._receiveId, { name: `הלוואה מ${fv('lenderName')}`, amount, expectedDate: receivedDate, accountId: fv('accountId') || null })
          if (ef._repayId)   updateFutureIncome(ef._repayId,   { name: `החזר ל${fv('lenderName')}`, amount: -amount, expectedDate: fv('repayDate'), accountId: fv('repayAccountId') || null })
          if (ef._debtId)    updateDebt(ef._debtId, { name: fv('lenderName'), amount, expectedDate: fv('repayDate') })
          flash(); break
        }
        const receivedDate = fv('receivedDate') || todayStr
        addDebt({ name: fv('lenderName'), amount, type: 'we_owe', expectedDate: fv('repayDate'), notes: 'הלוואה אישית' })
        addFutureIncome({ name: `הלוואה מ${fv('lenderName')}`, amount, expectedDate: receivedDate, accountId: fv('accountId') || null })
        addFutureIncome({ name: `החזר ל${fv('lenderName')}`, amount: -amount, expectedDate: fv('repayDate'), isPayment: true, accountId: fv('repayAccountId') || null })
        flash(); break
      }

      case 'income_expense': {
        const isMonthly = fv('freq') === 'monthly'
        const isIncome  = (fv('kind') || 'expense') === 'income'
        const amount    = parseFloat(fv('amount'))
        const errs = []
        if (!fv('name')) errs.push('name')
        if (!amount)     errs.push('amount')
        if (isMonthly && !fv('chargeDay')) errs.push('chargeDay')
        if (!isMonthly && !isIncome && !fv('date')) errs.push('date')
        if (errs.length) { setErrors(errs); return }
        if (editTarget?.item) {
          const { type, item } = editTarget
          const oldAmt = item.currency === 'USD' ? item.usdAmount : item.amount
          const amountChanged = Math.abs(amount - Math.abs(oldAmt || 0)) > 0.01
          if (type === 'expense') {
            const metaUpd = { name: fv('name'), chargeDay: parseInt(fv('chargeDay')), accountId: fv('accountId') || null, destAccountId: fv('destAccountId') || null }
            if (amountChanged) {
              const mKey = todayStr.slice(0, 7)
              setPermPrompt({
                name: item.name,
                applyPermanent: () => {
                  const expUpd = item.currency === 'USD' ? { ...metaUpd, usdAmount: amount } : { ...metaUpd, amount }
                  updateExpense(item.id, expUpd)
                  flash()
                },
                applyOneTime: () => {
                  updateExpense(item.id, metaUpd)
                  updateExpenseMonthlyAmount(item.id, mKey, amount)
                  flash()
                },
              })
              break
            }
            updateExpense(item.id, metaUpd)
          } else if (type === 'rental') {
            const metaUpd = { name: fv('name'), chargeDay: parseInt(fv('chargeDay')), accountId: fv('accountId') || null }
            if (amountChanged) {
              const mKey = todayStr.slice(0, 7)
              setPermPrompt({
                name: item.name,
                applyPermanent: () => {
                  if (item.currency === 'USD') metaUpd.usdAmount = amount; else metaUpd.amount = amount
                  updateRentalIncome(item.id, metaUpd)
                  flash()
                },
                applyOneTime: () => {
                  updateRentalIncome(item.id, metaUpd)
                  updateRentalMonthlyAmount(item.id, mKey, amount)
                  flash()
                },
              })
              break
            }
            if (item.currency === 'USD') metaUpd.usdAmount = amount; else metaUpd.amount = amount
            updateRentalIncome(item.id, metaUpd)
          } else if (type === 'future') {
            updateFutureIncome(item.id, { name: fv('name'), amount: item.isPayment ? -amount : amount, expectedDate: fv('date') || null, accountId: fv('accountId') || null })
          }
          flash(); break
        }
        if (isMonthly && isIncome) {
          addRentalIncome({ name: fv('name'), amount, chargeDay: parseInt(fv('chargeDay')), accountId: fv('accountId') || null })
        } else if (isMonthly && !isIncome) {
          addExpense({ name: fv('name'), amount, chargeDay: parseInt(fv('chargeDay')), category: 'other', accountId: fv('accountId') || null, destAccountId: fv('destAccountId') || null, note: '', monthlyAmounts: {} })
        } else if (!isMonthly && isIncome) {
          addFutureIncome({ name: fv('name'), amount, expectedDate: fv('date') || null, accountId: fv('accountId') || null })
        } else {
          addFutureIncome({ name: fv('name'), amount: -amount, expectedDate: fv('date'), isPayment: true, accountId: fv('accountId') || null })
        }
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
        const isMonthly = fv('reminderType') === 'monthly'
        const errs = []
        if (!isMonthly && !fv('text')) errs.push('text')
        if (isMonthly && fv('invId') === '__other__' && !fv('text')) errs.push('text')
        if (isMonthly && !fv('day'))   errs.push('day')
        if (!isMonthly && !fv('date')) errs.push('date')
        if (errs.length) { setErrors(errs); return }
        const rawInvId = fv('invId')
        const invId = rawInvId && rawInvId !== '__other__' ? rawInvId : null
        const text  = fv('text') || ''
        if (isMonthly) {
          addReminder({ text, type: 'monthly', day: parseInt(fv('day')), doneMonths: [], ...(invId ? { invId } : {}) })
        } else {
          addReminder({ text, type: 'once', date: fv('date') })
        }
        flash(); break
      }

      case 'update_loan': {
        const val = parseFloat(fv('value'))
        const errs = []
        if (!fv('loanId')) errs.push('loanId')
        if (isNaN(val))    errs.push('value')
        if (errs.length) { setErrors(errs); return }
        const fieldKey = fv('field') || 'balanceOverride'
        const cd = parseInt(fv('chargeDay'))
        // monthlyPayment on a loan from editTarget → ask permanent/one-time
        if (editTarget?.item && fieldKey === 'monthlyPayment') {
          const loanId = fv('loanId')
          const mKey = todayStr.slice(0, 7)
          const loanItem = loans.find(l => l.id === loanId)
          setPermPrompt({
            name: loanItem?.name || 'הלוואה',
            applyPermanent: () => {
              const upd = { monthlyPayment: val }
              if (!isNaN(cd) && cd > 0) upd.chargeDay = cd
              // Also update future paymentSchedule entries
              if (loanItem?.paymentSchedule?.length) {
                const mKey2 = todayStr.slice(0, 7)
                upd.paymentSchedule = loanItem.paymentSchedule.map(p =>
                  p.date && p.date >= mKey2 ? { ...p, amount: val } : p
                )
              }
              updateLoan(loanId, upd)
              flash()
            },
            applyOneTime: () => {
              updateLoanMonthlyAmount(loanId, mKey, val)
              if (!isNaN(cd) && cd > 0) updateLoan(loanId, { chargeDay: cd })
              flash()
            },
          })
          break
        }
        const upd = { [fieldKey]: val }
        if (editTarget?.item && !isNaN(cd) && cd > 0) upd.chargeDay = cd
        updateLoan(fv('loanId'), upd)
        flash(); break
      }

      case 'update_investment': {
        const val  = parseFloat(fv('newValue'))
        const errs = []
        if (!fv('invId'))  errs.push('invId')
        if (isNaN(val))    errs.push('newValue')
        if (errs.length) { setErrors(errs); return }
        const inv = investments.find(i => i.id === fv('invId'))
        if (inv?.currency === 'EUR' || inv?.currency === 'USD') {
          updateInvestment(fv('invId'), { originalAmount: val })
        } else {
          updateInvestment(fv('invId'), { value: val })
        }
        flash(); break
      }

      default: break
    }
  }

  const renderForm = () => {
    switch (step) {

      case 'new_project': {
        return (
          <div className="space-y-3 py-2">
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => sv('owner', 'tomer')}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${(fv('owner') || 'tomer') === 'tomer' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
              >תומר</button>
              <button
                type="button"
                onClick={() => sv('owner', 'yael')}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${fv('owner') === 'yael' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-400'}`}
              >יעל</button>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate('/income', { state: { newProjectType: 'film', newProjectOwner: fv('owner') || 'tomer' } })
              }}
              className="w-full py-5 bg-blue-50 hover:bg-blue-100 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">🎬</span>
              <span className="text-sm font-bold text-blue-700">קולנוע / טלוויזיה</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate('/income', { state: { newProjectType: 'theater', newProjectOwner: fv('owner') || 'tomer' } })
              }}
              className="w-full py-5 bg-purple-50 hover:bg-purple-100 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">🎭</span>
              <span className="text-sm font-bold text-purple-700">תיאטרון</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate('/income', { state: { newProjectType: 'commercial', newProjectOwner: fv('owner') || 'tomer' } })
              }}
              className="w-full py-5 bg-orange-50 hover:bg-orange-100 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">💼</span>
              <span className="text-sm font-bold text-orange-700">מסחרי / קמפיין</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate('/income', { state: { newProjectType: 'dubbing', newProjectOwner: fv('owner') || 'tomer' } })
              }}
              className="w-full py-5 bg-pink-100 hover:bg-pink-200 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">🎙️</span>
              <span className="text-sm font-bold text-pink-700">דיבוב</span>
            </button>
          </div>
        )
      }

      case 'edit_income': {
        if (!futureIncome.length) {
          return <p className="text-sm text-gray-400 text-center py-6">אין הכנסות לעריכה</p>
        }
        return (
          <div className="space-y-2">
            {futureIncome.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickIncomeForEdit(item)}
                className="w-full text-right bg-gray-50 hover:bg-blue-50 active:bg-blue-100 rounded-xl px-4 py-3 border border-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800 truncate">{item.name || 'ללא שם'}</span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {item.amount != null ? `₪${Number(item.amount).toLocaleString()}` : ''}
                  </span>
                </div>
                {item.expectedDate && (
                  <div className="text-xs text-gray-400 mt-0.5">{item.expectedDate}</div>
                )}
              </button>
            ))}
          </div>
        )
      }

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
          <Sel err={e('accountId')} value={fv('accountId')} onChange={ev => sv('accountId', ev.target.value)}>
            <option value="">בחר חשבון</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
        <F label="מאיזה חשבון יוצא ההחזר" name="repayAccountId" errors={errors}>
          <Sel value={fv('repayAccountId')} onChange={ev => sv('repayAccountId', ev.target.value)}>
            <option value="">לא מוגדר</option>
            {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </F>
      </>)

      case 'income_expense': {
        const isMonthly = fv('freq') === 'monthly'
        const isIncome  = (fv('kind') || 'expense') === 'income'
        const isEditMode = !!editTarget?.item
        const isUSD = editTarget?.item?.currency === 'USD'
        const currSymbol = isUSD ? '$' : '₪'
        return (<>
          {!isEditMode && <div className="flex gap-2 mb-4">
            {['once', 'monthly'].map(t => (
              <button key={t} onClick={() => sv('freq', t)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  (fv('freq') || 'once') === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {t === 'once' ? 'חד פעמי' : 'חוזר כל חודש'}
              </button>
            ))}
          </div>}
          {!isEditMode && <div className="flex gap-2 mb-4">
            {['expense', 'income'].map(k => (
              <button key={k} onClick={() => sv('kind', k)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  (fv('kind') || 'expense') === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {k === 'income' ? '💚 הכנסה' : '🔴 הוצאה'}
              </button>
            ))}
          </div>}
          <F label="שם" name="name" errors={errors}>
            <Inp err={e('name')} value={fv('name')} onChange={ev => sv('name', ev.target.value)} />
          </F>
          <F label={isMonthly ? `סכום חודשי (${currSymbol})` : `סכום (${currSymbol})`} name="amount" errors={errors}>
            <Inp err={e('amount')} type="number" value={fv('amount')} onChange={ev => sv('amount', ev.target.value)} />
          </F>
          {isMonthly ? (
            <F label="יום בחודש" name="chargeDay" errors={errors}>
              <DayOfMonthPicker value={fv('chargeDay')} onChange={v => sv('chargeDay', v)} hasError={e('chargeDay')} />
            </F>
          ) : (
            <F label={isIncome ? 'תאריך צפוי (אופציונלי)' : 'תאריך'} name="date" errors={errors}>
              <MiniCalendar value={fv('date')} onChange={v => sv('date', v)} hasError={e('date')} />
            </F>
          )}
          <F label={isIncome ? 'חשבון יעד' : 'חשבון מקור'} name="accountId" errors={errors}>
            <Sel value={fv('accountId')} onChange={ev => sv('accountId', ev.target.value)}>
              <option value="">לא מקושר</option>
              {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Sel>
          </F>
          {isMonthly && !isIncome && (
            <F label="חשבון יעד — יזדכה בביצוע (אופציונלי)" name="destAccountId" errors={errors}>
              <Sel value={fv('destAccountId')} onChange={ev => sv('destAccountId', ev.target.value)}>
                <option value="">ללא</option>
                <optgroup label="חשבונות בנק">
                  {ilsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
                <optgroup label="השקעות">
                  {investments.map(i => <option key={i.id} value={`inv:${i.id}`}>{i.name}</option>)}
                </optgroup>
              </Sel>
            </F>
          )}
        </>)
      }

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

      case 'reminder': {
        const isMonthly = fv('reminderType') === 'monthly'
        return (<>
          <div className="flex gap-2 mb-4">
            {['once', 'monthly'].map(t => (
              <button
                key={t}
                onClick={() => sv('reminderType', t)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  (fv('reminderType') || 'once') === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {t === 'once' ? 'חד פעמית' : 'חודשית חוזרת'}
              </button>
            ))}
          </div>
          {isMonthly ? (
            <F label="תזכורת" name="invId" errors={errors}>
              <Sel value={fv('invId')} onChange={ev => sv('invId', ev.target.value)} style={!fv('invId') ? {color:'#9ca3af'} : {}}>
                <option value="" disabled hidden>תזכורת</option>
                {investments.map(i => <option key={i.id} value={i.id} style={{color:'#111827'}}>עדכון סכום {i.name}</option>)}
                <option value="__other__" style={{color:'#111827'}}>אחר</option>
              </Sel>
            </F>
          ) : (
            <F label="תזכורת" name="text" errors={errors}>
              <Inp err={e('text')} value={fv('text')} onChange={ev => sv('text', ev.target.value)} />
            </F>
          )}
          {isMonthly && fv('invId') === '__other__' && (
            <F label="תוכן התזכורת" name="text" errors={errors}>
              <Inp err={e('text')} value={fv('text')} onChange={ev => sv('text', ev.target.value)} />
            </F>
          )}
          {isMonthly ? (
            <F label="יום בחודש" name="day" errors={errors}>
              <DayOfMonthPicker value={fv('day')} onChange={v => sv('day', v)} hasError={e('day')} />
            </F>
          ) : (
            <F label="תאריך" name="date" errors={errors}>
              <MiniCalendar value={fv('date')} onChange={v => sv('date', v)} hasError={e('date')} />
            </F>
          )}
          {isMonthly && (
            <F label="הערה" name="text" errors={errors}>
              <Inp err={e('text')} value={fv('text')} onChange={ev => sv('text', ev.target.value)} />
            </F>
          )}
        </>)
      }

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
          {editTarget?.item && (
            <F label="יום חיוב בחודש" name="chargeDay" errors={errors}>
              <DayOfMonthPicker value={fv('chargeDay')} onChange={v => sv('chargeDay', v)} />
            </F>
          )}
        </>)
      }

      case 'update_investment': {
        const selInv   = investments.find(i => i.id === fv('invId'))
        const isFx     = selInv?.currency === 'EUR' || selInv?.currency === 'USD'
        const symbol   = selInv?.currency === 'EUR' ? '€' : selInv?.currency === 'USD' ? '$' : '₪'
        const curVal   = selInv ? (isFx ? selInv.originalAmount : selInv.value) : null
        return (<>
          <F label="השקעה" name="invId" errors={errors}>
            <Sel err={e('invId')} value={fv('invId')} onChange={ev => { sv('invId', ev.target.value); sv('newValue', '') }}>
              <option value="">בחר</option>
              {investments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Sel>
          </F>
          {selInv && curVal != null && (
            <p className="text-xs text-gray-400 -mt-2 mb-4">שווי נוכחי: {symbol}{Number(curVal).toLocaleString()}</p>
          )}
          <F label={`שווי עדכני (${symbol})`} name="newValue" errors={errors}>
            <Inp err={e('newValue')} type="number" value={fv('newValue')} onChange={ev => sv('newValue', ev.target.value)} />
          </F>
        </>)
      }

      default: return null
    }
  }

  const action = ACTIONS.find(a => a.id === step)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40"
      style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
      onMouseDown={ev => { pressStartedOnBackdropRef.current = ev.target === ev.currentTarget }}
      onMouseUp={ev => {
        if (pressStartedOnBackdropRef.current && ev.target === ev.currentTarget) onClose()
        pressStartedOnBackdropRef.current = false
      }}
      onTouchStart={ev => { pressStartedOnBackdropRef.current = ev.target === ev.currentTarget }}
      onTouchEnd={ev => {
        if (pressStartedOnBackdropRef.current && ev.target === ev.currentTarget) onClose()
        pressStartedOnBackdropRef.current = false
      }}
    >
      <div
        className="bg-white w-full max-w-md rounded-3xl mx-4 scroll-right"
        style={{ maxHeight: '88vh', overflowY: 'auto', animation: 'modalPopIn 0.35s cubic-bezier(.22,1,.36,1)' }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (step === 'pick' || step === 'edit_income' || step === 'new_project') return
          const tag = e.target?.tagName
          if (tag === 'TEXTAREA' && !e.shiftKey) return
          e.preventDefault()
          handleSave()
        }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          {step !== 'pick' && !editTarget
            ? <button onClick={() => { setStep('pick'); setForm({}); setErrors([]) }} className="text-blue-500 text-sm font-medium">חזרה</button>
            : <span className="w-12" />
          }
          <span className="font-bold text-gray-800 text-base">
            {step === 'pick' ? '＋ הוסף נתון' : editTarget ? '✏️ עריכה' : action?.label}
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
              {step !== 'edit_income' && step !== 'new_project' && (
                <button
                  onClick={handleSave}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm mt-4 transition-all duration-200 ${
                    saved ? 'bg-green-500 text-white scale-95' : 'bg-blue-600 text-white active:opacity-80'
                  }`}
                >
                  {saved ? '✓ נשמר!' : 'שמור'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Permanent vs one-time prompt */}
      {permPrompt && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-40"
          style={{ animation: 'modalBackdropIn 0.15s ease-out' }}
          onClick={() => setPermPrompt(null)}
        >
          <div
            className="bg-white rounded-2xl w-[85%] max-w-sm shadow-xl p-5"
            style={{ animation: 'modalPopIn 0.35s cubic-bezier(.22,1,.36,1)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-800 text-base text-center mb-1">שינוי סכום</h3>
            <p className="text-center text-xs text-gray-500 mb-4">{permPrompt.name}</p>
            <div className="space-y-2">
              <button
                onClick={() => { setPermPrompt(null); permPrompt.applyPermanent() }}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm"
              >
                🔒 שינוי קבוע
              </button>
              <button
                onClick={() => { setPermPrompt(null); permPrompt.applyOneTime() }}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
              >
                📅 חד-פעמי (החודש בלבד)
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3">קבוע = ישנה את הסכום מעכשיו והלאה. חד-פעמי = רק החודש הנוכחי.</p>
          </div>
        </div>
      )}
    </div>
  )
}
