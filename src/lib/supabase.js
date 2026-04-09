import { createClient } from '@supabase/supabase-js'
import useStore from '../store/useStore'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key)

const STATE_ID = 'main'

export async function loadState() {
  const { data, error } = await supabase
    .from('app_state')
    .select('state')
    .eq('id', STATE_ID)
    .single()
  if (error || !data) { console.warn('[Supabase loadState failed]', error); return null }
  console.log('[Supabase loaded] usdRate:', data.state?.usdRate, 'accounts ILS:', data.state?.accounts?.reduce((s,a)=>s+(a.balance||0),0))
  return data.state
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
  const now = Date.now()
  useStore.setState({ lastSaved: now })
  const serializable = Object.fromEntries(
    Object.entries({ ...state, lastSaved: now }).filter(([, v]) => typeof v !== 'function')
  )
  isSaving = true
  let retries = 3
  let lastError = null
  while (retries > 0) {
    const { error } = await supabase
      .from('app_state')
      .upsert({ id: STATE_ID, state: serializable, updated_at: new Date().toISOString() })
    if (!error) {
      console.log('[Supabase saved] at', new Date().toLocaleTimeString(), '| loans:', (serializable.loans||[]).length)
      // גיבוי אוטומטי אחרי כל שמירה מוצלחת
      try { localStorage.setItem('financial_state_backup', JSON.stringify(serializable)); localStorage.setItem('financial_state_backup_ts', String(now)) } catch {}
      isSaving = false
      return
    }
    lastError = error
    retries--
    console.warn(`[Supabase save failed, ${retries} retries left]`, error)
    if (retries > 0) await new Promise(r => setTimeout(r, 2000))
  }
  isSaving = false
  console.error('[Supabase saveState FAILED after 3 attempts]', lastError)
}
