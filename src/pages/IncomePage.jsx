import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton, DeleteButton } from '../components/Modal'
import TimePicker from '../components/TimePicker'
import Backdrop from '../components/Backdrop'
import { formatILS, formatDate, daysUntil, urgencyClass, urgencyLabel } from '../utils/formatters'

// ── Helpers: time and amount calculations ────────────────────────────

// Round up to nearest quarter hour (0.25). 10.1 → 10.25, 10.26 → 10.5
// Offset a 'HH:MM' time by whole hours (can be negative). Returns null if input invalid.
// Used to suggest smart default hints in the time picker (e.g. shoot end = start + 9).
const offsetTime = (hhmm, hourDelta) => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  let total = h + Number(hourDelta)
  if (total < 0) total += 24
  if (total >= 24) total -= 24
  const hh = String(Math.floor(total)).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

const roundUpQuarter = (h) => {
  const n = Number(h)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.ceil(n * 4) / 4
}

// Difference between two "HH:MM" strings in decimal hours.
// If end < start, assumes end is next day (e.g. shoot ended after midnight).
const timeDiffHours = (start, end) => {
  if (!start || !end) return 0
  const [sh, sm] = String(start).split(':').map(Number)
  const [eh, em] = String(end).split(':').map(Number)
  if (Number.isNaN(sh) || Number.isNaN(eh)) return 0
  let diff = (eh + (em || 0) / 60) - (sh + (sm || 0) / 60)
  if (diff < 0) diff += 24
  return diff
}

// Format a decimal hours value nicely: 10.25 → "10:15", 10.5 → "10:30"
const fmtHoursHM = (h) => {
  const n = Number(h) || 0
  const hours = Math.floor(n)
  const mins = Math.round((n - hours) * 60)
  return `${hours}:${String(mins).padStart(2, '0')}`
}

// Default overtime tiers for a photo day — Sun-Thu
// "fromHour: 11" means "the 11th hour and onwards" — i.e. once accumulated work hours cross 10
const DEFAULT_OT_TIERS = [
  { fromHour: 11, pct: 125 },
  { fromHour: 13, pct: 150 },
  { fromHour: 15, pct: 200 },
]

// Compute a photo day amount given total work hours, photo day rate, and overtime tiers
// Returns { baseAmt, overtimeAmt, total, breakdown: [{ label, amount }] }
const computePhotoDayAmount = (workHours, rate, tiers) => {
  const hours = roundUpQuarter(workHours)
  const r = Number(rate) || 0
  if (hours <= 0 || r <= 0) return { baseAmt: 0, overtimeAmt: 0, total: 0, breakdown: [] }

  const hourlyBase = r / 10
  const breakdown = [{ label: `יום בסיס (עד 10 שעות)`, amount: r }]

  if (hours <= 10) {
    return { baseAmt: r, overtimeAmt: 0, total: r, breakdown }
  }

  // Sort tiers and convert fromHour (user-facing) to accumulated-hour thresholds
  // "fromHour: 11" → starts at accumulated hour 10.0
  const sortedTiers = [...(tiers || [])]
    .map(t => ({ startAcc: (Number(t.fromHour) || 0) - 1, pct: Number(t.pct) || 0 }))
    .filter(t => t.startAcc >= 10 && t.pct > 0)
    .sort((a, b) => a.startAcc - b.startAcc)

  let overtimeAmt = 0

  if (sortedTiers.length === 0) {
    // No tiers defined — treat overtime as base rate
    const extra = hours - 10
    overtimeAmt = extra * hourlyBase
    breakdown.push({ label: `שעות נוספות: ${extra} × ₪${hourlyBase.toFixed(0)}`, amount: overtimeAmt })
    return { baseAmt: r, overtimeAmt, total: r + overtimeAmt, breakdown }
  }

  for (let i = 0; i < sortedTiers.length; i++) {
    const start = sortedTiers[i].startAcc
    const end = i + 1 < sortedTiers.length ? sortedTiers[i + 1].startAcc : Infinity
    if (hours <= start) break
    const hoursInRange = Math.min(hours, end) - start
    if (hoursInRange <= 0) continue
    const rangeAmt = hoursInRange * hourlyBase * (sortedTiers[i].pct / 100)
    overtimeAmt += rangeAmt
    const rangeLabel = end === Infinity
      ? `שעות ${start + 1}+: ${hoursInRange} × ₪${hourlyBase.toFixed(0)} × ${sortedTiers[i].pct}%`
      : `שעות ${start + 1}–${end}: ${hoursInRange} × ₪${hourlyBase.toFixed(0)} × ${sortedTiers[i].pct}%`
    breakdown.push({ label: rangeLabel, amount: rangeAmt })
  }

  return { baseAmt: r, overtimeAmt, total: r + overtimeAmt, breakdown }
}

