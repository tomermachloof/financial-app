import { useState } from 'react'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton } from './Modal'
import { formatILS, formatDate } from '../utils/formatters'
import PartialPaymentModal from './PartialPaymentModal'

const EMPTY_NEW_SESS = { type: 'יום צילום', date: '', quantity: '1', rate: '', overtimeHours: '', overtimeRate: '' }
const SESSION_TYPES  = [
  { value: 'יום צילום', label: 'יום צילום' },
  { value: 'חזרות',     label: 'חזרות'     },
  { value: 'מדידות',    label: 'מדידות'    },
  { value: 'אחר',       label: 'אחר'       },
]
const unitLabel = t => t === 'יום צילום' ? 'ימים' : 'שעות'

// ── Helpers לבלוק קבצים (תאימות לאחור לשדה invoiceFile הישן) ──
const getFilesFromItem = (item) => {
  if (Array.isArray(item.files) && item.files.length > 0) return item.files
  if (item.invoiceFile) {
    return [{
      id: 'legacy_inv',
      type: 'invoice',
      file: item.invoiceFile,
      fileName: item.invoiceFileName || 'חשבונית',
      uploadedAt: null,
    }]
  }
  return []
}

export default function IncomeEditModal({ item, onClose }) {
  const { accounts, updateFutureIncome, futureIncome, removeIncomePayment, confirmedEvents } = useStore()
  const ilsAccounts   = accounts.filter(a => a.currency !== 'USD')
  const accountOptions = [
    { value: '', label: 'לא מקושר לחשבון' },
    ...ilsAccounts.map(a => ({ value: a.id, label: a.name })),
  ]

  // תמיד לקרוא את הפריט החי מהחנות — כך שתשלומים חדשים וקבצים שנוספו
  // מתוך חלון התשלום החלקי יופיעו מיד בלי לסגור ולפתוח.
  const liveItem = futureIncome.find(f => f.id === item.id) || item

  const [showPartialModal, setShowPartialModal] = useState(false)
  const [viewingFile, setViewingFile] = useState(null)

  const [form, setForm] = useState({
    name:            item.name            || '',
    amount:          item.amount != null  ? String(item.amount) : '',
    agentCommission: item.agentCommission || false,
    invoiceSent:     item.invoiceSent     || false,
    expectedDate:    item.expectedDate    || '',
    notes:           item.notes           || '',
    accountId:       item.accountId       || '',
    sessions:        item.sessions        || [],
  })

  // קבצים ותשלומים מוצגים מהפריט החי, לא מטופס העריכה —
  // כי הם נשמרים מיד לחנות בלי לחכות לכפתור "שמור" של חלון העריכה.
  const files    = getFilesFromItem(liveItem)
  const payments = liveItem.payments || []
  const totalAmount   = Number(form.amount) || liveItem.amount || 0
  const totalReceived = payments.reduce((s, p) => s + p.amount, 0)
  const remaining     = totalAmount - totalReceived

  const addFile = (type) => (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const newFile = {
        id: 'f' + Date.now(),
        type,
        file: ev.target.result,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      }
      updateFutureIncome(item.id, { files: [...files, newFile] })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const openFile = (dataUrl, fileName) => {
    if (!dataUrl) return
    const isImage = dataUrl.startsWith('data:image/')
    setViewingFile({ url: dataUrl, name: fileName, isImage })
  }

  const removeFile = (fileId) => {
    const newFiles = files.filter(f => f.id !== fileId)
    // אם נמחק הפריט שהגיע מהתאימות-לאחור, לנקות גם את השדות הישנים
    const updates = { files: newFiles }
    if (fileId === 'legacy_inv') {
      updates.invoiceFile = null
      updates.invoiceFileName = null
    }
    updateFutureIncome(item.id, updates)
  }

  const sessions = item.sessions || []
  const lastForType = (type) => [...sessions].reverse().find(w => w.type === type)
  const last = lastForType(EMPTY_NEW_SESS.type)
  const [newSess, setNewSess] = useState({
    ...EMPTY_NEW_SESS,
    rate:         last ? String(last.ratePerUnit)   : '',
    overtimeRate: last ? String(last.overtimeRate || '') : '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addSessToForm = () => {
    if (!newSess.rate) return
    const qty     = Number(newSess.quantity)      || 1
    const rate    = Number(newSess.rate)
    const otHours = Number(newSess.overtimeHours) || 0
    const otRate  = Number(newSess.overtimeRate)  || 0
    const sess = {
      id: 'ws' + Date.now(), type: newSess.type, date: newSess.date || null,
      quantity: qty, ratePerUnit: rate,
      overtimeHours: otHours || null, overtimeRate: otRate || null,
      amount: qty * rate + otHours * otRate,
    }
    const newSessions = [...form.sessions, sess]
    setForm(f => ({ ...f, sessions: newSessions, amount: newSessions.reduce((s, w) => s + w.amount, 0) }))
    setNewSess(EMPTY_NEW_SESS)
  }

  const removeSess = (id) => {
    const newSessions = form.sessions.filter(w => w.id !== id)
    setForm(f => ({ ...f, sessions: newSessions, amount: newSessions.length > 0 ? newSessions.reduce((s, w) => s + w.amount, 0) : f.amount }))
  }

  const save = () => {
    updateFutureIncome(item.id, {
      ...form,
      amount:       form.amount === '' ? null : Number(form.amount),
      expectedDate: form.expectedDate || null,
    })
    onClose()
  }

  // Overlay לצפייה בקובץ בתוך האפליקציה
  if (viewingFile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#1f2937', flexShrink: 0 }}>
          <span style={{ color: 'white', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewingFile.name}</span>
          <button onClick={() => setViewingFile(null)} style={{ color: 'white', fontSize: '24px', padding: '0 8px', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        {viewingFile.isImage
          ? <img src={viewingFile.url} style={{ flex: 1, objectFit: 'contain', width: '100%', height: 0, minHeight: 0 }} alt={viewingFile.name} />
          : <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: 0, minHeight: 0 }}>
              <iframe
                src={viewingFile.url}
                style={{ position: 'absolute', top: 0, left: 0, width: '200%', height: '200%', border: 'none', transform: 'scale(0.5)', transformOrigin: '0 0' }}
                title={viewingFile.name}
              />
            </div>
        }
      </div>
    )
  }

  // חלון התשלום החלקי מוצג כחלון עצמאי מעל חלון העריכה
  if (showPartialModal) {
    return (
      <PartialPaymentModal
        item={liveItem}
        onClose={() => setShowPartialModal(false)}
      />
    )
  }

  return (
    <Modal title="עריכת הכנסה" onClose={onClose} onSave={save}>
      <Field label="שם"><Input value={form.name} onChange={v => set('name', v)} placeholder="שם ההכנסה" /></Field>
      <Field label="סכום (₪)">
        <div className="flex items-center gap-2">
          <Input type="number" value={form.amount} onChange={v => set('amount', v)} placeholder="0" />
          {form.agentCommission && Number(form.amount) > 0 && (
            <span className="text-xs text-orange-500 font-semibold whitespace-nowrap">נטו: {formatILS(Number(form.amount) * 0.85)}</span>
          )}
        </div>
      </Field>
      <div className="flex items-center gap-2 -mt-1 mb-1">
        <button type="button" onClick={() => set('agentCommission', !form.agentCommission)}
          className={`w-9 h-5 rounded-full transition-colors relative ${form.agentCommission ? 'bg-orange-400' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.agentCommission ? 'right-0.5' : 'left-0.5'}`} />
        </button>
        <span className="text-xs text-gray-500">עמלת סוכן 15%</span>
      </div>

      {/* ── בלוק חשבונית: דגל בלבד ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">סטטוס חשבונית</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => set('invoiceSent', false)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${!form.invoiceSent ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
            לא יצאה חשבונית
          </button>
          <button type="button" onClick={() => set('invoiceSent', true)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${form.invoiceSent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            ✓ יצאה חשבונית
          </button>
        </div>
      </div>

      {/* ── בלוק קבצים מצורפים: חשבוניות + פירוטי תשלום ── */}
      <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500">קבצים מצורפים</p>

        {files.length > 0 && (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
            {files.map(f => {
              const isInvoice = f.type === 'invoice'
              return (
                <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-white">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isInvoice ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {isInvoice ? 'חשבונית' : 'פירוט תשלום'}
                    </span>
                    <button type="button" onClick={() => openFile(f.file, f.fileName)} className="text-xs text-blue-600 underline truncate text-right">
                      {f.fileName}
                    </button>
                    {f.uploadedAt && <span className="text-[10px] text-gray-400 shrink-0">{formatDate(f.uploadedAt)}</span>}
                  </div>
                  <button type="button" onClick={() => removeFile(f.id)} className="text-red-400 text-xs px-1.5 hover:bg-red-50 rounded shrink-0">✕</button>
                </div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-center gap-1 border-2 border-dashed border-blue-200 rounded-xl py-2.5 cursor-pointer hover:bg-blue-50 transition-colors">
            <span className="text-sm">📎</span>
            <span className="text-xs text-blue-600 font-medium">+ חשבונית</span>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={addFile('invoice')} />
          </label>
          <label className="flex items-center justify-center gap-1 border-2 border-dashed border-green-200 rounded-xl py-2.5 cursor-pointer hover:bg-green-50 transition-colors">
            <span className="text-sm">📎</span>
            <span className="text-xs text-green-600 font-medium">+ פירוט תשלום</span>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={addFile('payment')} />
          </label>
        </div>
      </div>

      {/* ── בלוק תשלומים שהתקבלו ── */}
      <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500">תשלומים שהתקבלו</p>

        <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">סכום כולל</span>
            <span className="font-bold text-gray-800">{formatILS(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">התקבל עד כה</span>
            <span className="font-semibold text-green-600">{formatILS(totalReceived)}</span>
          </div>
          <div className="flex justify-between text-xs border-t border-gray-200 pt-1">
            <span className="text-gray-500">נותר</span>
            <span className={`font-bold ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>{formatILS(remaining)}</span>
          </div>
        </div>

        {payments.length > 0 && (() => {
          const itemLocked = (confirmedEvents || []).some(e => {
            const bare = String(e.id || '').replace(/_ro$/, '').replace(/_m\d+$/, '')
            return bare === item.id
          })
          const handleRemovePayment = (paymentId) => {
            if (itemLocked) {
              alert('הפריט כבר אושר בלוח הבית. בטל אישור לפני מחיקת תשלום חלקי.')
              return
            }
            removeIncomePayment(item.id, paymentId)
          }
          return (
            <div className="space-y-1">
              {payments.map(p => {
                const acc = accounts.find(a => a.id === p.accountId)
                const shownBank = p.bankAmount != null ? p.bankAmount : p.amount
                return (
                  <div key={p.id} className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-1.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-green-700">{formatILS(shownBank)}</span>
                      <span className="text-gray-400 mr-2">{formatDate(p.date)}{acc ? ' · ' + acc.name : ''}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemovePayment(p.id) }}
                      disabled={itemLocked}
                      title={itemLocked ? 'בטל אישור בדשבורד לפני מחיקה' : 'בטל תשלום'}
                      className={`w-7 h-7 flex items-center justify-center text-sm font-bold rounded-full shrink-0 ${itemLocked ? 'text-gray-300 bg-gray-100 cursor-not-allowed' : 'text-red-500 bg-red-50 active:bg-red-200'}`}
                      style={{ touchAction: 'manipulation' }}
                    >✕</button>
                  </div>
                )
              })}
            </div>
          )
        })()}

        <button type="button" onClick={() => setShowPartialModal(true)}
          className="w-full border-2 border-dashed border-orange-200 text-orange-600 text-xs font-semibold py-2.5 rounded-xl hover:bg-orange-50 transition-colors">
          + רשום תשלום שהתקבל
        </button>
      </div>

      <Field label="תאריך צפוי" hint="השאר ריק אם לא ידוע">
        <Input type="date" value={form.expectedDate} onChange={v => set('expectedDate', v)} />
      </Field>
      <Field label="הערות">
        <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="הערות..." />
      </Field>
      <Field label="חשבון לזיכוי" hint="בעת לחיצה על התקבל — יתרה תתעדכן">
        <Select value={form.accountId} onChange={v => set('accountId', v)} options={accountOptions} />
      </Field>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500">פירוט ימי עבודה</p>
        {form.sessions.length > 0 && (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-2">
            {form.sessions.map(ws => (
              <div key={ws.id} className="flex items-center justify-between px-3 py-2 bg-white">
                <div>
                  <p className="text-sm font-medium text-gray-700">{ws.type}</p>
                  <p className="text-xs text-gray-400">
                    {ws.date ? formatDate(ws.date) : 'ללא תאריך'} · {ws.quantity} {unitLabel(ws.type)} × {formatILS(ws.ratePerUnit)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-green-600">{formatILS(ws.amount)}</span>
                  <button onClick={() => removeSess(ws.id)} className="text-red-400 text-xs px-1.5 hover:bg-red-50 rounded">✕</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 bg-green-50">
              <span className="text-xs font-semibold text-green-700">סה״כ</span>
              <span className="text-sm font-bold text-green-700">{formatILS(form.sessions.reduce((s, w) => s + w.amount, 0))}</span>
            </div>
          </div>
        )}
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="סוג">
              <Select value={newSess.type} onChange={v => {
                const last2 = [...form.sessions].reverse().find(w => w.type === v)
                setNewSess(s => ({ ...s, type: v, rate: last2 ? String(last2.ratePerUnit) : '', overtimeRate: last2 ? String(last2.overtimeRate || '') : '' }))
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
                <p className="text-xs text-green-600 font-semibold">סה״כ: {formatILS(base + ot)}</p>
                {ot > 0 && <p className="text-xs text-gray-400">בסיס {formatILS(base)} + שע״נ {formatILS(ot)}</p>}
              </div>
            )
          })()}
          <button onClick={addSessToForm} disabled={!newSess.rate}
            className="w-full bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
            + הוסף רישום
          </button>
        </div>
      </div>

      <SaveButton onClick={save} />
    </Modal>
  )
}
