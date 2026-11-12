import React, { Component, useEffect, useState, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginScreen } from './src/app/(frontend)/login/login-screen'
import { OperationsApp } from './src/app/(frontend)/app/operations-app'
import { readAuthSession, type AuthSession } from './src/lib/backend-client'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Institutional UI ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-[#f3f6f5] dark:bg-[#01191c] p-6 text-[#172326] dark:text-[#cbd5e1]">
          <div className="max-w-md w-full rounded-2xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] p-8 shadow-xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#faefec] dark:bg-[#2b100d] text-[#913b2c] dark:text-[#f08575] text-2xl font-bold">
              !
            </div>
            <h1 className="mt-4 text-lg font-bold text-[#003135] dark:text-[#e0f2fe]">
              Institutional Workspace Recovery
            </h1>
            <p className="mt-2 text-xs text-[#647376] dark:text-[#8ea5a3]">
              An unhandled rendering fault occurred. Your authenticated session and institutional data integrity remain secure.
            </p>
            {this.state.error && (
              <pre className="mt-3 max-h-24 overflow-y-auto rounded-lg bg-[#f7f9f9] dark:bg-[#031d21] p-2.5 text-left font-mono text-[10px] text-[#913b2c] dark:text-[#f08575] border border-[#e2eae9] dark:border-[#124349]">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto rounded-lg bg-[#08747c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065b61] transition"
              >
                Reload Application
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('gmritdu-auth-session')
                    sessionStorage.removeItem('gmritdu-auth-session')
                  } catch {
                    // ignore
                  }
                  window.location.reload()
                }}
                className="w-full sm:w-auto rounded-lg border border-[#dce4e3] dark:border-[#124349] px-4 py-2 text-xs font-semibold text-[#526164] dark:text-[#cbd5e1] hover:bg-[#f5f8f7] dark:hover:bg-[#07363d] transition"
              >
                Clear Cache & Relogin
              </button>
            </div>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

export function App() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // Theme initialization supporting both current and legacy storage keys
    const savedTheme =
      (localStorage.getItem('gmritdu-theme') as 'light' | 'dark') ||
      (localStorage.getItem('gmritdu_theme') as 'light' | 'dark') ||
      'light'
    setTheme(savedTheme)
    applyTheme(savedTheme)

    const handleThemeChange = () => {
      const updated =
        (localStorage.getItem('gmritdu-theme') as 'light' | 'dark') ||
        (localStorage.getItem('gmritdu_theme') as 'light' | 'dark') ||
        'light'
      setTheme(updated)
      applyTheme(updated)
    }

    const restore = () => {
      const current = readAuthSession()
      setSession(current)
    }

    restore()
    window.addEventListener('gmritdu:auth-change', restore)
    window.addEventListener('gmritdu:theme-change', handleThemeChange)

    return () => {
      window.removeEventListener('gmritdu:auth-change', restore)
      window.removeEventListener('gmritdu:theme-change', handleThemeChange)
    }
  }, [])

  function applyTheme(target: 'light' | 'dark') {
    if (target === 'dark') {
      document.documentElement.classList.add('dark')
      document.body.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.body.classList.remove('dark')
    }
  }

  if (session === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f6f5] dark:bg-[#01191c] text-[#172326] dark:text-[#cbd5e1]">
        <div className="text-center">
          <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-[#b9cac7] dark:border-[#0a4a50] border-t-[#08747c] dark:border-t-[#00e5ff]" />
          <p className="mt-4 text-xs font-bold text-[#003135] dark:text-[#e0f2fe]">GMRITDU Timetable Architecture</p>
          <p className="mt-1 text-[11px] text-[#647376] dark:text-[#94a3b8]">Loading institutional workspace…</p>
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <ErrorBoundary>
        <LoginScreen />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <OperationsApp user={session.user} />
    </ErrorBoundary>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  const root = createRoot(rootElement)
  root.render(<App />)
}
