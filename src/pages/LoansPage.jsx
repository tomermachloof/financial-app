import { useState } from 'react'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton, DeleteButton } from '../components/Modal'
import { formatILS, calcEndDate, calcRemainingMonths, calcLoanProgress, formatDate } from '../utils/formatters'
import { calcRemainingBalance } from '../utils/calculations'

const OWNER_OPTIONS = [
  { value: 'משותף', label: 'משותף' },
  { value: 'תומר',  label: 'תומר'  },
  { value: 'יעל',   label: 'יעל'   },
]
const TYPE_OPTIONS = [
  { value: 'loan',     label: 'הלוואה'    },
  { value: 'mortgage', label: 'משכנתא'   },
  { value: 'tax',      label: 'מס'        },
]
const INTEREST_OPTIONS = [
  { value: 'fixed',    label: 'קבועה'       },
  { value: 'prime+0.5',label: 'פריים +0.5%' },
  { value: 'prime-0.5',label: 'פריים -0.5%' },
  { value: 'prime-0.7',label: 'פריים -0.7%' },
]

const EMPTY_LOAN = {
  name: '', totalAmount: '', monthlyPayment: '', chargeDay: '',
  durationMonths: '', interestRate: '', interestType: 'fixed',
  startDate: '', owner: 'משותף', type: 'loan', balanceOverride: '',
}

export default function LoansPage() {
  const { loans, addLoan, updateLoan, deleteLoan } = useStore()
  const [modal, setModal] = useState(null) // null | 'add' | { loan }
  const [form, setForm]   = useState(EMPTY_LOAN)

  const mortgageMonthly = loans.filter(l => l.type === 'mortgage').reduce((s, l) => s + (l.monthlyPayment || 0), 0)
  const myMonthly      = loans.filter(l => !l.paidByFriend && l.type !== 'mortgage').reduce((s, l) => s + (l.monthlyPayment || 0), 0)
  const friendMonthly  = loans.filter(l =>  l.paidByFriend).reduce((s, l) => s + (l.monthlyPayment || 0), 0)

  const openAdd = () => {
    setForm(EMPTY_LOAN)
    setModal('add')
  }
  const openEdit = (loan) => {
    setForm({ ...loan, startDate: loan.startDate || '', balanceOverride: loan.balanceOverride ?? '' })
    setModal({ loan })
  }
  const closeModal = () => setModal(null)

  const save = () => {
    const data = {
      ...form,
      totalAmount:     form.totalAmount     === '' ? null : Number(form.totalAmount),
      monthlyPayment:  form.monthlyPayment  === '' ? null : Number(form.monthlyPayment),
      chargeDay:       form.chargeDay       === '' ? null : Number(form.chargeDay),
      durationMonths:  form.durationMonths  === '' ? null : Number(form.durationMonths),
      interestRate:    form.interestRate    === '' ? null : Number(form.interestRate),
      startDate:       form.startDate       || null,
      balanceOverride: form.balanceOverride === '' ? null : Number(form.balanceOverride),
    }
    if (modal === 'add') addLoan(data)
    else updateLoan(modal.loan.id, data)
    closeModal()
  }
  const remove = () => {
    deleteLoan(modal.loan.id)
    closeModal()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="page-content">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">הלוואות ומשכנתאות שלי</h1>
          <button onClick={openAdd} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
            + הוסף
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          סה״כ חודשי: <span className="font-bold text-red-500">{formatILS(mortgageMonthly + myMonthly)}</span>
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* משכנתאות */}
        {loans.filter(l => l.type === 'mortgage').length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🏠</span>
              <p className="text-sm font-bold text-gray-700">משכנתאות</p>
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                {formatILS(loans.filter(l => l.type === 'mortgage').reduce((s, l) => s + (l.monthlyPayment || 0), 0))} / חודש
              </span>
            </div>
            <div className="space-y-3">
              {loans.filter(l => l.type === 'mortgage').map(loan => (
                <LoanCard key={loan.id} loan={loan} onEdit={() => openEdit(loan)} isMortgage />
              ))}
            </div>
          </div>
        )}

        {/* הלוואות שלי */}
        {loans.filter(l => l.type !== 'mortgage' && !l.paidByFriend).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">💸</span>
              <p className="text-sm font-bold text-gray-700">הלוואות שלי</p>
              <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-semibold">
                {formatILS(myMonthly)} / חודש
              </span>
            </div>
            <div className="space-y-3">
              {loans.filter(l => l.type !== 'mortgage' && !l.paidByFriend).map(loan => (
                <LoanCard key={loan.id} loan={loan} onEdit={() => openEdit(loan)} />
              ))}
            </div>
          </div>
        )}

        {/* הלוואות אליעזר */}
        {loans.filter(l => l.paidByFriend).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">👤</span>
              <p className="text-sm font-bold text-gray-700">הלוואות אליעזר</p>
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
                {formatILS(friendMonthly)} / חודש
              </span>
            </div>
            <div className="space-y-3">
              {loans.filter(l => l.paidByFriend).map(loan => (
                <LoanCard key={loan.id} loan={loan} onEdit={() => openEdit(loan)} />
              ))}
            </div>
          </div>
        )}

        {loans.length === 0 && (
          <div className="card p-8 text-center text-gray-400">
            <p className="text-2xl mb-2">💳</p>
            <p className="text-sm">אין הלוואות — הוסף ראשונה</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <Modal title={modal === 'add' ? 'הלוואה חדשה' : 'עריכת הלוואה'} onClose={closeModal}>
          <Field label="שם"><Input value={form.name} onChange={v => set('name', v)} placeholder="שם ההלוואה" /></Field>
          <Field label="בעלים"><Select value={form.owner} onChange={v => set('owner', v)} options={OWNER_OPTIONS} /></Field>
          <Field label="סוג"><Select value={form.type} onChange={v => set('type', v)} options={TYPE_OPTIONS} /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="סכום הלוואה (₪)">
              <Input type="number" value={form.totalAmount} onChange={v => set('totalAmount', v)} placeholder="0" />
            </Field>
            <Field label="תשלום חודשי (₪)">
              <Input type="number" value={form.monthlyPayment} onChange={v => set('monthlyPayment', v)} placeholder="0" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="יום חיוב בחודש" hint="1–31">
              <Input type="number" value={form.chargeDay} onChange={v => set('chargeDay', v)} placeholder="15" min={1} />
            </Field>
            <Field label="מספר חודשים">
              <Input type="number" value={form.durationMonths} onChange={v => set('durationMonths', v)} placeholder="36" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ריבית שנתית (%)">
              <Input type="number" value={form.interestRate} onChange={v => set('interestRate', v)} placeholder="5.5" step={0.1} />
            </Field>
            <Field label="סוג ריבית">
              <Select value={form.interestType} onChange={v => set('interestType', v)} options={INTEREST_OPTIONS} />
            </Field>
          </div>

          <Field label="תאריך תחילת הלוואה" hint="נדרש לחישוב מתי ההלוואה מסתיימת">
            <Input type="date" value={form.startDate} onChange={v => set('startDate', v)} />
          </Field>

          <Field label="יתרה ידועה (₪)" hint="אם ידועה מדוח בנק — מחליפה את החישוב האוטומטי">
            <Input type="number" value={form.balanceOverride ?? ''} onChange={v => set('balanceOverride', v)} placeholder="השאר ריק לחישוב אוטומטי" />
          </Field>

          <SaveButton onClick={save} />
          {modal !== 'add' && <DeleteButton onClick={remove} />}
        </Modal>
      )}
    </div>
  )
}

