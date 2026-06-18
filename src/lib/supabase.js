import { createClient } from '@supabase/supabase-js'
import useStore, { patchCloudState } from '../store/useStore'
import useSaveStatus from './saveStatus'

// מפתח האחסון המקומי של zustand-persist (תואם ל-name ב-useStore)
const PERSIST_KEY = 'financial-app-v14'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)

const STATE_ID = 'main'

export async function loadState() {
  const { data, error } = await supabase
    .from('app_state')
    .select('state_v2, state')
    .eq('id', STATE_ID)
    .single()
  if (error || !data) { console.warn('[Supabase loadState failed]', error); return null }
  // קוראים מ-state_v2 בלבד. אם ריק (נדיר), fallback לעמודה הישנה רק לטעינה ראשונית.
  const loaded = data.state_v2 || data.state
  console.log('[Supabase loaded from state_v2] usdRate:', loaded?.usdRate, 'accounts ILS:', loaded?.accounts?.reduce((s,a)=>s+(a.balance||0),0))
  return loaded
}

export function subscribeToChanges(callback) {
  return supabase
    .channel('app_state_changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state', filter: `id=eq.${STATE_ID}` }, (payload) => {
      const cloudState = payload.new?.state
      if (cloudState) callback(cloudState)
    })
    .subscribe()
}

// ── Document Storage (via Worker) ─────────────────────────────────
const UPLOAD_URL = import.meta.env.VITE_ANALYZE_URL.replace('/analyze', '/upload')

export async function uploadDocument(file, loanId) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('loanId', loanId)
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: formData })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  const data = await res.json()
  return data.url
}

export async function deleteDocument(url) {
  // מחיקה לא קריטית — הקובץ יישאר באחסון
  if (!url || url.startsWith('data:')) return
}

// דגל שמירה — חוסם סנכרון נכנס בזמן שהשמירה בתהליך
export let isSaving = false

export async function saveState(state) {
  const setStatus = useSaveStatus.getState().setStatus
  setStatus('saving')

  const now = Date.now()
  // קוראים את המצב העדכני ביותר מהחנות, לא את הפרמטר הישן שנלכד ברגע הקריאה
  const freshState = useStore.getState()
  const serializable = Object.fromEntries(
    Object.entries({ ...freshState, lastSaved: now }).filter(([, v]) => typeof v !== 'function')
  )
  isSaving = true
  let retries = 3
  let lastError = null
  while (retries > 0) {
    // כותבים רק לעמודה החדשה state_v2. העמודה הישנה state נשארת נטושה ומופעים ישנים
    // שעדיין כותבים אליה לא יוכלו לדרוס שום נתונים שלנו.
    const { error } = await supabase
      .from('app_state')
      .update({ state_v2: serializable, updated_at: new Date().toISOString() })
      .eq('id', STATE_ID)
    if (!error) {
      useStore.setState({ lastSaved: now })
      console.log('[Supabase saved to state_v2] at', new Date().toLocaleTimeString(), '| loans:', (serializable.loans||[]).length)
      // גיבוי אוטומטי אחרי כל שמירה מוצלחת
      try { localStorage.setItem('financial_state_backup', JSON.stringify(serializable)); localStorage.setItem('financial_state_backup_ts', String(now)) } catch {}
      // גיבוי יומי לענן (לא חוסם את השמירה — כל כשל נבלע בשקט)
      saveDailySnapshot(serializable)
      isSaving = false
      setStatus('saved', 'נשמר')
      return
    }
    lastError = error
    retries--
    console.warn(`[Supabase save failed, ${retries} retries left]`, error)
    if (retries > 0) await new Promise(r => setTimeout(r, 2000))
  }
  isSaving = false
  console.error('[Supabase saveState FAILED after 3 attempts]', lastError)
  setStatus('failed', 'שמירה נכשלה')
}

