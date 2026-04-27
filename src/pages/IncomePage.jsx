import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import Modal, { Field, Input, Select, Textarea, SaveButton, DeleteButton } from '../components/Modal'
import TimePicker from '../components/TimePicker'
import Backdrop from '../components/Backdrop'
import PartialPaymentModal from '../components/PartialPaymentModal'
import { exportIncomeReport } from '../lib/exportIncomeReport'
import { calcDistanceFromHome } from '../lib/distanceCalc'
import { analyzeContractDoc } from '../lib/analyzeContractDoc'
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
  // בעלים של הפרויקט — 'tomer' או 'yael'. ברירת מחדל לפרויקט חדש: תומר
  owner: 'tomer',
  // סוג פרויקט — 'film' (קולנוע/טלוויזיה) או 'theater' (תיאטרון)
  projectType: 'film',
  // ── Project rate defaults (film) ──
  photoDayRate: '',
  rehearsalPct12: 15,
  rehearsalPct3plus: 30,
  overtimeTiers: DEFAULT_OT_TIERS,
  // ── Theater rate defaults ──
  theaterShowPrice: '',
  theaterMonthlyRehearsal: '',
  theaterRehearsalTotal: '',
  theaterPostRehearsal: '',
  // ── Commercial (campaign) fields ──
  commercialClient: '',
  commercialPlatform: '',
  commercialShootDaysContract: '',
  // ── Dubbing fields ──
  dubbingProductionType: 'major', // 'major' | 'independent' | 'tv'
  dubbingFirstHourRate: 300,
  dubbingHalfHourRate: 150,
  dubbingSongBonus: 150,
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
  // מיקום סט
  setLocation: '',
  setDistanceKm: null,
  setIsAboveThreshold: null,
  // Theater fields
  theaterLocation: '',
  theaterMonth: '',
  // Commercial fields
  commercialNote: '',
  // Dubbing fields
  dubbingStart: '',        // recording start time HH:MM
  dubbingEnd: '',          // recording end time HH:MM
  dubbingHours: '',        // auto-calculated or manual override
  dubbingHasSong: false,   // solo/duet song bonus
}
const unitLabel = t => t === 'יום צילום' ? 'ימים' : 'שעות'

// Human readable description of a session row for the list display.
// Handles both new-shape sessions (workHours / hours) and legacy (quantity × rate).
const formatSessionDetail = (ws) => {
  if (!ws) return '—'

  // בניית תיאור שעות — משותף לכל הסוגים
  const timeParts = []
  if (ws.shootStart && ws.shootEnd) timeParts.push(`${ws.shootStart}–${ws.shootEnd}`)
  if (ws.pickupTime) timeParts.push(`איסוף ${ws.pickupTime}`)
  if (ws.returnTime) timeParts.push(`חזרה ${ws.returnTime}`)
  const timeStr = timeParts.length > 0 ? timeParts.join(' · ') : ''

  if (ws.type === 'יום צילום') {
    const parts = []
    if (timeStr) parts.push(timeStr)
    if (ws.workHours != null && ws.workHours !== '') {
      if (ws.useTravelForCalc && ws.travelHours) {
        parts.push(`${ws.travelHours} שעות (דלת לדלת) · צילום ${ws.workHours}`)
      } else {
        const travel = (ws.travelHours != null && ws.travelHours > 0) ? ` · כולל נסיעות ${ws.travelHours}` : ''
        parts.push(`${ws.workHours} שעות${travel}`)
      }
    }
    if (ws.manualMode) parts.push('סכום ידני')
    return parts.length > 0 ? parts.join(' · ') : '—'
  }
  if (ws.type === 'חזרות' || ws.type === 'מדידות') {
    const parts = []
    if (timeStr) parts.push(timeStr)
    if (ws.hours != null && ws.hours !== '') parts.push(`${ws.hours} שעות`)
    if (ws.manualMode) parts.push('סכום ידני')
    return parts.length > 0 ? parts.join(' · ') : '—'
  }
  // Theater types
  if (ws.type === 'הצגה') {
    const parts = []
    if (ws.theaterLocation) parts.push(`📍 ${ws.theaterLocation}`)
    if (timeStr) parts.push(timeStr)
    if (ws.manualMode) parts.push('סכום ידני')
    return parts.length > 0 ? parts.join(' · ') : 'הצגה'
  }
  if (ws.type === 'חזרות חודשיות') return ws.theaterMonth || 'חודש'
  if (ws.type === 'חזרה אחרי עלייה' || ws.type === 'חזרת רענון' || ws.type === 'חזרת מקומים באולם חדש' || ws.type === 'חזרת טקסט' || ws.type === 'צילומי טריילר' || ws.type === 'צילומי הצגה') {
    const parts = []
    if (timeStr) parts.push(timeStr)
    if (ws.manualMode) parts.push('סכום ידני')
    return parts.length > 0 ? parts.join(' · ') : ws.type
  }
  // Commercial types
  if (COMMERCIAL_TYPE_LABELS[ws.type]) {
    const parts = []
    if (timeStr) parts.push(timeStr)
    if (ws.commercialNote) parts.push(ws.commercialNote)
    if (ws.manualMode) parts.push('סכום ידני')
    return parts.length > 0 ? parts.join(' · ') : COMMERCIAL_TYPE_LABELS[ws.type]
  }
  // Dubbing
  if (ws.dubbingStart && ws.dubbingEnd) {
    const parts = [`${ws.dubbingStart}–${ws.dubbingEnd}`]
    if (ws.dubbingHours) parts.push(`${ws.dubbingHours} שעות`)
    if (ws.manualMode) parts.push('סכום ידני')
    return parts.join(' · ')
  }
  // Other / legacy
  if (ws.quantity != null && ws.ratePerUnit != null) {
    return `${ws.quantity} ${unitLabel(ws.type)} × ${formatILS(ws.ratePerUnit)}`
  }
  if (ws.manualMode) return 'סכום ידני'
  return '—'
}

const FILM_SESSION_TYPES = [
  { value: 'יום צילום', label: 'יום צילום' },
  { value: 'חזרות',     label: 'חזרות'     },
  { value: 'מדידות',    label: 'מדידות'    },
  { value: 'אחר',       label: 'אחר'       },
]
const THEATER_SESSION_TYPES = [
  { value: 'הצגה',                        label: '🎭 הצגה' },
  { value: 'חזרות חודשיות',               label: '📅 חזרות חודשיות' },
  { value: 'חזרה אחרי עלייה',            label: '🔄 חזרה אחרי עלייה' },
  { value: 'חזרת רענון',                 label: '🔁 חזרת רענון' },
  { value: 'חזרת מקומים באולם חדש',      label: '🏛️ חזרת מקומים' },
  { value: 'חזרת טקסט',                  label: '📝 חזרת טקסט' },
  { value: 'צילומי טריילר',              label: '🎬 צילומי טריילר' },
  { value: 'צילומי הצגה',                label: '🎥 צילומי הצגה' },
  { value: 'אחר',                         label: 'אחר' },
]
const COMMERCIAL_SESSION_TYPES = [
  { value: 'צילום',          label: '📷 צילום' },
  { value: 'מדידות מסחרי',   label: '📏 מדידות' },
  { value: 'פגישה',          label: '🤝 פגישה' },
  { value: 'חזרה מסחרי',     label: '🔄 חזרה' },
  { value: 'עריכה / פוסט',   label: '✂️ עריכה / פוסט' },
  { value: 'העלאת תוכן',     label: '📤 העלאת תוכן' },
  { value: 'אחר',            label: 'אחר' },
]
const DUBBING_SESSION_TYPES = [
  { value: 'הקלטה',  label: '🎙️ הקלטה' },
  { value: 'השלמה',  label: '🔄 השלמה' },
  { value: 'טריילר', label: '🎬 טריילר' },
  { value: 'סרט',    label: '🎥 סרט' },
  { value: 'אחר',    label: 'אחר' },
]
const DUBBING_RATE_PRESETS = {
  major:       { firstHour: 300, halfHour: 150, songBonus: 150 },
  independent: { firstHour: 200, halfHour: 100, songBonus: 150 },
  tv:          { firstHour: 150, halfHour: 75,  songBonus: 150 },
}
function computeDubbingAmount(hours, firstHourRate, halfHourRate, hasSong, songBonus) {
  if (!hours || hours <= 0) return 0
  // First hour
  let total = firstHourRate
  // Additional half-hours (round up to next half-hour)
  if (hours > 1) {
    const extra = hours - 1
    const halfHours = Math.ceil(extra / 0.5)
    total += halfHours * halfHourRate
  }
  if (hasSong) total += songBonus
  return total
}
const COMMERCIAL_TYPE_LABELS = {
  'צילום': '📷 צילום',
  'מדידות מסחרי': '📏 מדידות',
  'פגישה': '🤝 פגישה',
  'חזרה מסחרי': '🔄 חזרה',
  'עריכה / פוסט': '✂️ עריכה / פוסט',
  'העלאת תוכן': '📤 העלאת תוכן',
}
const EMPTY_SESSION = { type: 'יום צילום', date: '', amount: '', notes: '' }

