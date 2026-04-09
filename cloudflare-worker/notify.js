/**
 * Cloudflare Worker — Daily financial push notification
 * Runs every morning (cron: "0 5 * * *" = 8am Israel time)
 *
 * Secrets to set via `wrangler secret put`:
 *   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */

import webpush from 'web-push'

const APP_URL = 'https://tomermachloof.github.io/financial-app/'

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyNotification(env))
  },

  // For manual testing: GET https://your-worker.workers.dev/test
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/test') {
      await sendDailyNotification(env)
      return new Response('sent', { status: 200 })
    }
    return new Response('ok', { status: 200 })
  },
}

async function sendDailyNotification(env) {
  // ── 1. Read push subscription ────────────────────────────────
  const subRes = await fetchSupabase(env, 'app_state?id=eq.push_subscription&select=state')
  if (!subRes.ok || subRes.data.length === 0) {
    console.log('No push subscription found — skipping')
    return
  }
  const subscription = subRes.data[0].state

  // ── 2. Read app state ────────────────────────────────────────
  const stateRes = await fetchSupabase(env, 'app_state?id=eq.main&select=state')
  if (!stateRes.ok || stateRes.data.length === 0) {
    console.log('No app state found — skipping')
    return
  }
  const state = stateRes.data[0].state

  // ── 3. Calculate today's items ───────────────────────────────
  const now = new Date()
  // Israel is UTC+2/UTC+3 — add 2 hours to get approximate local time
  const ilTime = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const todayStr = ilTime.toISOString().split('T')[0]
  const todayDay = ilTime.getDate()
  const monthKey = `${ilTime.getFullYear()}-${String(ilTime.getMonth() + 1).padStart(2, '0')}`

  const items = []

  // Today's one-time reminders
  const { reminders = [] } = state
  for (const r of reminders) {
    if (r.type !== 'monthly' && r.date === todayStr && !r.done) {
      items.push({ label: r.text, type: 'reminder', today: true })
    }
  }

  // Today's monthly reminders
  for (const r of reminders) {
    if (r.type === 'monthly' && Number(r.dayOfMonth) === todayDay) {
      const doneThis = (r.doneMonths || []).includes(monthKey)
      if (!doneThis) items.push({ label: r.text, type: 'reminder', today: true })
    }
  }

  // Loan payments in next 7 days (excluding paidByFriend)
  const { loans = [] } = state
  for (const loan of loans) {
    if (!loan.chargeDay || !loan.monthlyPayment || loan.paidByFriend) continue
    const days = daysUntilDay(loan.chargeDay, ilTime)
    if (days >= 0 && days <= 7) {
      const prefix = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`
      items.push({ label: `${prefix}: תשלום ${loan.name} — ₪${Math.round(loan.monthlyPayment).toLocaleString('he')}`, type: 'loan', today: days === 0 })
    }
  }

  // Expense payments in next 7 days
  const { expenses = [] } = state
  for (const exp of expenses) {
    if (!exp.chargeDay || !exp.amount) continue
    const days = daysUntilDay(exp.chargeDay, ilTime)
    if (days >= 0 && days <= 7) {
      const prefix = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`
      const amtStr = exp.currency === 'USD' ? `$${exp.amount}` : `₪${Math.round(exp.amount).toLocaleString('he')}`
      items.push({ label: `${prefix}: ${exp.name} — ${amtStr}`, type: 'expense', today: days === 0 })
    }
  }

  // Future income arriving today
  const { futureIncome = [] } = state
  for (const fi of futureIncome) {
    if (fi.date === todayStr && !fi.confirmedDate) {
      items.push({ label: `הכנסה: ${fi.name} — ₪${Math.round(fi.amount).toLocaleString('he')}`, type: 'income', today: true })
    }
  }

  if (items.length === 0) {
    console.log('No items for today — skipping notification')
    return
  }

  // ── 4. Build notification text ───────────────────────────────
  const todayItems = items.filter(i => i.today)
  const upcomingItems = items.filter(i => !i.today)

  let body = ''
  const allLines = items.slice(0, 5).map(i => `• ${i.label}`)
  body = allLines.join('\n')
  if (items.length > 5) body += `\n• ועוד ${items.length - 5}...`

  const title = todayItems.length > 0
    ? `📅 היום יש לך ${todayItems.length} פריט${todayItems.length > 1 ? 'ים' : ''}`
    : `📅 השבוע הקרוב — ${upcomingItems.length} תשלומים`

  // ── 5. Send push ─────────────────────────────────────────────
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  )

  const payload = JSON.stringify({
    title,
    body,
    url: APP_URL + 'calendar',
  })

  await webpush.sendNotification(subscription, payload)
  console.log(`Push sent: "${title}"`)
}

// ── helpers ───────────────────────────────────────────────────

function daysUntilDay(dayOfMonth, now) {
  const target = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, 0, 0, 0)
  if (target < now) target.setMonth(target.getMonth() + 1)
  return Math.round((target - now) / (1000 * 60 * 60 * 24))
}

async function fetchSupabase(env, path) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  })
  const data = await res.json()
  return { ok: res.ok, data }
}
