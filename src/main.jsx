import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadState, saveState, supabase } from './lib/supabase'
import useStore, { patchCloudState } from './store/useStore'

// ── Immediate cloud save: subscribe to every store change ─────────────
// Fires after initial load is complete (see setupImmediateSave below).
// This replaces the debounced save in App.jsx — every user action is persisted
// to the cloud immediately, protecting against tab close / app switch / crash.
let immediateSaveEnabled = false
let saveInFlight = false
let queuedSave = false
// עוקב אחרי lastSaved שנטענה מהענן — לזיהוי שמירה מקבילה ממכשיר אחר
let _lastKnownCloudTime = 0
// חשיפה גלובלית — כדי שהרענון האוטומטי ימתין לשמירה פעילה לפני location.replace
if (typeof window !== 'undefined') {
  window.__isSaveInFlight = () => saveInFlight || queuedSave
}

// ממזג שינויים מהענן לפני שמירה — מונע דריסה של נתונים שמכשיר אחר הוסיף
function mergeBeforeSave(local, cloud) {
  const delta = {}
  const cleanId = (s) => String(s || '').replace(/_ro$/, '').replace(/_m\d+$/, '')

  // confirmedEvents — מיזוג לפי id+date
  const localConf = local.confirmedEvents || []
  const cloudConf = cloud.confirmedEvents || []
  const localConfKeys = new Set(localConf.map(c => cleanId(c.id) + '|' + c.date))
  const newConf = [...localConf, ...cloudConf.filter(c => !localConfKeys.has(cleanId(c.id) + '|' + c.date))]
  if (newConf.length > localConf.length) delta.confirmedEvents = newConf

  // dismissedEvents — מיזוג לפי id+date
  const localDis = local.dismissedEvents || []
  const cloudDis = cloud.dismissedEvents || []
  const localDisKeys = new Set(localDis.map(d => cleanId(d.id) + '|' + d.date))
  const newDis = [...localDis, ...cloudDis.filter(d => !localDisKeys.has(cleanId(d.id) + '|' + d.date))]
  if (newDis.length > localDis.length) delta.dismissedEvents = newDis

  // payments[] בתוך rentalIncome ו-futureIncome — מיזוג לפי payment ID
  ;['rentalIncome', 'futureIncome'].forEach(key => {
    const localArr = local[key] || []
    const cloudArr = cloud[key] || []
    const cloudMap = Object.fromEntries(cloudArr.filter(x => x?.id).map(x => [x.id, x]))
    let anyChanged = false
    const result = localArr.map(item => {
      const cloudItem = cloudMap[item.id]
      if (!cloudItem?.payments?.length) return item
      const localPayIds = new Set((item.payments || []).map(p => p.id).filter(Boolean))
      const cloudOnly = cloudItem.payments.filter(p => p.id && !localPayIds.has(p.id))
      if (!cloudOnly.length) return item
      anyChanged = true
      return { ...item, payments: [...(item.payments || []), ...cloudOnly] }
    })
    if (anyChanged) delta[key] = result
  })

  // usdBalance — מונע דריסה של אישורי אירועים דולריים בין מכשירים.
  // applyBankBalances משחזר balance שקלי מהענן, אבל לא usdBalance — לכן מטפלים בו כאן.
  const localAccs = local.accounts || []
  const cloudAccs = cloud.accounts || []
  if (cloudAccs.length > 0 && localAccs.length > 0) {
    const cloudAccMap = Object.fromEntries(cloudAccs.filter(a => a?.id).map(a => [a.id, a]))
    let accChanged = false
    const mergedAccs = localAccs.map(a => {
      const ca = cloudAccMap[a.id]
      if (!ca) return a
      if ((ca.usdBalance ?? 0) === (a.usdBalance ?? 0)) return a
      accChanged = true
      return { ...a, usdBalance: ca.usdBalance }
    })
    if (accChanged) delta.accounts = mergedAccs
  }

  // פריטים חדשים שנוספו בענן (למשל הוצאה חדשה שיעל הוסיפה) — רק הוספה, לא דריסה
  const localDeleted = local.deletedIds || {}
  ;['loans', 'expenses', 'rentalIncome', 'futureIncome', 'debts', 'investments'].forEach(key => {
    const localArr = delta[key] || local[key] || []
    const cloudArr = cloud[key] || []
    const localIds = new Set(localArr.map(x => x?.id).filter(Boolean))
    const deleted = new Set(localDeleted[key] || [])
    const newItems = cloudArr.filter(x => x?.id && !localIds.has(x.id) && !deleted.has(x.id))
    if (newItems.length > 0) {
      delta[key] = [...localArr, ...newItems]
      console.log(`[PreSave] rescued ${newItems.length} new ${key} item(s) from cloud`)
    }
  })

  return delta
}