const LOAN_LABEL = {
  mortgage: '🏠 משכנתא',
  loan:     '💸 הלוואה',
  usd:      '💵 הלוואה $',
}


function LoanCard({ loan, onEdit, isMortgage }) {
  const progress  = calcLoanProgress(loan.startDate, loan.durationMonths)
  const remaining = calcRemainingMonths(loan.startDate, loan.durationMonths)
  const endDate   = calcEndDate(loan.startDate, loan.durationMonths)
  const { balance, missing, isOverride } = calcRemainingBalance(loan)
  const hasMissing = missing && missing.length > 0

  if (isMortgage) {
    const isLeumi = loan.accountId === 'ba6' || (loan.note || '').includes('לאומי')
    const theme = isLeumi
      ? { border: 'border-sky-200', grad: 'from-sky-500 to-sky-400', sub: 'text-sky-100', body: 'bg-sky-50', warn: 'bg-sky-100', warnText: 'text-sky-600', warnSub: 'text-sky-400', bal: 'text-sky-700', meta: 'text-sky-400', bar: 'bg-sky-200', barFill: 'bg-sky-500' }
      : { border: 'border-orange-100', grad: 'from-orange-500 to-orange-400', sub: 'text-orange-100', body: 'bg-orange-50', warn: 'bg-orange-100', warnText: 'text-orange-600', warnSub: 'text-orange-400', bal: 'text-orange-700', meta: 'text-orange-400', bar: 'bg-orange-200', barFill: 'bg-orange-500' }

    return (
      <div className={`rounded-2xl overflow-hidden cursor-pointer shadow-sm border ${theme.border}`} onClick={onEdit}>
        <div className={`bg-gradient-to-l ${theme.grad} px-4 py-3 flex items-center justify-between`}>
          <div>
            <p className="text-white font-bold text-base leading-tight">{loan.name}</p>
            <p className={`${theme.sub} text-xs`}>{loan.owner}{loan.chargeDay ? ` · ב-${loan.chargeDay} לחודש` : ''}</p>
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-lg leading-tight">{formatILS(loan.monthlyPayment)}</p>
            <p className={`${theme.sub} text-xs`}>לחודש</p>
          </div>
        </div>
        <div className={`${theme.body} px-4 py-3`}>
          {hasMissing && !balance ? (
            <div className={`flex items-start gap-2 ${theme.warn} rounded-xl px-3 py-2`}>
              <span className="text-sm">⚠️</span>
              <div>
                <p className={`text-xs font-medium ${theme.warnText}`}>חסר מידע לחישוב יתרה</p>
                <p className={`text-xs ${theme.warnSub}`}>{missing.join(' · ')}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs ${theme.meta}`}>{isOverride ? 'יתרה ידועה' : 'יתרה משוערת'}</p>
                <p className={`text-xl font-bold ${theme.bal}`}>{formatILS(balance)}</p>
              </div>
              {remaining !== null && (
                <div className="text-left">
                  <p className={`text-xs ${theme.meta}`}>נותרו</p>
                  <p className={`text-sm font-bold ${theme.bal}`}>{remaining} חודשים</p>
                  {endDate && <p className={`text-xs ${theme.meta}`}>{formatDate(endDate)}</p>}
                </div>
              )}
            </div>
          )}
          {!hasMissing && !isOverride && loan.startDate && (
            <div className="mt-2">
              <div className={`${theme.bar} rounded-full h-1.5`}>
                <div className={`${theme.barFill} h-1.5 rounded-full`} style={{ width: `${progress}%` }} />
              </div>
              <p className={`text-xs ${theme.meta} mt-1`}>{progress}% שולם מתוך {formatILS(loan.totalAmount)}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const isFriend = loan.paidByFriend

  if (isFriend) return (
    <div className="rounded-2xl overflow-hidden cursor-pointer border border-purple-100 border-r-4 border-r-purple-300 bg-purple-50" onClick={onEdit}>
      <div className="px-4 py-3 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-slate-400">{loan.owner}</span>
            <span className="text-xs bg-purple-100 text-purple-500 px-2 py-0.5 rounded-full">👤 {loan.friendName}</span>
          </div>
          <h3 className="font-semibold text-gray-800">{loan.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {loan.chargeDay && <span className="text-xs bg-purple-100 text-purple-400 px-2 py-0.5 rounded-full">ב-{loan.chargeDay} לחודש</span>}
            {loan.interestRate > 0 && <span className="text-xs bg-purple-100 text-purple-400 px-2 py-0.5 rounded-full">{loan.interestRate}%</span>}
          </div>
        </div>
        <div className="text-left mr-2 shrink-0">
          <p className="font-bold text-purple-500">{formatILS(loan.monthlyPayment)}</p>
          <p className="text-xs text-purple-300">לחודש</p>
        </div>
      </div>
      <div className="px-4 pb-3 border-t border-purple-100 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-purple-300">{isOverride ? 'יתרה ידועה' : 'יתרה משוערת'}</p>
            <p className="text-base font-bold text-purple-600">{formatILS(balance)}</p>
          </div>
          {remaining !== null && (
            <div className="text-left">
              <p className="text-xs text-purple-300">נותרו</p>
              <p className="text-sm font-semibold text-purple-500">{remaining} חודשים</p>
              {endDate && <p className="text-xs text-purple-300">{formatDate(endDate)}</p>}
            </div>
          )}
        </div>
        {loan.startDate && loan.durationMonths && progress !== null && (
          <div className="mt-2">
            <div className="bg-purple-100 rounded-full h-1.5">
              <div className="bg-purple-300 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-purple-300 mt-1">{progress}% שולם מתוך {formatILS(loan.totalAmount)}</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 cursor-pointer" onClick={onEdit}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-gray-400">{loan.owner}</span>
          </div>
          <h3 className="font-semibold text-gray-800">{loan.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {loan.chargeDay && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">ב-{loan.chargeDay} לחודש</span>
            )}
            {loan.interestRate > 0 && (
              <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">{loan.interestRate}%</span>
            )}
          </div>
        </div>
        <div className="text-left mr-2 shrink-0">
          {loan.currency === 'USD' ? (
            <p className="font-bold text-red-500">${loan.monthlyPayment}/mo</p>
          ) : (
            <p className="font-bold text-red-500">{formatILS(loan.monthlyPayment)}</p>
          )}
          <p className="text-xs text-gray-400 text-left">לחודש</p>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100">
        {hasMissing && !balance ? (
          <div className="flex items-start gap-2 bg-orange-50 rounded-xl px-3 py-2">
            <span className="text-sm">⚠️</span>
            <div>
              <p className="text-xs font-medium text-orange-600">חסר מידע לחישוב יתרה</p>
              <p className="text-xs text-orange-400">{missing.join(' · ')}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-gray-400">{isOverride ? 'יתרה ידועה' : 'יתרה משוערת'}</p>
                {isOverride && <span className="text-[10px] bg-blue-100 text-blue-500 px-1.5 py-0.5 rounded-full">עדכני</span>}
              </div>
              <p className="text-base font-bold text-gray-800">
                {loan.currency === 'USD' ? `$${balance?.toFixed(2)}` : formatILS(balance)}
              </p>
            </div>
            {remaining !== null && (
              <div className="text-left">
                <p className="text-xs text-gray-400">נותרו</p>
                <p className="text-sm font-semibold text-gray-600">{remaining} חודשים</p>
                {endDate && <p className="text-xs text-gray-400">{formatDate(endDate)}</p>}
              </div>
            )}
          </div>
        )}
        {loan.startDate && loan.durationMonths && progress !== null && (
          <div className="mt-2">
            <div className="bg-gray-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{progress}% שולם מתוך {formatILS(loan.totalAmount)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