// Compute rehearsal/fitting amount
// hours 1-2 at pct12%, hours 3+ at pct3plus% (each a percentage of a full photo day)
const computeRehearsalAmount = (hours, rate, pct12, pct3plus) => {
  const h = roundUpQuarter(hours)
  const r = Number(rate) || 0
  if (h <= 0 || r <= 0) return { total: 0, breakdown: [] }

  const p12 = (Number(pct12) || 15) / 100
  const p3  = (Number(pct3plus) || 30) / 100

  const breakdown = []
  let total = 0

  const firstTier = Math.min(h, 2)
  if (firstTier > 0) {
    const amt = firstTier * r * p12
    total += amt
    breakdown.push({ label: `שעות 1–${firstTier}: ${firstTier} × ₪${r} × ${Math.round(p12 * 100)}%`, amount: amt })
  }

  if (h > 2) {
    const extra = h - 2
    const amt = extra * r * p3
    total += amt
    breakdown.push({ label: `שעות 3–${h}: ${extra} × ₪${r} × ${Math.round(p3 * 100)}%`, amount: amt })
  }

  return { total, breakdown }
}

const EMPTY_INCOME = {
  name: '', amount: '', expectedDate: '', notes: '', accountId: '',
  sessions: [], agentCommission: false, addVat: false, invoiceSent: false, invoiceFile: null, invoiceFileName: null,
  // ── Project rate defaults ──
  photoDayRate: '',
  rehearsalPct12: 15,
  rehearsalPct3plus: 30,
  overtimeTiers: DEFAULT_OT_TIERS,
}
const EMPTY_NEW_SESS = {
  type: 'יום צילום', date: '',
  // Photo day: time fields
  pickupTime: '', shootStart: '', shootEnd: '', returnTime: '',
  // Photo day: manual hours override (empty = auto from shoot times)
  workHours: '',
  // Rehearsal/fitting: direct hours input
  hours: '',
  // Fallback for 'אחר'
  quantity: '1', rate: '',
  // Manual amount override (gov the computed total)
  manualMode: false, manualAmount: '',
  // Whether photo day calc uses travel hours (pickup→return) instead of shoot hours
  useTravelForCalc: false,
}
const unitLabel = t => t === 'יום צילום' ? 'ימים' : 'שעות'

