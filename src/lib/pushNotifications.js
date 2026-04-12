import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BHaIatsf1lQOSvF3iIghhP-rX24usvQFC8VmAs3JK8Lc2-n2Nn2JGWZeaPScJxfYiSBTVMG5oNDVWZcMLORMqCM'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// ── Multi-device subscription storage ────────────────────────────────
// We keep an array of subscriptions under a single app_state row
// (id: 'push_subscriptions'). Each entry has a stable `key` derived from
// the browser endpoint so the same device replaces its own entry on
// re-subscribe rather than growing the list forever.

function endpointKey(sub) {
  try { return (sub.endpoint || '').slice(-64) } catch { return '' }
}

async function readSubscriptions() {
  const { data, error } = await supabase
    .from('app_state')
    .select('state')
    .eq('id', 'push_subscriptions')
    .maybeSingle()
  if (error || !data) return []
  const list = Array.isArray(data.state) ? data.state : []
  return list
}

async function writeSubscriptions(list) {
  const { error } = await supabase
    .from('app_state')
    .upsert({ id: 'push_subscriptions', state: list, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'הדפדפן לא תומך בהתראות' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, error: 'ההרשאה נדחתה' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const subJson = subscription.toJSON()
    const key     = endpointKey(subJson)
    const list    = await readSubscriptions()
    // Replace any previous entry from the same device, then add this one
    const next    = list.filter(s => endpointKey(s) !== key)
    next.push(subJson)
    await writeSubscriptions(next)

    // Backwards compatibility — also keep the old single-entry row in sync
    // so older worker versions keep working until the new worker is rolled out.
    try {
      await supabase
        .from('app_state')
        .upsert({ id: 'push_subscription', state: subJson, updated_at: new Date().toISOString() })
    } catch {}

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    const key = sub ? endpointKey(sub.toJSON()) : null
    if (sub) await sub.unsubscribe()

    if (key) {
      const list = await readSubscriptions()
      const next = list.filter(s => endpointKey(s) !== key)
      await writeSubscriptions(next)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function getPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'unsubscribed'
  } catch {
    return 'unsubscribed'
  }
}