const doSave = async () => {
  if (saveInFlight) { queuedSave = true; return }
  saveInFlight = true
  try {
    // בדיקת התנגשות — האם מכשיר אחר שמר מאז הסנכרון האחרון שלנו?
    try {
      const { data: peek } = await supabase
        .from('app_state').select('state_v2').eq('id', 'main').maybeSingle()
      const cloudTs = peek?.state_v2?.lastSaved || 0
      if (cloudTs > _lastKnownCloudTime) {
        const delta = mergeBeforeSave(useStore.getState(), peek.state_v2)
        if (Object.keys(delta).length > 0) {
          useStore.setState(delta)
          console.log('[PreSave] merged concurrent cloud changes:', Object.keys(delta))
        }
        _lastKnownCloudTime = cloudTs
      }
    } catch (e) {
      console.warn('[PreSave] conflict check failed, saving anyway:', e.message)
    }
    await saveState(useStore.getState())
    _lastKnownCloudTime = useStore.getState().lastSaved || Date.now()
  } finally {
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
    // בדיקה אחרונה — שמירה שהחלה בזמן ניקוי ה-cache לא תיחתך
    const finalWait = Date.now()
    while (window.__isSaveInFlight?.() && (Date.now() - finalWait) < 5000) {
      await new Promise(r => setTimeout(r, 100))
    }
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
  if (document.visibilityState === 'visible') { checkVersion(); applyBankBalances() }
})
// בדיקה גם בפוקוס על החלון (חשוב לדסקטופ שלא מטריגר visibilitychange)
window.addEventListener('focus', () => { checkVersion(); applyBankBalances() })

