import { useState } from 'react'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton, DeleteButton } from '../components/Modal'
import { formatILS, formatDate, daysUntil, urgencyClass, urgencyLabel } from '../utils/formatters'

const EMPTY_INCOME = { name: '', amount: '', expectedDate: '', notes: '', accountId: '', sessions: [], agentCommission: false, invoiceSent: false, invoiceFile: null, invoiceFileName: null }
const EMPTY_NEW_SESS = { type: 'יום צילום', date: '', quantity: '1', rate: '', overtimeHours: '', overtimeRate: '' }
const unitLabel = t => t === 'יום צילום' ? 'ימים' : 'שעות'

const SESSION_TYPES = [
  { value: 'יום צילום', label: 'יום צילום' },
  { value: 'חזרות',     label: 'חזרות'     },
  { value: 'מדידות',    label: 'מדידות'    },
  { value: 'אחר',       label: 'אחר'       },
]
const EMPTY_SESSION = { type: 'יום צילום', date: '', amount: '', notes: '' }

export default function IncomePage() {
  const {
    accounts,
    futureIncome, addFutureIncome, updateFutureIncome, deleteFutureIncome,
    markIncomeReceived, markIncomePending,
    addWorkSession, deleteWorkSession,
  } = useStore()

  const ilsAccounts = accounts.filter(a => a.currency !== 'USD')
  const accountOptions = [
    { value: '', label: 'לא מקושר לחשבון' },
    ...ilsAccounts.map(a => ({ value: a.id, label: a.name })),
  ]

  const [modal,        setModal]      = useState(null)
  const [form,         setForm]       = useState(EMPTY_INCOME)
  const [filter,       setFilter]     = useState('pending')
  const [workModal,    setWorkModal]  = useState(null) // { item }
  const [sessForm,     setSessForm]   = useState(EMPTY_SESSION)
  const [receiveModal, setReceiveModal] = useState(null) // { item }
  const [receiveAccId, setReceiveAccId] = useState('')
  const [newSess,      setNewSess]      = useState(EMPTY_NEW_SESS)

  const closeProject  = (id, e) => { e.stopPropagation(); updateFutureIncome(id, { isWorkLog: false }) }
  const reopenProject = (id, e) => { e.stopPropagation(); updateFutureIncome(id, { isWorkLog: true  }) }

  const pending  = futureIncome.filter(f => f.status === 'pending')
  const received = futureIncome.filter(f => f.status === 'received')
  const visible  = filter === 'pending' ? pending : filter === 'received' ? received : futureIncome

  const totalPending  = pending.reduce((s, f)  => s + (f.amount || 0), 0)
  const totalReceived = received.reduce((s, f) => s + (f.amount || 0), 0)

  const openAdd  = () => { setForm({ ...EMPTY_INCOME }); setNewSess(EMPTY_NEW_SESS); setModal('add') }
  const openEdit = (item) => {
    const sessions = item.sessions || []
    const lastForType = (type) => [...sessions].reverse().find(w => w.type === type)
    const last = lastForType(EMPTY_NEW_SESS.type)
    setForm({ ...item, expectedDate: item.expectedDate || '', sessions })
    setNewSess({ ...EMPTY_NEW_SESS, rate: last ? String(last.ratePerUnit) : '', overtimeRate: last ? String(last.overtimeRate || '') : '' })
    setModal({ item })
  }

  const addSessToForm = () => {
    if (!newSess.rate) return
    const qty       = Number(newSess.quantity)     || 1
    const rate      = Number(newSess.rate)
    const otHours   = Number(newSess.overtimeHours) || 0
    const otRate    = Number(newSess.overtimeRate)  || 0
    const baseAmt   = qty * rate
    const otAmt     = otHours * otRate
    const sess = {
      id: 'ws' + Date.now(), type: newSess.type, date: newSess.date || null,
      quantity: qty, ratePerUnit: rate,
      overtimeHours: otHours || null, overtimeRate: otRate || null,
      amount: baseAmt + otAmt,
    }
    const sessions = [...(form.sessions || []), sess]
    setForm(f => ({ ...f, sessions, amount: sessions.reduce((s, w) => s + w.amount, 0) }))
    setNewSess(EMPTY_NEW_SESS)
  }
  const removeSessFromForm = (id) => {
    const sessions = (form.sessions || []).filter(w => w.id !== id)
    setForm(f => ({ ...f, sessions, amount: sessions.length > 0 ? sessions.reduce((s, w) => s + w.amount, 0) : f.amount }))
  }
  const closeModal = () => setModal(null)

  const save = () => {
    const data = {
      ...form,
      amount:       form.amount === '' ? null : Number(form.amount),
      expectedDate: form.expectedDate || null,
    }
    if (modal === 'add') addFutureIncome(data)
    else updateFutureIncome(modal.item.id, data)
    closeModal()
  }
  const remove       = () => { deleteFutureIncome(modal.item.id); closeModal() }
  const openReceive  = (item, e) => { e.stopPropagation(); setReceiveAccId(item.accountId || ''); setReceiveModal({ item }) }
  const confirmReceive = () => {
    markIncomeReceived(receiveModal.item.id, receiveAccId || null)
    setReceiveModal(null)
  }
  const undoReceived = (id, e) => { e.stopPropagation(); markIncomePending(id) }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Work log ──
  const openWorkLog  = (item, e) => { e.stopPropagation(); setWorkModal({ item }); setSessForm(EMPTY_SESSION) }
  const closeWorkLog = () => setWorkModal(null)

  const saveSession = () => {
    if (!sessForm.amount) return
    addWorkSession(workModal.item.id, {
      type:   sessForm.type,
      date:   sessForm.date || null,
      amount: Number(sessForm.amount),
      notes:  sessForm.notes,
    })
    setSessForm(EMPTY_SESSION)
  }

  const setS = (k, v) => setSessForm(f => ({ ...f, [k]: v }))

  // refresh workModal item from store after session changes
  const workItem = workModal
    ? futureIncome.find(f => f.id === workModal.item.id)
    : null

  return (
    <div className="page-content">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800">הכנסות צפויות</h1>
          <button onClick={openAdd} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
            + הוסף
          </button>
        </div>

        <div className="bg-green-50 rounded-xl px-3 py-3 text-center">
          <p className="text-xs text-green-500">צפוי להגיע</p>
          <p className="text-xl font-bold text-green-700">{formatILS(totalPending)}</p>
        </div>

        <div className="flex gap-2 mt-3">
          {[['pending','ממתין'],['received','התקבל'],['all','הכל']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${filter === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {label}
              {val === 'pending'  && pending.length  > 0 && <span className="mr-1">({pending.length})</span>}
              {val === 'received' && received.length > 0 && <span className="mr-1">({received.length})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {visible.map(item => (
          <IncomeCard
            key={item.id}
            item={item}
            onEdit={() => openEdit(item)}
            onReceive={(e) => openReceive(item, e)}
            onUndo={(e) => undoReceived(item.id, e)}
            onWorkLog={(e) => openWorkLog(item, e)}
            onClose={(e) => closeProject(item.id, e)}
            onReopen={(e) => reopenProject(item.id, e)}
          />
        ))}
        {visible.length === 0 && (
          <div className="card p-8 text-center text-gray-400">
            <p className="text-2xl mb-2">💰</p>
            <p className="text-sm">אין הכנסות — הוסף ראשונה</p>
          </div>
        )}
      </div>

      {/* ── Edit / Add modal ── */}
      {modal && (
        <Modal title={modal === 'add' ? 'הכנסה חדשה' : 'עריכת הכנסה'} onClose={closeModal}>
          <Field label="שם"><Input value={form.name} onChange={v => set('name', v)} placeholder="שם ההכנסה" /></Field>
          <Field label="סכום (₪)">
            <div className="flex items-center gap-2">
              <Input type="number" value={form.amount} onChange={v => set('amount', v)} placeholder="0" />
              {form.agentCommission && Number(form.amount) > 0 && (
                <span className="text-xs text-orange-500 font-semibold whitespace-nowrap">
                  נטו: {formatILS(Number(form.amount) * 0.85)}
                </span>
              )}
            </div>
          </Field>
          <div className="flex items-center gap-2 -mt-1 mb-1">
            <button
              type="button"
              onClick={() => set('agentCommission', !form.agentCommission)}
              className={`w-9 h-5 rounded-full transition-colors relative ${form.agentCommission ? 'bg-orange-400' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.agentCommission ? 'right-0.5' : 'left-0.5'}`} />
            </button>
            <span className="text-xs text-gray-500">עמלת סוכן 15%</span>
          </div>
          {/* ── Invoice status ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500">חשבונית</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('invoiceSent', false)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${!form.invoiceSent ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}
              >
                לא יצאה חשבונית
              </button>
              <button
                type="button"
                onClick={() => set('invoiceSent', true)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${form.invoiceSent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
              >
                ✓ יצאה חשבונית
              </button>
            </div>
            {form.invoiceSent && (
              form.invoiceFile ? (
                <div className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">📄</span>
                    <a href={form.invoiceFile} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline truncate">{form.invoiceFileName}</a>
                  </div>
                  <button type="button" onClick={() => { set('invoiceFile', null); set('invoiceFileName', null) }} className="text-red-400 text-xs px-1.5 hover:bg-red-50 rounded">✕</button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-green-200 rounded-xl py-3 cursor-pointer hover:bg-green-50 transition-colors">
                  <span className="text-sm">📎</span>
                  <span className="text-xs text-green-600 font-medium">העלה חשבונית</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => { set('invoiceFile', ev.target.result); set('invoiceFileName', file.name) }
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
              )
            )}
          </div>

          <Field label="תאריך צפוי" hint="השאר ריק אם לא ידוע">
            <Input type="date" value={form.expectedDate} onChange={v => set('expectedDate', v)} />
          </Field>
          <Field label="הערות">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="הערות..." />
          </Field>
          <Field label="חשבון לזיכוי" hint="בעת לחיצה על התקבל — יתרה תתעדכן">
            <Select value={form.accountId || ''} onChange={v => set('accountId', v)} options={accountOptions} />
          </Field>

          {/* ── Work sessions ── */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">פירוט ימי עבודה</p>

            {/* Existing sessions */}
            {(form.sessions || []).length > 0 && (
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-2">
                {(form.sessions || []).map(ws => (
                  <div key={ws.id} className="flex items-center justify-between px-3 py-2 bg-white">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{ws.type}</p>
                      <p className="text-xs text-gray-400">
                        {ws.date ? formatDate(ws.date) : 'ללא תאריך'} · {ws.quantity} {unitLabel(ws.type)} × {formatILS(ws.ratePerUnit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-green-600">{formatILS(ws.amount)}</span>
                      <button onClick={() => removeSessFromForm(ws.id)} className="text-red-400 text-xs px-1.5 hover:bg-red-50 rounded">✕</button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 bg-green-50">
                  <span className="text-xs font-semibold text-green-700">סה״כ</span>
                  <span className="text-sm font-bold text-green-700">{formatILS((form.sessions || []).reduce((s, w) => s + w.amount, 0))}</span>
                </div>
              </div>
            )}

            {/* New session adder */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="סוג">
                  <Select value={newSess.type} onChange={v => {
                    const last = [...(form.sessions || [])].reverse().find(w => w.type === v)
                    setNewSess(s => ({ ...s, type: v, rate: last ? String(last.ratePerUnit) : '', overtimeRate: last ? String(last.overtimeRate || '') : '' }))
                  }} options={SESSION_TYPES} />
                </Field>
                <Field label="תאריך">
                  <Input type="date" value={newSess.date} onChange={v => setNewSess(s => ({ ...s, date: v }))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={unitLabel(newSess.type)}>
                  <Input type="number" value={newSess.quantity} onChange={v => setNewSess(s => ({ ...s, quantity: v }))} placeholder="1" min="1" />
                </Field>
                <Field label={`תעריף ל${newSess.type === 'יום צילום' ? 'יום' : 'שעה'} (₪)`}>
                  <Input type="number" value={newSess.rate} onChange={v => setNewSess(s => ({ ...s, rate: v }))} placeholder="0" />
                </Field>
              </div>
              {newSess.type === 'יום צילום' && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="שעות נוספות">
                    <Input type="number" value={newSess.overtimeHours} onChange={v => setNewSess(s => ({ ...s, overtimeHours: v }))} placeholder="0" />
                  </Field>
                  <Field label="תעריף לשעה נוספת (₪)">
                    <Input type="number" value={newSess.overtimeRate} onChange={v => setNewSess(s => ({ ...s, overtimeRate: v }))} placeholder="0" />
                  </Field>
                </div>
              )}
              {newSess.rate && (() => {
                const base = (Number(newSess.quantity) || 0) * (Number(newSess.rate) || 0)
                const ot   = (Number(newSess.overtimeHours) || 0) * (Number(newSess.overtimeRate) || 0)
                return (
                  <div className="text-center">
                    <p className="text-xs text-green-600 font-semibold">
                      סה״כ: {formatILS(base + ot)}
                    </p>
                    {ot > 0 && (
                      <p className="text-xs text-gray-400">
                        בסיס {formatILS(base)} + שע״נ {formatILS(ot)}
                      </p>
                    )}
                  </div>
                )
              })()}
              <button onClick={addSessToForm} disabled={!newSess.rate} className="w-full bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                + הוסף רישום
              </button>
            </div>
          </div>

          <SaveButton onClick={save} />
          {modal !== 'add' && <DeleteButton onClick={remove} />}
        </Modal>
      )}

      {/* ── Receive: account picker ── */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setReceiveModal(null)}>
          <div className="absolute inset-0 bg-black bg-opacity-30" />
          <div className="relative bg-white rounded-t-2xl w-full shadow-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">התקבל — {receiveModal.item.name}</h3>
              <button onClick={() => setReceiveModal(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <p className="text-2xl font-bold text-green-600 text-center">{formatILS(receiveModal.item.amount)}</p>
            <div>
              <p className="text-xs text-gray-500 mb-2">לאיזה חשבון לזכות?</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {ilsAccounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setReceiveAccId(a.id)}
                    className={`w-full text-right px-4 py-2.5 rounded-xl text-sm font-medium transition-colors
                      ${receiveAccId === a.id ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={confirmReceive}
              disabled={!receiveAccId}
              className="w-full bg-green-600 disabled:opacity-40 text-white font-bold py-3 rounded-xl"
            >
              ✓ אישור — זכה את החשבון
            </button>
          </div>
        </div>
      )}

      {/* ── Work log modal ── */}
      {workModal && workItem && (
        <Modal title={`יומן עבודה — ${workItem.name}`} onClose={closeWorkLog}>
          {/* Total */}
          <div className="bg-green-50 rounded-xl px-4 py-3 mb-2 flex items-center justify-between">
            <span className="text-sm text-green-700 font-medium">סה״כ נצבר</span>
            <span className="text-lg font-bold text-green-700">{formatILS(workItem.amount || 0)}</span>
          </div>

          {/* Session list */}
          {(workItem.sessions || []).length > 0 && (
            <div className="divide-y divide-gray-100 mb-3 rounded-xl overflow-hidden border border-gray-100">
              {(workItem.sessions || []).map(ws => (
                <div key={ws.id} className="flex items-center justify-between px-3 py-2.5 bg-white">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{ws.type}</p>
                    <p className="text-xs text-gray-400">
                      {ws.date ? formatDate(ws.date) : 'ללא תאריך'}
                      {ws.notes ? ` · ${ws.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-green-600">{formatILS(ws.amount)}</span>
                    <button
                      onClick={() => deleteWorkSession(workItem.id, ws.id)}
                      className="text-red-400 text-xs px-1.5 py-0.5 hover:bg-red-50 rounded"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add session form */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">+ הוסף רישום</p>
            <Field label="סוג">
              <Select value={sessForm.type} onChange={v => setS('type', v)} options={SESSION_TYPES} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="תאריך">
                <Input type="date" value={sessForm.date} onChange={v => setS('date', v)} />
              </Field>
              <Field label="סכום (₪)">
                <Input type="number" value={sessForm.amount} onChange={v => setS('amount', v)} placeholder="0" />
              </Field>
            </div>
            <Field label="הערות">
              <Input value={sessForm.notes} onChange={v => setS('notes', v)} placeholder="פירוט..." />
            </Field>
            <button
              onClick={saveSession}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl mt-1"
            >
              + הוסף רישום
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function IncomeCard({ item, onEdit, onReceive, onUndo, onWorkLog, onClose, onReopen }) {
  const days = daysUntil(item.expectedDate)
  const { label, color } = urgencyLabel(days)
  const uc = urgencyClass(days)
  const isReceived = item.status === 'received'
  const isWorkLog  = item.isWorkLog

  const badgeColor =
    color === 'green'  ? 'bg-green-100 text-green-700'  :
    color === 'orange' ? 'bg-orange-100 text-orange-700' :
    color === 'red'    ? 'bg-red-100 text-red-600'       :
    color === 'blue'   ? 'bg-blue-100 text-blue-700'     :
                         'bg-gray-100 text-gray-500'

  const sessionCount = (item.sessions || []).length

  return (
    <div
      className={`card p-4 ${days !== null && days <= 3 && !isReceived ? uc : ''} cursor-pointer`}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold ${isReceived ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {item.name}
            </h3>
            {isReceived ? (
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">✓ התקבל</span>
            ) : isWorkLog ? (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                🎬 בתהוות{sessionCount > 0 ? ` · ${sessionCount} רישומים` : ''}
              </span>
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
                {label}
              </span>
            )}
            {item.invoiceSent
              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">📄 חשבונית</span>
              : <span className="text-xs bg-red-50 text-red-400 px-2 py-0.5 rounded-full">חשבונית ✕</span>
            }
          </div>

          {item.expectedDate && (
            <p className="text-xs text-gray-400 mt-1">
              {isReceived ? 'התקבל' : 'צפוי'}: {formatDate(item.expectedDate)}
            </p>
          )}
          {item.notes && (
            <p className="text-xs text-gray-400 mt-1 truncate">{item.notes}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 mr-3">
          <div className="text-left">
            <span className={`text-base font-bold ${isReceived ? 'text-gray-400' : isWorkLog ? 'text-purple-600' : 'text-green-600'}`}>
              {(item.amount || 0) > 0 ? formatILS(item.amount) : isWorkLog ? '—' : '—'}
            </span>
            {item.agentCommission && (item.amount || 0) > 0 && (
              <p className="text-xs text-orange-500 font-semibold">
                נטו: {formatILS(item.amount * 0.85)}
              </p>
            )}
          </div>

          {!isReceived && isWorkLog && (
            <div className="flex flex-col gap-1.5 items-end">
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium"
              >
                בהתהוות
              </button>
              <button
                onClick={onClose}
                className="text-xs border border-gray-300 text-gray-500 px-3 py-1.5 rounded-lg font-medium"
              >
                סגור
              </button>
            </div>
          )}
          {!isReceived && !isWorkLog ? (
            <div className="flex flex-col gap-1.5 items-end">
              <button
                onClick={onReceive}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium"
              >
                ✓ התקבל
              </button>
              <button
                onClick={onReopen}
                className="text-xs border border-gray-300 text-gray-500 px-3 py-1.5 rounded-lg font-medium"
              >
                ↩ בהתהוות
              </button>
            </div>
          ) : isReceived ? (
            <button
              onClick={onUndo}
              className="text-xs border border-gray-300 text-gray-500 px-3 py-1.5 rounded-lg font-medium"
            >
              ↩ בטל
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
