import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import { analyzeLoanDoc } from '../lib/analyzeLoanDoc'
import { uploadDocument, deleteDocument } from '../lib/supabase'
import Modal, { Field, Input, Select, Textarea, SaveButton, DeleteButton } from '../components/Modal'
import { formatILS, calcEndDate, calcRemainingMonths, calcLoanProgress, formatDate } from '../utils/formatters'
import { calcRemainingBalance } from '../utils/calculations'

// מחזיר את הסכום מלוח הסילוקין לחודש הקרוב, או monthlyPayment כ-fallback
function getCurrentPayment(loan) {
  if (!loan.paymentSchedule?.length) return loan.monthlyPayment || 0
  const todayStr = new Date().toISOString().split('T')[0]
  const next = loan.paymentSchedule.find(p => p.date && p.date > todayStr)
  if (next) return next.amount
  // אם אין תשלום עתידי, הלוואה הסתיימה
  return loan.monthlyPayment || 0
}

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

function nextChargeDate(chargeDay) {
  const now = new Date(); now.setHours(0,0,0,0)
  const d = new Date(now.getFullYear(), now.getMonth(), chargeDay)
  if (d <= now) d.setMonth(d.getMonth() + 1)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

const EMPTY_LOAN = {
  name: '', totalAmount: '', monthlyPayment: '', chargeDay: '',
  durationMonths: '', interestRate: '', interestType: 'fixed',
  startDate: '', owner: 'משותף', type: 'loan', balanceOverride: '',
  creditAccountId: null, accountId: null,
}

export default function LoansPage() {
  const { loans, accounts, addLoan, updateLoan, deleteLoan } = useStore()
  const [modal, setModal] = useState(null) // null | 'add' | { loan }
  const [form, setForm]   = useState(EMPTY_LOAN)
  const [analyzing, setAnalyzing] = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const fileInputRef = useRef(null)

  const mortgageMonthly = loans.filter(l => l.type === 'mortgage').reduce((s, l) => s + getCurrentPayment(l), 0)
  const myMonthly      = loans.filter(l => !l.paidByFriend && l.type !== 'mortgage').reduce((s, l) => s + getCurrentPayment(l), 0)
  const friendMonthly  = loans.filter(l =>  l.paidByFriend).reduce((s, l) => s + getCurrentPayment(l), 0)
  const myTotalBalance = loans.filter(l => !l.paidByFriend && l.type !== 'mortgage').reduce((s, l) => {
    const { balance } = calcRemainingBalance(l)
    return s + (balance ?? l.balanceOverride ?? l.totalAmount ?? 0)
  }, 0)

  const openAdd = () => {
    setForm(EMPTY_LOAN)
    setModal('add')
  }

  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (location.state?.openAdd) {
      openAdd()
      navigate('/loans', { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openAdd])
  const openEdit = (loan) => {
    setForm({ ...loan, startDate: loan.startDate || '', balanceOverride: loan.balanceOverride ?? '', documents: loan.documents || [] })
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
  const readFileAsDataURL = (file) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(file)
  })
  const handleFile = async (file) => {
    if (!file) return
    setAnalyzing(true)
    try {
      // ניסיון העלאה לאחסון סופאבייס — אם נכשל, שומר מקומית
      const loanId = modal?.loan?.id || 'new_' + Date.now()
      let doc
      try {
        const url = await uploadDocument(file, loanId)
        doc = { name: file.name, type: file.type, url, uploadedAt: new Date().toISOString().split('T')[0] }
      } catch (uploadErr) {
        console.warn('[Upload] נכשל, שומר מקומית:', uploadErr)
        const dataURL = await readFileAsDataURL(file)
        doc = { name: file.name, type: file.type, dataURL, uploadedAt: new Date().toISOString().split('T')[0] }
      }
      setForm(prev => ({ ...prev, documents: [...(prev.documents || []), doc] }))

      const result = await analyzeLoanDoc(file)
      if (result.error) { alert(result.error); return }
      // הצג סיכום של מה שה-AI חילץ
      if (result.paymentSchedule?.length) {
        const s = result.paymentSchedule
        const first = s[0]?.amount, last = s[s.length - 1]?.amount
        const common = s.length > 2 ? s[1]?.amount : first
        alert(`לוח סילוקין: ${s.length} תשלומים\nראשון: ₪${first}\nקבוע: ₪${common}\nאחרון: ₪${last}`)
      }
      setForm(prev => ({
        ...prev,
        ...(result.name && !prev.name ? { name: result.name } : {}),
        ...(result.totalAmount   ? { totalAmount: result.totalAmount } : {}),
        ...(result.monthlyPayment? { monthlyPayment: result.monthlyPayment } : {}),
        ...(result.chargeDay     ? { chargeDay: result.chargeDay } : {}),
        ...(result.durationMonths? { durationMonths: result.durationMonths } : {}),
        ...(result.interestRate  ? { interestRate: result.interestRate } : {}),
        ...(result.interestType  ? { interestType: result.interestType } : {}),
        ...(result.startDate     ? { startDate: result.startDate } : {}),
        ...(result.balanceOverride ? { balanceOverride: result.balanceOverride } : {}),
        ...(result.paymentSchedule?.length ? { paymentSchedule: result.paymentSchedule } : {}),
      }))
    } catch (err) {
      alert('שגיאה בניתוח המסמך')
    } finally {
      setAnalyzing(false)
    }
  }

  const remove = () => {
    const loan = modal.loan
    // If the loan was originally created with a credit to an account, offer to reverse it
    let reverseCredit = false
    if (loan && loan.creditAccountId && loan.totalAmount) {
      const acc = accounts.find(a => a.id === loan.creditAccountId)
      const accName = acc?.name || 'חשבון'
      reverseCredit = window.confirm(`למחוק את ההלוואה ולהחזיר את הזיכוי המקורי מ-${accName} (${loan.totalAmount.toLocaleString('he')})?\n\nאישור = גם להחזיר את הזיכוי\nביטול = רק למחוק את ההלוואה`)
    }
    deleteLoan(loan.id, { reverseCredit })
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
                {formatILS(loans.filter(l => l.type === 'mortgage').reduce((s, l) => s + getCurrentPayment(l), 0))} / חודש
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
              {myTotalBalance > 0 && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">יתרה: {formatILS(myTotalBalance)}</span>}
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
          {/* Drop zone for document upload */}
          <div
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors mb-3 ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }} />
            {analyzing
              ? <p className="text-sm text-blue-600 font-medium">מנתח מסמך...</p>
              : <>
                  <p className="text-sm text-gray-500 font-medium">📄 גרור לוח סילוקין / תמונה לכאן</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, תמונה — הנתונים ימולאו אוטומטית</p>
                </>
            }
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <Field label="חשבון שזוכה בסכום" hint="לאן נכנס כסף ההלוואה">
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.creditAccountId || ''} onChange={e => set('creditAccountId', e.target.value || null)}>
                <option value="">לא נבחר</option>
                {accounts.filter(a => (a.currency || 'ILS') === 'ILS').map(a => <option key={a.id} value={a.id}>{a.name} (₪{(a.balance||0).toLocaleString()})</option>)}
              </select>
            </Field>
            <Field label="חשבון חיוב חודשי" hint="מאיפה יורד התשלום">
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.accountId || ''} onChange={e => set('accountId', e.target.value || null)}>
                <option value="">לא נבחר</option>
                {accounts.filter(a => (a.currency || 'ILS') === 'ILS').map(a => <option key={a.id} value={a.id}>{a.name} (₪{(a.balance||0).toLocaleString()})</option>)}
              </select>
            </Field>
          </div>

          {/* Saved documents */}
          {(form.documents || []).length > 0 && (
            <div className="mt-2 mb-1">
              <p className="text-xs font-medium text-gray-500 mb-1.5">📎 מסמכים ({form.documents.length})</p>
              <div className="space-y-1.5">
                {form.documents.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm">{doc.type?.includes('pdf') ? '📄' : '🖼️'}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.uploadedAt}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <a href={doc.url || doc.dataURL} target="_blank" rel="noopener noreferrer" download={doc.name} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-medium inline-block">פתח</a>
                      <button type="button" onClick={() => { deleteDocument(doc.url); setForm(f => ({ ...f, documents: f.documents.filter((_, j) => j !== i) })) }} className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-lg font-medium">מחק</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
  const progress  = calcLoanProgress(loan.startDate, loan.durationMonths, loan.paymentSchedule)
  const remaining = calcRemainingMonths(loan.startDate, loan.durationMonths, loan.paymentSchedule)
  const endDate   = calcEndDate(loan.startDate, loan.durationMonths, loan.paymentSchedule)
  const { balance, missing, isOverride, fromSchedule } = calcRemainingBalance(loan)
  const hasMissing = missing && missing.length > 0
  const payment = getCurrentPayment(loan)

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
            <p className={`${theme.sub} text-xs`}>{loan.owner}{loan.chargeDay ? ` · חיוב הבא: ${nextChargeDate(loan.chargeDay)}` : ''}</p>
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-lg leading-tight">{formatILS(payment)}</p>
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
            {loan.chargeDay && <span className="text-xs bg-purple-100 text-purple-400 px-2 py-0.5 rounded-full">חיוב: {nextChargeDate(loan.chargeDay)}</span>}
            {loan.interestRate > 0 && <span className="text-xs bg-purple-100 text-purple-400 px-2 py-0.5 rounded-full">{loan.interestRate}%</span>}
          </div>
        </div>
        <div className="text-left mr-2 shrink-0">
          <p className="font-bold text-purple-500">{formatILS(payment)}</p>
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
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">חיוב: {nextChargeDate(loan.chargeDay)}</span>
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
            <p className="font-bold text-red-500">{formatILS(payment)}</p>
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
