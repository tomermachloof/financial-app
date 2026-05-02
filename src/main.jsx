import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadState, saveState } from './lib/supabase'
import useStore, { patchCloudState } from './store/useStore'

// ── Immediate cloud save: subscribe to every store change ─────────────
// Fires after initial load is complete (see setupImmediateSave below).
// This replaces the debounced save in App.jsx — every user action is persisted
// to the cloud immediately, protecting against tab close / app switch / crash.
let immediateSaveEnabled = false
let saveInFlight = false
let queuedSave = false
// חשיפה גלובלית — כדי שהרענון האוטומטי ימתין לשמירה פעילה לפני location.replace
if (typeof window !== 'undefined') {
  window.__isSaveInFlight = () => saveInFlight || queuedSave
}
const doSave = async () => {
  if (saveInFlight) { queuedSave = true; return }
  saveInFlight = true
  try { await saveState(useStore.getState()) }
  finally {
    saveInFlight = false
    if (queuedSave) { queuedSave = false; doSave() }
  }
}
useStore.subscribe((state, prev) => {
  if (!immediateSaveEnabled) return
  // Skip saves triggered only by lastSaved bumps
  if (state.lastSaved !== prev.lastSaved && Object.keys(state).every(k => k === 'lastSaved' || state[k] === prev[k])) return
  doSave()
})

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

// ── רענון אוטומטי כשמתפרסמת גרסה חדשה — גרסה אגרסיבית ──
// פועל גם כשיש מטמון עקשני של דפדפן / גיטהאב פיידג'ס
let reloadInFlight = false
const checkVersion = async () => {
  if (reloadInFlight) return
  try {
    // פרמטר ייחודי מונע כל אפשרות של החזרת תשובה מהמטמון
    const url = import.meta.env.BASE_URL + 'version.txt?t=' + Date.now() + '_' + Math.random()
    const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
    const latest = (await res.text()).trim()
    if (!latest) return
    const stored = localStorage.getItem('app_version')
    if (!stored) { localStorage.setItem('app_version', latest); return }
    if (stored === latest) return

    // גרסה חדשה זוהתה — ניקוי אגרסיבי ורענון עם עקיפת מטמון
    reloadInFlight = true
    localStorage.setItem('app_version', latest)
    // ── חכה לשמירה פעילה לפני רענון, שלא נקטע כתיבה לענן באמצע ──
    // מקסימום 10 שניות המתנה כדי שלא להיתקע לנצח
    const waitStart = Date.now()
    while (window.__isSaveInFlight && window.__isSaveInFlight() && (Date.now() - waitStart) < 10000) {
      await new Promise(r => setTimeout(r, 100))
    }
    try {
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(n => caches.delete(n)))
      }
    } catch {}
    // טעינה מחדש עם פרמטר ייחודי בכתובת — מאלץ את הדפדפן לטעון הכל מההתחלה
    const fresh = window.location.pathname + '?v=' + encodeURIComponent(latest)
    window.location.replace(fresh)
  } catch {}
}
checkVersion()
// בדיקה כל 30 שניות
setInterval(checkVersion, 30 * 1000)
// בדיקה מיידית כשחוזרים לאפליקציה אחרי שהיא הייתה ברקע
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkVersion()
})
// בדיקה גם בפוקוס על החלון (חשוב לדסקטופ שלא מטריגר visibilitychange)
window.addEventListener('focus', checkVersion)

// ── תיקון מסך תקוע אחרי חזרה מרקע (bfcache) ──
// כש-iOS/Safari משחזרים את הדף מ-bfcache, ה-React state הישן נשאר (מודל פתוח וכו')
// ולפעמים event handlers לא מגיבים. טעינה מחדש מאפסת הכל למצב נקי.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    window.location.reload()
  }
})

