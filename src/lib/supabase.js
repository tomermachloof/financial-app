import { createClient } from '@supabase/supabase-js'

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
  if (error || !data) return null
  return data.state
}

export async function saveState(state) {
  // Save only data fields, not functions
  const serializable = Object.fromEntries(
    Object.entries(state).filter(([, v]) => typeof v !== 'function')
  )
  await supabase
    .from('app_state')
    .upsert({ id: STATE_ID, state: serializable, updated_at: new Date().toISOString() })
}