// ── תיקון מסך תקוע אחרי חזרה מרקע (bfcache) ──
// כש-iOS/Safari משחזרים את הדף מ-bfcache, ה-React state הישן נשאר (מודל פתוח וכו')
// ולפעמים event handlers לא מגיבים. טעינה מחדש מאפסת הכל למצב נקי.
window.addEventListener('pageshow', async (e) => {
  if (e.persisted) {
    // ממתין לשמירה פעילה לפני הריענון — מונע אובדן תשלומים שנשמרו לפני ה-bfcache
    const waitStart = Date.now()
    while (window.__isSaveInFlight?.() && (Date.now() - waitStart) < 5000) {
      await new Promise(r => setTimeout(r, 100))
    }
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
Promise.race([loadState(), timeout]).then(async cloudState => {
  if (cloudState) {
    const local      = useStore.getState()
    const localTime  = local.lastSaved  || 0
    const cloudTime  = cloudState.lastSaved || 0
    // מנרמל IDs של אירועים — מסיר סיומות _ro ו-_m1 לפני השוואה
    const syncCleanId = (s) => String(s || '').replace(/_ro$/, '').replace(/_m\d+$/, '')

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

      // Merge dismissedEvents (by id+date) — normalize IDs before dedup
      const cloudDis = patched.dismissedEvents || []
      const localDis = local.dismissedEvents  || []
      const cloudDisIds = new Set(cloudDis.map(d => syncCleanId(d.id) + '|' + d.date))
      patched.dismissedEvents = [...cloudDis, ...localDis.filter(d => !cloudDisIds.has(syncCleanId(d.id) + '|' + d.date))]

      // Merge confirmedEvents (by id+date) — CRITICAL: never lose a user's confirmation
      // normalize IDs (_ro/_m1 suffixes) before dedup so confirmations from different devices match
      const cloudConf = patched.confirmedEvents || []
      const localConf = local.confirmedEvents  || []
      const cloudConfIds = new Set(cloudConf.map(c => syncCleanId(c.id) + '|' + c.date))
      patched.confirmedEvents = [...cloudConf, ...localConf.filter(c => !cloudConfIds.has(syncCleanId(c.id) + '|' + c.date))]

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
        const cloudArr     = Array.isArray(patched[key]) ? patched[key] : []
        const localArr     = Array.isArray(local[key])   ? local[key]   : []
        const cloudSet     = new Set(cloudArr.map(x => x?.id).filter(Boolean))
        const localDeleted = new Set((local.deletedIds?.[key]  || []))
        const cloudDeleted = new Set((patched.deletedIds?.[key] || []))
        // cloudDeleted always applies.
        // localDeleted only applies to items NOT present in cloudArr —
        // if cloud has the item in its array, it means it was deliberately restored,
        // and local deletion is ignored (prevents phone localStorage from re-deleting admin restores).
        const allDeleted = new Set([
          ...cloudDeleted,
          ...[...localDeleted].filter(id => !cloudSet.has(id)),
        ])
        // Filter items that cloud explicitly marks as deleted
        const filteredCloud = allDeleted.size > 0
          ? cloudArr.filter(x => !x?.id || !allDeleted.has(x.id))
          : cloudArr
        const filteredSet = new Set(filteredCloud.map(x => x?.id).filter(Boolean))
        const orphans = localArr.filter(x => x?.id && !filteredSet.has(x.id) && !allDeleted.has(x.id))
        if (filteredCloud.length !== cloudArr.length || orphans.length > 0) {
          if (filteredCloud.length !== cloudArr.length)
            console.warn(`[Sync] removed ${cloudArr.length - filteredCloud.length} deleted ${key} item(s) from cloud`)
          if (orphans.length > 0)
            console.warn(`[Sync] rescued ${orphans.length} local ${key} item(s) not yet in cloud`)
          patched[key] = [...filteredCloud, ...orphans]
        }
        // Save merged deletedIds — excluding items present in cloudArr (they were un-deleted)
        const finalDeleted = [...allDeleted].filter(id => !cloudSet.has(id))
        patched.deletedIds = { ...(patched.deletedIds || {}), [key]: finalDeleted }
      }
      mergeById('accounts')
      mergeById('loans')
      mergeById('expenses')
      mergeById('futureIncome')
      mergeById('rentalIncome')
      mergeById('debts')
      mergeById('investments')

      // מיזוג עמוק של payments[] — מונע אובדן תשלומים שנוספו על מכשיר אחר
      // mergeById שומרת את הפריט מהענן במלואו; הפונקציה הזו מוסיפה בנוסף תשלומים מהלוקאל שחסרים בענן
      // פילטר זמן: מציל רק תשלומים שנוצרו בשעתיים האחרונות — מונע הצלה של תשלומים ישנים מסשנים שבורים
      const deepMergePayments = (key) => {
        const now = Date.now()
        const TWO_HOURS = 2 * 60 * 60 * 1000
        const localMap = Object.fromEntries((local[key] || []).filter(x => x?.id).map(x => [x.id, x]))
        patched[key] = (patched[key] || []).map(item => {
          const localItem = localMap[item.id]
          if (!localItem?.payments?.length) return item
          const cloudPayIds = new Set((item.payments || []).map(p => p.id).filter(Boolean))
          const localOnly = localItem.payments.filter(p => {
            if (!p.id || cloudPayIds.has(p.id)) return false
            const age = now - new Date(p.date).getTime()
            return age < TWO_HOURS
          })
          if (!localOnly.length) return item
          console.warn(`[Sync] rescued ${localOnly.length} local-only payment(s) into ${key}/${item.id}`)
          return { ...item, payments: [...(item.payments || []), ...localOnly] }
        })
      }
      deepMergePayments('rentalIncome')
      deepMergePayments('futureIncome')

      // סינון סופי — הלוואות דיסקונט שנמחקו לא יחזרו אף פעם (גם לא מ-merge)
      const DEAD_LOAN_IDS = new Set(['l10', 'l11', 'l13', 'l1775055941589'])
      const DEAD_LOAN_NAMES = new Set(['דיסקונט תומר', 'דיסקונט יעל'])
      patched.loans = (patched.loans || []).filter(l =>
        !DEAD_LOAN_IDS.has(l.id) && !DEAD_LOAN_NAMES.has((l.name || '').trim())
      )

      // ── בדיקת היעלמות פריטים בסנכרון ──
      // אם פריט היה בלוקאל, לא נמצא אחרי הסנכרון, ולא מסומן כמחוק בענן — שולח מייל
      const SYNC_WATCH_KEYS = ['loans', 'futureIncome', 'rentalIncome', 'debts', 'expenses', 'investments', 'accounts']
      const SYNC_TYPE_LABELS = { loans: 'הלוואה', futureIncome: 'הכנסה עתידית', rentalIncome: 'שכירות', debts: 'חוב', expenses: 'הוצאה', investments: 'השקעה', accounts: 'חשבון בנק' }
      const syncDisappeared = []
      SYNC_WATCH_KEYS.forEach(key => {
        const before = local[key] || []
        const afterSet = new Set((patched[key] || []).map(x => x?.id).filter(Boolean))
        const deletedInSync = new Set(patched.deletedIds?.[key] || [])
        before.forEach(item => {
          if (item?.id && !afterSet.has(item.id) && !deletedInSync.has(item.id)) {
            syncDisappeared.push({ type: SYNC_TYPE_LABELS[key] || key, name: item.name || item.projectName || item.bankName || item.id, id: item.id })
          }
        })
      })
      if (syncDisappeared.length > 0) {
        const body = syncDisappeared.map(d => `• ${d.type}: "${d.name}" (${d.id})`).join('\n')
        fetch('https://financial-notify.tomer-finance.workers.dev/notify-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: `⚠️ סנכרון מחק ${syncDisappeared.length} פריטים`, name: body, id: 'sync' }),
        }).catch(() => {})
      }

      useStore.setState(patched)
    } else {
      // המקומי חדש יותר או שווה — שומרים על המקומי, אבל תמיד ממזגים אישורים מהענן
      // כדי שאישורים שנעשו במכשיר אחר לא יאבדו גם כשהמקומי חדש יותר
      // חשבונות עם lastScraped חדש יותר בענן — תמיד ניקח את היתרה מהענן (bank sync)
      const cloudAccounts = cloudState.accounts || []
      const updatedAccounts = (local.accounts || []).map(localAcc => {
        const cloudAcc = cloudAccounts.find(a => a.id === localAcc.id)
        if (cloudAcc?.lastScraped && (!localAcc.lastScraped || cloudAcc.lastScraped > localAcc.lastScraped)) {
          return { ...localAcc, balance: cloudAcc.balance, lastScraped: cloudAcc.lastScraped }
        }
        return localAcc
      })
      if (updatedAccounts.some((a, i) => a.balance !== (local.accounts || [])[i]?.balance)) {
        console.log('[Sync] updated scraped account balances from cloud')
        useStore.setState({ accounts: updatedAccounts })
      }
      console.log('[Sync] local is newer or equal — keeping local state, merging cloud confirmations')
      const cloudConf = (cloudState.confirmedEvents || [])
      const localConf = (local.confirmedEvents || [])
      const localConfIds = new Set(localConf.map(c => syncCleanId(c.id) + '|' + c.date))
      const merged = [...localConf, ...cloudConf.filter(c => !localConfIds.has(syncCleanId(c.id) + '|' + c.date))]
      if (merged.length > localConf.length) {
        console.log(`[Sync] rescued ${merged.length - localConf.length} cloud confirmation(s) into local`)
        useStore.setState({ confirmedEvents: merged })
      }

      const cloudDis = (cloudState.dismissedEvents || [])
      const localDis = (local.dismissedEvents || [])
      const localDisIds = new Set(localDis.map(d => syncCleanId(d.id) + '|' + d.date))
      const mergedDis = [...localDis, ...cloudDis.filter(d => !localDisIds.has(syncCleanId(d.id) + '|' + d.date))]
      if (mergedDis.length > localDis.length) {
        useStore.setState({ dismissedEvents: mergedDis })
      }

      // גם כשהלוקאל חדש יותר — נציל פריטים שהענן מכיל אך הלוקאל מחק,
      // בתנאי שהענן עצמו לא מסמן אותם כמחוקים (שחזור ידני בענן).
      // חשוב: לא מצילים פריטים שהמשתמש מחק בכוונה (נמצאים ב-local.deletedIds)
      const rescuedState = {}
      ;['futureIncome', 'rentalIncome', 'loans', 'debts', 'expenses', 'investments'].forEach(key => {
        const cloudArr     = cloudState[key] || []
        const cloudDeleted = new Set((cloudState.deletedIds?.[key] || []))
        const localDeleted = new Set((local.deletedIds?.[key] || []))
        const localArr     = rescuedState[key] || local[key] || []
        const localSet     = new Set(localArr.map(x => x?.id).filter(Boolean))
        // לא מצילים: נמחק בענן, קיים בלוקאל, או שהמשתמש מחק בלוקאל בכוונה
        const toRescue     = cloudArr.filter(x => x?.id && !cloudDeleted.has(x.id) && !localSet.has(x.id) && !localDeleted.has(x.id))
        if (toRescue.length > 0) {
          console.warn(`[Sync] rescued ${toRescue.length} cloud-only ${key} item(s) in local-newer path`)
          rescuedState[key] = [...localArr, ...toRescue]
          const prevDeleted = rescuedState.deletedIds || local.deletedIds || {}
          rescuedState.deletedIds = {
            ...prevDeleted,
            [key]: (prevDeleted[key] || []).filter(id => !toRescue.some(x => x.id === id)),
          }
        }
      })
      if (Object.keys(rescuedState).length > 0) useStore.setState(rescuedState)
    }
    // תמיד מחיל יתרות בנק scraped מהענן — עוקף השוואת lastSaved לחלוטין
    const scrapedCloud = (cloudState.accounts || []).filter(a => a.lastScraped)
    if (scrapedCloud.length > 0) {
      const curAccs = useStore.getState().accounts || []
      let balChanged = false
      const fixedAccs = curAccs.map(a => {
        const ca = scrapedCloud.find(c => c.id === a.id)
        if (ca && a.balance !== ca.balance) { balChanged = true; return { ...a, balance: ca.balance, lastScraped: ca.lastScraped } }
        return a
      })
      if (balChanged) useStore.setState({ accounts: fixedAccs })
    }
  }
  await Promise.race([applyBankBalances(), new Promise(r => setTimeout(r, 3000))])
  migrateScheduleLoansPaidCount()
  migrateRentalPaymentMKeys()
  pruneOldEvents()
  purgeBlockedLoans()
  // מאתחל את זמן הסנכרון האחרון לפני שמפעילים שמירות אוטומטיות
  _lastKnownCloudTime = useStore.getState().lastSaved || 0
  renderApp()
  immediateSaveEnabled = true
}).catch(async () => {
  await Promise.race([applyBankBalances(), new Promise(r => setTimeout(r, 3000))])
  migrateScheduleLoansPaidCount()
  migrateRentalPaymentMKeys()
  pruneOldEvents()
  purgeBlockedLoans()
  renderApp()
  immediateSaveEnabled = true
})

