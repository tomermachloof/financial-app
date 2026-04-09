import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadState, subscribeToChanges, uploadDocument, isSaving } from './lib/supabase'
import useStore, { patchCloudState } from './store/useStore'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', direction: 'ltr' }}>
          <h2 style={{ color: 'red' }}>Runtime Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error)}{'\n'}{this.state.error?.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// Auto-reload when a new version is deployed
const checkVersion = async () => {
  try {
    const stored = localStorage.getItem('app_version')
    const res = await fetch(import.meta.env.BASE_URL + 'version.txt?t=' + Date.now(), { cache: 'no-store' })
    const latest = (await res.text()).trim()
    if (!stored) { localStorage.setItem('app_version', latest); return }
    if (stored !== latest) { localStorage.setItem('app_version', latest); window.location.reload(true) }
  } catch {}
}
checkVersion()

// Register Service Worker + auto-resubscribe if permission already granted
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
    .then(async reg => {
      console.log('[SW] registered', reg.scope)
      // אם ההרשאה כבר ניתנה — וודא שיש subscription פעיל ומעודכן
      if (Notification.permission === 'granted') {
        const sub = await reg.pushManager.getSubscription()
        if (!sub) {
          // subscription פג — מחדש אוטומטית
          console.log('[Push] no subscription — resubscribing')
          const { subscribeToPush } = await import('./lib/pushNotifications')
          subscribeToPush()
        } else {
          // יש subscription — וודא שהענן מכיל את ה-endpoint הנוכחי
          try {
            const { supabase } = await import('./lib/supabase')
            const { data } = await supabase.from('app_state').select('state').eq('id', 'push_subscription').single()
            if (!data || data.state?.endpoint !== sub.endpoint) {
              console.log('[Push] endpoint changed — updating cloud')
              const { subscribeToPush } = await import('./lib/pushNotifications')
              subscribeToPush()
            }
          } catch {}
        }
      }
    })
    .catch(err => console.warn('[SW] registration failed', err))
}

const renderApp = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/financial-app">
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

// ── Safe merge helpers — NEVER drops data, always union ──────────
function mergeArrayById(local, cloud, keyFn) {
  const seen = new Set()
  const merged = []
  for (const item of [...local, ...cloud]) {
    const k = keyFn(item)
    if (!seen.has(k)) { seen.add(k); merged.push(item) }
  }
  return merged
}

// מיזוג ברמת שדה — לעולם לא מוחק שדות שקיימים בצד אחד בלבד
// כלל ברזל: אם לפריט יש מידע עשיר (paymentSchedule, documents) — הוא תמיד מנצח
function mergeById(local, cloud) {
  const map = new Map()
  // שלב 1: טוען הכל מהענן
  for (const item of (cloud || [])) if (item?.id) map.set(item.id, { ...item })
  // שלב 2: ממזג מהמקומי — כל שדה מקומי שקיים דורס את הענן
  for (const item of (local || [])) {
    if (!item?.id) continue
    const existing = map.get(item.id)
    if (existing) {
      const merged = { ...existing }
      for (const [key, val] of Object.entries(item)) {
        if (val !== undefined) merged[key] = val
      }
      // כלל ברזל: מידע עשיר לעולם לא נמחק
      if (existing.paymentSchedule?.length && !item.paymentSchedule?.length) merged.paymentSchedule = existing.paymentSchedule
      if (item.paymentSchedule?.length) merged.paymentSchedule = item.paymentSchedule
      if (existing.documents?.length && !item.documents?.length) merged.documents = existing.documents
      if (item.documents?.length) merged.documents = item.documents
      map.set(item.id, merged)
    } else {
      map.set(item.id, { ...item })
    }
  }
  return Array.from(map.values())
}

// ── Backup & Restore ─────────────────────────────────────────────
const BACKUP_KEY = 'financial_state_backup'
const BACKUP_TS_KEY = 'financial_state_backup_ts'

function createBackup() {
  try {
    const state = useStore.getState()
    const serializable = Object.fromEntries(
      Object.entries(state).filter(([, v]) => typeof v !== 'function')
    )
    localStorage.setItem(BACKUP_KEY, JSON.stringify(serializable))
    localStorage.setItem(BACKUP_TS_KEY, String(Date.now()))
    console.log('[Backup] created —', (state.confirmedEvents||[]).length, 'confirmed,', (state.accounts||[]).length, 'accounts')
  } catch (e) {
    console.warn('[Backup] failed', e)
  }
}

