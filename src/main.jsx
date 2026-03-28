import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadState } from './lib/supabase'
import useStore, { patchCloudState } from './store/useStore'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', direction: 'ltr' }}>
          <h2 style={{ color: 'red' }}>Runtime Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error)}{'\n'}{this.state.error?.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// Auto-reload when a new version is deployed
const checkVersion = async () => {
  try {
    const stored = localStorage.getItem('app_version')
    const res = await fetch('/version.txt?t=' + Date.now(), { cache: 'no-store' })
    const latest = (await res.text()).trim()
    if (!stored) { localStorage.setItem('app_version', latest); return }
    if (stored !== latest) { localStorage.setItem('app_version', latest); window.location.reload(true) }
  } catch {}
}
checkVersion()

const renderApp = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/financial-app">
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

// Load state from Supabase before rendering (5s timeout so a hang never blocks the app)
const timeout = new Promise(resolve => setTimeout(resolve, 5000))
Promise.race([loadState(), timeout]).then(cloudState => {
  if (cloudState) {
    const local      = useStore.getState()
    const localTime  = local.lastSaved  || 0
    const cloudTime  = cloudState.lastSaved || 0

    if (cloudTime > localTime) {
      // הענן חדש יותר — טוען ממנו (סנכרון בין מכשירים)
      const patched = patchCloudState(cloudState)

      // Merge reminders: keep any local reminder not yet synced to cloud
      const cloudRem  = patched.reminders || []
      const localRem  = local.reminders  || []
      const cloudIds  = new Set(cloudRem.map(r => r.id))
      patched.reminders = [...cloudRem, ...localRem.filter(r => !cloudIds.has(r.id))]

      // Same for dismissedEvents
      const cloudDis = patched.dismissedEvents || []
      const localDis = local.dismissedEvents  || []
      const cloudDisIds = new Set(cloudDis.map(d => d.id + '|' + d.date))
      patched.dismissedEvents = [...cloudDis, ...localDis.filter(d => !cloudDisIds.has(d.id + '|' + d.date))]

      useStore.setState(patched)
    } else {
      // המקומי חדש יותר או שווה — שומרים על המקומי, לא מחליפים
      // (ה-save ל-Supabase יקרה ב-useCloudSync ויסנכרן)
      console.log('[Sync] local is newer or equal — keeping local state')
    }
  }
  renderApp()
}).catch(() => {
  renderApp()
})