// מסיר רשומות confirmedEvents / dismissedEvents ישנות (מעל 90 יום)
// מונע צמיחה ל-אלפי רשומות לאורך זמן
function pruneOldEvents() {
  const state = useStore.getState()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  const confirmed = (state.confirmedEvents || []).filter(e => (e.date || '') >= cutoffStr)
  const dismissed = (state.dismissedEvents || []).filter(e => (e.date || '') >= cutoffStr)
  const confirmedPruned = confirmed.length < (state.confirmedEvents || []).length
  const dismissedPruned = dismissed.length < (state.dismissedEvents || []).length
  if (confirmedPruned || dismissedPruned) {
    console.log(`[Prune] removed ${(state.confirmedEvents||[]).length - confirmed.length} old confirmations, ${(state.dismissedEvents||[]).length - dismissed.length} old dismissals`)
    useStore.setState({ confirmedEvents: confirmed, dismissedEvents: dismissed })
  }
}

// מסיר הלוואות חסומות מהלוקאל — רץ תמיד בכל טעינה, בלי תלות בנתיב הסנכרון
function purgeBlockedLoans() {
  const BLOCKED_IDS   = new Set(['l10', 'l11', 'l13', 'l1775055941589'])
  const BLOCKED_NAMES = new Set(['דיסקונט תומר', 'דיסקונט יעל'])
  const isBlockedLoan = l => BLOCKED_IDS.has(l.id) || BLOCKED_NAMES.has((l.name || '').trim())
  const state = useStore.getState()
  const before = state.loans || []
  const after  = before.filter(l => !isBlockedLoan(l))
  if (after.length < before.length) {
    const removedIds = before.filter(isBlockedLoan).map(l => l.id).filter(Boolean)
    const prevDel = state.deletedIds?.loans || []
    console.warn(`[Purge] removed ${before.length - after.length} blocked loan(s):`, removedIds)
    useStore.setState({
      loans: after,
      deletedIds: { ...(state.deletedIds || {}), loans: [...new Set([...prevDel, ...['l10','l11','l13'], ...removedIds])] }
    })
  }
}