// ── Safe merge function — used at startup AND on tab focus ──────
function safeMerge(cloudState) {
  const local = useStore.getState()
  const patched = patchCloudState(cloudState)
  const localTime = local.lastSaved || 0
  const cloudTime = patched.lastSaved || 0

  // Pick base: whoever is newer for non-array fields (rates, settings, etc)
  const base = cloudTime > localTime ? patched : local

  // SAFE MERGE — union of all critical arrays, never drop anything
  const result = { ...base }

  result.confirmedEvents = mergeArrayById(
    local.confirmedEvents || [], patched.confirmedEvents || [],
    e => `${e.id}|${e.date}`
  )
  result.dismissedEvents = mergeArrayById(
    local.dismissedEvents || [], patched.dismissedEvents || [],
    d => `${d.id}|${d.date}`
  )
  result.reminders = mergeArrayById(
    local.reminders || [], patched.reminders || [],
    r => r.id
  )
  result.tasks = mergeArrayById(
    local.tasks || [], patched.tasks || [],
    t => t.id
  )
  result.friendReminders = mergeArrayById(
    local.friendReminders || [], patched.friendReminders || [],
    r => `${r.loanId}|${r.monthKey}`
  )
  // מיזוג ברמת שדה — מקומי תמיד מנצח בשדות שהמשתמש ערך, ענן ממלא חסרים
  result.accounts = mergeById(local.accounts || [], patched.accounts || [])
  result.investments = mergeById(local.investments || [], patched.investments || [])
  const DELETED_LOAN_IDS = ['l13', 'l10', 'l11']
  result.loans = mergeById(local.loans || [], patched.loans || [])
    .filter(l => !DELETED_LOAN_IDS.includes(l.id))
  result.expenses = mergeById(local.expenses || [], patched.expenses || [])
  result.rentalIncome = mergeById(local.rentalIncome || [], patched.rentalIncome || [])
  result.futureIncome = mergeById(local.futureIncome || [], patched.futureIncome || [])
  result.debts = mergeById(local.debts || [], patched.debts || [])

  // ── SAFETY CHECK — never lose data ──
  const localConfLen = (local.confirmedEvents || []).length
  const resultConfLen = result.confirmedEvents.length
  const localAccLen = (local.accounts || []).length
  const resultAccLen = result.accounts.length

  // ספירת לוחות סילוקין ומסמכים — מקומי מול תוצאה
  const localSchedules = (local.loans || []).filter(l => l.paymentSchedule?.length > 0).length
  const resultSchedules = result.loans.filter(l => l.paymentSchedule?.length > 0).length
  const localDocs = (local.loans || []).reduce((s, l) => s + (l.documents?.length || 0), 0)
  const resultDocs = result.loans.reduce((s, l) => s + (l.documents?.length || 0), 0)
  const localTasks = (local.tasks || []).filter(t => t.done).length
  const resultTasks = (result.tasks || []).filter(t => t.done).length

  if (resultConfLen < localConfLen || resultAccLen < localAccLen) {
    console.error(`[Sync] BLOCKED — would lose data! confirmed: ${localConfLen}→${resultConfLen}, accounts: ${localAccLen}→${resultAccLen}`)
    return null // signal: do not apply
  }

  // חסימה אם מאבדים לוחות סילוקין או מסמכים
  if (resultSchedules < localSchedules || resultDocs < localDocs) {
    console.error(`[Sync] BLOCKED — would lose rich data! schedules: ${localSchedules}→${resultSchedules}, docs: ${localDocs}→${resultDocs}`)
    return null
  }

  // חסימה אם מאבדים משימות שכבר בוצעו
  if (resultTasks < localTasks) {
    console.error(`[Sync] BLOCKED — would lose completed tasks! ${localTasks}→${resultTasks}`)
    return null
  }

  console.log(`[Sync] merged — confirmed: ${resultConfLen}, dismissed: ${result.dismissedEvents.length}, accounts: ${resultAccLen}, loans: ${result.loans.length}, schedules: ${resultSchedules}, docs: ${resultDocs}, local=${localTime}, cloud=${cloudTime}`)
  return result
}

