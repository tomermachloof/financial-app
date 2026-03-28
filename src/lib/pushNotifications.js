import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BHaIatsf1lQOSvF3iIghhP-rX24usvQFC8VmAs3JK8Lc2-n2Nn2JGWZeaPScJxfYiSBTVMG5oNDVWZcMLORMqCM'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
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

    const { error } = await supabase
      .from('app_state')
      .upsert({ id: 'push_subscription', state: subscription.toJSON(), updated_at: new Date().toISOString() })

    if (error) throw error
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await supabase.from('app_state').delete().eq('id', 'push_subscription')
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
