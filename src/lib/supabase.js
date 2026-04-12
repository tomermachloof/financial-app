import { createClient } from '@supabase/supabase-js'
import useStore from '../store/useStore'
import useSaveStatus from './saveStatus'

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