export default function IncomePage() {
  const {
    accounts,
    futureIncome, addFutureIncome, updateFutureIncome, deleteFutureIncome,
    markIncomeReceived, markIncomePending,
    addWorkSession, deleteWorkSession,
    bubbleIncomeToTop,
    removeIncomePayment, confirmedEvents,
  } = useStore()

  const ilsAccounts = accounts.filter(a => a.currency !== 'USD')
  const accountOptions = [
    { value: '', label: 'לא מקושר לחשבון' },
    ...ilsAccounts.map(a => ({ value: a.id, label: a.name })),
  ]

  const [modal,        setModal]      = useState(null)
  const [form,         setForm]       = useState(EMPTY_INCOME)
  const [filter,       setFilter]     = useState('pending')
  const [ownerFilter,  setOwnerFilter] = useState('all') // 'all' | 'tomer' | 'yael'
  // חלון ייצוא לסוכנות — שומר את תאריך החיתוך הנבחר (ברירת מחדל: היום)
  const [exportCutoff, setExportCutoff] = useState('')
  const [showExport,   setShowExport]   = useState(false)
  const [workModal,    setWorkModal]  = useState(null) // { item }
  const [sessForm,     setSessForm]   = useState(EMPTY_SESSION)
  const [receiveModal, setReceiveModal] = useState(null) // { item }
  const [receiveAccId, setReceiveAccId] = useState('')
  const [newSess,      setNewSess]      = useState(EMPTY_NEW_SESS)
  const [distLoading,  setDistLoading]  = useState(false)
  const [showPartialModal, setShowPartialModal] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const contractInputRef = useRef(null)

  const handleContractFile = async (file) => {
    if (!file) return
    setAnalyzing(true)
    try {
      const result = await analyzeContractDoc(file, form.projectType)
      if (result.error) {
        alert('שגיאה בניתוח: ' + result.error)
        setAnalyzing(false)
        return
      }
      // מילוי אוטומטי של השדות שחזרו מהניתוח
      setForm(prev => {
        const updated = { ...prev }
        if (result.name) updated.name = result.name
        if (result.amount != null) updated.amount = result.amount
        if (result.expectedDate) updated.expectedDate = result.expectedDate
        if (result.notes) updated.notes = result.notes
        // agentCommission ו-addVat נשארים ידניים — לא ממלאים מהחוזה
        // Film fields
        if (result.photoDayRate != null) updated.photoDayRate = result.photoDayRate
        if (result.rehearsalPct12 != null) updated.rehearsalPct12 = result.rehearsalPct12
        if (result.rehearsalPct3plus != null) updated.rehearsalPct3plus = result.rehearsalPct3plus
        if (result.overtimeTiers) updated.overtimeTiers = result.overtimeTiers
        // Theater fields
        if (result.theaterShowPrice != null) updated.theaterShowPrice = result.theaterShowPrice
        if (result.theaterMonthlyRehearsal != null) updated.theaterMonthlyRehearsal = result.theaterMonthlyRehearsal
        if (result.theaterRehearsalTotal != null) updated.theaterRehearsalTotal = result.theaterRehearsalTotal
        if (result.theaterPostRehearsal != null) updated.theaterPostRehearsal = result.theaterPostRehearsal
        // Commercial fields
        if (result.commercialClient) updated.commercialClient = result.commercialClient
        if (result.commercialPlatform) updated.commercialPlatform = result.commercialPlatform
        if (result.commercialShootDaysContract != null) updated.commercialShootDaysContract = result.commercialShootDaysContract
        return updated
      })
    } catch (err) {
      alert('שגיאה: ' + (err.message || err))
    }
    setAnalyzing(false)
  }

  // ── Helper: files תאימות לאחור לשדה invoiceFile הישן ──
  const getFilesFromItem = (it) => {
    if (!it) return []
    if (Array.isArray(it.files) && it.files.length > 0) return it.files
    if (it.invoiceFile) {
      return [{
        id: 'legacy_inv',
        type: 'invoice',
        file: it.invoiceFile,
        fileName: it.invoiceFileName || 'חשבונית',
        uploadedAt: null,
      }]
    }
    return []
  }

  const closeProject  = (id, e) => { e.stopPropagation(); updateFutureIncome(id, { isWorkLog: false }) }
  const reopenProject = (id, e) => { e.stopPropagation(); updateFutureIncome(id, { isWorkLog: true  }) }

  // סינון לפי בעלים: 'all' מציג הכל, אחרת רק של הבעלים שנבחר
  const ownerMatches = (f) => {
    if (ownerFilter === 'all') return true
    return (f.owner || '') === ownerFilter
  }
  const pending  = futureIncome.filter(f => f.status === 'pending'  && ownerMatches(f))
  const received = futureIncome.filter(f => f.status === 'received' && ownerMatches(f))
  const visible  = filter === 'pending' ? pending : filter === 'received' ? received : futureIncome.filter(ownerMatches)

  const totalPending  = pending.reduce((s, f)  => s + (f.amount || 0), 0)
  const totalReceived = received.reduce((s, f) => s + (f.amount || 0), 0)

  const location = useLocation()
  const navigate = useNavigate()

  const [showTypePicker, setShowTypePicker] = useState(false)
  const [pickerOwner, setPickerOwner] = useState('tomer')
  const openAdd  = (projectType = 'film', owner = 'tomer') => {
    const defaultSessType = projectType === 'commercial' ? 'צילום' : projectType === 'theater' ? 'הצגה' : projectType === 'dubbing' ? 'הקלטה' : 'יום צילום'
    setForm({ ...EMPTY_INCOME, projectType, owner })
    setNewSess({ ...EMPTY_NEW_SESS, type: defaultSessType })
    setModal('add')
    setShowTypePicker(false)
  }
  const openEdit = (item) => {
    const sessions = item.sessions || []
    setForm({
      ...EMPTY_INCOME,
      ...item,
      expectedDate: item.expectedDate || '',
      sessions,
      // בעלים — לפרויקטים קיימים ללא שיוך נשאר ריק עד בחירה ידנית
      owner: item.owner || '',
      projectType: item.projectType || 'film',
      // Ensure rate fields exist even on old income items
      photoDayRate: item.photoDayRate ?? '',
      rehearsalPct12: item.rehearsalPct12 ?? 15,
      rehearsalPct3plus: item.rehearsalPct3plus ?? 30,
      overtimeTiers: item.overtimeTiers || DEFAULT_OT_TIERS,
      // Theater rates
      theaterShowPrice: item.theaterShowPrice ?? '',
      theaterMonthlyRehearsal: item.theaterMonthlyRehearsal ?? '',
      theaterRehearsalTotal: item.theaterRehearsalTotal ?? '',
      theaterPostRehearsal: item.theaterPostRehearsal ?? '',
      // Commercial fields
      commercialClient: item.commercialClient ?? '',
      commercialPlatform: item.commercialPlatform ?? '',
      commercialShootDaysContract: item.commercialShootDaysContract ?? '',
    })
    const editDefaultType = (item.projectType || 'film') === 'commercial' ? 'צילום' : (item.projectType || 'film') === 'theater' ? 'הצגה' : (item.projectType || 'film') === 'dubbing' ? 'הקלטה' : 'יום צילום'
    setNewSess({ ...EMPTY_NEW_SESS, type: editDefaultType })
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

  // Open new project from QuickAdd navigation
  useEffect(() => {
    const projectType = location.state?.newProjectType
    if (!projectType) return
    const owner = location.state?.newProjectOwner || 'tomer'
    openAdd(projectType, owner)
    navigate('/income', { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.newProjectType])

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

  // בונה אובייקט רישום מתוך ערכי הטופס הנוכחיים. מחזיר null אם אין מספיק נתונים.
  // אם קיבל editingId — משתמש בו כ-id של הרישום (לשמירה על מיקום ברשימה).
  const buildSessionFromNewSess = (editingId = null) => {
    const t = newSess.type
    const id = editingId || ('ws' + Date.now())

    // ── Commercial types — documentation only, no amount calc ──
    if (form.projectType === 'commercial' && t !== 'אחר') {
      // אל תיצור רישום ריק — רק אם יש תאריך או הערה או שמדובר בעריכה קיימת
      if (!editingId && !newSess.date && !newSess.commercialNote) return null
      return {
        id,
        type: t,
        date: newSess.date || null,
        shootStart: newSess.shootStart || null,
        shootEnd: newSess.shootEnd || null,
        setLocation: newSess.setLocation || null,
        commercialNote: newSess.commercialNote || null,
        amount: 0,
      }
    }
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
      if (finalAmt < 0) return null
      if (finalAmt === 0 && !newSess.manualMode) return null
      return {
        id,
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
        setLocation: newSess.setLocation || null,
        setDistanceKm: newSess.setDistanceKm ?? null,
        setIsAboveThreshold: newSess.setIsAboveThreshold ?? null,
      }
    }
    if (t === 'חזרות' || t === 'מדידות') {
      const autoH = (newSess.shootStart && newSess.shootEnd)
        ? roundUpQuarter(timeDiffHours(newSess.shootStart, newSess.shootEnd))
        : 0
      const h = newSess.hours !== '' ? Number(newSess.hours) : autoH
      const rate = Number(form.photoDayRate) || 0
      const calc = computeRehearsalAmount(h, rate, form.rehearsalPct12, form.rehearsalPct3plus)
      const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : calc.total
      if (finalAmt < 0) return null
      if (finalAmt === 0 && !newSess.manualMode) return null
      return {
        id,
        type: t,
        date: newSess.date || null,
        shootStart: newSess.shootStart || null,
        shootEnd: newSess.shootEnd || null,
        hours: roundUpQuarter(h),
        photoDayRateUsed: rate,
        pct12Used:     Number(form.rehearsalPct12) || 15,
        pct3plusUsed:  Number(form.rehearsalPct3plus) || 30,
        manualMode: !!newSess.manualMode,
        manualAmount: newSess.manualMode ? (Number(newSess.manualAmount) || 0) : null,
        amount: finalAmt,
      }
    }
    // ── Theater: חזרות חודשיות — סכום ידני תמיד (מול סכום כולל חזרות) ──
    if (t === 'חזרות חודשיות') {
      const finalAmt = Number(newSess.manualAmount) || 0
      if (newSess.manualAmount === '' || newSess.manualAmount === undefined) return null
      return {
        id,
        type: t,
        date: newSess.date || null,
        theaterMonth: newSess.theaterMonth || null,
        amount: finalAmt,
      }
    }
    // ── Theater types ──
    const theaterTypes = {
      'הצגה':                       'theaterShowPrice',
      'חזרה אחרי עלייה':           'theaterPostRehearsal',
      'חזרת רענון':                 'theaterPostRehearsal',
      'חזרת מקומים באולם חדש':     'theaterPostRehearsal',
      'חזרת טקסט':                  'theaterPostRehearsal',
      'צילומי טריילר':              'theaterPostRehearsal',
      'צילומי הצגה':                'theaterPostRehearsal',
    }
    if (theaterTypes[t]) {
      const price = Number(form[theaterTypes[t]]) || 0
      const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : price
      if (finalAmt < 0) return null
      if (finalAmt === 0 && !newSess.manualMode) return null
      return {
        id,
        type: t,
        date: newSess.date || null,
        shootStart: newSess.shootStart || null,
        shootEnd: newSess.shootEnd || null,
        theaterLocation: newSess.theaterLocation || null,
        theaterMonth: newSess.theaterMonth || null,
        manualMode: !!newSess.manualMode,
        manualAmount: newSess.manualMode ? (Number(newSess.manualAmount) || 0) : null,
        amount: finalAmt,
      }
    }
    // ── Dubbing: הקלטה / השלמה ──
    if (form.projectType === 'dubbing' && (t === 'הקלטה' || t === 'השלמה')) {
      const autoH = (newSess.dubbingStart && newSess.dubbingEnd)
        ? roundUpQuarter(timeDiffHours(newSess.dubbingStart, newSess.dubbingEnd))
        : 0
      const h = newSess.dubbingHours !== '' ? Number(newSess.dubbingHours) : autoH
      const firstHR = Number(form.dubbingFirstHourRate) || 0
      const halfHR = Number(form.dubbingHalfHourRate) || 0
      const hasSong = !!newSess.dubbingHasSong
      const songB = Number(form.dubbingSongBonus) || 0
      const computed = computeDubbingAmount(h, firstHR, halfHR, hasSong, songB)
      const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : computed
      if (finalAmt < 0) return null
      if (finalAmt === 0 && !newSess.manualMode) return null
      return {
        id,
        type: t,
        date: newSess.date || null,
        dubbingStart: newSess.dubbingStart || null,
        dubbingEnd: newSess.dubbingEnd || null,
        dubbingHours: h,
        dubbingHasSong: hasSong,
        dubbingFirstHourRateUsed: firstHR,
        dubbingHalfHourRateUsed: halfHR,
        dubbingSongBonusUsed: songB,
        manualMode: !!newSess.manualMode,
        manualAmount: newSess.manualMode ? (Number(newSess.manualAmount) || 0) : null,
        amount: finalAmt,
      }
    }
    // טריילר — ₪200 קבוע
    if (form.projectType === 'dubbing' && t === 'טריילר') {
      return { id, type: t, date: newSess.date || null, amount: 200 }
    }
    // סרט — שעות × ₪166
    if (form.projectType === 'dubbing' && t === 'סרט') {
      const autoH = (newSess.dubbingStart && newSess.dubbingEnd)
        ? roundUpQuarter(timeDiffHours(newSess.dubbingStart, newSess.dubbingEnd))
        : 0
      const h = newSess.dubbingHours !== '' ? Number(newSess.dubbingHours) : autoH
      const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : Math.round(h * 166)
      if (finalAmt <= 0 && !newSess.manualMode) return null
      return {
        id, type: t, date: newSess.date || null,
        dubbingStart: newSess.dubbingStart || null,
        dubbingEnd: newSess.dubbingEnd || null,
        dubbingHours: h,
        manualMode: !!newSess.manualMode,
        manualAmount: newSess.manualMode ? (Number(newSess.manualAmount) || 0) : null,
        amount: finalAmt,
      }
    }
    // 'אחר' — לפי כמות × תעריף
    if (!newSess.rate) return null
    const qty  = Number(newSess.quantity) || 1
    const rate = Number(newSess.rate)
    return {
      id,
      type: t,
      date: newSess.date || null,
      shootStart: newSess.shootStart || null,
      shootEnd: newSess.shootEnd || null,
      quantity: qty,
      ratePerUnit: rate,
      amount: qty * rate,
    }
  }

  // מזהה של רישום שנמצא כרגע בעריכה — אם לא ריק, הוא יחליף את הישן במקומו
  const [editingSessId, setEditingSessId] = useState(null)
  // Auto-open next time picker after selecting start time
  const [autoOpenEnd, setAutoOpenEnd] = useState(false)
  const [autoOpenReturn, setAutoOpenReturn] = useState(false)
  const [autoOpenDubbingEnd, setAutoOpenDubbingEnd] = useState(false)

  const defaultSessType = () =>
    form.projectType === 'commercial' ? 'צילום' :
    form.projectType === 'theater'    ? 'הצגה'  :
    form.projectType === 'dubbing'    ? 'הקלטה' : 'יום צילום'

  const addSessToForm = () => {
    const sess = buildSessionFromNewSess(editingSessId)
    if (!sess) return
    const base = form.sessions || []
    const sessions = editingSessId
      ? base.map(w => w.id === editingSessId ? sess : w)
      : [...base, sess]
    const totalAmount = sessions.reduce((s, w) => s + (w.amount || 0), 0)
    // מסחרי: לא לדרוס את הסכום הקבוע עם סכום הרישומים (שהוא 0)
    const updatedAmount = form.projectType === 'commercial' ? form.amount : totalAmount
    setForm(f => ({ ...f, sessions, amount: updatedAmount }))
    // שמירה מיידית לענן במצב עריכה — שלא נאבד רישום אם הדף ייסגר/ייטען מחדש
    if (modal !== 'add' && modal?.item) {
      updateFutureIncome(modal.item.id, form.projectType === 'commercial' ? { sessions } : { sessions, amount: totalAmount })
    }
    setNewSess({ ...EMPTY_NEW_SESS, type: defaultSessType() })
    setEditingSessId(null)
  }

  // טוען רישום קיים לטופס כדי לערוך אותו. שומר את המזהה כדי להחליפו בשמירה.
  const startEditSess = (ws) => {
    setEditingSessId(ws.id)
    setNewSess({
      type: ws.type || 'יום צילום',
      date: ws.date || '',
      pickupTime: ws.pickupTime || '',
      shootStart: ws.shootStart || '',
      shootEnd:   ws.shootEnd   || '',
      returnTime: ws.returnTime || '',
      workHours:  ws.workHours != null ? String(ws.workHours) : '',
      hours:      ws.hours     != null ? String(ws.hours)     : '',
      quantity:   ws.quantity  != null ? String(ws.quantity)  : '1',
      rate:       ws.ratePerUnit != null ? String(ws.ratePerUnit) : '',
      manualMode: !!ws.manualMode,
      manualAmount: ws.type === 'חזרות חודשיות'
        ? (ws.amount != null ? String(ws.amount) : '')
        : (ws.manualAmount != null ? String(ws.manualAmount) : ''),
      useTravelForCalc: !!ws.useTravelForCalc,
      setLocation: ws.setLocation || '',
      setDistanceKm: ws.setDistanceKm ?? null,
      setIsAboveThreshold: ws.setIsAboveThreshold ?? null,
      theaterLocation: ws.theaterLocation || '',
      theaterMonth: ws.theaterMonth || '',
      commercialNote: ws.commercialNote || '',
      dubbingStart: ws.dubbingStart || '',
      dubbingEnd: ws.dubbingEnd || '',
      dubbingHours: ws.dubbingHours != null ? String(ws.dubbingHours) : '',
      dubbingHasSong: !!ws.dubbingHasSong,
    })
  }

  const cancelEditSess = () => {
    setEditingSessId(null)
    setNewSess({ ...EMPTY_NEW_SESS, type: defaultSessType() })
  }
  const removeSessFromForm = (id) => {
    const sessions = (form.sessions || []).filter(w => w.id !== id)
    const totalAmount = sessions.reduce((s, w) => s + (w.amount || 0), 0)
    setForm(f => ({ ...f, sessions, ...(form.projectType === 'commercial' ? {} : { amount: totalAmount }) }))
    // שמירה מיידית לענן במצב עריכה
    if (modal !== 'add' && modal?.item) {
      updateFutureIncome(modal.item.id, form.projectType === 'commercial' ? { sessions } : { sessions, amount: totalAmount })
    }
    // אם היינו בעריכה של הרישום שנמחק — לצאת ממצב עריכה
    if (editingSessId === id) {
      setEditingSessId(null)
      setNewSess({ ...EMPTY_NEW_SESS, type: defaultSessType() })
    }
  }
  const closeModal = () => { setModal(null); setEditingSessId(null); setNewSess(EMPTY_NEW_SESS) }

  const save = () => {
    // אם יש רישום תקף בטופס הרישום החדש שלא נלחץ "+ הוסף רישום" — להוסיפו אוטומטית
    let sessions = form.sessions || []
    const pending = newSess.date ? buildSessionFromNewSess(editingSessId) : null
    if (pending) {
      sessions = editingSessId
        ? sessions.map(w => w.id === editingSessId ? pending : w)
        : [...sessions, pending]
    }
    const totalFromSessions = sessions.reduce((s, w) => s + (w.amount || 0), 0)
    // מסחרי: הסכום קבוע מראש, לא מחושב מהרישומים (רישומים הם תיעוד בלבד)
    const finalAmount = form.projectType === 'commercial'
      ? (form.amount === '' ? null : Number(form.amount))
      : sessions.length > 0
        ? totalFromSessions
        : (form.amount === '' ? null : Number(form.amount))
    const data = {
      ...form,
      sessions,
      amount:       finalAmount,
      expectedDate: form.expectedDate || null,
    }
    if (modal === 'add') addFutureIncome(data)
    else {
      updateFutureIncome(modal.item.id, data)
      bubbleIncomeToTop(modal.item.id)
    }
    closeModal()
  }
  const remove       = () => { if (!window.confirm('למחוק את ההכנסה?')) return; deleteFutureIncome(modal.item.id); closeModal() }
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
          <button onClick={() => setShowTypePicker(true)} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
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

        {/* ── סינון לפי בעלים של הפרויקט ── */}
        <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-dashed border-gray-200">
          <span className="text-[10px] text-gray-400 font-medium ml-1">בעלים:</span>
          {[['tomer','תומר','indigo'],['yael','יעל','pink'],['all','הכל','gray']].map(([val, label, color]) => {
            const active = ownerFilter === val
            const activeCls = color === 'indigo'
              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
              : color === 'pink'
                ? 'bg-pink-200 text-pink-800 border-pink-400'
                : 'bg-gray-200 text-gray-700 border-gray-300'
            return (
              <button
                key={val}
                onClick={() => setOwnerFilter(val)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-colors
                  ${active ? activeCls : 'bg-white text-gray-400 border-gray-200'}`}
              >
                {label}
              </button>
            )
          })}
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

      {/* ── Type picker ── */}
      {showTypePicker && (
        <Modal title="הכנסה חדשה" onClose={() => setShowTypePicker(false)}>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setPickerOwner('tomer')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${pickerOwner === 'tomer' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
            >תומר</button>
            <button
              type="button"
              onClick={() => setPickerOwner('yael')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${pickerOwner === 'yael' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-400'}`}
            >יעל</button>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => openAdd('film', pickerOwner)}
              className="w-full py-5 bg-blue-50 hover:bg-blue-100 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">🎬</span>
              <span className="text-sm font-bold text-blue-700">קולנוע / טלוויזיה</span>
            </button>
            <button
              onClick={() => openAdd('theater', pickerOwner)}
              className="w-full py-5 bg-purple-50 hover:bg-purple-100 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">🎭</span>
              <span className="text-sm font-bold text-purple-700">תיאטרון</span>
            </button>
            <button
              onClick={() => openAdd('commercial', pickerOwner)}
              className="w-full py-5 bg-orange-50 hover:bg-orange-100 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">💼</span>
              <span className="text-sm font-bold text-orange-700">מסחרי / קמפיין</span>
            </button>
            <button
              onClick={() => openAdd('dubbing', pickerOwner)}
              className="w-full py-5 bg-pink-100 hover:bg-pink-200 rounded-2xl flex flex-col items-center gap-1 transition-colors active:scale-95"
            >
              <span className="text-3xl">🎙️</span>
              <span className="text-sm font-bold text-pink-700">דיבוב</span>
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit / Add modal ── */}
      {modal && (
        <Modal
          title={modal === 'add' ? 'הכנסה חדשה' : (
            <div>
              <div className="text-base font-extrabold leading-tight">{form.name || 'פרויקט'}</div>
              <div className="text-[11px] font-medium opacity-80">{form.owner === 'tomer' ? 'תומר מכלוף' : form.owner === 'yael' ? 'יעל אלקנה' : ''}</div>
            </div>
          )}
          headerStyle={modal !== 'add' ? { background: form.owner === 'tomer' ? 'linear-gradient(135deg, #4338ca, #6366f1)' : form.owner === 'yael' ? 'linear-gradient(135deg, #db2777, #ec4899)' : undefined } : undefined}
          onClose={closeModal}
          onSave={save}
        >
          <Field label="שם"><Input value={form.name} onChange={v => set('name', v)} placeholder="שם ההכנסה" /></Field>
          {/* ── בעלים של הפרויקט — רק בהקמה ── */}
          {modal === 'add' && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500">בעלים של הפרויקט</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set('owner', 'tomer')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${form.owner === 'tomer' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  תומר
                </button>
                <button
                  type="button"
                  onClick={() => set('owner', 'yael')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${form.owner === 'yael' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  יעל
                </button>
              </div>
            </div>
          )}
          {/* ── סוג פרויקט (תצוגה בלבד) ── */}
          <div className={`text-center text-xs font-bold px-3 py-1.5 rounded-full mb-2 ${form.projectType === 'commercial' ? 'bg-orange-100 text-orange-700' : form.projectType === 'theater' ? 'bg-purple-100 text-purple-700' : form.projectType === 'dubbing' ? 'bg-pink-200 text-pink-800' : 'bg-blue-100 text-blue-700'}`}>
            {form.projectType === 'commercial' ? '💼 מסחרי / קמפיין' : form.projectType === 'theater' ? '🎭 תיאטרון' : form.projectType === 'dubbing' ? '🎙️ דיבוב' : '🎬 קולנוע / טלוויזיה'}
          </div>
          {/* ── גרירת חוזה ── */}
          <div
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors mb-3 ${analyzing ? 'bg-blue-50 border-blue-300' : dragOver ? 'bg-green-50 border-green-400' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleContractFile(e.dataTransfer.files[0]) }}
            onClick={() => contractInputRef.current?.click()}
          >
            <input ref={contractInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => { handleContractFile(e.target.files[0]); e.target.value = '' }} />
            {analyzing
              ? <p className="text-sm text-blue-600 font-medium">📄 מנתח חוזה...</p>
              : <>
                  <p className="text-sm text-gray-500">📄 גרור חוזה / תמונה לכאן</p>
                  <p className="text-xs text-gray-400 mt-1">PDF או תמונה — השדות ימולאו אוטומטית</p>
                </>
            }
          </div>
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
          {/* ── דגל סטטוס חשבונית ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500">סטטוס חשבונית</p>
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
          </div>

          {/* ── קבצים ותשלומים (רק במצב עריכה — לא בהוספה) ── */}
          {modal !== 'add' && modal?.item && (() => {
            const liveItem = futureIncome.find(f => f.id === modal.item.id) || modal.item
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
                updateFutureIncome(liveItem.id, { files: [...files, newFile] })
              }
              reader.readAsDataURL(file)
              e.target.value = ''
            }

            const removeFile = (fileId) => {
              const newFiles = files.filter(f => f.id !== fileId)
              const updates = { files: newFiles }
              if (fileId === 'legacy_inv') {
                updates.invoiceFile = null
                updates.invoiceFileName = null
              }
              updateFutureIncome(liveItem.id, updates)
            }

            return (
              <>
                {/* ── קבצים מצורפים ── */}
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
                              <a href={f.file} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline truncate">
                                {f.fileName}
                              </a>
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

                {/* ── תשלומים שהתקבלו ── */}
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
                      return bare === liveItem.id
                    })
                    const handleRemovePayment = (paymentId) => {
                      if (itemLocked) {
                        alert('הפריט כבר אושר בלוח הבית. בטל אישור לפני מחיקת תשלום חלקי.')
                        return
                      }
                      if (!window.confirm('למחוק את התשלום?')) return
                      removeIncomePayment(liveItem.id, paymentId)
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
              </>
            )
          })()}

          {/* ── Project rate defaults ── */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {form.projectType === 'commercial' ? (
              <>
                <p className="text-xs font-semibold text-gray-500">פרטי קמפיין</p>
                <div className="bg-orange-50 rounded-xl p-3 space-y-3">
                  <Field label="שם לקוח / מותג">
                    <Input value={form.commercialClient} onChange={v => set('commercialClient', v)} placeholder="למשל: קוקה קולה, פוקס..." />
                  </Field>
                  <Field label="פלטפורמה">
                    <Select value={form.commercialPlatform} onChange={v => set('commercialPlatform', v)} options={[
                      { value: '', label: 'בחר פלטפורמה' },
                      { value: 'instagram', label: 'אינסטגרם' },
                      { value: 'tiktok', label: 'טיקטוק' },
                      { value: 'youtube', label: 'יוטיוב' },
                      { value: 'tv', label: 'טלוויזיה' },
                      { value: 'other', label: 'אחר' },
                    ]} />
                  </Field>
                  <Field label="ימי צילום לפי חוזה" hint="השאר ריק אם לא מוגבל">
                    <Input type="number" value={form.commercialShootDaysContract} onChange={v => set('commercialShootDaysContract', v)} placeholder="0" />
                  </Field>
                </div>
              </>
            ) : form.projectType === 'dubbing' ? (
              <>
                <p className="text-xs font-semibold text-gray-500">תעריפי דיבוב (שח"ם)</p>
                <div className="bg-pink-50 rounded-xl p-3 space-y-3">
                  <Field label="סוג הפקה">
                    <Select value={form.dubbingProductionType} onChange={v => {
                      const preset = DUBBING_RATE_PRESETS[v] || DUBBING_RATE_PRESETS.major
                      set('dubbingProductionType', v)
                      set('dubbingFirstHourRate', preset.firstHour)
                      set('dubbingHalfHourRate', preset.halfHour)
                      set('dubbingSongBonus', preset.songBonus)
                    }} options={[
                      { value: 'major', label: '🎬 מייג\'ור (Disney, Paramount...)' },
                      { value: 'independent', label: '🎥 עצמאי' },
                      { value: 'tv', label: '📺 טלוויזיה' },
                    ]} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="שעה ראשונה (₪)">
                      <Input type="number" value={form.dubbingFirstHourRate} onChange={v => set('dubbingFirstHourRate', v)} />
                    </Field>
                    <Field label="חצי שעה נוספת (₪)">
                      <Input type="number" value={form.dubbingHalfHourRate} onChange={v => set('dubbingHalfHourRate', v)} />
                    </Field>
                  </div>
                  <Field label="תוספת שיר סולו/דואט (₪)">
                    <Input type="number" value={form.dubbingSongBonus} onChange={v => set('dubbingSongBonus', v)} />
                  </Field>
                </div>
              </>
            ) : (
            <>
            <p className="text-xs font-semibold text-gray-500">תעריפי ברירת מחדל</p>
            {form.projectType === 'theater' ? (
              <div className="bg-purple-50 rounded-xl p-3 space-y-3">
                <Field label="מחיר הצגה (₪)">
                  <Input type="number" value={form.theaterShowPrice} onChange={v => set('theaterShowPrice', v)} placeholder="0" />
                </Field>
                <Field label="סכום כולל חזרות (₪)" hint="הסכום שהוסכם לכל תקופת החזרות">
                  <Input type="number" value={form.theaterRehearsalTotal} onChange={v => set('theaterRehearsalTotal', v)} placeholder="0" />
                </Field>
                {(() => {
                  const total = Number(form.theaterRehearsalTotal) || 0
                  if (total <= 0) return null
                  const paid = (form.sessions || [])
                    .filter(s => s.type === 'חזרות חודשיות')
                    .reduce((sum, s) => sum + (s.amount || 0), 0)
                  const remaining = total - paid
                  const pct = Math.min(Math.round((paid / total) * 100), 100)
                  return (
                    <div className="bg-purple-50 rounded-lg px-3 py-2 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">שולם</span>
                        <span className="font-bold text-purple-700">{formatILS(paid)} / {formatILS(total)}</span>
                      </div>
                      <div className="w-full bg-purple-200 rounded-full h-2">
                        <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">נותר</span>
                        <span className={`font-bold ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>{formatILS(remaining)}</span>
                      </div>
                    </div>
                  )
                })()}
                <Field label="מחיר חזרה — אחרי עלייה (₪)" hint="גם לצילומי טריילר וצילומי הצגה">
                  <Input type="number" value={form.theaterPostRehearsal} onChange={v => set('theaterPostRehearsal', v)} placeholder="0" />
                </Field>
              </div>
            ) : (
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
            )}
            </>
            )}
          </div>

          {/* ── Work sessions ── */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">{form.projectType === 'commercial' ? 'תיעוד פעילויות' : form.projectType === 'dubbing' ? 'פירוט הקלטות' : 'פירוט ימי עבודה'}</p>

            {/* Existing sessions */}
            {(form.sessions || []).length > 0 && (
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden mb-2">
                {(form.sessions || []).map(ws => {
                  const isBeingEdited = editingSessId === ws.id
                  return (
                    <div key={ws.id} className={`flex items-center justify-between px-3 py-2 ${isBeingEdited ? 'bg-indigo-50' : 'bg-white'}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-700">{COMMERCIAL_TYPE_LABELS[ws.type] || ws.type}{isBeingEdited && <span className="text-[10px] text-indigo-600 mr-2">· בעריכה</span>}</p>
                        <p className="text-xs text-gray-400">
                          {ws.date ? formatDate(ws.date) : 'ללא תאריך'} · {formatSessionDetail(ws)}
                        </p>
                        {ws.setLocation && (
                          <p className={`text-xs font-medium ${ws.setIsAboveThreshold ? 'text-orange-500' : 'text-green-600'}`}>
                            {ws.setIsAboveThreshold ? '🚗' : '📍'} {ws.setLocation} ({ws.setDistanceKm} ק״מ) — {ws.setIsAboveThreshold ? 'מהבית' : 'מהסט'}
                          </p>
                        )}
                        {ws.overtimeAmt > 0 && (
                          <p className="text-xs text-orange-400">כולל שעות נוספות: {formatILS(ws.overtimeAmt)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {ws.amount != null && <span className={`text-sm font-bold ml-1 ${ws.amount > 0 ? 'text-green-600' : 'text-gray-400'}`}>{formatILS(ws.amount)}</span>}
                        <button
                          type="button"
                          onClick={() => startEditSess(ws)}
                          title="ערוך רישום"
                          className="w-7 h-7 flex items-center justify-center text-sm rounded-full text-indigo-500 bg-indigo-50 active:bg-indigo-200"
                        >✎</button>
                        <button
                          type="button"
                          onClick={() => removeSessFromForm(ws.id)}
                          title="מחק רישום"
                          className="w-7 h-7 flex items-center justify-center text-sm font-bold rounded-full text-red-500 bg-red-50 active:bg-red-200"
                        >✕</button>
                      </div>
                    </div>
                  )
                })}
                {form.projectType === 'commercial' ? (
                  <div className="flex justify-between px-3 py-2 bg-orange-50">
                    <span className="text-xs font-semibold text-orange-700">סה״כ פעילויות</span>
                    <span className="text-sm font-bold text-orange-700">{(form.sessions || []).length}</span>
                  </div>
                ) : (
                  <div className="flex justify-between px-3 py-2 bg-green-50">
                    <span className="text-xs font-semibold text-green-700">סה״כ</span>
                    <span className="text-sm font-bold text-green-700">{formatILS((form.sessions || []).reduce((s, w) => s + (w.amount || 0), 0))}</span>
                  </div>
                )}
              </div>
            )}

            {/* New session adder */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="סוג">
                  <Select value={newSess.type} onChange={v => setNewSess(s => ({ ...s, type: v }))} options={form.projectType === 'commercial' ? COMMERCIAL_SESSION_TYPES : form.projectType === 'theater' ? THEATER_SESSION_TYPES : form.projectType === 'dubbing' ? DUBBING_SESSION_TYPES : FILM_SESSION_TYPES} />
                </Field>
                <Field label="תאריך">
                  <Input type="date" value={newSess.date} onChange={v => setNewSess(s => ({ ...s, date: v }))} />
                </Field>
              </div>

              {/* ═══ מיקום סט ═══ */}
              {newSess.type === 'יום צילום' && (
                <div className="space-y-1">
                  <Field label="מיקום סט">
                    <div className="flex gap-2">
                      <Input
                        value={newSess.setLocation}
                        onChange={v => setNewSess(s => ({ ...s, setLocation: v, setDistanceKm: null, setIsAboveThreshold: null }))}
                        placeholder="למשל: הרצליה, באר שבע, ירושלים..."
                      />
                      <button
                        type="button"
                        disabled={distLoading || !newSess.setLocation || newSess.setLocation.trim().length < 3}
                        onClick={async () => {
                          setDistLoading(true)
                          const result = await calcDistanceFromHome(newSess.setLocation)
                          setDistLoading(false)
                          if (result) {
                            setNewSess(s => ({
                              ...s,
                              setDistanceKm: result.distanceKm,
                              setIsAboveThreshold: result.isAboveThreshold,
                              useTravelForCalc: result.isAboveThreshold,
                            }))
                          }
                        }}
                        className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl disabled:opacity-40"
                      >
                        {distLoading ? '...' : 'בדוק'}
                      </button>
                    </div>
                  </Field>
                  {newSess.setDistanceKm != null && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${newSess.setIsAboveThreshold ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                      <span>{newSess.setIsAboveThreshold ? '🚗' : '📍'}</span>
                      <span>{newSess.setDistanceKm} ק״מ מהבית</span>
                      <span className="mr-auto">—</span>
                      <span>{newSess.setIsAboveThreshold ? 'חישוב מיציאה מהבית' : 'חישוב מהגעה לסט'}</span>
                    </div>
                  )}
                </div>
              )}

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
                const canAdd = newSess.manualMode ? newSess.manualAmount !== '' : finalAmt > 0
                return (
                  <>
                    <div className="bg-white rounded-lg p-2 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">שעות הצילום (לחישוב)</p>
                      <div className="grid grid-cols-2 gap-2" dir="rtl">
                        <Field label="תחילת צילומים">
                          <TimePicker
                            value={newSess.shootStart}
                            onChange={v => setNewSess(s => ({ ...s, shootStart: v }))}
                            defaultHint="10:00"
                            label="תחילת צילומים"
                            onPicked={() => setTimeout(() => setAutoOpenEnd(true), 150)}
                          />
                        </Field>
                        <Field label="סיום צילומים">
                          <TimePicker
                            value={newSess.shootEnd}
                            onChange={v => setNewSess(s => ({ ...s, shootEnd: v }))}
                            defaultHint={offsetTime(newSess.shootStart, 9) || '17:00'}
                            label="סיום צילומים"
                            triggerOpen={autoOpenEnd}
                            onOpenHandled={() => setAutoOpenEnd(false)}
                          />
                        </Field>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">שעות איסוף וחזור (אופציונלי)</p>
                      <div className="grid grid-cols-2 gap-2" dir="rtl">
                        <Field label="שעת איסוף">
                          <TimePicker
                            value={newSess.pickupTime}
                            onChange={v => setNewSess(s => ({ ...s, pickupTime: v }))}
                            defaultHint={offsetTime(newSess.shootStart, -1) || '07:00'}
                            label="שעת איסוף"
                            onPicked={() => setTimeout(() => setAutoOpenReturn(true), 150)}
                          />
                        </Field>
                        <Field label="שעת חזור">
                          <TimePicker
                            value={newSess.returnTime}
                            onChange={v => setNewSess(s => ({ ...s, returnTime: v }))}
                            defaultHint={offsetTime(newSess.shootEnd, 1) || '18:00'}
                            label="שעת חזור"
                            triggerOpen={autoOpenReturn}
                            onOpenHandled={() => setAutoOpenReturn(false)}
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
                      {editingSessId ? 'עדכן רישום · ' : '+ הוסף רישום · '}{formatILS(finalAmt)}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}

              {/* ═══ Rehearsal / fitting ═══ */}
              {(newSess.type === 'חזרות' || newSess.type === 'מדידות') && (() => {
                const rate = Number(form.photoDayRate) || 0
                const autoH = (newSess.shootStart && newSess.shootEnd)
                  ? roundUpQuarter(timeDiffHours(newSess.shootStart, newSess.shootEnd))
                  : 0
                const h = newSess.hours !== '' ? Number(newSess.hours) : autoH
                const calc = computeRehearsalAmount(h, rate, form.rehearsalPct12, form.rehearsalPct3plus)
                const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : calc.total
                const canAdd = newSess.manualMode ? newSess.manualAmount !== '' : finalAmt > 0
                return (
                  <>
                    <div className="bg-white rounded-lg p-2 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">שעות חזרה (לחישוב)</p>
                      <div className="grid grid-cols-2 gap-2" dir="rtl">
                        <Field label="תחילת חזרה">
                          <TimePicker
                            value={newSess.shootStart}
                            onChange={v => setNewSess(s => ({ ...s, shootStart: v }))}
                            defaultHint="10:00"
                            label="תחילת חזרה"
                            onPicked={() => setTimeout(() => setAutoOpenEnd(true), 150)}
                          />
                        </Field>
                        <Field label="סיום חזרה">
                          <TimePicker
                            value={newSess.shootEnd}
                            onChange={v => setNewSess(s => ({ ...s, shootEnd: v }))}
                            defaultHint={offsetTime(newSess.shootStart, 3) || '13:00'}
                            label="סיום חזרה"
                            triggerOpen={autoOpenEnd}
                            onOpenHandled={() => setAutoOpenEnd(false)}
                          />
                        </Field>
                      </div>
                      <Field label="שעות לחישוב (עשרוני — לעקיפת זמנים)" hint="השאר ריק כדי לחשב אוטומטית מזמני החזרה">
                        <Input type="number" value={newSess.hours} onChange={v => setNewSess(s => ({ ...s, hours: v }))} placeholder={`${autoH || 0}`} step="0.25" />
                      </Field>
                    </div>

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
                      {editingSessId ? 'עדכן רישום · ' : '+ הוסף רישום · '}{formatILS(finalAmt)}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}

              {/* ═══ Theater: חזרות חודשיות — סכום ידני מול סכום כולל ═══ */}
              {newSess.type === 'חזרות חודשיות' && (() => {
                const amt = Number(newSess.manualAmount) || 0
                const totalBudget = Number(form.theaterRehearsalTotal) || 0
                const paidSoFar = (form.sessions || [])
                  .filter(s => s.type === 'חזרות חודשיות')
                  .reduce((sum, s) => sum + (s.amount || 0), 0)
                return (
                  <>
                    <Field label="חודש">
                      <Input type="month" value={newSess.theaterMonth} onChange={v => setNewSess(s => ({ ...s, theaterMonth: v }))} />
                    </Field>
                    <Field label="סכום שהתקבל (₪)">
                      <Input type="number" value={newSess.manualAmount} onChange={v => setNewSess(s => ({ ...s, manualAmount: v }))} placeholder="0" />
                    </Field>
                    {totalBudget > 0 && (
                      <div className="bg-purple-50 rounded-lg px-3 py-2 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">שולם עד כה</span>
                          <span className="font-bold text-purple-700">{formatILS(paidSoFar)} / {formatILS(totalBudget)}</span>
                        </div>
                        <div className="w-full bg-purple-200 rounded-full h-2">
                          <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(Math.round((paidSoFar / totalBudget) * 100), 100)}%` }} />
                        </div>
                        {amt > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">נותר אחרי רישום זה</span>
                            <span className={`font-bold ${(totalBudget - paidSoFar - amt) > 0 ? 'text-orange-600' : 'text-green-600'}`}>{formatILS(totalBudget - paidSoFar - amt)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={addSessToForm} disabled={newSess.manualAmount === '' || newSess.manualAmount === undefined} className="w-full bg-purple-700 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      {editingSessId ? 'עדכן רישום · ' : '+ הוסף רישום · '}{formatILS(amt)}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}

              {/* ═══ Theater types (other than חזרות חודשיות) ═══ */}
              {['הצגה', 'חזרה אחרי עלייה', 'חזרת רענון', 'חזרת מקומים באולם חדש', 'חזרת טקסט', 'צילומי טריילר', 'צילומי הצגה'].includes(newSess.type) && (() => {
                const priceMap = {
                  'הצגה':                       form.theaterShowPrice,
                  'חזרה אחרי עלייה':            form.theaterPostRehearsal,
                  'חזרת רענון':                 form.theaterPostRehearsal,
                  'חזרת מקומים באולם חדש':     form.theaterPostRehearsal,
                  'חזרת טקסט':                  form.theaterPostRehearsal,
                  'צילומי טריילר':              form.theaterPostRehearsal,
                  'צילומי הצגה':                form.theaterPostRehearsal,
                }
                const price = Number(priceMap[newSess.type]) || 0
                const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : price
                const canAdd = newSess.manualMode ? newSess.manualAmount !== '' : finalAmt > 0
                return (
                  <>
                    <Field label="מיקום">
                      <Input value={newSess.theaterLocation} onChange={v => setNewSess(s => ({ ...s, theaterLocation: v }))} placeholder="שם התיאטרון / עיר" />
                    </Field>

                    <div className="bg-white rounded-lg p-2 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">
                        {newSess.type === 'הצגה' ? 'שעות הצגה' : 'שעות'}
                      </p>
                      <div className="grid grid-cols-2 gap-2" dir="rtl">
                        <Field label="תחילה">
                          <TimePicker
                            value={newSess.shootStart}
                            onChange={v => setNewSess(s => ({ ...s, shootStart: v }))}
                            defaultHint={newSess.type === 'הצגה' ? '20:00' : '10:00'}
                            label="תחילה"
                            onPicked={() => setTimeout(() => setAutoOpenEnd(true), 150)}
                          />
                        </Field>
                        <Field label="סיום">
                          <TimePicker
                            value={newSess.shootEnd}
                            onChange={v => setNewSess(s => ({ ...s, shootEnd: v }))}
                            defaultHint={offsetTime(newSess.shootStart, newSess.type === 'הצגה' ? 2 : 3) || (newSess.type === 'הצגה' ? '22:00' : '13:00')}
                            label="סיום"
                            triggerOpen={autoOpenEnd}
                            onOpenHandled={() => setAutoOpenEnd(false)}
                          />
                        </Field>
                      </div>
                    </div>

                    {price > 0 ? (
                      <div className="bg-white rounded-lg px-3 py-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">תעריף {newSess.type}</span>
                          <span className="font-bold text-green-700">{formatILS(price)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 rounded-lg px-3 py-2 text-xs text-yellow-700">
                        ⚠ הגדר תעריף "{newSess.type}" בהגדרות למעלה — או הפעל "סכום ידני"
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!newSess.manualMode}
                        onChange={e => setNewSess(s => ({ ...s, manualMode: e.target.checked }))}
                      />
                      סכום ידני (עוקף את התעריף)
                    </label>
                    {newSess.manualMode && (
                      <Field label="סכום ידני (₪)">
                        <Input type="number" value={newSess.manualAmount} onChange={v => setNewSess(s => ({ ...s, manualAmount: v }))} placeholder="0" />
                      </Field>
                    )}

                    <button onClick={addSessToForm} disabled={!canAdd} className="w-full bg-purple-700 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      {editingSessId ? 'עדכן רישום · ' : '+ הוסף רישום · '}{formatILS(finalAmt)}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}

              {/* ═══ Commercial types ═══ */}
              {form.projectType === 'commercial' && newSess.type !== 'אחר' && (() => {
                const shootDaysUsed = (form.sessions || []).filter(s => s.type === 'צילום').length
                const contractDays = Number(form.commercialShootDaysContract) || 0
                const isCommRehearsal = ['חזרה מסחרי', 'מדידות מסחרי'].includes(newSess.type)
                return (
                  <>
                    {isCommRehearsal && (
                      <div className="bg-white rounded-lg p-2 space-y-2">
                        <p className="text-xs text-gray-500 font-medium">שעות {newSess.type === 'חזרה מסחרי' ? 'חזרה' : 'מדידות'}</p>
                        <div className="grid grid-cols-2 gap-2" dir="rtl">
                          <Field label="תחילה">
                            <TimePicker
                              value={newSess.shootStart}
                              onChange={v => setNewSess(s => ({ ...s, shootStart: v }))}
                              defaultHint="10:00"
                              label="תחילה"
                              onPicked={() => setTimeout(() => setAutoOpenEnd(true), 150)}
                            />
                          </Field>
                          <Field label="סיום">
                            <TimePicker
                              value={newSess.shootEnd}
                              onChange={v => setNewSess(s => ({ ...s, shootEnd: v }))}
                              defaultHint={offsetTime(newSess.shootStart, 3) || '13:00'}
                              label="סיום"
                              triggerOpen={autoOpenEnd}
                              onOpenHandled={() => setAutoOpenEnd(false)}
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                    <Field label="מיקום">
                      <Input value={newSess.setLocation || ''} onChange={v => setNewSess(s => ({ ...s, setLocation: v }))} placeholder="למשל: תל אביב, סטודיו, ירושלים..." />
                    </Field>
                    <Field label="פירוט">
                      <Input value={newSess.commercialNote} onChange={v => setNewSess(s => ({ ...s, commercialNote: v }))} placeholder="למשל: צילום בסטודיו, פגישת הפקה..." />
                    </Field>

                    {newSess.type === 'צילום' && contractDays > 0 && (
                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold ${shootDaysUsed >= contractDays ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                        <span>📷 ימי צילום</span>
                        <span>{shootDaysUsed} / {contractDays}</span>
                      </div>
                    )}

                    <button onClick={addSessToForm} className="w-full bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      {editingSessId ? 'עדכן רישום' : '+ הוסף רישום'}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}

              {/* ═══ Dubbing: הקלטה / השלמה ═══ */}
              {form.projectType === 'dubbing' && (newSess.type === 'הקלטה' || newSess.type === 'השלמה') && (() => {
                // Auto-calc hours from start/end times
                const autoH = (newSess.dubbingStart && newSess.dubbingEnd)
                  ? roundUpQuarter(timeDiffHours(newSess.dubbingStart, newSess.dubbingEnd))
                  : 0
                const h = newSess.dubbingHours !== '' ? Number(newSess.dubbingHours) : autoH
                const firstHR = Number(form.dubbingFirstHourRate) || 0
                const halfHR = Number(form.dubbingHalfHourRate) || 0
                const hasSong = !!newSess.dubbingHasSong
                const songB = Number(form.dubbingSongBonus) || 0
                const computed = h > 0 ? computeDubbingAmount(h, firstHR, halfHR, hasSong, songB) : 0
                return (
                  <>
                    <div className="bg-white rounded-lg p-2 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">שעות הקלטה</p>
                      <div className="grid grid-cols-2 gap-2" dir="rtl">
                        <Field label="תחילת הקלטה">
                          <TimePicker
                            value={newSess.dubbingStart}
                            onChange={v => setNewSess(s => ({ ...s, dubbingStart: v, dubbingHours: '' }))}
                            defaultHint="10:00"
                            label="תחילת הקלטה"
                            onPicked={() => setTimeout(() => setAutoOpenDubbingEnd(true), 150)}
                          />
                        </Field>
                        <Field label="סיום הקלטה">
                          <TimePicker
                            value={newSess.dubbingEnd}
                            onChange={v => setNewSess(s => ({ ...s, dubbingEnd: v, dubbingHours: '' }))}
                            defaultHint={offsetTime(newSess.dubbingStart, 2) || '12:00'}
                            label="סיום הקלטה"
                            triggerOpen={autoOpenDubbingEnd}
                            onOpenHandled={() => setAutoOpenDubbingEnd(false)}
                          />
                        </Field>
                      </div>
                      <Field label="שעות לחישוב (עשרוני)" hint="השאר ריק כדי לחשב אוטומטית מהזמנים">
                        <Input type="number" step="0.25" value={newSess.dubbingHours} onChange={v => setNewSess(s => ({ ...s, dubbingHours: v }))} placeholder={autoH > 0 ? String(autoH) : '0'} />
                      </Field>
                    </div>

                    <label className="flex items-center gap-2 px-1 cursor-pointer">
                      <input type="checkbox" checked={!!newSess.dubbingHasSong} onChange={e => setNewSess(s => ({ ...s, dubbingHasSong: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
                      <span className="text-xs font-medium text-gray-600">🎵 שיר סולו / דואט (+{songB}₪)</span>
                    </label>

                    {h > 0 && (
                      <div className="bg-pink-100 rounded-xl p-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">שעה ראשונה</span>
                          <span className="font-bold text-pink-700">{formatILS(firstHR)}</span>
                        </div>
                        {h > 1 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">{Math.ceil((h - 1) / 0.5)} × חצי שעה ({halfHR}₪)</span>
                            <span className="font-bold text-pink-700">{formatILS(Math.ceil((h - 1) / 0.5) * halfHR)}</span>
                          </div>
                        )}
                        {hasSong && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">🎵 תוספת שיר</span>
                            <span className="font-bold text-pink-700">{formatILS(songB)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm border-t border-pink-300 pt-1 mt-1">
                          <span className="font-semibold text-gray-700">סה"כ</span>
                          <span className="font-bold text-pink-700">{formatILS(computed)}</span>
                        </div>
                      </div>
                    )}

                    <button onClick={addSessToForm} disabled={h <= 0} className="w-full bg-pink-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      {editingSessId ? 'עדכן רישום' : '+ הוסף רישום'}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}

              {/* ═══ Dubbing: טריילר ═══ */}
              {form.projectType === 'dubbing' && newSess.type === 'טריילר' && (
                <>
                  <div className="bg-pink-100 rounded-xl p-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-gray-700">סה״כ</span>
                      <span className="font-bold text-pink-700">₪200</span>
                    </div>
                  </div>
                  <button onClick={addSessToForm} className="w-full bg-pink-600 text-white text-sm font-semibold py-2 rounded-xl">
                    {editingSessId ? 'עדכן רישום' : '+ הוסף רישום'}
                  </button>
                  {editingSessId && (
                    <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                      ביטול עריכה
                    </button>
                  )}
                </>
              )}

              {/* ═══ Dubbing: סרט ═══ */}
              {form.projectType === 'dubbing' && newSess.type === 'סרט' && (() => {
                const autoH = (newSess.dubbingStart && newSess.dubbingEnd)
                  ? roundUpQuarter(timeDiffHours(newSess.dubbingStart, newSess.dubbingEnd))
                  : 0
                const h = newSess.dubbingHours !== '' ? Number(newSess.dubbingHours) : autoH
                const computed = Math.round(h * 166)
                const finalAmt = newSess.manualMode ? (Number(newSess.manualAmount) || 0) : computed
                const canAdd = newSess.manualMode ? finalAmt > 0 : h > 0
                return (
                  <>
                    <div className="bg-white rounded-lg p-2 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">שעות הקלטה</p>
                      <div className="grid grid-cols-2 gap-2" dir="rtl">
                        <Field label="תחילת הקלטה">
                          <TimePicker
                            value={newSess.dubbingStart}
                            onChange={v => setNewSess(s => ({ ...s, dubbingStart: v, dubbingHours: '' }))}
                            defaultHint="10:00"
                            label="תחילת הקלטה"
                            onPicked={() => setTimeout(() => setAutoOpenDubbingEnd(true), 150)}
                          />
                        </Field>
                        <Field label="סיום הקלטה">
                          <TimePicker
                            value={newSess.dubbingEnd}
                            onChange={v => setNewSess(s => ({ ...s, dubbingEnd: v, dubbingHours: '' }))}
                            defaultHint={offsetTime(newSess.dubbingStart, 2) || '12:00'}
                            label="סיום הקלטה"
                            triggerOpen={autoOpenDubbingEnd}
                            onOpenHandled={() => setAutoOpenDubbingEnd(false)}
                          />
                        </Field>
                      </div>
                      <Field label="שעות לחישוב (עשרוני)" hint="השאר ריק כדי לחשב אוטומטית מהזמנים">
                        <Input type="number" step="0.25" value={newSess.dubbingHours} onChange={v => setNewSess(s => ({ ...s, dubbingHours: v }))} placeholder={autoH > 0 ? String(autoH) : '0'} />
                      </Field>
                    </div>
                    {!newSess.manualMode && h > 0 && (
                      <div className="bg-pink-100 rounded-xl p-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">{h} שעות × ₪166</span>
                          <span className="font-bold text-pink-700">{formatILS(computed)}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-pink-300 pt-1 mt-1">
                          <span className="font-semibold text-gray-700">סה״כ</span>
                          <span className="font-bold text-pink-700">{formatILS(computed)}</span>
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 px-1 cursor-pointer">
                      <input type="checkbox" checked={!!newSess.manualMode}
                        onChange={e => setNewSess(s => ({ ...s, manualMode: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
                      <span className="text-xs font-medium text-gray-600">סכום ידני (עוקף את החישוב)</span>
                    </label>
                    {newSess.manualMode && (
                      <Field label="סכום ידני (₪)">
                        <Input type="number" value={newSess.manualAmount} onChange={v => setNewSess(s => ({ ...s, manualAmount: v }))} placeholder="0" />
                      </Field>
                    )}
                    <button onClick={addSessToForm} disabled={!canAdd} className="w-full bg-pink-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl">
                      {editingSessId ? 'עדכן רישום' : '+ הוסף רישום'}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
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
                      {editingSessId ? 'עדכן רישום' : '+ הוסף רישום'}
                    </button>
                    {editingSessId && (
                      <button onClick={cancelEditSess} className="w-full bg-gray-100 text-gray-600 text-xs font-semibold py-1.5 rounded-xl mt-1">
                        ביטול עריכה
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          <Field label="חשבון לזיכוי" hint="בעת לחיצה על התקבל — יתרה תתעדכן">
            <Select value={form.accountId || ''} onChange={v => set('accountId', v)} options={accountOptions} />
          </Field>
          <Field label="תאריך צפוי" hint="השאר ריק אם לא ידוע">
            <Input type="date" value={form.expectedDate} onChange={v => set('expectedDate', v)} />
          </Field>
          <Field label="הערות">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="הערות..." />
          </Field>

          <SaveButton onClick={save} />
          {modal !== 'add' && (
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10)
                setExportCutoff(today)
                setShowExport(true)
              }}
              className="w-full bg-indigo-50 text-indigo-700 text-sm font-semibold py-3 rounded-xl mt-2 active:bg-indigo-100"
            >
              📄 ייצא דיווח לסוכנות
            </button>
          )}
          {modal !== 'add' && <DeleteButton onClick={remove} />}
        </Modal>
      )}

      {/* ── חלון ייצוא דיווח לסוכנות ── */}
      {showExport && modal?.item && (
        <Modal
          title="ייצוא דיווח לסוכנות"
          onClose={() => setShowExport(false)}
          onSave={() => {
            const liveItem = futureIncome.find(f => f.id === modal.item.id) || modal.item
            // לאסוף את הרישומים הנוכחיים מהטופס + רישום ממתין בטופס הרישום החדש (אם יש),
            // כך שגם רישומים שטרם נשמרו יופיעו בדיווח.
            let mergedSessions = form.sessions || liveItem.sessions || []
            const pending = newSess.date ? buildSessionFromNewSess(editingSessId) : null
            if (pending) {
              mergedSessions = editingSessId
                ? mergedSessions.map(w => w.id === editingSessId ? pending : w)
                : [...mergedSessions, pending]
            }
            exportIncomeReport(liveItem, exportCutoff || new Date().toISOString().slice(0, 10), { overrideSessions: mergedSessions })
            setShowExport(false)
          }}
        >
          <p className="text-xs text-gray-500 mb-2">
            ייווצר דיווח המכיל את כל ימי העבודה שתאריכם עד וכולל התאריך שנבחר.
          </p>
          <Field label="עד תאריך">
            <Input
              type="date"
              value={exportCutoff}
              onChange={v => setExportCutoff(v)}
              style={{ maxWidth: '100%', boxSizing: 'border-box' }}
            />
          </Field>
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 space-y-0.5">
            <p>• הדיווח יוצג בחלון חדש עם אפשרות הדפסה / שמירה כ-PDF</p>
            <p>• הסכום מוצג גולמי — ללא עמלת סוכן וללא מע״מ</p>
            <p>• מופיעה הערה: "הסכום הנ״ל לפני מע״מ"</p>
          </div>
          <SaveButton onClick={() => {
            const liveItem = futureIncome.find(f => f.id === modal.item.id) || modal.item
            // לאסוף את הרישומים הנוכחיים מהטופס + רישום ממתין בטופס הרישום החדש (אם יש),
            // כך שגם רישומים שטרם נשמרו יופיעו בדיווח.
            let mergedSessions = form.sessions || liveItem.sessions || []
            const pending = newSess.date ? buildSessionFromNewSess(editingSessId) : null
            if (pending) {
              mergedSessions = editingSessId
                ? mergedSessions.map(w => w.id === editingSessId ? pending : w)
                : [...mergedSessions, pending]
            }
            exportIncomeReport(liveItem, exportCutoff || new Date().toISOString().slice(0, 10), { overrideSessions: mergedSessions })
            setShowExport(false)
          }} label="צור דיווח" />
        </Modal>
      )}

      {/* ── חלון תשלום חלקי — מוצג מעל חלון העריכה ── */}
      {showPartialModal && modal?.item && (
        <PartialPaymentModal
          item={futureIncome.find(f => f.id === modal.item.id) || modal.item}
          onClose={() => setShowPartialModal(false)}
        />
      )}

      {/* ── Receive: account picker ── */}
      {receiveModal && (
        <Backdrop
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black bg-opacity-30"
          style={{ animation: 'modalBackdropIn 0.2s ease-out' }}
          onClose={() => setReceiveModal(null)}
        >
          <div className="relative bg-white rounded-t-2xl w-full shadow-xl p-5 space-y-4" style={{ animation: 'modalSlideUp 0.35s cubic-bezier(.22,1,.36,1)' }}>
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
                      onClick={() => { if (window.confirm('למחוק את הרישום?')) deleteWorkSession(workItem.id, ws.id) }}
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

  const ownerGradient =
    isReceived ? {} :
    item.owner === 'tomer' ? { background: 'linear-gradient(135deg, #312e81 0%, #4338ca 50%, #6366f1 100%)' } :
    item.owner === 'yael'  ? { background: 'linear-gradient(135deg, #9d174d 0%, #db2777 50%, #f472b6 100%)' } :
                              {}
  const hasGradient = !isReceived && (item.owner === 'tomer' || item.owner === 'yael')

  return (
    <div
      className={`card p-4 ${hasGradient ? 'text-white' : ''} ${days !== null && days <= 3 && !isReceived ? uc : ''} cursor-pointer`}
      style={ownerGradient}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold ${isReceived ? 'text-gray-400 line-through' : hasGradient ? 'text-white' : 'text-gray-800'}`}>
              {item.name}
            </h3>
            {isReceived ? (
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">✓ התקבל</span>
            ) : isWorkLog ? (
              <span className={`text-xs px-2 py-0.5 rounded-full ${hasGradient ? 'bg-white bg-opacity-20 text-white' : item.projectType === 'commercial' ? 'bg-orange-100 text-orange-700' : item.projectType === 'theater' ? 'bg-purple-100 text-purple-700' : item.projectType === 'dubbing' ? 'bg-pink-200 text-pink-800' : 'bg-blue-100 text-blue-700'}`}>
                {item.projectType === 'commercial' ? '💼' : item.projectType === 'theater' ? '🎭' : item.projectType === 'dubbing' ? '🎙️' : '🎬'} בתהוות{sessionCount > 0 ? ` · ${sessionCount} רישומים` : ''}
              </span>
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${hasGradient ? 'bg-white bg-opacity-20 text-white' : badgeColor}`}>
                {label}
              </span>
            )}
            {item.invoiceSent
              ? <span className={`text-xs px-2 py-0.5 rounded-full ${hasGradient ? 'bg-white bg-opacity-20 text-white' : 'bg-green-100 text-green-700'}`}>📄 חשבונית</span>
              : <span className={`text-xs px-2 py-0.5 rounded-full ${hasGradient ? 'bg-white bg-opacity-20 text-white text-opacity-70' : 'bg-red-50 text-red-400'}`}>חשבונית ✕</span>
            }
            {item.owner === 'tomer' && !hasGradient && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">תומר</span>
            )}
            {item.owner === 'yael' && !hasGradient && (
              <span className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-semibold">יעל</span>
            )}
          </div>

          {item.projectType === 'commercial' && (item.commercialClient || item.commercialShootDaysContract) && (() => {
            const shootDays = (item.sessions || []).filter(s => s.type === 'צילום').length
            const contract = Number(item.commercialShootDaysContract) || 0
            return (
              <p className={`text-xs mt-1 font-medium ${hasGradient ? 'text-white text-opacity-80' : 'text-orange-500'}`}>
                {item.commercialClient && <span>{item.commercialClient}</span>}
                {item.commercialClient && contract > 0 && ' · '}
                {contract > 0 && <span>📷 {shootDays}/{contract} ימי צילום</span>}
              </p>
            )
          })()}
          {item.expectedDate && (
            <p className={`text-xs mt-1 ${hasGradient ? 'text-white text-opacity-70' : 'text-gray-400'}`}>
              {isReceived ? 'התקבל' : 'צפוי'}: {formatDate(item.expectedDate)}
            </p>
          )}
          {item.notes && (
            <p className={`text-xs mt-1 truncate ${hasGradient ? 'text-white text-opacity-70' : 'text-gray-400'}`}>{item.notes}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 mr-3">
          <div className="text-left">
            <span className={`text-base font-bold ${isReceived ? 'text-gray-400' : hasGradient ? 'text-white' : isWorkLog && item.projectType === 'commercial' ? 'text-orange-600' : isWorkLog && item.projectType === 'theater' ? 'text-purple-600' : isWorkLog && item.projectType === 'dubbing' ? 'text-pink-600' : isWorkLog ? 'text-blue-600' : 'text-green-600'}`}>
              {(item.amount || 0) > 0 ? formatILS(item.amount) : isWorkLog ? '—' : '—'}
            </span>
            {(item.amount || 0) > 0 && (item.agentCommission || item.addVat) && (() => {
              const base = Number(item.amount) || 0
              const afterAgent = item.agentCommission ? base * 0.85 : base
              const afterVat = item.addVat ? afterAgent * 1.18 : null
              return (
                <>
                  {item.agentCommission && (
                    <p className={`text-xs font-semibold ${hasGradient ? 'text-white text-opacity-80' : 'text-orange-500'}`}>
                      אחרי עמלת סוכן: {formatILS(afterAgent)}
                    </p>
                  )}
                  {item.addVat && (
                    <p className={`text-xs font-semibold ${hasGradient ? 'text-white text-opacity-80' : 'text-orange-500'}`}>
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
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${hasGradient ? 'border border-white border-opacity-40 text-white text-opacity-80' : 'border border-gray-300 text-gray-500'}`}
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
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${hasGradient ? 'border border-white border-opacity-40 text-white text-opacity-80' : 'border border-gray-300 text-gray-500'}`}
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
