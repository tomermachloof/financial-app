/**
 * Cloudflare Worker — Daily financial push notification
 * Runs every morning (cron: "0 4 * * *" + "0 5 * * *" — dispatches only at Israel 07:00)
 *
 * Secrets to set via `wrangler secret put`:
 *   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */

import { buildPushPayload } from '@block65/webcrypto-web-push'

const APP_URL = 'https://tomermachloof.github.io/financial-app/'

// Check whether the current UTC time corresponds to 07:00 in Asia/Jerusalem
function isIsraelSevenAM() {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false,
  }).format(new Date())
  return Number(hour) === 7
}

export default {
  async scheduled(event, env, ctx) {
    if (!isIsraelSevenAM()) {
      console.log('Not 07:00 Israel — skipping')
      return
    }
    ctx.waitUntil(sendDailyNotification(env))
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    // ── חישוב מרחק מהבית ──
    if (url.pathname === '/distance') {
      const dest = url.searchParams.get('destination')
      if (!dest) return new Response(JSON.stringify({ error: 'missing destination' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
      try {
        const result = await calcDistance(dest, env)
        return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    // ── ניתוח חוזה / מסמך עם Claude ──
    if (url.pathname === '/analyze' && request.method === 'POST') {
      try {
        const body = await request.json()
        const result = await analyzeDocument(body, env)
        return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    // ── בדיקת התראות (ידני) ──
    if (url.pathname === '/test') {
      try {
        await sendDailyNotification(env)
        return new Response('sent', { status: 200, headers: cors })
      } catch (err) {
        console.error('notify failed:', err && err.stack || err)
        return new Response('error: ' + (err && err.message || String(err)), { status: 500, headers: cors })
      }
    }

    // ── סטטוס התראות — בדיקה אם ההתראה של היום נשלחה ──
    if (url.pathname === '/status') {
      try {
        const logRes = await fetchSupabase(env, 'app_state?id=eq.notification_log&select=state')
        const log = logRes.ok && logRes.data.length > 0 ? logRes.data[0].state : null
        return new Response(JSON.stringify(log), { headers: { ...cors, 'Content-Type': 'application/json' } })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    return new Response('ok', { status: 200, headers: cors })
  },
}

// Strip rollover / monthly suffixes — matches src/pages/Dashboard.jsx cleanId
const cleanId = (s) => String(s || '').replace(/_ro$/, '').replace(/_m\d+$/, '')

// The Dashboard creates dates with `new Date(year, month, day)` in the browser's
// local Israel timezone, then calls `toISOString().split('T')[0]`. Midnight Israel
// = 21:00–22:00 UTC of the previous day, so every stored dateStr is **one calendar
// day earlier** than the intended day. All confirmedEvents records use this format,
// so the worker must replicate it exactly in order to match.
function dashDateStr(year, monthZeroIdx, day) {
  const d = new Date(Date.UTC(year, monthZeroIdx, day - 1))
  return d.toISOString().split('T')[0]
}

// Format amount as a display string
function fmtAmount(amount, currency) {
  const abs = Math.round(Math.abs(amount || 0))
  return currency === 'USD' ? `$${abs}` : `₪${abs.toLocaleString('he')}`
}

// Build a readable line for an event
function labelFor(e) {
  const amtStr = fmtAmount(e.amount, e.currency)
  if (e.type === 'loan')    return `💳 ${e.name} — ${amtStr}`
  if (e.type === 'expense') return `💸 ${e.name} — ${amtStr}`
  if (e.type === 'rental')  return `💰 ${e.name} — ${amtStr}`
  if (e.type === 'future') {
    const isPayment = (e.amount || 0) < 0
    return `${isPayment ? '💸' : '💰'} ${e.name} — ${amtStr}`
  }
  return `• ${e.name} — ${amtStr}`
}

// Mirror of src/utils/calculations.js → getUpcomingEvents (lookback only, today inclusive).
// Walks month by month from (today - daysBack) up to today, generating one event per
// recurring item per month (respecting loan startDate/durationMonths), plus one-time
// pending futureIncome items. Reminders are NOT included here — they are handled separately.
function getEvents(loans, expenses, rentalIncome, futureIncome, todayStr, daysBack) {
  const today     = new Date(todayStr + 'T00:00:00')
  const startFrom = new Date(today);      startFrom.setDate(startFrom.getDate() - daysBack)
  const limit     = new Date(today)       // today-inclusive, no forward lookup

  const events       = []
  const currentYear  = startFrom.getFullYear()
  const currentMonth = startFrom.getMonth() + 1  // 1-based

  const addRecurring = (items, isIncome) => {
    for (const item of items) {
      const chargeDay = item.chargeDay
      if (!chargeDay) continue
      const isLoan = item.monthlyPayment !== undefined
      const isUSD  = item.currency === 'USD'

      // Loan activity window — first payment + last payment
      let loanStartDate = null
      let loanEndDate   = null
      if (!isIncome && isLoan && item.startDate) {
        const start    = new Date(item.startDate)
        const firstPay = new Date(start.getFullYear(), start.getMonth() + 1, chargeDay)
        if ((firstPay - start) / 86400000 < 15) firstPay.setMonth(firstPay.getMonth() + 1)
        loanStartDate = firstPay
        if (item.durationMonths) {
          loanEndDate = new Date(firstPay.getFullYear(), firstPay.getMonth() + item.durationMonths - 1, chargeDay)
        }
      }

      let year  = currentYear
      let month = currentMonth - 1  // 0-based for Date constructor
      let iteration = 0
      while (iteration < 24) {
        const d = new Date(year, month, chargeDay)
        if (d > limit) break
        if (loanEndDate && d > loanEndDate) break
        if (loanStartDate && d < loanStartDate) {
          month++; if (month > 11) { month = 0; year++ }
          iteration++; continue
        }
        if (d >= startFrom) {
          const suffix = iteration === 0 ? '' : `_m${iteration}`
          const mKey   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

          // Base amount
          let amount = isLoan ? (item.monthlyPayment || 0) : (item.amount || 0)

          // paymentSchedule overrides everything (loan amortization table)
          const scheduled = (item.paymentSchedule || []).find(p => p.date && p.date.startsWith(mKey))
          if (scheduled) {
            amount = scheduled.amount
          } else if (item.monthlyAmounts && item.monthlyAmounts[mKey] != null) {
            amount = item.monthlyAmounts[mKey]
          }

          events.push({
            id:       item.id + suffix,
            name:     item.name,
            amount,
            currency: isUSD ? 'USD' : 'ILS',
            dateStr:  dashDateStr(d.getFullYear(), d.getMonth(), d.getDate()),
            type:     isIncome ? 'rental' : (isLoan ? 'loan' : 'expense'),
          })
        }
        month++
        if (month > 11) { month = 0; year++ }
        iteration++
      }
    }
  }

  addRecurring(loans,        false)
  addRecurring(expenses,     false)
  addRecurring(rentalIncome, true)

  // One-time future income / payments.
  // expectedDate is a "YYYY-MM-DD" string the user picked. The Dashboard reparses
  // it through `new Date(...); setHours(0,0,0,0); toISOString().split('T')[0]`,
  // which shifts it back by one day (same Israel TZ bug). Replicate that here.
  for (const f of futureIncome) {
    if (!f.expectedDate) continue
    if (f.status && f.status !== 'pending') continue
    const [fy, fm, fd] = f.expectedDate.split('-').map(Number)
    if (!fy || !fm || !fd) continue
    const realDate = new Date(fy, fm - 1, fd)
    if (realDate < startFrom || realDate > limit) continue
    events.push({
      id:       f.id,
      name:     f.name,
      amount:   f.amount || 0,
      currency: f.currency || 'ILS',
      dateStr:  dashDateStr(fy, fm - 1, fd),
      type:     'future',
    })
  }

  return events
}

async function sendDailyNotification(env) {
  // ── 1. Read push subscriptions (multi-device, with legacy fallback) ──
  let subscriptions = []

  // New storage — an array under id='push_subscriptions'
  const multiRes = await fetchSupabase(env, 'app_state?id=eq.push_subscriptions&select=state')
  if (multiRes.ok && multiRes.data.length > 0 && Array.isArray(multiRes.data[0].state)) {
    subscriptions = multiRes.data[0].state.filter(Boolean)
  }

  // Legacy storage — a single subscription under id='push_subscription'
  if (subscriptions.length === 0) {
    const legacyRes = await fetchSupabase(env, 'app_state?id=eq.push_subscription&select=state')
    if (legacyRes.ok && legacyRes.data.length > 0 && legacyRes.data[0].state) {
      subscriptions = [legacyRes.data[0].state]
    }
  }

  if (subscriptions.length === 0) {
    console.log('No push subscriptions found — skipping')
    return
  }

  // ── 2. Read app state ────────────────────────────────────────
  const stateRes = await fetchSupabase(env, 'app_state?id=eq.main&select=state')
  if (!stateRes.ok || stateRes.data.length === 0) {
    console.log('No app state found — skipping')
    return
  }
  const state = stateRes.data[0].state

  // ── 3. Set up Israel-local "today" ───────────────────────────
  const now = new Date()
  const ilParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc }, {})
  // Real Israel calendar date (used for Hebrew title and reminder matching).
  const realTodayStr = `${ilParts.year}-${ilParts.month}-${ilParts.day}`
  // Dashboard-format date (used to match confirmedEvents and rolled-over logic).
  const todayStr = dashDateStr(Number(ilParts.year), Number(ilParts.month) - 1, Number(ilParts.day))

  // ── 4. Pull everything we need ───────────────────────────────
  const {
    reminders       = [],
    loans           = [],
    expenses        = [],
    rentalIncome    = [],
    futureIncome    = [],
    confirmedEvents = [],
    dismissedEvents = [],
  } = state

  const isConfirmed = (id, dateStr) =>
    confirmedEvents.some(e => cleanId(e.id) === cleanId(id) && e.date === dateStr)
  const isDismissed = (id, dateStr) =>
    dismissedEvents.some(e => cleanId(e.id) === cleanId(id) && e.date === dateStr)

  // ── 5. Mirror the Dashboard logic exactly ───────────────────
  // Generate every event in the 31-day lookback window using the same
  // month-by-month walk calculations.js uses, then split into:
  //   - today's events (detailed list)
  //   - past events still waiting for confirmation (just a count)
  const allEvents = getEvents(loans, expenses, rentalIncome, futureIncome, todayStr, 31)

  const todayItems   = []
  let   overdueCount = 0

  for (const e of allEvents) {
    if (isConfirmed(e.id, e.dateStr) || isDismissed(e.id, e.dateStr)) continue
    if (e.dateStr === todayStr) {
      todayItems.push({ label: labelFor(e) })
    } else if (e.dateStr < todayStr) {
      overdueCount++
    }
  }

  // Reminders appear on the Dashboard only on their exact day — they do not
  // roll over, so we only add them to today's list. Reminders are matched
  // against the REAL Israel calendar date (user picked these days directly).
  const realThisMonthKey = realTodayStr.slice(0, 7)
  const realTodayDayOfMo = Number(ilParts.day)

  for (const r of reminders) {
    if (r.type === 'monthly') {
      if (Number(r.day) !== realTodayDayOfMo) continue
      if ((r.doneMonths || []).includes(realThisMonthKey)) continue
    } else {
      if (r.date !== realTodayStr) continue
      if (r.done) continue
    }
    todayItems.push({ label: `🔔 ${r.text}` })
  }

  // ── 6. Build notification text ───────────────────────────────
  // Always send, even when there is nothing. Top = today, bottom = overdue count.

  const hebDate = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'long',
  }).format(now)

  let title
  if (todayItems.length === 0) {
    title = `📅 ${hebDate} — אין אירועים היום`
  } else {
    title = `📅 ${hebDate} — ${todayItems.length} אירוע${todayItems.length > 1 ? 'ים' : ''} היום`
  }

  const maxTodayLines = 6
  const todayLines = todayItems.length === 0
    ? ['אין אירועים להיום']
    : todayItems.slice(0, maxTodayLines).map(i => `• ${i.label}`)
  if (todayItems.length > maxTodayLines) {
    todayLines.push(`• ועוד ${todayItems.length - maxTodayLines}...`)
  }

  const overdueLine = overdueCount === 0
    ? '✓ אין אירועים מהעבר שממתינים לאישור'
    : `⚠️ ${overdueCount} אירוע${overdueCount > 1 ? 'ים' : ''} מימים קודמים ממתינ${overdueCount > 1 ? 'ים' : ''} לאישור`

  const body = todayLines.join('\n') + '\n\n' + overdueLine

  // ── 7. Send push to every registered device (with retry) ────
  const vapid = {
    subject:    env.VAPID_SUBJECT,
    publicKey:  env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  }

  const message = {
    data: JSON.stringify({ title, body, url: APP_URL + 'calendar' }),
    options: { ttl: 60 * 60 * 4 }, // 4h TTL
  }

  const MAX_RETRIES = 3
  const keep = []
  let sent = 0
  let dead = 0
  const errors = []

  for (const sub of subscriptions) {
    if (!sub || !sub.endpoint) continue
    let success = false
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const payload = await buildPushPayload(message, sub, vapid)
        const res = await fetch(sub.endpoint, payload)
        if (res.ok) {
          keep.push(sub)
          sent++
          success = true
          break
        } else if (res.status === 404 || res.status === 410) {
          // Subscription gone — drop it permanently
          dead++
          success = true // not an error, just expired
          break
        } else {
          const text = await res.text().catch(() => '')
          if (attempt === MAX_RETRIES) {
            keep.push(sub)
            errors.push(`${res.status}: ${text.slice(0, 120)}`)
          }
          // Wait before retry
          await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          keep.push(sub)
          errors.push(err && err.message || String(err))
        }
        await new Promise(r => setTimeout(r, 1000 * attempt))
      }
    }
  }

  // Prune dead subscriptions from storage
  if (dead > 0) {
    await upsertSupabase(env, 'push_subscriptions', keep)
  }

  console.log(`Push dispatch: sent=${sent} dead=${dead} kept=${keep.length} errors=${errors.length}`)
  if (errors.length > 0) console.log('errors:', errors.join(' | '))

  // ── 8. Log result to Supabase ──────────────────────────────
  const logEntry = {
    date: realTodayStr,
    sent,
    dead,
    errors: errors.length,
    errorDetails: errors.length > 0 ? errors.join(' | ').slice(0, 500) : null,
    todayEvents: todayItems.length,
    overdueEvents: overdueCount,
  }
  await upsertSupabase(env, 'notification_log', logEntry)

  // ── 9. Fallback: send email if no push succeeded ──────────
  if (sent === 0 && env.RESEND_API_KEY) {
    console.log('No push succeeded — sending email fallback')
    await sendEmailFallback(env, title, body)
  }
}

// ── email fallback via Resend ─────────────────────────────────

async function sendEmailFallback(env, title, body) {
  try {
    const htmlBody = body.split('\n').map(line => line ? `<p style="margin:4px 0">${line}</p>` : '<br>').join('')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'tomermachluf@gmail.com',
        subject: title,
        html: `<div dir="rtl" style="font-family:sans-serif;font-size:16px">${htmlBody}</div>`,
      }),
    })
    if (res.ok) {
      console.log('Email fallback sent successfully')
    } else {
      const text = await res.text()
      console.error('Email fallback failed:', res.status, text)
    }
  } catch (err) {
    console.error('Email fallback error:', err.message)
  }
}

