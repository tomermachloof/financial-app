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

const renderApp = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/financial-app">
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

// Load state from Supabase before rendering
loadState().then(cloudState => {
  if (cloudState) {
    useStore.setState(patchCloudState(cloudState))
  }
  renderApp()
}).catch(() => {
  renderApp()
})