function migrateRentalPaymentMKeys() {
  const { rentalIncome, usdRate: rate } = useStore.getState()
  // guard: אם usdRate הוא 0 — לא מריצים את ה-migration (סכומים יתאפסו)
  if (!rate || rate <= 0) { console.warn('[Migration] skipped migrateRentalPaymentMKeys — usdRate is 0'); return }
  const usdRate = rate
  let anyChanged = false
  const newRI = rentalIncome.map(r => {
    const needsMigration = (r.payments || []).some(p => p.mKey == null && p.date)
    if (!needsMigration) return r
    const newMonthlyAmounts = { ...(r.monthlyAmounts || {}) }
    const newPayments = (r.payments || []).map(p => {
      if (p.mKey != null || !p.date) return p
      const payMKey = p.date.slice(0, 7)
      if (newMonthlyAmounts[payMKey] != null) {
        const payILS = r.currency === 'USD' ? Math.round(p.amount * usdRate) : p.amount
        newMonthlyAmounts[payMKey] = (newMonthlyAmounts[payMKey] || 0) + payILS
      }
      return { ...p, mKey: payMKey }
    })
    anyChanged = true
    return { ...r, monthlyAmounts: newMonthlyAmounts, payments: newPayments }
  })
  if (anyChanged) {
    console.log('[Migration] assigned mKey to rental payments')
    useStore.setState({ rentalIncome: newRI })
  }
}

