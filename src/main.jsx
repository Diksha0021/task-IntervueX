import { Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

class RootErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#04070f',
            color: '#e2e8f8',
            padding: 32,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ color: '#ff5a6e', marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ marginBottom: 16, maxWidth: 560 }}>
            The app hit an error while loading. Try a hard refresh (Ctrl+Shift+R). If it
            persists, open the browser console (F12) and share the error message.
          </p>
          <pre
            style={{
              background: '#0a1020',
              padding: 16,
              borderRadius: 12,
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {this.state.error?.message ?? String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: '12px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg,#63dca9,#0f6e56)',
              color: '#04070f',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </RootErrorBoundary>,
)
