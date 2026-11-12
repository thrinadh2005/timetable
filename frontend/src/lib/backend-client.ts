'use client'

export type BackendRole =
  | 'SUPER_ADMIN'
  | 'DEAN'
  | 'DEPT_ADMIN'
  | 'COORDINATOR'
  | 'TEACHING_STAFF'
  | 'NON_TEACHING_STAFF'
  | 'STUDENT'

export type BackendUser = {
  userId: string
  pnr: string | null
  fullName: string
  email: string
  role: BackendRole
  departmentId: string | null
  sectionId: string | null
  /** School-wide governance scope for an executive DEAN (e.g. 'SOAC', 'SOAE'). */
  schoolId?: string | null
  status: string
}

export type AuthSession = {
  token: string
  user: BackendUser
}

const SESSION_KEY = 'gmritdu-auth-session'
const BACKEND_ROLES: BackendRole[] = [
  'SUPER_ADMIN',
  'DEAN',
  'DEPT_ADMIN',
  'COORDINATOR',
  'TEACHING_STAFF',
  'NON_TEACHING_STAFF',
  'STUDENT',
]

export function readAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<AuthSession>
    if (
      typeof parsed.token !== 'string' ||
      !parsed.token ||
      !parsed.user ||
      typeof parsed.user.userId !== 'string' ||
      !BACKEND_ROLES.includes(parsed.user.role as BackendRole)
    ) {
      return null
    }
    return parsed as AuthSession
  } catch {
    return null
  }
}

export function saveAuthSession(session: AuthSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event('gmritdu:auth-change'))
}

export function clearAuthSession() {
  window.sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event('gmritdu:auth-change'))
}

export async function backendFetch(
  input: string,
  init: RequestInit = {},
  options: { authenticated?: boolean } = { authenticated: true },
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (options.authenticated !== false) {
    const token = readAuthSession()?.token
    if (token) headers.set('authorization', `Bearer ${token}`)
  }
  const response = await fetch(input, {
    ...init,
    headers,
    cache: 'no-store',
  })
  if (options.authenticated !== false && response.status === 401) clearAuthSession()
  return response
}

export function backendError(body: unknown, status: number) {
  if (body && typeof body === 'object') {
    const value = body as { message?: unknown; error?: unknown }
    if (typeof value.message === 'string') return value.message
    if (typeof value.error === 'string') return value.error
  }
  return `Request failed with ${status}`
}