// ── helpers ───────────────────────────────────────────────────

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

async function upsertSupabase(env, id, state) {
  const url = `${env.SUPABASE_URL}/rest/v1/app_state?on_conflict=id`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id, state, updated_at: new Date().toISOString() }),
  })
  return res.ok
}

// ── חישוב מרחק מהבית ──────────────────────────────────────────
const HOME_ADDRESS = 'משה וילנסקי 55, תל אביב, ישראל'
const DISTANCE_THRESHOLD_KM = 20

async function calcDistance(destination, env) {
  const key = env.GOOGLE_MAPS_KEY
  if (!key) throw new Error('GOOGLE_MAPS_KEY not configured')

  const params = new URLSearchParams({
    origins: HOME_ADDRESS,
    destinations: destination + ', ישראל',
    key,
    language: 'he',
  })
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
  )
  const data = await res.json()

  if (data.status !== 'OK') throw new Error('Google API error: ' + data.status)
  const el = data.rows?.[0]?.elements?.[0]
  if (!el || el.status !== 'OK') throw new Error('No route found: ' + (el?.status || 'unknown'))

  const distanceKm = Math.round(el.distance.value / 1000)
  return {
    distanceKm,
    distanceText: el.distance.text,
    isAboveThreshold: distanceKm > DISTANCE_THRESHOLD_KM,
  }
}