// ── גיבוי יומי אוטומטי לענן ──────────────────────────────────────
// אחרי כל שמירה מוצלחת, שומר תמונת-מצב מלאה בשורה נפרדת לפי תאריך (snap_YYYY-MM-DD,
// לפי אזור-זמן Asia/Jerusalem). במהלך היום השורה מתעדכנת; בסוף היום היא "קופאת"
// כמצב הסופי של אותו יום — כך כל יום מ-90 הימים האחרונים ניתן לשחזור.
//
// בטיחות: לא נוגע בשורת main ובזרימת השמירה הקיימת — רק מוסיף שורה לצד.
// נכתב לשתי העמודות (state + state_v2) כי זו התבנית שכבר עובדת להכנסת שורות חדשות
// (כמו notification_log ב-worker). כל כשל נבלע בשקט ולא חוסם את השמירה הראשית.
async function saveDailySnapshot(serializable) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).reduce((a, p) => { a[p.type] = p.value; return a }, {})
    const snapId = `snap_${parts.year}-${parts.month}-${parts.day}`
    const { error } = await supabase
      .from('app_state')
      .upsert(
        { id: snapId, state: serializable, state_v2: serializable, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
    if (error) console.warn('[Snapshot] daily backup failed (non-critical):', error.message)
  } catch (e) {
    console.warn('[Snapshot] daily backup error (non-critical):', e?.message || e)
  }
}

// ── שחזור מתמונת-מצב ─────────────────────────────────────────────

// רשימת כל הגיבויים (יומיים + נקודות-לפני-שחזור), מהחדש לישן
export async function listSnapshots() {
  const { data, error } = await supabase
    .from('app_state')
    .select('id, updated_at')
    .like('id', 'snap_%')
    .order('updated_at', { ascending: false })
  if (error) { console.warn('[Snapshot] list failed:', error.message); return [] }
  return data || []
}

// טעינת המצב המלא של גיבוי בודד
export async function loadSnapshot(id) {
  const { data, error } = await supabase
    .from('app_state')
    .select('state_v2, state')
    .eq('id', id)
    .single()
  if (error || !data) { console.warn('[Snapshot] load failed:', error?.message); return null }
  return data.state_v2 || data.state
}

// שמירת המצב הנוכחי כנקודת-גיבוי בלתי-משתנה (לפני שחזור) — כדי שהשחזור יהיה הפיך
export async function saveRestorePoint() {
  try {
    const fresh = useStore.getState()
    const serializable = Object.fromEntries(Object.entries(fresh).filter(([, v]) => typeof v !== 'function'))
    const id = `snap_pre_${Date.now()}`
    const { error } = await supabase
      .from('app_state')
      .upsert({ id, state: serializable, state_v2: serializable, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) { console.warn('[Snapshot] restore-point failed:', error.message); return null }
    return id
  } catch (e) {
    console.warn('[Snapshot] restore-point error:', e?.message || e)
    return null
  }
}

// שחזור מלא לתמונת-מצב נבחרת.
// 1) מגבה את המצב הנוכחי (הפיך) → 2) טוען את הגיבוי → 3) כותב אותו כמצב הסמכותי
// גם לענן (main) וגם ל-localStorage, כדי שטעינה-מחדש תראה מצב אחיד ולא "תציל"
// פריטים חדשים בחזרה. הקורא אחראי לבצע reload אחרי הצלחה.
export async function restoreFromSnapshot(id) {
  await saveRestorePoint()
  const snap = await loadSnapshot(id)
  if (!snap) throw new Error('הגיבוי לא נמצא')
  // מעביר דרך אותו patch שמופעל בטעינה רגילה מהענן — שומר על אינווריאנטות
  const restored = patchCloudState(snap)
  restored.lastSaved = Date.now()
  // כתיבה לענן (main) — הסמכותי
  const { error } = await supabase
    .from('app_state')
    .update({ state_v2: restored, updated_at: new Date().toISOString() })
    .eq('id', STATE_ID)
  if (error) throw new Error('כתיבה לענן נכשלה: ' + error.message)
  // דריסת המצב המקומי כדי שמנגנון ה-merge בטעינה לא "יחזיר" פריטים חדשים
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (raw) { const p = JSON.parse(raw); p.state = restored; localStorage.setItem(PERSIST_KEY, JSON.stringify(p)) }
    localStorage.setItem('financial_state_backup', JSON.stringify(restored))
    localStorage.setItem('financial_state_backup_ts', String(restored.lastSaved))
  } catch {}
  return true
}