// ── בדיקת סיכון — מזהה כשהענן מכיל פחות מידע מהמקומי ──────
function detectDataLossRisk(local, cloud) {
  const risks = []
  const localSchedules = (local.loans || []).filter(l => l.paymentSchedule?.length > 0).length
  const cloudSchedules = (cloud.loans || []).filter(l => l.paymentSchedule?.length > 0).length
  if (localSchedules > 0 && cloudSchedules < localSchedules) {
    risks.push(`לוחות סילוקין: ${localSchedules} מקומי → ${cloudSchedules} בענן`)
  }
  const localDocs = (local.loans || []).reduce((s, l) => s + (l.documents?.length || 0), 0)
  const cloudDocs = (cloud.loans || []).reduce((s, l) => s + (l.documents?.length || 0), 0)
  if (localDocs > 0 && cloudDocs < localDocs) {
    risks.push(`מסמכים: ${localDocs} מקומי → ${cloudDocs} בענן`)
  }
  const localConf = (local.confirmedEvents || []).length
  const cloudConf = (cloud.confirmedEvents || []).length
  if (localConf > cloudConf + 5) {
    risks.push(`אישורים: ${localConf} מקומי → ${cloudConf} בענן`)
  }
  return risks
}

// ── Initial load from Supabase ──────────────────────────────────
// Always render first, then sync — app is never blocked
renderApp()

// Sync from cloud after render
loadState().then(cloudState => {
  try {
    if (!cloudState) return
    const local = useStore.getState()
    const localTime = local.lastSaved || 0

    if (!localTime) {
      // Fresh device — take cloud state directly
      const patched = patchCloudState(cloudState)
      // בדיקה: אם הענן ריק מלוחות סילוקין אבל יש גיבוי — להציע שחזור
      const backup = localStorage.getItem(BACKUP_KEY)
      if (backup) {
        try {
          const backupState = JSON.parse(backup)
          const backupSchedules = (backupState.loans || []).filter(l => l.paymentSchedule?.length > 0).length
          const cloudSchedules = (patched.loans || []).filter(l => l.paymentSchedule?.length > 0).length
          if (backupSchedules > cloudSchedules) {
            const useBackup = window.confirm(`זוהה גיבוי מקומי עם ${backupSchedules} לוחות סילוקין שלא קיימים בענן (${cloudSchedules}).\n\nלשחזר מהגיבוי?`)
            if (useBackup) {
              const merged = { ...patched }
              merged.loans = mergeById(backupState.loans || [], patched.loans || [])
              merged.confirmedEvents = mergeArrayById(backupState.confirmedEvents || [], patched.confirmedEvents || [], e => `${e.id}|${e.date}`)
              const dataOnly = Object.fromEntries(Object.entries(merged).filter(([, v]) => typeof v !== 'function'))
              useStore.setState(dataOnly)
              console.log('[Sync] restored from backup with', backupSchedules, 'schedules')
              return
            }
          }
        } catch (e) { console.warn('[Sync] backup parse failed', e) }
      }
      const dataOnly = Object.fromEntries(
        Object.entries(patched).filter(([, v]) => typeof v !== 'function')
      )
      console.log('[Sync] fresh device — loaded cloud. confirmed:', (dataOnly.confirmedEvents||[]).length)
      useStore.setState(dataOnly)
    } else {
      // Existing device — safe merge
      createBackup()

      // בדיקת סיכון — אם הענן מכיל פחות, להציג אזהרה
      const patched = patchCloudState(cloudState)
      const risks = detectDataLossRisk(local, patched)
      if (risks.length > 0) {
        console.warn('[Sync] DATA LOSS RISK detected:', risks)
        const proceed = window.confirm(`אזהרה: הענן מכיל פחות מידע מהמכשיר הזה:\n\n${risks.join('\n')}\n\nהנתונים המקומיים נשמרו בגיבוי.\nלהמשיך בסנכרון? (המערכת תמזג ולא תמחק)`)
        if (!proceed) {
          console.log('[Sync] user cancelled — keeping local')
          return
        }
      }

      const result = safeMerge(cloudState)
      if (result) useStore.setState(result)
    }
  } catch (e) {
    console.error('[Sync] merge error, keeping local', e)
  }
}).catch(e => console.warn('[Sync] cloud load failed', e))