// ── ניתוח מסמך עם Claude API ──────────────────────────────────

const PROMPTS = {
  loan: `אתה מנתח לוח סילוקין / חוזה הלוואה. החזר JSON בלבד (ללא טקסט נוסף) עם השדות הבאים:
{
  "name": "שם ההלוואה או הבנק",
  "totalAmount": 0,
  "monthlyPayment": 0,
  "chargeDay": 0,
  "durationMonths": 0,
  "interestRate": 0,
  "interestType": "fixed או prime",
  "startDate": "YYYY-MM-DD",
  "balanceOverride": null,
  "paymentSchedule": [{ "date": "YYYY-MM-DD", "amount": 0 }]
}
אם שדה לא נמצא — החזר null. paymentSchedule הוא מערך של כל התשלומים מהלוח.`,

  film: `אתה מנתח חוזה עבודה בתחום הקולנוע / טלוויזיה. החזר JSON בלבד (ללא טקסט נוסף) עם השדות הבאים:
{
  "name": "שם הפרויקט / הסדרה / הסרט",
  "amount": 0,
  "photoDayRate": 0,
  "rehearsalPct12": 15,
  "rehearsalPct3plus": 30,
  "overtimeTiers": [{ "fromHour": 11, "pct": 125 }, { "fromHour": 13, "pct": 150 }],
  "agentCommission": false,
  "addVat": false,
  "expectedDate": "YYYY-MM-DD או null",
  "notes": "פרטים נוספים מהחוזה"
}
הסבר:
- photoDayRate = תעריף ליום צילום
- rehearsalPct12 = אחוז מתעריף יום צילום לשעת חזרה/מדידה (שעות 1-2)
- rehearsalPct3plus = אחוז לשעה 3+
- overtimeTiers = מדרגות שעות נוספות: fromHour = מאיזו שעה, pct = אחוז מהבסיס
- agentCommission = true אם יש עמלת סוכן
- addVat = true אם מוזכר מע״מ
אם שדה לא נמצא — החזר null.`,

  theater: `אתה מנתח חוזה עבודה בתחום התיאטרון. החזר JSON בלבד (ללא טקסט נוסף) עם השדות הבאים:
{
  "name": "שם ההפקה / ההצגה",
  "amount": 0,
  "theaterShowPrice": 0,
  "theaterMonthlyRehearsal": 0,
  "theaterRehearsalTotal": 0,
  "theaterPostRehearsal": 0,
  "agentCommission": false,
  "addVat": false,
  "expectedDate": "YYYY-MM-DD או null",
  "notes": "פרטים נוספים מהחוזה"
}
הסבר:
- theaterShowPrice = מחיר להצגה בודדת
- theaterMonthlyRehearsal = סכום חודשי לתקופת חזרות (לפני עלייה)
- theaterRehearsalTotal = סכום כולל לכל תקופת החזרות (אם מוזכר)
- theaterPostRehearsal = מחיר חזרה בודדת (אחרי עלייה)
אם שדה לא נמצא — החזר null.`,

  commercial: `אתה מנתח חוזה עבודה מסחרי / קמפיין. החזר JSON בלבד (ללא טקסט נוסף) עם השדות הבאים:
{
  "name": "שם הפרויקט / הקמפיין",
  "amount": 0,
  "commercialClient": "שם הלקוח / המותג",
  "commercialPlatform": "instagram / tiktok / youtube / tv / other",
  "commercialShootDaysContract": 0,
  "agentCommission": false,
  "addVat": false,
  "expectedDate": "YYYY-MM-DD או null",
  "notes": "פרטים נוספים מהחוזה"
}
הסבר:
- commercialClient = שם החברה או המותג
- commercialPlatform = הפלטפורמה העיקרית (instagram, tiktok, youtube, tv, other)
- commercialShootDaysContract = כמות ימי צילום שנקבעו בחוזה
אם שדה לא נמצא — החזר null.`,
}

async function analyzeDocument({ base64, mediaType, type }, env) {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  if (!base64) throw new Error('missing base64 file data')

  const prompt = PROMPTS[type] || PROMPTS.loan

  // PDF → document type, images → image type
  const isPdf = mediaType === 'application/pdf'
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } }

  const content = [fileBlock, { type: 'text', text: prompt }]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Claude API ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('לא הצלחתי לחלץ נתונים מהמסמך')

  return JSON.parse(jsonMatch[0])
}
