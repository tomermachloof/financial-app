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

export async function saveState(state) {
  const now = Date.now()
  // חותמים את ה-timestamp ב-store לפני השליחה — כך localStorage תמיד עדכני
  useStore.setState({ lastSaved: now })
  const serializable = Object.fromEntries(
    Object.entries({ ...state, lastSaved: now }).filter(([, v]) => typeof v !== 'function')
  )
  const { error } = await supabase
    .from('app_state')
    .upsert({ id: STATE_ID, state: serializable, updated_at: new Date().toISOString() })
  if (error) console.error('[Supabase saveState error]', error)
  else console.log('[Supabase saved] at', new Date().toLocaleTimeString())
}