// ── Migrate old documents (dataURL → cloud storage) ────────────
async function migrateLocalDocs() {
  const { loans, updateLoan } = useStore.getState()
  if (!loans) return
  for (const loan of loans) {
    const docs = loan.documents || []
    const oldDocs = docs.filter(d => d.dataURL && !d.url)
    if (oldDocs.length === 0) continue
    console.log(`[DocMigrate] ${loan.name}: ${oldDocs.length} מסמכים להעלאה`)
    const newDocs = []
    for (const doc of docs) {
      if (doc.url || !doc.dataURL) { newDocs.push(doc); continue }
      try {
        const res = await fetch(doc.dataURL)
        const blob = await res.blob()
        const file = new File([blob], doc.name || 'document.pdf', { type: doc.type || 'application/pdf' })
        const url = await uploadDocument(file, loan.id)
        newDocs.push({ name: doc.name, type: doc.type, url, uploadedAt: doc.uploadedAt })
        console.log(`[DocMigrate] ✓ ${doc.name}`)
      } catch (e) {
        console.warn(`[DocMigrate] ✗ ${doc.name}:`, e)
        newDocs.push(doc) // שומר את הגרסה הישנה אם ההעלאה נכשלת
      }
    }
    updateLoan(loan.id, { documents: newDocs })
  }
}
setTimeout(migrateLocalDocs, 5000) // רץ 5 שניות אחרי טעינה

// ── Realtime sync — instant updates from other devices ──────────
let _lastSaveTime = 0
useStore.subscribe(s => { _lastSaveTime = s.lastSaved || 0 })

subscribeToChanges((cloudState) => {
  // חוסם סנכרון נכנס בזמן שמירה — מונע מצב שנתונים ישנים דורסים חדשים
  if (isSaving) { console.log('[Realtime] ignored — save in progress'); return }
  const localTime = _lastSaveTime || useStore.getState().lastSaved || 0
  const cloudTime = cloudState.lastSaved || 0
  if (cloudTime <= localTime) return
  console.log('[Realtime] received update from another device')

  // בדיקת סיכון בזמן אמת
  const local = useStore.getState()
  const patched = patchCloudState(cloudState)
  const risks = detectDataLossRisk(local, patched)
  if (risks.length > 0) {
    console.warn('[Realtime] DATA LOSS RISK:', risks)
    // בזמן אמת לא מציגים alert — פשוט חוסמים
    return
  }

  const result = safeMerge(cloudState)
  if (result) {
    useStore.setState(result)
    console.log('[Realtime] merged successfully')
  }
})

// ── שמירה בסגירת דף — שמירה סינכרונית עם XMLHttpRequest ──
window.addEventListener('beforeunload', () => {
  try {
    const state = useStore.getState()
    const serializable = Object.fromEntries(
      Object.entries(state).filter(([, v]) => typeof v !== 'function')
    )
    const xhr = new XMLHttpRequest()
    xhr.open('PATCH', `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/app_state?id=eq.main`, false) // false = synchronous
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Authorization', `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`)
    xhr.setRequestHeader('Prefer', 'return=minimal')
    xhr.send(JSON.stringify({ state: serializable, updated_at: new Date().toISOString() }))
  } catch (e) { /* שמירה בסגירה — לא קריטית */ }
})

// ── Live sync when tab becomes visible (switching between devices) ──
// Use multiple events for maximum iOS PWA compatibility
let _syncLock = false
async function syncOnResume() {
  if (_syncLock) return
  _syncLock = true
  try {
    const cloudState = await Promise.race([loadState(), new Promise(r => setTimeout(r, 3000))])
    if (!cloudState) return

    createBackup()

    const result = safeMerge(cloudState)
    if (result) {
      useStore.setState(result)
      console.log('[Sync] resume merge complete')
    }
  } catch (e) {
    console.warn('[Sync] resume sync failed', e)
  } finally {
    _syncLock = false
  }
}

// visibilitychange — works on most browsers
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncOnResume()
})

// focus — backup for iOS PWA where visibilitychange is unreliable
window.addEventListener('focus', syncOnResume)

// pageshow — fires on iOS when PWA resumes from background
window.addEventListener('pageshow', (e) => {
  // persisted = page was restored from bfcache (common on iOS)
  if (e.persisted) syncOnResume()
  // Also sync on any pageshow after first load
  else setTimeout(syncOnResume, 500)
})
