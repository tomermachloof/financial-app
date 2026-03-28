import { useState } from 'react'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton, DeleteButton } from '../components/Modal'
import { formatILS, formatDate, daysUntil, urgencyClass } from '../utils/formatters'
import { calcTotalLiquidity } from '../utils/calculations'

// ─── Account Modal ────────────────────────────────────────────────────────
const BANK_OPTIONS = [
  { value: 'פועלים',   label: 'פועלים'    },
  { value: 'לאומי',    label: 'לאומי'     },
  { value: 'דיסקונט', label: 'דיסקונט'   },
  { value: 'מזרחי',   label: 'מזרחי'     },
  { value: 'בינלאומי', label: 'בינלאומי' },
  { value: 'אחר',      label: 'אחר'       },
]
const OWNER_OPTIONS = [
  { value: 'תומר',   label: 'תומר'   },
  { value: 'יעל',    label: 'יעל'    },
  { value: 'משותף',  label: 'משותף'  },
]
const INV_TYPE_OPTIONS = [
  { value: 'investment', label: 'תיק השקעות' },
  { value: 'pension',    label: 'פנסיה / גמל' },
  { value: 'savings',    label: 'קרן השתלמות' },
  { value: 'deposit',    label: 'פקדון'        },
  { value: 'cash',       label: 'מזומן'        },
]
const DEBT_TYPE_OPTIONS = [
  { value: 'owed_to_us', label: 'חייבים לנו'  },
  { value: 'we_owe',     label: 'אנחנו חייבים' },
]


const BANK_META = {
  'פועלים':   { card: 'border-r-[6px] border-red-500    bg-red-50',    header: 'bg-red-500',    text: 'text-white' },
  'לאומי':    { card: 'border-r-[6px] border-sky-500    bg-sky-50',    header: 'bg-sky-500',    text: 'text-white' },
  'בינלאומי': { card: 'border-r-[6px] border-blue-800   bg-blue-50',   header: 'bg-blue-800',   text: 'text-white' },
  'מזרחי':    { card: 'border-r-[6px] border-orange-500 bg-orange-50', header: 'bg-orange-500', text: 'text-white' },
  'דיסקונט':  { card: 'border-r-[6px] border-green-600  bg-green-50',  header: 'bg-green-600',  text: 'text-white' },
  'Chase':    { card: 'border-r-[6px] border-sky-400    bg-sky-50',    header: 'bg-sky-400',    text: 'text-white' },
}

