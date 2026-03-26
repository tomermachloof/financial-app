import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { loadState } from './lib/supabase'
import useStore from './store/useStore'

// Load state from Supabase before rendering
loadState().then(cloudState => {
  if (cloudState) {
    useStore.setState(cloudState)
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  )
}).catch(() => {
  // If Supabase fails, render with local state
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  )
})
