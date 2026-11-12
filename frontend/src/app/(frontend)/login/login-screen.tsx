'use client'

import {
  ArrowRight,
  ChevronLeft,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  backendError,
  backendFetch,
  readAuthSession,
  saveAuthSession,
  type AuthSession,
} from '@/lib/backend-client'

function Mark() {
  return (
    <div
      className="flex h-9 w-9 items-end justify-center gap-0.5 rounded-lg bg-[#003135] dark:bg-[#04363a] px-1.5 py-2 shadow-sm"
      aria-hidden="true"
    >
      <span className="h-2.5 w-1 rounded-t-sm bg-white" />
      <span className="h-5 w-1 rounded-t-sm bg-white" />
      <span className="h-3.5 w-1 rounded-t-sm bg-[#67cbd1]" />
    </div>
  )
}

export function LoginScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState('')
  const [pnr, setPnr] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState<Array<{ department_id: string; name?: string }>>([])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    if (readAuthSession()) router.replace('/app')
    document.title = 'Sign In | GMRITDU Academic Platform'
    backendFetch('/api/v1/departments')
      .then((res) => res.json())
      .then((payload: any) => {
        const list = Array.isArray(payload?.data) ? payload.data : []
        setDepartments(list)
      })
      .catch(() => {})
    const saved = localStorage.getItem('gmritdu-theme')
    const dark =
      saved === 'dark' ||
      (!saved && document.documentElement.classList.contains('dark'))
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
    document.body.classList.toggle('dark', dark)
  }, [router])

  function toggleTheme() {
    const nextDark = !isDark
    setIsDark(nextDark)
    localStorage.setItem('gmritdu-theme', nextDark ? 'dark' : 'light')
    if (nextDark) {
      document.documentElement.classList.add('dark')
      document.body.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.body.classList.remove('dark')
    }
    window.dispatchEvent(new Event('gmritdu:theme-change'))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccessMessage('')
    if (mode === 'register') {
      if (!departmentId) {
        setError('Please select your academic department.')
        return
      }
      if (password !== confirmPassword) {
        setError('Password and confirmation password do not match.')
        return
      }
    }
    setLoading(true)
    try {
      const response = await backendFetch(
        `/api/v1/auth/${mode}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            mode === 'login'
              ? { identifier, password }
              : {
                  pnrno: pnr,
                  fullName: name,
                  email,
                  password,
                  confirmPassword,
                  mobileNumber,
                  role: 'STUDENT',
                  departmentId,
                },
          ),
          signal: AbortSignal.timeout(15_000),
        },
        { authenticated: false },
      )
      const body = (await response.json().catch(() => null)) as
        | (Partial<AuthSession> & { data?: Partial<AuthSession> })
        | null
      if (!response.ok) throw new Error(backendError(body, response.status))
      const result = body?.data ?? body
      if (
        !result ||
        typeof result.token !== 'string' ||
        !result.user ||
        typeof result.user.userId !== 'string'
      ) {
        if (mode === 'register') {
          setMode('login')
          setIdentifier(email || pnr)
          setConfirmPassword('')
          setSuccessMessage('Account registered successfully. Sign in with your new credentials.')
          return
        }
        throw new Error('Authentication response did not return a valid session.')
      }
      saveAuthSession(result as AuthSession)
      router.push('/app')
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f6f5] dark:bg-[#111c24] text-[#172326] dark:text-[#edf5f8] lg:grid lg:grid-cols-[minmax(380px,0.85fr)_minmax(560px,1.15fr)] transition-colors">
      <section className="relative hidden overflow-hidden bg-[#003135] dark:bg-gradient-to-br dark:from-[#0b4147] dark:via-[#10323c] dark:to-[#162835] p-12 text-white lg:flex lg:flex-col justify-between border-r border-[#084147] dark:border-[#2b6973]">
        {/* Architectural ambient geometric backdrop */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full border border-[#55d6dc]/15 bg-[#08747c]/15 blur-2xl ambient-float" />
        <div className="pointer-events-none absolute bottom-12 -left-20 h-64 w-64 rounded-full border border-[#55d6dc]/10 bg-[#0b5055]/20 blur-2xl ambient-float" style={{ animationDelay: '2.5s' }} />

        <div className="relative z-10 flex items-center gap-3 view-enter">
          <Mark />
          <div>
            <strong className="block text-sm font-bold tracking-[0.02em]">GMRITDU</strong>
            <span className="text-[11px] text-[#a7cbca]">Academic Operations Platform</span>
          </div>
        </div>

        <div className="relative z-10 max-w-xl view-card-enter">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#7ae0e5] border border-white/15">
            <ShieldCheck size={13} />
            Institutional Academic Portal
          </span>
          <h1 className="mt-5 text-[clamp(2.4rem,4.2vw,4.2rem)] leading-[1.02] font-bold tracking-[-0.04em] text-white">
            Centralized Academic Operations &amp; Timetables
          </h1>
          <p className="mt-6 text-sm leading-6 text-[#cce2e1]">
            Real-time theory schedules, continuous laboratory allocations, peer faculty substitutions,
            and live campus facility occupancy across all 8 semesters and 9 engineering departments.
          </p>

          <div className="mt-10 rounded-xl border border-white/15 bg-white/10 backdrop-blur-xs p-4 text-xs leading-relaxed text-[#dceeee] transition hover:bg-white/15">
            Authoritative class schedules, conflict protection, and laboratory governance run live
            across GMRITDU&apos;s unified institutional workspace.
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-[11px] text-[#9ebfb9]">
          <ShieldCheck size={16} className="text-[#7ae0e5]" />
          <span>Verified Institutional Session · Role-Based Governance</span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-4 pt-16 pb-8 sm:px-8 sm:py-10 lg:px-12">
        {/* In-Login Theme Switcher */}
        <div className="absolute top-4 right-4 z-20">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6dfde] dark:border-[#2e4656] bg-white dark:bg-[#182732] text-[#526164] dark:text-[#dfeaf0] hover:text-[#08747c] dark:hover:text-[#38e0d2] btn-interactive shadow-xs cursor-pointer"
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div key={mode} className="w-full max-w-md view-enter rounded-2xl border border-[#dce4e3] dark:border-[#2e4656] bg-white dark:bg-[#182732] p-5 sm:p-8 shadow-sm dark:shadow-[0_24px_54px_-22px_rgba(0,0,0,0.65)]">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Mark />
            <div>
              <strong className="block text-sm font-bold text-[#003135] dark:text-[#f4f9fb]">GMRITDU</strong>
              <span className="text-[11px] text-[#718083] dark:text-[#a6bcc9]">Academic Operations Platform</span>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-xs font-semibold text-[#08747c] dark:text-[#38e0d2] tracking-wide uppercase">
              {mode === 'login' ? 'Institutional Sign In' : 'Student Self-Registration'}
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#003135] dark:text-[#f4f9fb]">
              {mode === 'login' ? 'Sign In to Your Workspace' : 'Create Enrolled Student Account'}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-[#647376] dark:text-[#a6bcc9]">
              {mode === 'login'
                ? 'Use your university Staff ID, Student No, or institutional email.'
                : 'Self-registration is open to enrolled students. Faculty accounts are registered by an Admin or Department Coordinator.'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            {mode === 'register' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Student No"
                    icon={<GraduationCap size={16} />}
                    value={pnr}
                    onChange={setPnr}
                    placeholder="Official Student No / Roll No"
                  />
                  <Field
                    label="Full Name"
                    icon={<UserRound size={16} />}
                    value={name}
                    onChange={setName}
                    placeholder="Official Name"
                  />
                </div>
                <Field
                  label="Institutional Email"
                  icon={<GraduationCap size={16} />}
                  value={email}
                  onChange={setEmail}
                  placeholder="student@gmritdu.edu.in"
                  type="email"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Mobile Number"
                    icon={<Smartphone size={16} />}
                    value={mobileNumber}
                    onChange={setMobileNumber}
                    placeholder="10-digit number"
                    type="tel"
                  />
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[#526164] dark:text-[#d0e0ea]">Department</span>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      required
                      className="h-11 w-full rounded-lg border border-[#d6dfde] dark:border-[#395467] bg-[#f8faf9] dark:bg-[#101b23] text-xs text-[#172326] dark:text-white px-3 outline-none focus:border-[#08747c] dark:focus:border-[#38e0d2]"
                    >
                      <option value="" disabled className="dark:bg-[#182732]">
                        Select department...
                      </option>
                      {departments.map((d) => (
                        <option key={d.department_id} value={d.department_id} className="dark:bg-[#182732]">
                          {d.department_id}{d.name ? ` — ${d.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <Field
                label="Staff ID, Student No, or Email"
                icon={<GraduationCap size={16} />}
                value={identifier}
                onChange={setIdentifier}
                placeholder="Staff ID, Student No, or Email"
              />
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#526164] dark:text-[#d0e0ea]">Password</span>
              <span className="flex h-11 items-center gap-3 rounded-lg border border-[#d6dfde] dark:border-[#395467] bg-[#f8faf9] dark:bg-[#101b23] px-3 focus-within:border-[#08747c] dark:focus-within:border-[#38e0d2] focus-within:ring-2 focus-within:ring-[#08747c]/15 dark:focus-within:ring-[#38e0d2]/20">
                <LockKeyhole size={16} className="text-[#738285] dark:text-[#a6bcc9]" />
                <input
                  className="h-full w-full bg-transparent text-xs text-[#172326] dark:text-white outline-none placeholder:text-[#9aa6a8] dark:placeholder:text-[#8ea5b4]"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="grid h-8 w-8 place-items-center text-[#647376] dark:text-[#a6bcc9] hover:bg-[#edf2f1] dark:hover:bg-[#253b4a] rounded"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {mode === 'register' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526164] dark:text-[#d0e0ea]">Confirm Password</span>
                <span className="flex h-11 items-center gap-3 rounded-lg border border-[#d6dfde] dark:border-[#395467] bg-[#f8faf9] dark:bg-[#101b23] px-3 focus-within:border-[#08747c] dark:focus-within:border-[#38e0d2] focus-within:ring-2 focus-within:ring-[#08747c]/15 dark:focus-within:ring-[#38e0d2]/20">
                  <LockKeyhole size={16} className="text-[#738285] dark:text-[#a6bcc9]" />
                  <input
                    className="h-full w-full bg-transparent text-xs text-[#172326] dark:text-white outline-none placeholder:text-[#9aa6a8] dark:placeholder:text-[#8ea5b4]"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="grid h-8 w-8 place-items-center text-[#647376] dark:text-[#a6bcc9] hover:bg-[#edf2f1] dark:hover:bg-[#253b4a] rounded"
                    aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                <span className="mt-1.5 flex items-center justify-between text-[11px] text-[#738285] dark:text-[#a6bcc9]">
                  <span>Minimum 8 characters recommended</span>
                  {confirmPassword && (
                    <span className={password === confirmPassword ? 'text-[#08747c] dark:text-[#38e0d2] font-medium' : 'text-[#913b2c] dark:text-[#fca5a5] font-medium'}>
                      {password === confirmPassword ? 'Passwords match' : 'Mismatch'}
                    </span>
                  )}
                </span>
              </label>
            )}

            {successMessage && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/70 p-3 text-xs text-emerald-800 dark:text-emerald-200 font-medium view-enter"
              >
                {successMessage}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-[#e6c8c0] dark:border-red-700 bg-[#faefec] dark:bg-red-950/60 p-3 text-xs text-[#913b2c] dark:text-red-200 font-medium view-enter"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#024950] dark:bg-[#0d8d96] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] dark:hover:bg-[#13a4af] btn-interactive disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In to Account' : 'Register Account'}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between border-t border-[#dfe6e5] dark:border-[#2e4656] pt-4 text-xs">
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
                setSuccessMessage('')
                setConfirmPassword('')
              }}
              className="inline-flex items-center gap-1 font-semibold text-[#08747c] dark:text-[#38e0d2] hover:underline"
            >
              {mode === 'register' && <ChevronLeft size={14} />}
              {mode === 'login' ? 'New student registration' : 'Back to Sign In'}
            </button>
            <span className="text-[#829093] dark:text-[#a6bcc9] text-[11px]">Verified Campus Access</span>
          </div>
        </div>
      </section>
    </main>
  )
}

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  icon: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[#526164] dark:text-[#d0e0ea]">{label}</span>
      <span className="flex h-11 items-center gap-3 rounded-lg border border-[#d6dfde] dark:border-[#395467] bg-[#f8faf9] dark:bg-[#101b23] px-3 focus-within:border-[#08747c] dark:focus-within:border-[#38e0d2] focus-within:ring-2 focus-within:ring-[#08747c]/15 dark:focus-within:ring-[#38e0d2]/20">
        <span className="text-[#738285] dark:text-[#a6bcc9]">{icon}</span>
        <input
          className="h-full w-full bg-transparent text-xs text-[#172326] dark:text-white outline-none placeholder:text-[#9aa6a8] dark:placeholder:text-[#8ea5b4]"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
        />
      </span>
    </label>
  )
}