function migrateScheduleLoansPaidCount() {
  const state = useStore.getState()
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`
  let anyChanged = false
  const updatedLoans = state.loans.map(loan => {
    if (!loan.paymentSchedule?.length || loan._paidCountMigrated) return loan
    const pastCount = loan.paymentSchedule.filter(p => p.date && p.date <= todayStr).length
    const newPaidCount = Math.max(loan.paidCount || 0, pastCount)
    anyChanged = true
    return { ...loan, paidCount: newPaidCount, _paidCountMigrated: true, _updatedAt: Date.now() }
  })
  if (anyChanged) {
    console.log('[Migration] updated paidCount for schedule loans')
    useStore.setState({ loans: updatedLoans })
  }
}

async function applyBankBalances() {
  try {
    const { data } = await supabase
      .from('app_state').select('state_v2').eq('id', 'main').maybeSingle()
    if (!data?.state_v2?.accounts) return
    const cloudAccounts = data.state_v2.accounts
    const current = useStore.getState()
    let anyChanged = false
    const updated = (current.accounts || []).map(a => {
      const cloudAcc = cloudAccounts.find(c => c.id === a.id)
      if (!cloudAcc?.lastScraped || a.balance === cloudAcc.balance) return a
      anyChanged = true
      return { ...a, balance: cloudAcc.balance, lastScraped: cloudAcc.lastScraped }
    })
    if (anyChanged) {
      useStore.setState({ accounts: updated })
      // שמירה מיידית — מונעת מה-doSave הבא לדרוס את יתרת הסקרייפר
      try { await saveState(useStore.getState()) } catch {}
    }
  } catch (e) {
    console.warn('[BankSync] failed:', e.message)
  }
}