// Human readable description of a session row for the list display.
// Handles both new-shape sessions (workHours / hours) and legacy (quantity × rate).
const formatSessionDetail = (ws) => {
  if (!ws) return '—'
  if (ws.manualMode) return 'סכום ידני'
  if (ws.type === 'יום צילום') {
    if (ws.workHours != null && ws.workHours !== '') {
      if (ws.useTravelForCalc && ws.travelHours) {
        return `${ws.travelHours} שעות (לפי דלת לדלת) · צילום ${ws.workHours}`
      }
      const travel = (ws.travelHours != null && ws.travelHours > 0) ? ` · כולל נסיעות ${ws.travelHours}` : ''
      return `${ws.workHours} שעות${travel}`
    }
    if (ws.quantity != null && ws.ratePerUnit != null) {
      return `${ws.quantity} ${unitLabel(ws.type)} × ${formatILS(ws.ratePerUnit)}`
    }
    return '—'
  }
  if (ws.type === 'חזרות' || ws.type === 'מדידות') {
    if (ws.hours != null && ws.hours !== '') return `${ws.hours} שעות`
    if (ws.quantity != null && ws.ratePerUnit != null) {
      return `${ws.quantity} ${unitLabel(ws.type)} × ${formatILS(ws.ratePerUnit)}`
    }
    return '—'
  }
  // Other / legacy
  if (ws.quantity != null && ws.ratePerUnit != null) {
    return `${ws.quantity} ${unitLabel(ws.type)} × ${formatILS(ws.ratePerUnit)}`
  }
  return '—'
}

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
    bubbleIncomeToTop,
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

  const location = useLocation()
  const navigate = useNavigate()

  const openAdd  = () => { setForm({ ...EMPTY_INCOME }); setNewSess(EMPTY_NEW_SESS); setModal('add') }
  const openEdit = (item) => {
    const sessions = item.sessions || []
    setForm({
      ...EMPTY_INCOME,
      ...item,
      expectedDate: item.expectedDate || '',
      sessions,
      // Ensure rate fields exist even on old income items
      photoDayRate: item.photoDayRate ?? '',
      rehearsalPct12: item.rehearsalPct12 ?? 15,
      rehearsalPct3plus: item.rehearsalPct3plus ?? 30,
      overtimeTiers: item.overtimeTiers || DEFAULT_OT_TIERS,
    })
    setNewSess(EMPTY_NEW_SESS)
    setModal({ item })
  }

  // Open edit modal automatically when navigated from QuickAdd with an id
  useEffect(() => {
    const openId = location.state?.openEditId
    if (!openId) return
    const item = futureIncome.find(f => f.id === openId)
    if (item) openEdit(item)
    // clear state so refresh doesn't re-open
    navigate('/income', { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openEditId])

  // Effective work hours for the photo day session preview:
  // manual override (workHours field) takes precedence, otherwise computed from shoot times
  const getEffectiveWorkHours = () => {
    if (newSess.workHours !== '' && newSess.workHours != null) {
      return Number(newSess.workHours) || 0
    }
    if (newSess.shootStart && newSess.shootEnd) {
      return roundUpQuarter(timeDiffHours(newSess.shootStart, newSess.shootEnd))
    }
    return 0
  }

  const getTravelHours = () => {
    if (newSess.pickupTime && newSess.returnTime) {
      return roundUpQuarter(timeDiffHours(newSess.pickupTime, newSess.returnTime))
    }
    return null
  }

  const addSessToForm = () => {
    const t = newSess.type
    let sess = null

    if (t === 'יום צילום') {
      const shootH = getEffectiveWorkHours()
      const travelH = getTravelHours()
      const hasTravel = travelH != null && travelH > 0
      const useTravel = !!newSess.useTravelForCalc && hasTravel
      const hoursForCalc = useTravel ? travelH : shootH
      const rate = Number(form.photoDayRate) || 0
      const tiers = form.overtimeTiers || DEFAULT_OT_TIERS
      const calc = computePhotoDayAmount(hoursForCalc, rate, tiers)
      const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : calc.total
      if (finalAmt <= 0) return

      sess = {
        id: 'ws' + Date.now(),
        type: t,
        date: newSess.date || null,
        pickupTime: newSess.pickupTime || null,
        shootStart: newSess.shootStart || null,
        shootEnd:   newSess.shootEnd   || null,
        returnTime: newSess.returnTime || null,
        workHours:   shootH || null,
        travelHours: travelH,
        useTravelForCalc: useTravel,
        photoDayRateUsed: rate,
        tiersUsed: tiers,
        baseAmt: calc.baseAmt,
        overtimeAmt: calc.overtimeAmt,
        manualMode: !!newSess.manualMode,
        manualAmount: newSess.manualMode ? (Number(newSess.manualAmount) || 0) : null,
        amount: finalAmt,
      }
    } else if (t === 'חזרות' || t === 'מדידות') {
      const h = Number(newSess.hours) || 0
      const rate = Number(form.photoDayRate) || 0
      const calc = computeRehearsalAmount(h, rate, form.rehearsalPct12, form.rehearsalPct3plus)
      const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : calc.total
      if (finalAmt <= 0) return

      sess = {
        id: 'ws' + Date.now(),
        type: t,
        date: newSess.date || null,
        hours: roundUpQuarter(h),
        photoDayRateUsed: rate,
        pct12Used:     Number(form.rehearsalPct12) || 15,
        pct3plusUsed:  Number(form.rehearsalPct3plus) || 30,
        manualMode: !!newSess.manualMode,
        manualAmount: newSess.manualMode ? (Number(newSess.manualAmount) || 0) : null,
        amount: finalAmt,
      }
    } else {
      // 'אחר' — keep legacy quantity × rate behavior
      if (!newSess.rate) return
      const qty  = Number(newSess.quantity) || 1
      const rate = Number(newSess.rate)
      sess = {
        id: 'ws' + Date.now(),
        type: t,
        date: newSess.date || null,
        quantity: qty,
        ratePerUnit: rate,
        amount: qty * rate,
      }
    }

    if (!sess) return
    const sessions = [...(form.sessions || []), sess]
    setForm(f => ({ ...f, sessions, amount: sessions.reduce((s, w) => s + (w.amount || 0), 0) }))
    setNewSess(EMPTY_NEW_SESS)
  }
  const removeSessFromForm = (id) => {
    const sessions = (form.sessions || []).filter(w => w.id !== id)
    setForm(f => ({ ...f, sessions, amount: sessions.reduce((s, w) => s + (w.amount || 0), 0) }))
  }
  const closeModal = () => setModal(null)

  const save = () => {
    const data = {
      ...form,
      amount:       form.amount === '' ? null : Number(form.amount),
      expectedDate: form.expectedDate || null,
    }
    if (modal === 'add') addFutureIncome(data)
    else {
      updateFutureIncome(modal.item.id, data)
      bubbleIncomeToTop(modal.item.id)
    }
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
            <div className="flex flex-col gap-1">
              <Input type="number" value={form.amount} onChange={v => set('amount', v)} placeholder="0" />
              {Number(form.amount) > 0 && (form.agentCommission || form.addVat) && (() => {
                const base = Number(form.amount)
                const afterAgent = form.agentCommission ? base * 0.85 : base
                const afterVat = form.addVat ? afterAgent * 1.18 : null
                return (
                  <div className="flex flex-col gap-0.5 text-xs text-orange-500 font-semibold">
                    {form.agentCommission && (
                      <span>אחרי עמלת סוכן: {formatILS(afterAgent)}</span>
                    )}
                    {form.addVat && (
                      <span>אחרי מע״מ: {formatILS(afterVat)}</span>
                    )}
                  </div>
                )
              })()}
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
          <div className="flex items-center gap-2 -mt-1 mb-1">
            <button
              type="button"
              onClick={() => set('addVat', !form.addVat)}
              className={`w-9 h-5 rounded-full transition-colors relative ${form.addVat ? 'bg-orange-400' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.addVat ? 'right-0.5' : 'left-0.5'}`} />
            </button>
            <span className="text-xs text-gray-500">מע״מ 18%</span>
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

          {/* ── Project rate defaults ── */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">תעריפי ברירת מחדל</p>
            <div className="bg-indigo-50 rounded-xl p-3 space-y-3">
              <Field label="תעריף יום צילום (₪)" hint="משמש בסיס לחישוב חזרות, מדידות ושעות נוספות">
                <Input type="number" value={form.photoDayRate} onChange={v => set('photoDayRate', v)} placeholder="0" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="% שעה 1–2 (חזרה/מדידה)">
                  <Input type="number" value={form.rehearsalPct12} onChange={v => set('rehearsalPct12', v)} placeholder="15" />
                </Field>
                <Field label="% שעה 3+ (חזרה/מדידה)">
                  <Input type="number" value={form.rehearsalPct3plus} onChange={v => set('rehearsalPct3plus', v)} placeholder="30" />
                </Field>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">מדרגות שעות נוספות ביום צילום</p>
                {(form.overtimeTiers || []).map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-gray-500 whitespace-nowrap">החל משעה</span>
                    <input
                      type="number"
                      value={tier.fromHour ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value)
                        set('overtimeTiers', (form.overtimeTiers || []).map((t, i) => i === idx ? { ...t, fromHour: val } : t))
                      }}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center"
                    />
                    <span className="text-xs text-gray-500">=</span>
                    <input
                      type="number"
                      value={tier.pct ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value)
                        set('overtimeTiers', (form.overtimeTiers || []).map((t, i) => i === idx ? { ...t, pct: val } : t))
                      }}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center"
                    />
                    <span className="text-xs text-gray-500">%</span>
                    <button
                      type="button"
                      onClick={() => set('overtimeTiers', (form.overtimeTiers || []).filter((_, i) => i !== idx))}
                      className="text-red-400 text-xs px-1.5 hover:bg-red-50 rounded mr-auto"
                    >✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const tiers = form.overtimeTiers || []
                    const last = tiers[tiers.length - 1]
                    const nextFrom = last ? (Number(last.fromHour) || 10) + 2 : 11
                    set('overtimeTiers', [...tiers, { fromHour: nextFrom, pct: 200 }])
                  }}
                  className="text-xs text-indigo-600 font-medium mt-1"
                >+ הוסף מדרגה</button>
              </div>
            </div>
          </div>

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
                        {ws.date ? formatDate(ws.date) : 'ללא תאריך'} · {formatSessionDetail(ws)}
                      </p>
                      {ws.overtimeAmt > 0 && (
                        <p className="text-xs text-orange-400">כולל שעות נוספות: {formatILS(ws.overtimeAmt)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-green-600">{formatILS(ws.amount)}</span>
                      <button onClick={() => removeSessFromForm(ws.id)} className="text-red-400 text-xs px-1.5 hover:bg-red-50 rounded">✕</button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 bg-green-50">
                  <span className="text-xs font-semibold text-green-700">סה״כ</span>
                  <span className="text-sm font-bold text-green-700">{formatILS((form.sessions || []).reduce((s, w) => s + (w.amount || 0), 0))}</span>
                </div>
              </div>
            )}

            {/* New session adder */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="סוג">
                  <Select value={newSess.type} onChange={v => setNewSess({ ...EMPTY_NEW_SESS, type: v, date: newSess.date })} options={SESSION_TYPES} />
                </Field>
                <Field label="תאריך">
                  <Input type="date" value={newSess.date} onChange={v => setNewSess(s => ({ ...s, date: v }))} />
                </Field>
              </div>

              {/* ═══ Photo day ═══ */}
              {newSess.type === 'יום צילום' && (() => {
                const rate = Number(form.photoDayRate) || 0
                const shootH = getEffectiveWorkHours()
                const travelH = getTravelHours()
                const hasTravel = travelH != null && travelH > 0
                const useTravel = !!newSess.useTravelForCalc && hasTravel
                const hoursForCalc = useTravel ? travelH : shootH
                const tiers = form.overtimeTiers || DEFAULT_OT_TIERS
                const calc    = computePhotoDayAmount(hoursForCalc, rate, tiers)
                const altCalc = hasTravel && shootH > 0
                  ? computePhotoDayAmount(useTravel ? shootH : travelH, rate, tiers)
                  : null
                const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : calc.total
                const canAdd = finalAmt > 0
                return (
                  <>
                    <div className="bg-white rounded-lg p-2 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">שעות הצילום (לחישוב)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="תחילת צילומים">
                          <TimePicker
                            value={newSess.shootStart}
                            onChange={v => setNewSess(s => ({ ...s, shootStart: v }))}
                            defaultHint="08:00"
                          />
                        </Field>
                        <Field label="סיום צילומים">
                          <TimePicker
                            value={newSess.shootEnd}
                            onChange={v => setNewSess(s => ({ ...s, shootEnd: v }))}
                            defaultHint={offsetTime(newSess.shootStart, 9) || '17:00'}
                          />
                        </Field>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">שעות איסוף וחזור (אופציונלי)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="שעת איסוף">
                          <TimePicker
                            value={newSess.pickupTime}
                            onChange={v => setNewSess(s => ({ ...s, pickupTime: v }))}
                            defaultHint={offsetTime(newSess.shootStart, -1) || '07:00'}
                          />
                        </Field>
                        <Field label="שעת חזור">
                          <TimePicker
                            value={newSess.returnTime}
                            onChange={v => setNewSess(s => ({ ...s, returnTime: v }))}
                            defaultHint={offsetTime(newSess.shootEnd, 1) || '18:00'}
                          />
                        </Field>
                      </div>
                      <Field label="שעות לחישוב (עשרוני — לעקיפת זמנים)" hint="השאר ריק כדי לחשב אוטומטית מזמני הצילום">
                        <Input type="number" value={newSess.workHours} onChange={v => setNewSess(s => ({ ...s, workHours: v }))} placeholder={`${shootH || 0}`} step="0.25" />
                      </Field>
                    </div>

                    {/* Rate used + warning */}
                    {rate === 0 ? (
                      <div className="bg-yellow-50 rounded-lg px-3 py-2 text-xs text-yellow-700">
                        ⚠ הגדר "תעריף יום צילום" למעלה כדי שהחישוב יפעל אוטומטית — או הפעל "סכום ידני"
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">תעריף יום צילום שמשמש: <span className="font-semibold text-gray-700">{formatILS(rate)}</span></div>
                    )}

                    {/* Calculation mode selector — shoot hours vs travel hours */}
                    {!newSess.manualMode && (shootH > 0 || hasTravel) && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNewSess(s => ({ ...s, useTravelForCalc: false }))}
                          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${!useTravel ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                        >
                          <div>לפי שעות צילום</div>
                          <div className="text-xs opacity-80 font-normal">{shootH || 0} שעות</div>
                        </button>
                        <button
                          type="button"
                          disabled={!hasTravel}
                          onClick={() => setNewSess(s => ({ ...s, useTravelForCalc: true }))}
                          className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${useTravel ? 'bg-indigo-600 text-white' : hasTravel ? 'bg-gray-100 text-gray-400' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}`}
                        >
                          <div>כולל נסיעות</div>
                          <div className="text-xs opacity-80 font-normal">{hasTravel ? `${travelH} שעות` : 'מלא שעות איסוף וחזור'}</div>
                        </button>
                      </div>
                    )}

                    {/* Breakdown of the SELECTED mode */}
                    {!newSess.manualMode && hoursForCalc > 0 && rate > 0 && (
                      <div className="bg-white rounded-lg p-2 space-y-1 border border-indigo-200">
                        <p className="text-xs font-semibold text-indigo-700">
                          חישוב {useTravel ? 'כולל נסיעות' : 'לפי שעות צילום'} — {hoursForCalc} שעות
                        </p>
                        {calc.breakdown.map((b, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-medium text-gray-700">{formatILS(b.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                          <span className="font-semibold text-green-700">סה״כ</span>
                          <span className="font-bold text-green-700">{formatILS(calc.total)}</span>
                        </div>
                      </div>
                    )}

                    {/* Comparison note — amount for the OTHER mode */}
                    {!newSess.manualMode && altCalc && rate > 0 && (
                      <p className="text-xs text-gray-400 text-center">
                        הערה: לפי {useTravel ? 'שעות צילום' : 'סך כולל נסיעות'} הסכום היה {formatILS(altCalc.total)}
                      </p>
                    )}

                    {/* Manual override toggle */}
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!newSess.manualMode}
                        onChange={e => setNewSess(s => ({ ...s, manualMode: e.target.checked }))}
                      />
                      סכום ידני (עוקף את החישוב)
                    </label>
                    {newSess.manualMode && (
                      <Field label="סכום ידני (₪)">
                        <Input type="number" value={newSess.manualAmount} onChange={v => setNewSess(s => ({ ...s, manualAmount: v }))} placeholder="0" />
                      </Field>
                    )}

                    <button onClick={addSessToForm} disabled={!canAdd} className="w-full bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      + הוסף רישום · {formatILS(finalAmt)}
                    </button>
                  </>
                )
              })()}

              {/* ═══ Rehearsal / fitting ═══ */}
              {(newSess.type === 'חזרות' || newSess.type === 'מדידות') && (() => {
                const rate = Number(form.photoDayRate) || 0
                const h = Number(newSess.hours) || 0
                const calc = computeRehearsalAmount(h, rate, form.rehearsalPct12, form.rehearsalPct3plus)
                const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : calc.total
                const canAdd = finalAmt > 0
                return (
                  <>
                    <Field label="מספר שעות (עשרוני — לדוגמה 2.5)">
                      <Input type="number" value={newSess.hours} onChange={v => setNewSess(s => ({ ...s, hours: v }))} placeholder="0" step="0.25" />
                    </Field>

                    {rate === 0 ? (
                      <div className="bg-yellow-50 rounded-lg px-3 py-2 text-xs text-yellow-700">
                        ⚠ הגדר "תעריף יום צילום" למעלה כדי שהחישוב יפעל אוטומטית — או הפעל "סכום ידני"
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">
                        תעריף יום צילום: <span className="font-semibold text-gray-700">{formatILS(rate)}</span>
                        {' · '}
                        שעה 1–2: {form.rehearsalPct12 || 15}% · שעה 3+: {form.rehearsalPct3plus || 30}%
                      </div>
                    )}

                    {!newSess.manualMode && h > 0 && rate > 0 && (
                      <div className="bg-white rounded-lg p-2 space-y-1">
                        {calc.breakdown.map((b, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-500">{b.label}</span>
                            <span className="font-medium text-gray-700">{formatILS(b.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                          <span className="font-semibold text-green-700">סה״כ</span>
                          <span className="font-bold text-green-700">{formatILS(calc.total)}</span>
                        </div>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!newSess.manualMode}
                        onChange={e => setNewSess(s => ({ ...s, manualMode: e.target.checked }))}
                      />
                      סכום ידני (עוקף את החישוב)
                    </label>
                    {newSess.manualMode && (
                      <Field label="סכום ידני (₪)">
                        <Input type="number" value={newSess.manualAmount} onChange={v => setNewSess(s => ({ ...s, manualAmount: v }))} placeholder="0" />
                      </Field>
                    )}

                    <button onClick={addSessToForm} disabled={!canAdd} className="w-full bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      + הוסף רישום · {formatILS(finalAmt)}
                    </button>
                  </>
                )
              })()}

              {/* ═══ Other ═══ */}
              {newSess.type === 'אחר' && (() => {
                const qty = Number(newSess.quantity) || 0
                const rate = Number(newSess.rate) || 0
                const total = qty * rate
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="כמות">
                        <Input type="number" value={newSess.quantity} onChange={v => setNewSess(s => ({ ...s, quantity: v }))} placeholder="1" min="1" />
                      </Field>
                      <Field label="תעריף ליחידה (₪)">
                        <Input type="number" value={newSess.rate} onChange={v => setNewSess(s => ({ ...s, rate: v }))} placeholder="0" />
                      </Field>
                    </div>
                    {total > 0 && (
                      <div className="text-center text-xs text-green-600 font-semibold">סה״כ: {formatILS(total)}</div>
                    )}
                    <button onClick={addSessToForm} disabled={!newSess.rate} className="w-full bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      + הוסף רישום
                    </button>
                  </>
                )
              })()}
            </div>
          </div>

          <SaveButton onClick={save} />
          {modal !== 'add' && <DeleteButton onClick={remove} />}
        </Modal>
      )}

      {/* ── Receive: account picker ── */}
      {receiveModal && (
        <Backdrop
          className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-30"
          onClose={() => setReceiveModal(null)}
        >
          <div className="relative bg-white rounded-t-2xl w-full shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">התקבל — {receiveModal.item.name}</h3>
              <button onClick={() => setReceiveModal(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <p className="text-2xl font-bold text-green-600 text-center">{formatILS(receiveModal.item.amount)}</p>
            <div>
              <p className="text-xs text-gray-500 mb-2">לאיזה חשבון לזכות?</p>
              <div className="space-y-2 max-h-48 overflow-y-auto scroll-right">
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
        </Backdrop>
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
            {(item.amount || 0) > 0 && (item.agentCommission || item.addVat) && (() => {
              const base = Number(item.amount) || 0
              const afterAgent = item.agentCommission ? base * 0.85 : base
              const afterVat = item.addVat ? afterAgent * 1.18 : null
              return (
                <>
                  {item.agentCommission && (
                    <p className="text-xs text-orange-500 font-semibold">
                      אחרי עמלת סוכן: {formatILS(afterAgent)}
                    </p>
                  )}
                  {item.addVat && (
                    <p className="text-xs text-orange-500 font-semibold">
                      אחרי מע״מ: {formatILS(afterVat)}
                    </p>
                  )}
                </>
              )
            })()}
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