// Register Service Worker for push notifications + auto-update
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
    .then(reg => {
      console.log('[SW] registered', reg.scope)
      // בדיקת עדכון לשכבת השירות כל דקה + בכל חזרה לפורגראונד
      const checkSW = () => { try { reg.update() } catch {} }
      setInterval(checkSW, 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkSW()
      })
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

// Load state from Supabase before rendering (5s timeout so a hang never blocks the app)
const timeout = new Promise(resolve => setTimeout(resolve, 5000))
Promise.race([loadState(), timeout]).then(cloudState => {
  if (cloudState) {
    const local      = useStore.getState()
    const localTime  = local.lastSaved  || 0
    const cloudTime  = cloudState.lastSaved || 0

    // ── Safety lock: never let an empty/partial cloud state overwrite local data ──
    const localHasData  = (local.loans?.length || 0) > 0 || (local.accounts?.length || 0) > 0
    const cloudHasData  = (cloudState.loans?.length || 0) > 0 || (cloudState.accounts?.length || 0) > 0
    if (localHasData && !cloudHasData) {
      console.warn('[Sync] SAFETY LOCK — cloud returned empty state, keeping local')
      renderApp()
      return
    }

    if (cloudTime > localTime) {
      // הענן חדש יותר — טוען ממנו (סנכרון בין מכשירים)
      const patched = patchCloudState(cloudState)

      // Merge reminders: keep any local reminder not yet synced to cloud
      const cloudRem  = patched.reminders || []
      const localRem  = local.reminders  || []
      const cloudIds  = new Set(cloudRem.map(r => r.id))
      patched.reminders = [...cloudRem, ...localRem.filter(r => !cloudIds.has(r.id))]

      // Merge dismissedEvents (by id+date)
      const cloudDis = patched.dismissedEvents || []
      const localDis = local.dismissedEvents  || []
      const cloudDisIds = new Set(cloudDis.map(d => d.id + '|' + d.date))
      patched.dismissedEvents = [...cloudDis, ...localDis.filter(d => !cloudDisIds.has(d.id + '|' + d.date))]

      // Merge confirmedEvents (by id+date) — CRITICAL: never lose a user's confirmation
      const cloudConf = patched.confirmedEvents || []
      const localConf = local.confirmedEvents  || []
      const cloudConfIds = new Set(cloudConf.map(c => c.id + '|' + c.date))
      patched.confirmedEvents = [...cloudConf, ...localConf.filter(c => !cloudConfIds.has(c.id + '|' + c.date))]

      // Merge tasks (by id) — keep any local task not yet in cloud
      const cloudTasks = patched.tasks || []
      const localTasks = local.tasks  || []
      const cloudTaskIds = new Set(cloudTasks.map(t => t.id))
      patched.tasks = [...cloudTasks, ...localTasks.filter(t => !cloudTaskIds.has(t.id))]

      // ── Safety merge by id for all core data collections ──
      // Protects against losing items that were added locally but didn't finish
      // syncing to the cloud before the app was closed/refreshed.
      // Strategy: keep cloud version for existing ids (cloud is newer), and
      // append any local items whose id does not exist in cloud at all.
      const mergeById = (key) => {
        const cloudArr  = Array.isArray(patched[key]) ? patched[key] : []
        const localArr  = Array.isArray(local[key])   ? local[key]   : []
        const cloudSet  = new Set(cloudArr.map(x => x?.id).filter(Boolean))
        // IDs deleted on any device — never resurrect these
        const localDeleted = new Set((local.deletedIds?.[key]  || []))
        const cloudDeleted = new Set((patched.deletedIds?.[key] || []))
        const allDeleted   = new Set([...localDeleted, ...cloudDeleted])
        const orphans = localArr.filter(x => x?.id && !cloudSet.has(x.id) && !allDeleted.has(x.id))
        if (orphans.length > 0) {
          console.warn(`[Sync] rescued ${orphans.length} local ${key} item(s) not yet in cloud`)
          patched[key] = [...cloudArr, ...orphans]
        }
        // Merge deletedIds so all devices accumulate the full deleted list
        if (allDeleted.size > 0) {
          patched.deletedIds = { ...(patched.deletedIds || {}), [key]: [...allDeleted] }
        }
      }
      mergeById('accounts')
      mergeById('loans')
      mergeById('expenses')
      mergeById('futureIncome')
      mergeById('rentalIncome')
      mergeById('debts')
      mergeById('investments')

      // סינון סופי — הלוואות דיסקונט שנמחקו לא יחזרו אף פעם (גם לא מ-merge)
      const DEAD_LOAN_IDS = ['l10', 'l11', 'l13']
      const DEAD_LOAN_NAMES = ['דיסקונט תומר', 'דיסקונט יעל']
      patched.loans = (patched.loans || []).filter(l =>
        !DEAD_LOAN_IDS.includes(l.id) && !DEAD_LOAN_NAMES.includes(l.name)
      )

      useStore.setState(patched)
    } else {
      // המקומי חדש יותר או שווה — שומרים על המקומי, אבל תמיד ממזגים אישורים מהענן
      // כדי שאישורים שנעשו במכשיר אחר לא יאבדו גם כשהמקומי חדש יותר
      console.log('[Sync] local is newer or equal — keeping local state, merging cloud confirmations')
      const cloudConf = (cloudState.confirmedEvents || [])
      const localConf = (local.confirmedEvents || [])
      const localConfIds = new Set(localConf.map(c => c.id + '|' + c.date))
      const merged = [...localConf, ...cloudConf.filter(c => !localConfIds.has(c.id + '|' + c.date))]
      if (merged.length > localConf.length) {
        console.log(`[Sync] rescued ${merged.length - localConf.length} cloud confirmation(s) into local`)
        useStore.setState({ confirmedEvents: merged })
      }

      const cloudDis = (cloudState.dismissedEvents || [])
      const localDis = (local.dismissedEvents || [])
      const localDisIds = new Set(localDis.map(d => d.id + '|' + d.date))
      const mergedDis = [...localDis, ...cloudDis.filter(d => !localDisIds.has(d.id + '|' + d.date))]
      if (mergedDis.length > localDis.length) {
        useStore.setState({ dismissedEvents: mergedDis })
      }
    }
  }
  renderApp()
  immediateSaveEnabled = true
}).catch(() => {
  renderApp()
  immediateSaveEnabled = true
})