export default function AccountsPage() {
  const {
    accounts,    addAccount,    updateAccount,    deleteAccount,
    investments, addInvestment, updateInvestment, deleteInvestment,
    debts,       addDebt,       updateDebt,       deleteDebt,
    eurRate, usdRate,
  } = useStore()

  const [section, setSection] = useState('accounts') // accounts | investments | debts
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState({})

  const liquidity    = calcTotalLiquidity(accounts, usdRate)
  const ilsLiquidity = accounts.filter(a => a.currency !== 'USD').reduce((s, a) => s + (a.balance || 0), 0)
  const usdLiquidity = accounts.filter(a => a.currency === 'USD').reduce((s, a) => s + (a.usdBalance || 0), 0)
  const invILS = (i) => {
    if (i.currency === 'EUR') return (i.originalAmount || 0) * eurRate
    if (i.currency === 'USD') return (i.originalAmount || 0) * usdRate
    return i.value || 0
  }
  const totalSavings = investments.reduce((s, i) => s + invILS(i), 0)
  const debtILS = (d) => {
    if (d.currency === 'EUR') return (d.originalAmount || 0) * eurRate
    if (d.currency === 'USD') return (d.originalAmount || 0) * usdRate
    return d.amount || 0
  }
  const owedToUsTotal = debts.filter(d => d.type === 'owed_to_us').reduce((s, d) => s + debtILS(d), 0)
  const weOweTotal    = debts.filter(d => d.type === 'we_owe').reduce((s, d) => s + debtILS(d), 0)
  const debtsNet      = owedToUsTotal - weOweTotal

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Account handlers ──
  const openAddAccount = () => {
    setForm({ name: '', bank: 'פועלים', balance: '', owner: 'תומר', type: 'checking' })
    setModal({ type: 'account', mode: 'add' })
  }
  const openEditAccount = (acc) => {
    setForm({ ...acc, usdBalance: acc.usdBalance != null ? Math.round(acc.usdBalance * 100) / 100 : acc.usdBalance })
    setModal({ type: 'account', mode: 'edit', id: acc.id })
  }
  const saveAccount = () => {
    const data = {
      ...form,
      balance:    form.balance    === '' ? 0 : Number(form.balance),
      usdBalance: form.usdBalance === '' ? 0 : Number(form.usdBalance),
    }
    if (modal.mode === 'add') addAccount(data)
    else updateAccount(modal.id, data)
    setModal(null)
  }

  // ── Investment handlers ──
  const openAddInv = () => {
    setForm({ name: '', value: '', type: 'investment', owner: 'משותף' })
    setModal({ type: 'inv', mode: 'add' })
  }
  const openEditInv = (inv) => {
    setForm({ ...inv })
    setModal({ type: 'inv', mode: 'edit', id: inv.id })
  }
  const saveInv = () => {
    const data = { ...form, value: form.value === '' ? 0 : Number(form.value) }
    if (modal.mode === 'add') addInvestment(data)
    else updateInvestment(modal.id, data)
    setModal(null)
  }

  // ── Debt handlers ──
  const openAddDebt = () => {
    setForm({ name: '', amount: '', type: 'owed_to_us', expectedDate: '', notes: '' })
    setModal({ type: 'debt', mode: 'add' })
  }
  const openEditDebt = (debt) => {
    setForm({ ...debt, expectedDate: debt.expectedDate || '' })
    setModal({ type: 'debt', mode: 'edit', id: debt.id })
  }
  const saveDebt = () => {
    const data = { ...form, amount: form.amount === '' ? 0 : Number(form.amount), expectedDate: form.expectedDate || null }
    if (modal.mode === 'add') addDebt(data)
    else updateDebt(modal.id, data)
    setModal(null)
  }
  const removeDebt = () => { deleteDebt(modal.id); setModal(null) }
  const removeAccount = () => { deleteAccount(modal.id); setModal(null) }
  const removeInv = () => { deleteInvestment(modal.id); setModal(null) }

  const owedToUs = debts.filter(d => d.type === 'owed_to_us')
  const weOwe    = debts.filter(d => d.type === 'we_owe')

  return (
    <div className="page-content">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800 mb-3">חשבונות ונכסים</h1>

        {/* 3 accurate summary cards */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-blue-50 rounded-2xl p-3 text-center">
            <p className="text-xs text-blue-400 mb-1">₪ נזיל</p>
            <p className="font-bold text-blue-700 text-sm leading-tight">{formatILS(ilsLiquidity)}</p>
            <div className="w-full h-px bg-blue-100 my-1" />
            <div className="bg-green-100 rounded-lg px-1 py-0.5">
              <p className="font-semibold text-green-700 text-xs">${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(usdLiquidity)}</p>
            </div>
          </div>
          <div className="bg-green-50 rounded-2xl p-3 text-center">
            <p className="text-xs text-green-500 mb-1">📈 חיסכון</p>
            <p className="font-bold text-green-700 text-sm leading-tight">{formatILS(totalSavings)}</p>
            <p className="text-xs text-green-300 mt-0.5">קרנות והשקעות</p>
          </div>
          <div className={`rounded-2xl p-3 text-center ${debtsNet >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className={`text-xs mb-1 ${debtsNet >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>🤝 חובות</p>
            <p className={`font-bold text-sm leading-tight ${debtsNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {debtsNet >= 0 ? '+' : ''}{formatILS(debtsNet)}
            </p>
            <p className={`text-xs mt-0.5 ${debtsNet >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>נטו</p>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2">
          {[['accounts','🏦 בנק'],['investments','📈 השקעות'],['debts','🤝 חובות']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSection(val)}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors
                ${section === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {/* ── Accounts section ── */}
        {section === 'accounts' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                נזילות: <span className="font-bold text-gray-800">{formatILS(liquidity)}</span>
              </p>
              <button onClick={openAddAccount} className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                + הוסף חשבון
              </button>
            </div>
            {accounts.map(acc => {
              const ilsVal = acc.currency === 'USD' ? (acc.usdBalance || 0) * usdRate : (acc.balance || 0)
              return (
                <div key={acc.id} className={`card overflow-hidden cursor-pointer ${BANK_META[acc.bank]?.card || ''}`} onClick={() => openEditAccount(acc)}>
                  <div className={`px-4 py-1.5 flex items-center justify-between ${BANK_META[acc.bank]?.header || 'bg-gray-200'}`}>
                    <span className={`text-xs font-bold ${BANK_META[acc.bank]?.text || 'text-gray-700'}`}>{acc.bank}</span>
                    <span className={`text-xs ${BANK_META[acc.bank]?.text || 'text-gray-500'} opacity-80`}>{acc.owner}{acc.type === 'business' ? ' · עסקי' : ''}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <p className="font-semibold text-gray-800">{acc.name}</p>
                    <div className="text-left">
                      {acc.currency === 'USD' ? (
                        <>
                          <p className="text-base font-bold text-gray-800">
                            ${new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(acc.usdBalance)}
                          </p>
                          <p className="text-xs text-gray-400">{formatILS(ilsVal)}</p>
                        </>
                      ) : (
                        <p className={`text-base font-bold ${ilsVal >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                          {formatILS(ilsVal)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── Investments section ── */}
        {section === 'investments' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                סה״כ: <span className="font-bold text-gray-800">
                  {formatILS(investments.reduce((s, i) => s + (i.value || 0), 0))}
                </span>
              </p>
              <button onClick={openAddInv} className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                + הוסף
              </button>
            </div>
            {investments.map(inv => {
              const ils = invILS(inv)
              return (
                <div key={inv.id} className="card p-4 flex items-center justify-between cursor-pointer" onClick={() => openEditInv(inv)}>
                  <div>
                    <p className="font-semibold text-gray-800">{inv.name}</p>
                    <p className="text-xs text-gray-400">{inv.owner} · {INV_TYPE_OPTIONS.find(o => o.value === inv.type)?.label || inv.type}</p>
                    {inv.currency === 'EUR' && (
                      <p className="text-xs text-gray-400">€{new Intl.NumberFormat('en').format(inv.originalAmount)} @ {eurRate?.toFixed(3)}</p>
                    )}
                    {inv.currency === 'USD' && (
                      <p className="text-xs text-gray-400">${new Intl.NumberFormat('en').format(inv.originalAmount)} @ {usdRate?.toFixed(3)}</p>
                    )}
                  </div>
                  <p className="text-base font-bold text-green-700">{formatILS(ils)}</p>
                </div>
              )
            })}
          </>
        )}

        {/* ── Debts section ── */}
        {section === 'debts' && (
          <>
            <div className="flex justify-end">
              <button onClick={openAddDebt} className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                + הוסף חוב
              </button>
            </div>

            {owedToUs.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-700">חייבים לנו</span>
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">
                    {formatILS(owedToUs.reduce((s, d) => s + (d.amount || 0), 0))}
                  </span>
                </div>
                {owedToUs.map(d => <DebtCard key={d.id} debt={d} onEdit={() => openEditDebt(d)} eurRate={eurRate} usdRate={usdRate} />)}
              </>
            )}

            {weOwe.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm font-semibold text-red-600">אנחנו חייבים</span>
                  <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-bold">
                    {formatILS(weOwe.reduce((s, d) => s + (d.amount || 0), 0))}
                  </span>
                </div>
                {weOwe.map(d => <DebtCard key={d.id} debt={d} onEdit={() => openEditDebt(d)} eurRate={eurRate} usdRate={usdRate} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'account' && (
        <Modal title={modal.mode === 'add' ? 'חשבון חדש' : 'עריכת חשבון'} onClose={() => setModal(null)}>
          <Field label="שם"><Input value={form.name} onChange={v => setF('name', v)} placeholder="שם החשבון" /></Field>
          <Field label="בנק"><Select value={form.bank} onChange={v => setF('bank', v)} options={BANK_OPTIONS} /></Field>
          <Field label="בעלים"><Select value={form.owner} onChange={v => setF('owner', v)} options={OWNER_OPTIONS} /></Field>
          {form.currency === 'USD' ? (
            <Field label="יתרה ($)">
              <Input type="number" value={form.usdBalance ?? ''} onChange={v => setF('usdBalance', v)} placeholder="0" />
            </Field>
          ) : (
            <Field label="יתרה (₪)">
              <Input type="number" value={form.balance} onChange={v => setF('balance', v)} placeholder="0" />
            </Field>
          )}
          <SaveButton onClick={saveAccount} />
          {modal.mode === 'edit' && <DeleteButton onClick={removeAccount} />}
        </Modal>
      )}

      {modal?.type === 'inv' && (
        <Modal title={modal.mode === 'add' ? 'נכס חדש' : 'עריכת נכס'} onClose={() => setModal(null)}>
          <Field label="שם"><Input value={form.name} onChange={v => setF('name', v)} placeholder="שם הנכס" /></Field>
          <Field label="סוג"><Select value={form.type} onChange={v => setF('type', v)} options={INV_TYPE_OPTIONS} /></Field>
          <Field label="בעלים"><Select value={form.owner} onChange={v => setF('owner', v)} options={OWNER_OPTIONS} /></Field>
          <Field label="שווי (₪)">
            <Input type="number" value={form.value} onChange={v => setF('value', v)} placeholder="0" />
          </Field>
          <SaveButton onClick={saveInv} />
          {modal.mode === 'edit' && <DeleteButton onClick={removeInv} />}
        </Modal>
      )}

      {modal?.type === 'debt' && (
        <Modal title={modal.mode === 'add' ? 'חוב חדש' : 'עריכת חוב'} onClose={() => setModal(null)}>
          <Field label="שם"><Input value={form.name} onChange={v => setF('name', v)} placeholder="שם האדם" /></Field>
          <Field label="סוג"><Select value={form.type} onChange={v => setF('type', v)} options={DEBT_TYPE_OPTIONS} /></Field>
          <Field label="סכום (₪)">
            <Input type="number" value={form.amount} onChange={v => setF('amount', v)} placeholder="0" />
          </Field>
          <Field label="תאריך צפוי להחזר" hint="השאר ריק אם לא ידוע">
            <Input type="date" value={form.expectedDate} onChange={v => setF('expectedDate', v)} />
          </Field>
          <Field label="הערות">
            <Textarea value={form.notes} onChange={v => setF('notes', v)} placeholder="הערות..." />
          </Field>
          <SaveButton onClick={saveDebt} />
          {modal.mode === 'edit' && <DeleteButton onClick={removeDebt} />}
        </Modal>
      )}
    </div>
  )
}

function DebtCard({ debt, onEdit, eurRate, usdRate }) {
  const days = daysUntil(debt.expectedDate)
  const isOwedToUs = debt.type === 'owed_to_us'

  const ilsAmount =
    debt.currency === 'EUR' ? (debt.originalAmount || 0) * (eurRate || 3.6283) :
    debt.currency === 'USD' ? (debt.originalAmount || 0) * (usdRate || 3.61) :
    (debt.amount || 0)

  return (
    <div className="card p-4 cursor-pointer" onClick={onEdit}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-800">{debt.name}</p>
          {debt.expectedDate ? (
            <p className="text-xs text-gray-400 mt-0.5">
              {isOwedToUs ? 'חוזר' : 'להחזיר'}: {formatDate(debt.expectedDate)}
              {days !== null && days >= 0 && <span className="text-gray-400"> ({days} ימים)</span>}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">תאריך לא נקבע</p>
          )}
          {debt.notes && <p className="text-xs text-gray-400 mt-1">{debt.notes}</p>}
        </div>
        <div className="text-left">
          <p className={`font-bold text-base ${isOwedToUs ? 'text-green-600' : 'text-red-500'}`}>
            {isOwedToUs ? '+' : '-'}{formatILS(ilsAmount)}
          </p>
          {debt.currency === 'EUR' && (
            <p className="text-xs text-gray-400 text-left">
              €{new Intl.NumberFormat('en').format(debt.originalAmount)}
              <span className="text-gray-300"> @ {eurRate?.toFixed(3)}</span>
            </p>
          )}
          {debt.currency === 'USD' && (
            <p className="text-xs text-gray-400 text-left">
              ${new Intl.NumberFormat('en').format(debt.originalAmount)}
              <span className="text-gray-300"> @ {usdRate?.toFixed(3)}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
