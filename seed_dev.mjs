// seed_dev.mjs — copies production Supabase state into dev Supabase.
// Direction: PROD (read-only) → DEV (write)
// NEVER runs in reverse. Writing to prod is blocked by explicit guard below.

const PROD_URL = 'https://hxoqpogcmwgeonljkypl.supabase.co'
const PROD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b3Fwb2djbXdnZW9ubGpreXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDg3NTIsImV4cCI6MjA5MDA4NDc1Mn0.Qj1bXu9cah3LFjpBO4ttaaBoyTkdiKnFNDUWv9so0g0'

const DEV_URL = 'https://okwanpvphtoqhmufxcyv.supabase.co'
const DEV_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rd2FucHZwaHRvcWhtdWZ4Y3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTkyMDcsImV4cCI6MjA5Mjc3NTIwN30.vn0RRgDbE6reb-3NS9Ft13upNuGZjDcWR00uFoAt8_0'

// ── Safety guard: target MUST be dev. Never write to prod. ──────────────────
if (DEV_URL === PROD_URL) {
  console.error('SAFETY ERROR: DEV_URL and PROD_URL are identical. Aborting.')
  process.exit(1)
}
if (!DEV_URL.includes('okwanpvphtoqhmufxcyv')) {
  console.error(`SAFETY ERROR: DEV_URL does not match the known dev project. Aborting.`)
  console.error(`DEV_URL: ${DEV_URL}`)
  process.exit(1)
}
console.log('Safety check passed — source: prod (read-only), target: dev (write)')

const prodHeaders = { 'apikey': PROD_KEY, 'Authorization': 'Bearer ' + PROD_KEY }
const devHeaders  = { 'apikey': DEV_KEY,  'Authorization': 'Bearer ' + DEV_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }

console.log('Reading from production (read-only)...')
const res = await fetch(`${PROD_URL}/rest/v1/app_state?id=eq.main&select=state_v2,updated_at`, { headers: prodHeaders })
const rows = await res.json()
if (!rows[0]) { console.error('No state in production'); process.exit(1) }
const { state_v2, updated_at } = rows[0]
console.log('Loans:', state_v2.loans?.length, '| Accounts:', state_v2.accounts?.length)

// Check if dev already has a row
const checkRes = await fetch(`${DEV_URL}/rest/v1/app_state?id=eq.main&select=id`, { headers: { 'apikey': DEV_KEY, 'Authorization': 'Bearer ' + DEV_KEY } })
const existing = await checkRes.json()

let saveRes
if (existing.length > 0) {
  console.log('Updating existing dev row...')
  saveRes = await fetch(`${DEV_URL}/rest/v1/app_state?id=eq.main`, {
    method: 'PATCH',
    headers: devHeaders,
    body: JSON.stringify({ state_v2, updated_at })
  })
} else {
  console.log('Inserting new dev row...')
  saveRes = await fetch(`${DEV_URL}/rest/v1/app_state`, {
    method: 'POST',
    headers: devHeaders,
    body: JSON.stringify({ id: 'main', state_v2, updated_at })
  })
}

if (!saveRes.ok) { console.error('Failed:', await saveRes.text()); process.exit(1) }
console.log('Done. Dev Supabase now mirrors production.')
