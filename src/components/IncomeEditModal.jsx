import { useState } from 'react'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton } from './Modal'
import { formatILS, formatDate } from '../utils/formatters'

const EMPTY_NEW_SESS = { type: 'יום צילום', date: '', quantity: '1', rate: '', overtimeHours: '', overtimeRate: '' }
const SESSION_TYPES  = [
  { value: 'יום צילום', label: 'יום צילום' },
  { value: 'חזרות',     label: 'חזרות'     },
  { value: 'מדידות',    label: 'מדידות'    },
  { value: 'אחר',       label: 'אחר'       },
]
const unitLabel = t => t === 'יום צילום' ? 'ימים' : 'שעות'

export default function IncomeEditModal({ item, onClose }) {
  const { accounts, updateFutureIncome } = useStore()
  const ilsAccounts   = accounts.filter(a => a.currency !== 'USD')
  const accountOptions = [
    { value: '', label: 'לא מקושר לחשבון' },
    ...ilsAccounts.map(a => ({ value: a.id, label: a.name })),
  ]

  const [form, setForm] = useState({
    name:            item.name            || '',
    amount:          item.amount != null  ? String(item.amount) : '',
    agentCommission: item.agentCommission || false,
    invoiceSent:     item.invoiceSent     || false,
    invoiceFile:     item.invoiceFile     || null,
    invoiceFileName: item.invoiceFileName || null,
    expectedDate:    item.expectedDate    || '',
    notes:           item.notes           || '',
    accountId:       item.accountId       || '',
    sessions:        item.sessions        || [],
  })

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

  return (
    <Modal title="עריכת הכנסה" onClose={onClose}>
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

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">חשבונית</p>
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
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => {
                const file = e.target.files?.[0]; if (!file) return
                const reader = new FileReader()
                reader.onload = ev => { set('invoiceFile', ev.target.result); set('invoiceFileName', file.name) }
                reader.readAsDataURL(file)
              }} />
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
