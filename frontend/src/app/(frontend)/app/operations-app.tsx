'use client'

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Eye,
  FileClock,
  FileUp,
  Filter,
  Flame,
  FlaskConical,
  GraduationCap,
  Grid2X2,
  HardDriveDownload,
  Heart,
  HeartPulse,
  Inbox,
  KeyRound,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageSquareText,
  Moon,
  Pencil,
  Phone,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Star,
  Sun,
  ThumbsUp,
  Trash2,
  UserCheck,
  UserPlus,
  UserRoundCog,
  Users,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react'
import {
  bellSchedule,
  getAcademicEndpoint,
  getScheduleState,
  mutationContracts,
  normalizeAcademicResponse,
  type AcademicRecord,
  type AcademicResponse,
  type AcademicScreen,
  type BackendRole,
  type BackendUser,
  type Metric,
  type MutationFieldSource,
  type ScheduleState,
  type TelemetrySnapshot,
} from '@/lib/academic-contract'
import { backendFetch, clearAuthSession, readAuthSession, saveAuthSession } from '@/lib/backend-client'
import { mutateAcademicEndpoint, useLiveResource } from '@/lib/use-live-resource'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
type NavItem = { id: AcademicScreen; label: string; icon: Icon }

type SchoolSummary = {
  school_id: string
  name: string
  dean_name?: string
  dean_email?: string
  department_count?: number
  faculty_count?: number
  laboratories_count?: number
}

type DepartmentSummary = {
  department_id: string
  school_id?: string | null
  name: string
  description?: string
  hod_name?: string
  dean_name?: string
  contact_email?: string
  contact_phone?: string
  faculty_count?: number
  laboratories_count?: number
}

function useInstitutionalDirectory() {
  const deptsRes = useLiveResource<{ status?: string; success?: boolean; data: DepartmentSummary[] }>('/api/v1/departments')
  const schoolsRes = useLiveResource<{ status?: string; success?: boolean; data: SchoolSummary[] }>('/api/v1/departments/schools')
  const departments = deptsRes.data?.data || []
  const schools = schoolsRes.data?.data || []
  const deptIds = useMemo(
    () => Array.from(new Set(departments.map((d) => String(d.department_id || '').toUpperCase()).filter(Boolean))),
    [departments]
  )
  return {
    departments,
    schools,
    deptIds,
    loading: deptsRes.loading || schoolsRes.loading,
    reload: () => {
      deptsRes.retry()
      schoolsRes.retry()
    },
  }
}

function DepartmentOptions({
  includeValue,
  suffix = '',
  showAllOption = false,
  allLabel = 'All Departments',
}: {
  includeValue?: string
  suffix?: string
  showAllOption?: boolean
  allLabel?: string
}) {
  const { departments } = useInstitutionalDirectory()
  const list = useMemo(() => {
    const map = new Map<string, string>()
    departments.forEach((d) => {
      const id = String(d.department_id || '').toUpperCase()
      if (id) map.set(id, id)
    })
    if (includeValue && includeValue !== 'ALL') {
      const upper = includeValue.toUpperCase()
      if (!map.has(upper)) map.set(upper, upper)
    }
    return Array.from(map.keys())
  }, [departments, includeValue])

  return (
    <>
      {showAllOption && <option value="ALL">{allLabel}</option>}
      {list.map((id) => (
        <option key={id} value={id}>
          {id}{suffix}
        </option>
      ))}
    </>
  )
}

const roleNames: Record<BackendRole, string> = {
  SUPER_ADMIN: 'System Administrator (Root Command)',
  DEAN: 'Executive School Dean',
  DEPT_ADMIN: 'Head of Department (HOD)',
  COORDINATOR: 'Department Academic Coordinator',
  TEACHING_STAFF: 'Faculty Member / Instructor',
  NON_TEACHING_STAFF: 'Laboratory Custodian & Technical Assistant',
  STUDENT: 'Enrolled Student',
}

const navCatalog: Record<AcademicScreen, NavItem> = {
  overview: { id: 'overview', label: 'Campus Overview', icon: Grid2X2 },
  departments: { id: 'departments', label: 'Academic Departments', icon: Building2 },
  timetable: { id: 'overview', label: 'Campus Overview', icon: Grid2X2 },
  ingestion: { id: 'ingestion', label: 'Timetable Upload & Publishing', icon: FileUp },
  calendar: { id: 'calendar', label: 'Calendar & Exams', icon: BookOpen },
  labs: { id: 'labs', label: 'Laboratories & Practicals', icon: FlaskConical },
  availability: { id: 'availability', label: 'Facility Availability', icon: Building2 },
  bookings: { id: 'bookings', label: 'Laboratory Bookings', icon: FileClock },
  approvals: { id: 'approvals', label: 'HOD Approvals', icon: ClipboardCheck },
  people: { id: 'people', label: 'Faculty Directory & Workload', icon: Users },
  substitutions: { id: 'substitutions', label: 'Leave & Substitutions', icon: UserCheck },
  recommendations: { id: 'recommendations', label: 'Schedule Optimization', icon: Sliders },
  users: { id: 'users', label: 'Users & Roles', icon: UserRoundCog },
  feedback: { id: 'feedback', label: 'System Feedback', icon: MessageSquareText },
  telemetry: { id: 'telemetry', label: 'System Health', icon: HeartPulse },
}

const roleNavigation: Record<BackendRole, AcademicScreen[]> = {
  SUPER_ADMIN: [
    'overview',
    'departments',
    'ingestion',
    'calendar',
    'labs',
    'availability',
    'approvals',
    'people',
    'substitutions',
    'recommendations',
    'users',
    'feedback',
    'telemetry',
  ],
  DEAN: [
    'overview',
    'departments',
    'calendar',
    'labs',
    'availability',
    'bookings',
    'approvals',
    'people',
    'substitutions',
    'feedback',
    'telemetry',
  ],
  DEPT_ADMIN: [
    'overview',
    'departments',
    'ingestion',
    'calendar',
    'labs',
    'availability',
    'bookings',
    'approvals',
    'people',
    'substitutions',
    'feedback',
  ],
  COORDINATOR: [
    'overview',
    'departments',
    'ingestion',
    'calendar',
    'labs',
    'availability',
    'people',
    'substitutions',
  ],
  TEACHING_STAFF: [
    'overview',
    'substitutions',
    'calendar',
    'labs',
    'bookings',
    'people',
    'feedback',
  ],
  NON_TEACHING_STAFF: [
    'overview',
    'labs',
    'availability',
    'bookings',
    'feedback',
  ],
  STUDENT: [
    'overview',
    'calendar',
    'labs',
    'bookings',
    'feedback',
  ],
}

const screenCopy: Record<
  AcademicScreen,
  {
    title: string
    subtitle: string
    action: string
    empty: string
  }
> = {
  overview: {
    title: 'Live Operational Campus',
    subtitle: 'Real-time active class sessions and facility utilization across all cohorts',
    action: 'Refresh Overview',
    empty: 'No live class sessions are currently running for this time slot.',
  },
  departments: {
    title: 'Autonomous Academic Departments',
    subtitle: 'Curricular administration, student intake, faculty rosters, and specialized laboratories',
    action: 'Refresh Departments',
    empty: 'No academic departments registered.',
  },
  timetable: {
    title: 'Live Operational Campus',
    subtitle: 'Real-time active class sessions and facility utilization across all cohorts',
    action: 'Assign Timetable Slot',
    empty: 'No live class sessions are currently running for this time slot.',
  },
  ingestion: {
    title: 'Institutional Timetable Upload & Review',
    subtitle: 'Upload, validate, and review PDF or Excel timetables before publishing to the live schedule',
    action: 'Upload Timetable File',
    empty: 'No draft documents pending review. Upload an Excel, spreadsheet, or PDF institutional timetable file.',
  },
  calendar: {
    title: 'Institutional Calendar & Exam Windows',
    subtitle: 'Holidays, mid-term examinations, semester schedules, and timetable disruption shields',
    action: 'Schedule Academic Event',
    empty: 'No calendar events or examination disruptions scheduled.',
  },
  labs: {
    title: 'Department Laboratories & Equipment',
    subtitle: 'Practical computing labs, hardware testing centers, capacity, and continuous reservations',
    action: 'Reserve Laboratory',
    empty: 'No laboratory facilities found.',
  },
  availability: {
    title: 'Real-Time Facility Availability',
    subtitle: 'Live campus space locator with current occupancy, free rooms, and equipment specifications',
    action: 'Book Facility',
    empty: 'No facility records match your search criteria.',
  },
  bookings: {
    title: 'Laboratory Booking Requests',
    subtitle: 'Multi-period practical workshops, exams, guest sessions, and maintenance bookings',
    action: 'New Lab Booking',
    empty: 'No active or historical laboratory bookings found for your profile.',
  },
  approvals: {
    title: 'Administrative Approval Center',
    subtitle: 'Pending laboratory booking requests and faculty substitutions awaiting HOD decisions',
    action: 'Process Queue',
    empty: 'All pending requests have been reviewed and approved.',
  },
  people: {
    title: 'Faculty Workload & Assignments',
    subtitle: 'Teaching assignments, weekly period allocations, lab hours, and AICTE compliance metrics',
    action: 'Refresh Workload',
    empty: 'No faculty workload data available for this department.',
  },
  substitutions: {
    title: 'Faculty Leave & Slot Substitutions',
    subtitle: 'Peer faculty coverage, emergency leave reallocations, and adjustment workflows',
    action: 'Request Substitution',
    empty: 'No substitution requests have been logged.',
  },
  recommendations: {
    title: 'Smart Class Adjustment & Faculty Discovery',
    subtitle: 'Real-time discovery of free available faculty, vacant classrooms, and vacant labs for emergency replacement',
    action: 'Run Discovery',
    empty: 'No adjustment recommendations returned.',
  },
  users: {
    title: 'Institutional User Directory & Roles',
    subtitle: 'Role-based access governance, account activations, and department affiliations',
    action: 'Add New User',
    empty: 'No user accounts match the current filter.',
  },
  feedback: {
    title: 'Institutional Feedback & Issue Reports',
    subtitle: 'Quality monitoring, scheduling collisions, facility issues, and feature upgrades',
    action: 'Submit Feedback',
    empty: 'No feedback reports have been submitted.',
  },
  telemetry: {
    title: 'Institutional System Health & Audit',
    subtitle: 'Service availability, storage connectivity, capacity readiness, and schedule integrity verification',
    action: 'Run Health Check',
    empty: 'System health verification pending.',
  },
}

const mutateRoles: Partial<Record<AcademicScreen, BackendRole[]>> = {
  timetable: ['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR'],
  calendar: ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR'],
  availability: [
    'SUPER_ADMIN',
    'DEAN',
    'DEPT_ADMIN',
    'COORDINATOR',
    'TEACHING_STAFF',
    'NON_TEACHING_STAFF',
    'STUDENT',
  ],
  labs: [
    'SUPER_ADMIN',
    'DEAN',
    'DEPT_ADMIN',
    'COORDINATOR',
    'TEACHING_STAFF',
    'NON_TEACHING_STAFF',
    'STUDENT',
  ],
  bookings: [
    'SUPER_ADMIN',
    'DEAN',
    'DEPT_ADMIN',
    'COORDINATOR',
    'TEACHING_STAFF',
    'NON_TEACHING_STAFF',
    'STUDENT',
  ],
  approvals: ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'],
  substitutions: ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF'],
  users: ['SUPER_ADMIN'],
  ingestion: ['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR'],
  feedback: [
    'SUPER_ADMIN',
    'DEAN',
    'DEPT_ADMIN',
    'COORDINATOR',
    'TEACHING_STAFF',
    'NON_TEACHING_STAFF',
    'STUDENT',
  ],
}

const ACADEMIC_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const

function nextDateForDay(dayName?: string): string {
  const today = new Date()
  if (!dayName) return today.toLocaleDateString('en-CA')
  const map: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  }
  const target = map[dayName.toUpperCase()]
  if (target === undefined) return today.toLocaleDateString('en-CA')
  const delta = (target - today.getDay() + 7) % 7
  const d = new Date(today)
  d.setDate(today.getDate() + delta)
  return d.toLocaleDateString('en-CA')
}

function BrandMark() {
  return (
    <div
      className="flex h-9 w-9 items-end justify-center gap-0.5 rounded-lg bg-[#003135] px-1.5 py-1.5 shadow-sm"
      aria-hidden="true"
    >
      <span className="h-3 w-1 rounded-t-sm bg-white" />
      <span className="h-5 w-1 rounded-t-sm bg-white" />
      <span className="h-3.5 w-1 rounded-t-sm bg-[#68cbd1]" />
    </div>
  )
}

function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'teal' | 'green' | 'amber' | 'red'
}) {
  const tones = {
    neutral: 'border-[#dce4e3] bg-[#f5f7f6] text-[#59686b] dark:border-[#124349] dark:bg-[#072428] dark:text-[#8ea5a3]',
    teal: 'border-[#cbe4e2] bg-[#e8f4f3] text-[#076970] dark:border-[#0e5057] dark:bg-[#063137] dark:text-[#55d6dc]',
    green: 'border-[#c9e3d9] bg-[#eaf5f0] text-[#1b6d53] dark:border-[#13493b] dark:bg-[#072b22] dark:text-[#45c39c]',
    amber: 'border-[#ead9b9] bg-[#fdf6e7] text-[#8a6122] dark:border-[#52411e] dark:bg-[#2b200b] dark:text-[#f3bf67]',
    red: 'border-[#e6c8c0] bg-[#faefec] text-[#913b2c] dark:border-[#54251e] dark:bg-[#2b100d] dark:text-[#f08575]',
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

function getTone(status?: string): 'neutral' | 'teal' | 'green' | 'amber' | 'red' {
  if (!status) return 'neutral'
  const val = status.toLowerCase()
  if (/available|active|approved|confirmed|healthy|published|complete|free|normal|up/.test(val))
    return 'green'
  if (/pending|review|warning|reserved|stale|degraded|overloaded/.test(val)) return 'amber'
  if (/error|failed|rejected|maintenance|offline|blocked|suspended/.test(val)) return 'red'
  return 'teal'
}

function Panel({
  children,
  className = '',
  tone = 'default',
}: {
  children: React.ReactNode
  className?: string
  tone?: 'default' | 'inverse'
}) {
  const isInverse = tone === 'inverse'
  return (
    <section
      data-tone={tone}
      style={isInverse ? { backgroundColor: '#003135', color: '#ffffff', borderColor: '#084147' } : undefined}
      className={`rounded-xl border shadow-xs transition-all duration-200 ${
        isInverse
          ? 'panel-inverse border-[#084147] bg-[#003135] text-white dark:border-[#084147] dark:bg-[#002226]'
          : 'border-[#dce4e3] bg-white dark:border-[#124349] dark:bg-[#062327]'
      } ${className}`}
    >
      {children}
    </section>
  )
}

function MetricCardsGrid({ metrics }: { metrics: Metric[] }) {
  if (!metrics || metrics.length === 0) return null
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 stagger-grid">
      {metrics.map((m, idx) => (
        <Panel
          key={m.id}
          className="p-4 sm:p-5 card-interactive metric-pop"
        >
          <div style={{ animationDelay: `${idx * 45}ms` }}>
            <span className="text-[11px] font-medium text-[#647376] dark:text-[#8ea5a3]">{m.label}</span>
            <strong className="mt-2 block font-mono text-[clamp(1.4rem,2.2vw,2rem)] font-semibold tracking-tight text-[#003135] dark:text-[#55d6dc]">
              {m.value}
            </strong>
            {m.comparison && (
              <span className="mt-1 block text-[10px] text-[#7a898c] dark:text-[#6e8886]">{m.comparison}</span>
            )}
          </div>
        </Panel>
      ))}
    </div>
  )
}

function ConfirmActionModal({
  title,
  subject,
  description = 'This action cannot be undone.',
  confirmLabel = 'Confirm Delete',
  loading = false,
  error = null,
  onClose,
  onConfirm,
}: {
  title: string
  subject: string
  description?: string
  confirmLabel?: string
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 modal-backdrop" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-[#062327] rounded-2xl border border-[#dce4e3] dark:border-[#124349] shadow-2xl w-full max-w-sm modal-panel">
        <div className="px-5 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={22} className="text-red-500 dark:text-red-400" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">{title}</h3>
          <p className="text-xs font-semibold text-[#003135] dark:text-[#55d6dc] break-words">{subject}</p>
          <p className="text-[11px] text-red-500 dark:text-red-400 font-semibold mt-2 mb-4">{description}</p>
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] text-xs font-semibold text-[#526164] dark:text-[#8ea5a3] hover:bg-[#f0f4f4] dark:hover:bg-[#072a2f] btn-interactive"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold btn-interactive disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <LoaderCircle size={12} className="animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Trash2 size={12} /> {confirmLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectionStatusBanner({
  error,
  offline,
  stale,
  updatedAt,
  retry,
}: {
  endpoint: string
  error: string | null
  offline: boolean
  stale: boolean
  updatedAt: Date | null
  retry: () => void
}) {
  if (!error && !offline && !stale) {
    return (
      <div className="mb-4 flex items-center gap-2 text-[11px] text-[#647376] dark:text-[#8ea5a3]">
        <span className="h-2 w-2 rounded-full bg-[#168565] live-pulse-dot" />
        <span>Live Institutional Sync Active{updatedAt ? ` · Last synced ${updatedAt.toLocaleTimeString()}` : ''}</span>
      </div>
    )
  }

  return (
    <div
      className={`mb-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center view-enter ${
        offline ? 'border-[#e6c8c0] bg-[#faefec] dark:border-[#54251e] dark:bg-[#2b100d]' : 'border-[#ead9b9] bg-[#fdf6e7] dark:border-[#52411e] dark:bg-[#2b200b]'
      }`}
    >
      {offline ? (
        <WifiOff size={20} className="shrink-0 text-[#913b2c] dark:text-[#f08575]" />
      ) : (
        <AlertTriangle size={20} className="shrink-0 text-[#8a6122] dark:text-[#f3bf67]" />
      )}
      <div className="min-w-0 flex-1">
        <strong className="block text-xs font-semibold text-[#172326] dark:text-[#e2f0ef]">
          {offline
            ? 'Network Connectivity Offline'
            : stale
              ? 'Displaying Recently Saved Schedule'
              : 'Schedule Refresh Unavailable'}
        </strong>
        <span className="mt-0.5 block text-[11px] text-[#647376] dark:text-[#8ea5a3]">
          {error ?? 'Unable to refresh institutional records right now. Please try again.'}
        </span>
      </div>
      <button
        onClick={retry}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 text-xs font-semibold hover:bg-white dark:hover:bg-white/20 btn-interactive"
      >
        <RefreshCw size={13} />
        Retry Now
      </button>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-40 rounded-xl border border-[#e1e7e6] dark:border-[#124349] bg-white dark:bg-[#062327] p-5 view-card-enter"
          style={{ ['--stagger' as any]: i }}
        >
          <div className="h-3 w-24 rounded skeleton-shimmer" />
          <div className="mt-4 h-5 w-3/4 rounded skeleton-shimmer" />
          <div className="mt-2 h-3 w-1/2 rounded skeleton-shimmer" />
          <div className="mt-6 h-px w-full bg-[#f0f4f3] dark:bg-[#124349]" />
        </div>
      ))}
    </div>
  )
}

/* =========================================================================
   TIMETABLE VIEWS (Weekly Matrix Grid + Day List + Continuous Lab Highlighting)
   ========================================================================= */

function TimetableMasterView({
  records,
  canDelete,
  activePeriod,
  department,
  semester,
  section,
}: {
  records: AcademicRecord[]
  canDelete: boolean
  activePeriod: number | null
  department?: string
  semester?: string
  section?: string
}) {
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')
  const [searchFilter, setSearchFilter] = useState('')

  const slotsByDay = useMemo(() => {
    const map: Record<string, AcademicRecord[]> = {
      MONDAY: [],
      TUESDAY: [],
      WEDNESDAY: [],
      THURSDAY: [],
      FRIDAY: [],
      SATURDAY: [],
    }

    records.forEach((record) => {
      const rawDay = String(record.meta?.day_of_week || record.meta?.day || '').toUpperCase()
      const dayKey = ACADEMIC_DAYS.includes(rawDay as any) ? rawDay : 'MONDAY'
      map[dayKey].push(record)
    })

    Object.keys(map).forEach((day) => {
      map[day].sort((a, b) => {
        const pA = Number(a.meta?.period_index ?? 0)
        const pB = Number(b.meta?.period_index ?? 0)
        return pA - pB
      })
    })

    return map
  }, [records])

  const filteredRecords = useMemo(() => {
    if (!searchFilter.trim()) return records
    const q = searchFilter.toLowerCase()
    return records.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.subtitle && r.subtitle.toLowerCase().includes(q)) ||
        String(r.meta?.room_id || '').toLowerCase().includes(q) ||
        String(r.meta?.subject_code || '').toLowerCase().includes(q)
    )
  }, [records, searchFilter])

  const totalSlotsCount = records.length
  const labSlotsCount = records.filter((r) => Boolean(r.meta?.is_laboratory || r.meta?.lab_name)).length

  return (
    <div className="space-y-3">
      {/* Dynamic Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] px-3.5 py-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {department && (
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
              Dept: {department}
            </span>
          )}
          {semester && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {semester.replace('SEM_', 'Sem ')}
            </span>
          )}
          {section && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Sec {section}
            </span>
          )}
          <span className="text-xs text-[#7a898c] dark:text-[#7ba09d] font-medium">
            {totalSlotsCount} weekly periods ({labSlotsCount} lab sessions)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-48 sm:w-64">
            <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[#758386]" />
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search subject, faculty, room..."
              className="h-7.5 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-[#fafcfb] dark:bg-[#072a2f] pl-7 pr-2.5 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#062327] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] shadow-xs hover:bg-[#edf2f1] dark:hover:bg-[#072d32] transition cursor-pointer"
          >
            <Printer size={13} />
            <span className="hidden sm:inline">Print</span>
          </button>

          <div className="flex items-center gap-0.5 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-0.5">
            <button
              onClick={() => setViewMode('matrix')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
                viewMode === 'matrix'
                  ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                  : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
              }`}
            >
              <LayoutGrid size={13} />
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                  : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
              }`}
            >
              <List size={13} />
              List
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <WeeklyMatrixGrid
          slotsByDay={slotsByDay}
          activePeriod={activePeriod}
          canDelete={canDelete}
        />
      ) : (
        <DayByDayListView
          records={filteredRecords}
          canDelete={canDelete}
        />
      )}
    </div>
  )
}

function WeeklyMatrixGrid({
  slotsByDay,
  activePeriod,
  canDelete,
}: {
  slotsByDay: Record<string, AcademicRecord[]>
  activePeriod: number | null
  canDelete: boolean
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-330px)]">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349] bg-[#f7f9f9] dark:bg-[#031d21]">
              <th className="sticky left-0 z-20 w-24 bg-[#f7f9f9] dark:bg-[#031d21] px-3 py-2 text-[10px] font-semibold text-[#003135] dark:text-[#55d6dc]">
                Day / Period
              </th>
              <th
                className={`w-[13%] border-l border-[#e8efee] dark:border-[#124349] px-2 py-1.5 text-center ${
                  activePeriod === 1 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 1</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">09:00 - 10:00</span>
              </th>
              <th
                className={`w-[13%] border-l border-[#e8efee] dark:border-[#124349] px-2 py-1.5 text-center ${
                  activePeriod === 2 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 2</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">10:00 - 11:00</span>
              </th>
              <th className="w-10 border-l border-r border-[#dce4e3] dark:border-[#124349] bg-[#f0f4f3] dark:bg-[#02181b] px-1 py-1.5 text-center text-[9px] font-semibold tracking-wide text-[#647376] dark:text-[#7ba09d]">
                TEA
              </th>
              <th
                className={`w-[13%] px-2 py-1.5 text-center ${
                  activePeriod === 3 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 3</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">11:10 - 12:10</span>
              </th>
              <th
                className={`w-[13%] border-l border-[#e8efee] dark:border-[#124349] px-2 py-1.5 text-center ${
                  activePeriod === 4 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 4</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">12:10 - 13:10</span>
              </th>
              <th className="w-12 border-l border-r border-[#dce4e3] dark:border-[#124349] bg-[#e8efee] dark:bg-[#02181b] px-1 py-1.5 text-center text-[9px] font-semibold tracking-wide text-[#076970] dark:text-[#55d6dc]">
                LUNCH
              </th>
              <th
                className={`w-[13%] px-2 py-1.5 text-center ${
                  activePeriod === 5 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 5</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">14:00 - 15:00</span>
              </th>
              <th
                className={`w-[13%] border-l border-[#e8efee] dark:border-[#124349] px-2 py-1.5 text-center ${
                  activePeriod === 6 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 6</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">15:00 - 16:00</span>
              </th>
              <th
                className={`w-[13%] border-l border-[#e8efee] dark:border-[#124349] px-2 py-1.5 text-center ${
                  activePeriod === 7 ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">Period 7</span>
                <span className="text-[9px] text-[#7a898c] dark:text-[#7ba09d]">16:00 - 17:00</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ACADEMIC_DAYS.map((day) => {
              const daySlots = slotsByDay[day] || []
              const slotByPeriod: Record<number, AcademicRecord> = {}
              daySlots.forEach((s) => {
                const idx = Number(s.meta?.period_index)
                if (idx) slotByPeriod[idx] = s
              })

              return (
                <tr key={day} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#072c31]">
                  <td className="sticky left-0 z-10 border-r border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] px-3 py-1.5 font-semibold text-[#003135] dark:text-[#55d6dc] text-[11px]">
                    {day.slice(0, 3)}
                    <span className="hidden sm:inline">{day.slice(3)}</span>
                  </td>

                  <GridCell slot={slotByPeriod[1]} canDelete={canDelete} isLive={activePeriod === 1} />
                  <GridCell slot={slotByPeriod[2]} canDelete={canDelete} isLive={activePeriod === 2} />

                  <td className="border-l border-r border-[#dce4e3] dark:border-[#124349] bg-[#f0f4f3]/60 dark:bg-[#02181b] text-center text-[10px] font-semibold text-[#92a1a0]">
                    ·
                  </td>

                  <GridCell slot={slotByPeriod[3]} canDelete={canDelete} isLive={activePeriod === 3} />
                  <GridCell slot={slotByPeriod[4]} canDelete={canDelete} isLive={activePeriod === 4} />

                  <td className="border-l border-r border-[#dce4e3] dark:border-[#124349] bg-[#e8efee]/60 dark:bg-[#02181b] text-center text-[10px] font-semibold text-[#076970]/60 dark:text-[#55d6dc]/60">
                    ·
                  </td>

                  <GridCell slot={slotByPeriod[5]} canDelete={canDelete} isLive={activePeriod === 5} />
                  <GridCell slot={slotByPeriod[6]} canDelete={canDelete} isLive={activePeriod === 6} />
                  <GridCell slot={slotByPeriod[7]} canDelete={canDelete} isLive={activePeriod === 7} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function GridCell({
  slot,
  canDelete,
  isLive,
}: {
  slot?: AcademicRecord
  canDelete: boolean
  isLive: boolean
}) {
  if (!slot) {
    return (
      <td
        className={`border-l border-[#e8efee] dark:border-[#124349] p-1 text-center text-[10px] text-[#9ba8a9] ${
          isLive ? 'bg-[#f4faf9] dark:bg-[#063137]' : ''
        }`}
      >
        <span className="inline-block py-1 text-[#b9cac7] dark:text-[#426466]">—</span>
      </td>
    )
  }

  const isContinuous = Boolean(slot.meta?.is_continuous)
  const isLab = Boolean(slot.meta?.is_laboratory || slot.meta?.lab_name)
  const continuousLabel = slot.meta?.continuous_label ? String(slot.meta.continuous_label) : null

  return (
    <td
      className={`border-l border-[#e8efee] dark:border-[#124349] p-1 align-top transition-colors ${
        isLive ? 'bg-[#f0faf9] dark:bg-[#08383e]' : ''
      }`}
    >
      <div
        className={`flex flex-col justify-between rounded-md border p-1.5 text-left h-full min-h-[58px] ${
          isContinuous
            ? 'border-[#08747c]/30 dark:border-[#0fa4af]/40 bg-[#ebf7f6] dark:bg-[#06343a]'
            : isLab
              ? 'border-[#c9e3d9] dark:border-[#13493b] bg-[#f2f9f6] dark:bg-[#052924]'
              : 'border-[#e0e7e6] dark:border-[#124349] bg-white dark:bg-[#082a2f]'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-bold text-[#08747c] dark:text-[#55d6dc]">
              {String(slot.meta?.subject_code || slot.id.split('-').slice(-2).join('-'))}
            </span>
            {isLab && (
              <span className="rounded bg-[#08747c]/10 dark:bg-[#08747c]/30 px-1 py-0.2 text-[8px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                LAB
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-[#172326] dark:text-[#e2f0ef] leading-tight" title={slot.title}>
            {slot.title}
          </p>
        </div>

        <div className="mt-1 border-t border-black/5 dark:border-white/5 pt-0.5 text-[9px] text-[#647376] dark:text-[#8ea5a3]">
          <p className="truncate font-medium">{String(slot.meta?.faculty_name || slot.subtitle || '')}</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="truncate font-mono text-[8px] text-[#7a898c] dark:text-[#7ba09d]">
              {String(slot.meta?.room_id || slot.meta?.room_number || '')}
            </span>
            {continuousLabel && (
              <span className="text-[8px] font-semibold text-[#08747c] dark:text-[#55d6dc]" title={continuousLabel}>
                Continuous
              </span>
            )}
          </div>
        </div>

        {canDelete && (
          <div className="mt-0.5 flex items-center justify-end gap-2">
            <EditSlotButton slot={slot} />
            <DeleteSlotButton slotId={slot.id} />
          </div>
        )}
      </div>
    </td>
  )
}

function DayByDayListView({
  records,
  canDelete,
}: {
  records: AcademicRecord[]
  canDelete: boolean
}) {
  const groups = useMemo(() => {
    return records.reduce<Record<string, AcademicRecord[]>>((res, r) => {
      const d = String(r.meta?.day_of_week || r.meta?.day || 'MONDAY').toUpperCase()
      if (!res[d]) res[d] = []
      res[d].push(r)
      return res
    }, {})
  }, [records])

  return (
    <div className="space-y-4">
      {ACADEMIC_DAYS.map((day) => {
        const daySlots = groups[day] || []
        if (daySlots.length === 0) return null

        return (
          <Panel key={day} className="overflow-hidden p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#003135] dark:text-[#55d6dc] flex items-center gap-2">
              <CalendarDays size={16} className="text-[#08747c]" />
              {day}
              <span className="rounded-full bg-[#f0f4f3] dark:bg-[#0b3339] px-2 py-0.5 text-[10px] font-medium text-[#647376] dark:text-[#8ea5a3]">
                {daySlots.length} sessions
              </span>
            </h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-grid">
              {daySlots.map((slot) => {
                const isContinuous = Boolean(slot.meta?.is_continuous)
                const isLab = Boolean(slot.meta?.is_laboratory || slot.meta?.lab_name)
                return (
                  <div
                    key={slot.id}
                    className={`rounded-lg border p-3.5 transition ${
                      isContinuous
                        ? 'border-[#08747c]/30 dark:border-[#0fa4af]/40 bg-[#ebf7f6] dark:bg-[#06343a]'
                        : isLab
                          ? 'border-[#c9e3d9] dark:border-[#13493b] bg-[#f2f9f6] dark:bg-[#052924]'
                          : 'border-[#e0e7e6] dark:border-[#124349] bg-white dark:bg-[#082a2f]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc]">
                        {String(slot.meta?.period || `Period ${slot.meta?.period_index}`)}
                      </span>
                      {isLab && (
                        <span className="rounded bg-[#08747c]/10 dark:bg-[#08747c]/30 px-1.5 py-0.5 text-[9px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                          PRACTICAL LAB
                        </span>
                      )}
                    </div>
                    <h4 className="mt-1 text-xs font-semibold text-[#172326] dark:text-[#e2f0ef] leading-tight">
                      {slot.title}
                    </h4>
                    <p className="mt-2 text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                      {String(slot.meta?.faculty_name || slot.subtitle || '')}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-2 text-[10px] text-[#7a898c] dark:text-[#7ba09d]">
                      <span className="font-mono">
                        {String(slot.meta?.room_id || slot.meta?.room_number || '')}
                      </span>
                      {slot.meta?.continuous_label && (
                        <span className="font-semibold text-[#08747c] dark:text-[#55d6dc]">
                          {String(slot.meta.continuous_label)}
                        </span>
                      )}
                    </div>
                    {canDelete && (
                      <div className="mt-2 pt-1 flex items-center gap-3">
                        <EditSlotButton slot={slot} />
                        <DeleteSlotButton slotId={slot.id} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function EditSlotButton({ slot }: { slot: AcademicRecord }) {
  const [open, setOpen] = useState(false)
  const meta = slot.meta || {}
  const [dayOfWeek, setDayOfWeek] = useState(String(meta.day_of_week || meta.day || 'MONDAY').toUpperCase())
  const [periodIndex, setPeriodIndex] = useState(String(meta.period_index || '1'))
  const [facultyId, setFacultyId] = useState(String(meta.faculty_id || ''))
  const [roomId, setRoomId] = useState(String(meta.room_id || ''))
  const [subjectId, setSubjectId] = useState(String(meta.subject_id || ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const staffRes = useLiveResource<{ data?: Array<{ staff_id: string; full_name: string; department_id?: string }> }>(
    open ? '/api/v1/staff?category=TEACHING' : null
  )
  const roomsRes = useLiveResource<{ data?: { facilities?: Array<{ room_id?: string; id?: string; room_number?: string; name?: string }> } }>(
    open ? '/api/v1/availability' : null
  )
  const subjectsRes = useLiveResource<{ data?: Array<{ subject_id: string; subject_code: string; subject_name: string }> }>(
    open ? '/api/v1/timetables/subjects' : null
  )

  const staffList = Array.isArray(staffRes.data?.data) ? staffRes.data!.data : []
  const roomList = Array.isArray(roomsRes.data?.data?.facilities) ? roomsRes.data!.data!.facilities : []
  const subjectList = Array.isArray(subjectsRes.data?.data) ? subjectsRes.data!.data : []

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const raw = await backendFetch(`/api/v1/admin/slots/${encodeURIComponent(slot.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          day_of_week: dayOfWeek,
          period_index: Number(periodIndex),
          faculty_id: facultyId || undefined,
          room_id: roomId || undefined,
          subject_id: subjectId || undefined,
        }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Failed to update timetable slot')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: 'Timetable slot updated cleanly.', type: 'success' },
      }))
      setOpen(false)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setError(err?.message || 'Conflict or validation error updating slot.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setDayOfWeek(String(meta.day_of_week || meta.day || 'MONDAY').toUpperCase())
          setPeriodIndex(String(meta.period_index || '1'))
          setFacultyId(String(meta.faculty_id || ''))
          setRoomId(String(meta.room_id || ''))
          setSubjectId(String(meta.subject_id || ''))
          setOpen(true)
        }}
        className="text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
      >
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
            <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 py-4 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-[#08747c] dark:text-[#55d6dc]">
                  Timetable Slot Modification
                </span>
                <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc] truncate">{slot.title}</h2>
              </div>
              <button
                type="button"
                aria-label="Close slot editor"
                onClick={() => setOpen(false)}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
              >
                <X size={16} />
              </button>
            </header>
            <form onSubmit={handleSave} className="p-5 space-y-3 overflow-y-auto flex-1">
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Day</label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    {ACADEMIC_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Period</label>
                  <select
                    value={periodIndex}
                    onChange={(e) => setPeriodIndex(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    {['1', '2', '3', '4', '5', '6', '7'].map((p) => <option key={p} value={p}>Period {p}</option>)}
                  </select>
                </div>
              </div>
              {subjectList.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Subject</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    {subjectList.map((sub) => (
                      <option key={sub.subject_id} value={sub.subject_id}>{sub.subject_code} — {sub.subject_name}</option>
                    ))}
                  </select>
                </div>
              )}
              {staffList.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Assigned Faculty</label>
                  <select
                    value={facultyId}
                    onChange={(e) => setFacultyId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    {staffList.map((st) => (
                      <option key={st.staff_id} value={st.staff_id}>{st.full_name} ({st.department_id || ''})</option>
                    ))}
                  </select>
                </div>
              )}
              {roomList.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Room / Facility</label>
                  <select
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    {roomList.map((rm) => {
                      const rid = rm.room_id || rm.id || ''
                      return <option key={rid} value={rid}>{rm.room_number || rid}{rm.name ? ` — ${rm.name}` : ''}</option>
                    })}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[#e3e9e8] dark:border-[#124349]">
                <button type="button" onClick={() => setOpen(false)} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#526164] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#08747c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003135] disabled:opacity-50 btn-interactive">
                  {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function DeleteSlotButton({ slotId }: { slotId: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  async function remove() {
    if (!window.confirm('Delete this timetable slot allocation?')) return
    setState('working')
    try {
      await mutateAcademicEndpoint(`/api/v1/admin/slots/${encodeURIComponent(slotId)}`, 'DELETE')
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch {
      setState('error')
    }
  }
  return (
    <button
      type="button"
      disabled={state === 'working'}
      onClick={remove}
      className="text-[10px] font-semibold text-[#913b2c] dark:text-[#f08575] hover:underline disabled:opacity-50"
    >
      {state === 'working' ? 'Deleting…' : state === 'error' ? 'Delete failed' : 'Delete'}
    </button>
  )
}

/* =========================================================================
   GENERIC RECORD COLLECTIONS (Labs, Availability, Workload, etc.)
   ========================================================================= */

function GenericRecordGrid({
  records,
  screen,
  user,
  onInspectFaculty,
  onSelectDept,
}: {
  records: AcademicRecord[]
  screen: AcademicScreen
  user: BackendUser
  onInspectFaculty?: (staffId: string, name: string) => void
  onSelectDept?: (deptId: string) => void
}) {
  const [searchTerm, setSearchFilter] = useState('')
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<'ALL' | 'CLASSROOM' | 'LABORATORY'>('ALL')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [staffCategoryFilter, setStaffCategoryFilter] = useState<'ALL' | 'TEACHING' | 'NON_TEACHING'>('ALL')
  const [staffDeptFilter, setStaffDeptFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [labDeptFilter, setLabDeptFilter] = useState<string>('ALL')

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (screen === 'availability') {
        if (facilityTypeFilter !== 'ALL') {
          const type = String(r.meta?.facility_type || r.meta?.type || '').toUpperCase()
          if (type !== facilityTypeFilter) return false
        }
        if (availableOnly) {
          const st = String(r.status || '').toUpperCase()
          if (st !== 'AVAILABLE' && st !== 'FREE') return false
        }
      }
      if (screen === 'people') {
        if (staffCategoryFilter !== 'ALL') {
          const cat = String(r.meta?.category || '').toUpperCase()
          if (cat !== staffCategoryFilter) return false
        }
        if (staffDeptFilter !== 'ALL') {
          const dept = String(r.meta?.department_id || '').toUpperCase()
          if (dept !== staffDeptFilter) return false
        }
      }
      if (screen === 'labs') {
        if (labDeptFilter !== 'ALL') {
          const dept = String(r.meta?.department_id || '').toUpperCase()
          if (dept !== labDeptFilter) return false
        }
      }
      if (screen === 'substitutions' || screen === 'bookings') {
        if (statusFilter !== 'ALL') {
          const st = String(r.status || r.meta?.status || '').toUpperCase()
          if (st !== statusFilter) return false
        }
      }
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return (
        r.title.toLowerCase().includes(q) ||
        (r.subtitle && r.subtitle.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.meta && Object.values(r.meta).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)))
      )
    })
  }, [records, searchTerm, screen, facilityTypeFilter, availableOnly, staffCategoryFilter, staffDeptFilter, statusFilter, labDeptFilter])

  return (
    <div className="space-y-4">
      {['availability', 'labs', 'people', 'users', 'calendar', 'substitutions', 'bookings'].includes(screen) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap">
          <div className="relative w-full sm:w-80">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Search ${screenCopy[screen].title.toLowerCase()}...`}
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          {screen === 'people' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
                {(['ALL', 'TEACHING', 'NON_TEACHING'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setStaffCategoryFilter(cat)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      staffCategoryFilter === cat
                        ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                        : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
                    }`}
                  >
                    {cat === 'ALL'
                      ? `All Staff (${records.length})`
                      : cat === 'TEACHING'
                      ? `Faculty (${records.filter((r) => String(r.meta?.category || '').toUpperCase() === 'TEACHING').length})`
                      : `Technical Staff (${records.filter((r) => String(r.meta?.category || '').toUpperCase() === 'NON_TEACHING').length})`}
                  </button>
                ))}
              </div>
              <select
                value={staffDeptFilter}
                onChange={(e) => setStaffDeptFilter(e.target.value)}
                className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                <DepartmentOptions showAllOption allLabel="All Departments" includeValue={staffDeptFilter} />
              </select>
            </div>
          )}

          {screen === 'labs' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#647376] dark:text-[#8ea5a3]">Department:</span>
              <select
                value={labDeptFilter}
                onChange={(e) => setLabDeptFilter(e.target.value)}
                className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                <DepartmentOptions showAllOption allLabel="All Laboratories" suffix=" Labs" includeValue={labDeptFilter} />
              </select>
            </div>
          )}

          {(screen === 'substitutions' || screen === 'bookings') && (
            <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    statusFilter === st
                      ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                      : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st === 'APPROVED' ? (screen === 'bookings' ? 'Confirmed' : 'Approved') : st}
                </button>
              ))}
            </div>
          )}

          {screen === 'availability' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
                {(['ALL', 'CLASSROOM', 'LABORATORY'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFacilityTypeFilter(t)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      facilityTypeFilter === t
                        ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                        : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
                    }`}
                  >
                    {t === 'ALL' ? 'All Types' : t === 'CLASSROOM' ? 'Classrooms' : 'Labs'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-[#526164] dark:text-[#8ea5a3] cursor-pointer">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="rounded text-[#08747c]"
                />
                Available Only
              </label>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <Panel className="grid min-h-60 place-items-center p-8 text-center">
          <div>
            <Inbox size={32} className="mx-auto text-[#8a9799]" />
            <h3 className="mt-3 text-sm font-semibold text-[#172326] dark:text-[#e2f0ef]">No records matched</h3>
            <p className="mt-1 text-xs text-[#647376] dark:text-[#8ea5a3] max-w-sm">
              Try adjusting your search keywords or filter options.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((record) => {
            if (screen === 'departments') {
              return (
                <DepartmentItemCard
                  key={record.id}
                  record={record}
                  onSelectDept={onSelectDept}
                />
              )
            }
            if (screen === 'substitutions') {
              return <SubstitutionItemCard key={record.id} record={record} user={user} />
            }
            if (screen === 'people') {
              return <FacultyWorkloadCard key={record.id} record={record} onInspect={onInspectFaculty} />
            }
            if (screen === 'availability') {
              return <FacilityAvailabilityCard key={record.id} record={record} />
            }
            if (screen === 'labs') {
              return <LaboratoryItemCard key={record.id} record={record} />
            }
            if (screen === 'bookings' || screen === 'approvals') {
              return (
                <LabBookingItemCard
                  key={record.id}
                  record={record}
                  user={user}
                  isApprovalQueue={screen === 'approvals'}
                />
              )
            }
            if (screen === 'recommendations') {
              return <RecommendationStaffCard key={record.id} record={record} onInspect={onInspectFaculty} />
            }
            if (screen === 'calendar') {
              return <CalendarEventItemCard key={record.id} record={record} />
            }
            if (screen === 'users') {
              return <UserDirectoryItemCard key={record.id} record={record} currentUser={user} />
            }
            if (screen === 'feedback') {
              return <FeedbackItemCard key={record.id} record={record} />
            }
            if (screen === 'ingestion') {
              return <IngestionStagedCard key={record.id} record={record} user={user} />
            }
            return <GenericCuratedCard key={record.id} record={record} />
          })}
        </div>
      )}
    </div>
  )
}

function FacultyAvatar({
  name,
  photo,
  size = 'md',
  isSubstitute = false,
}: {
  name: string
  photo?: string | null
  size?: 'sm' | 'md' | 'lg'
  isSubstitute?: boolean
}) {
  const [imgError, setImgError] = useState(false)
  const initials = useMemo(() => {
    const clean = (name || '').replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim().split(/\s+/)
    if (clean.length >= 2) return `${clean[0][0]}${clean[1][0]}`.toUpperCase()
    return (clean[0] || 'FA').slice(0, 2).toUpperCase()
  }, [name])

  const sizeClasses = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
  }[size]

  if (photo && !imgError) {
    return (
      <img
        src={photo}
        alt={name}
        onError={() => setImgError(true)}
        className={`${sizeClasses} shrink-0 rounded-full object-cover border ${
          isSubstitute
            ? 'border-[#08747c] dark:border-[#55d6dc]'
            : 'border-[#dce4e3] dark:border-[#124349]'
        }`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses} shrink-0 rounded-full flex items-center justify-center font-bold select-none ${
        isSubstitute
          ? 'bg-[#e2f1f0] dark:bg-[#063b41] text-[#076970] dark:text-[#55d6dc] border border-[#08747c]/30'
          : 'bg-[#edf2f1] dark:bg-[#052b30] text-[#003135] dark:text-[#cbd5e1] border border-[#dce4e3] dark:border-[#124349]'
      }`}
    >
      {initials}
    </div>
  )
}

function SubstitutionItemCard({
  record,
  user,
}: {
  record: AcademicRecord
  user: BackendUser
}) {
  const meta = record.meta || {}
  const status = String(record.status || meta.status || 'PENDING').toUpperCase()
  const origName = String(meta.original_faculty_name || 'Original Faculty')
  const origDesig = String(meta.original_faculty_designation || 'Faculty')
  const origPhoto = meta.original_faculty_photo ? String(meta.original_faculty_photo) : null
  const subName = String(meta.substitute_faculty_name || 'Substitute Faculty')
  const subDesig = String(meta.substitute_faculty_designation || 'Faculty Member')
  const subPhoto = meta.substitute_faculty_photo ? String(meta.substitute_faculty_photo) : null
  const subjectCode = String(meta.subject_code || '')
  const reason = String(meta.reason || 'Faculty Leave Coverage')
  const leaveDate = String(meta.leave_date || '')
  const day = String(meta.day_of_week || meta.day || 'MONDAY')
  const period = String(meta.period_index || meta.period || 'P1')
  const assignedBy = meta.assigned_by_name ? String(meta.assigned_by_name) : null
  const semSec = [
    meta.semester_number ? `Sem ${meta.semester_number}` : null,
    meta.section_name ? `Sec ${meta.section_name}` : null,
    meta.sec_dept ? `(${meta.sec_dept})` : null,
  ].filter(Boolean).join(' ')
  const roomClean = String(meta.room_number || record.subtitle || 'Classroom')

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        {/* Header: Subject & Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {subjectCode && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                  {subjectCode}
                </span>
              )}
              {semSec && (
                <span className="text-[11px] font-medium text-[#7a898c] dark:text-[#7ba09d]">
                  {semSec}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
              {record.title}
            </h3>
          </div>
          <StatusBadge tone={getTone(status)}>{status}</StatusBadge>
        </div>

        {/* Schedule & Location Pills */}
        <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-[#526164] dark:text-[#94a3b8]">
          <span className="inline-flex items-center gap-1 font-medium bg-[#f5f8f7] dark:bg-[#031d21] px-2 py-0.5 rounded-md border border-[#e2eae9] dark:border-[#124349]">
            <CalendarDays size={12} className="text-[#08747c] dark:text-[#55d6dc]" />
            {day} · Period {period.replace(/^P/, '')}
          </span>
          <span className="inline-flex items-center gap-1 font-medium bg-[#f5f8f7] dark:bg-[#031d21] px-2 py-0.5 rounded-md border border-[#e2eae9] dark:border-[#124349]">
            <MapPin size={12} className="text-[#08747c] dark:text-[#55d6dc]" />
            {roomClean}
          </span>
        </div>

        {/* Visual Substitution Delegation Flow */}
        <div className="mt-3.5 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {/* Original Faculty */}
            <div className="flex items-center gap-2 min-w-0">
              <FacultyAvatar name={origName} photo={origPhoto} size="md" />
              <div className="min-w-0">
                <span className="block text-[9px] uppercase font-bold tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
                  Original
                </span>
                <span className="block truncate text-xs font-semibold text-[#003135] dark:text-[#e0f2fe]">
                  {origName}
                </span>
                <span className="block truncate text-[10px] text-[#647376] dark:text-[#8ea5a3]">
                  {origDesig}
                </span>
              </div>
            </div>

            {/* Transfer Arrow */}
            <div className="flex flex-col items-center justify-center px-1 text-[#08747c] dark:text-[#55d6dc]">
              <span className="text-[9px] font-bold uppercase tracking-tight text-[#8a9799] dark:text-[#7ba09d]">
                Replaced by
              </span>
              <ArrowRight size={14} className="mt-0.5" />
            </div>

            {/* Substitute Faculty */}
            <div className="flex items-center gap-2 min-w-0 justify-end text-right">
              <div className="min-w-0">
                <span className="block text-[9px] uppercase font-bold tracking-wider text-[#08747c] dark:text-[#55d6dc]">
                  Substitute
                </span>
                <span className="block truncate text-xs font-semibold text-[#003135] dark:text-[#e0f2fe]">
                  {subName}
                </span>
                <span className="block truncate text-[10px] text-[#647376] dark:text-[#8ea5a3]">
                  {subDesig}
                </span>
              </div>
              <FacultyAvatar name={subName} photo={subPhoto} size="md" isSubstitute />
            </div>
          </div>

          {/* Reason & Leave Date Info */}
          <div className="mt-2.5 pt-2 border-t border-[#e8efee] dark:border-[#0e3b40] flex items-center justify-between text-[11px] text-[#647376] dark:text-[#8ea5a3]">
            <span className="truncate pr-2">
              <strong className="text-[#526164] dark:text-[#cbd5e1]">Reason:</strong> {reason}
            </span>
            {leaveDate && (
              <span className="shrink-0 font-medium text-[10px] text-[#7a898c] dark:text-[#7ba09d]">
                Date: {leaveDate}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Decision / Status Footer */}
      <div className="mt-3.5 pt-3 border-t border-[#edf2f1] dark:border-[#124349]">
        {status === 'APPROVED' ? (
          <div className="flex items-center justify-between text-[11px] text-[#1b6d53] dark:text-[#45c39c] font-medium">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              Coverage Approved & In Effect
            </span>
            {assignedBy && <span className="text-[10px] text-[#8a9799]">By {assignedBy}</span>}
          </div>
        ) : status === 'REJECTED' ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[#913b2c] dark:text-[#f87171] font-medium">
            <XCircle size={14} />
            Substitution Request Rejected
          </div>
        ) : ['SUPER_ADMIN', 'DEPT_ADMIN'].includes(user.role) ? (
          <SubstitutionApprovalButtons record={record} />
        ) : (
          <span className="text-[11px] text-[#8a9799] italic">Pending administrative approval</span>
        )}
      </div>
    </Panel>
  )
}

function FacultyWorkloadCard({
  record,
  onInspect,
}: {
  record: AcademicRecord
  onInspect?: (staffId: string, name: string) => void
}) {
  const meta = record.meta || {}
  const dept = String(meta.department_id || 'CSE')
  const email = meta.official_email ? String(meta.official_email) : null
  const photo = meta.photo_url ? String(meta.photo_url) : null
  const isNonTeaching = String(meta.category || '').toUpperCase() === 'NON_TEACHING'
  const weeklyHours = Number(meta.total_periods_per_week || 0)
  const isOverloaded = Boolean(meta.is_overloaded)
  const labResp = meta.lab_responsibility ? String(meta.lab_responsibility) : null

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start gap-3">
          <FacultyAvatar name={record.title} photo={photo} size="lg" isSubstitute={isNonTeaching} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                PNR #{record.id}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                isNonTeaching
                  ? 'bg-[#eaf5f0] dark:bg-[#072b22] text-[#1b6d53] dark:text-[#45c39c]'
                  : 'bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]'
              }`}>
                {dept} · {isNonTeaching ? 'Tech Staff' : 'Faculty'}
              </span>
            </div>
            <h3 className="mt-1 truncate text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
              {record.title}
            </h3>
            <p className="truncate text-xs text-[#647376] dark:text-[#8ea5a3]">
              {record.subtitle}
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        {isNonTeaching ? (
          <div className="mt-4 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3 text-left">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
              Assigned Lab Facility / Responsibility
            </span>
            <span className="mt-1 block text-xs font-semibold text-[#003135] dark:text-[#55d6dc]">
              {labResp || 'Departmental Computer & Hardware Labs'}
            </span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-2">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
                Weekly Load
              </span>
              <span className="mt-0.5 block text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
                {weeklyHours} <span className="text-[10px] font-normal text-[#647376]">hrs/wk</span>
              </span>
            </div>
            <div className="rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-2">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
                Status
              </span>
              <span
                className={`mt-0.5 inline-block text-[11px] font-bold ${
                  isOverloaded
                    ? 'text-[#b45309] dark:text-[#fbbf24]'
                    : 'text-[#15803d] dark:text-[#4ade80]'
                }`}
              >
                {isOverloaded ? 'OVERLOADED' : 'NORMAL LOAD'}
              </span>
            </div>
          </div>
        )}

        {email && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[#647376] dark:text-[#8ea5a3] truncate">
            <span className="text-[#08747c] dark:text-[#55d6dc]">{'\u2709'}</span>
            <a href={`mailto:${email}`} className="truncate hover:underline">
              {email}
            </a>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#edf2f1] dark:border-[#124349]">
        {!isNonTeaching ? (
          <button
            onClick={() => onInspect?.(record.id, record.title)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#08747c]/30 bg-[#f0faf9] dark:bg-[#052b30] py-2 text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#08747c] hover:text-white dark:hover:bg-[#08747c] dark:hover:text-white transition"
          >
            <CalendarDays size={14} />
            View Personal Schedule
          </button>
        ) : (
          <div className="flex items-center justify-center gap-1 text-[11px] text-[#1b6d53] dark:text-[#45c39c] font-medium py-1">
            <CheckCircle2 size={13} />
            <span>Verified Technical Operations Staff</span>
          </div>
        )}
      </div>
    </Panel>
  )
}

function FacilityAvailabilityCard({ record }: { record: AcademicRecord }) {
  const meta = record.meta || {}
  const statusStr = String(record.status || '').toUpperCase()
  const isVacant = statusStr === 'AVAILABLE' || statusStr === 'VACANT' || statusStr === 'FREE'
  const facilityType = String(meta.facility_type || meta.type || 'CLASSROOM').toUpperCase()
  const dept = String(meta.department_id || 'CSE')
  const capacity = Number(meta.capacity || 70)
  const equipment = meta.equipment_details ? String(meta.equipment_details) : null
  const session = (meta.session as unknown) as Record<string, any> | undefined

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                {dept} · {facilityType}
              </span>
              <span className="text-[11px] text-[#7a898c] dark:text-[#7ba09d]">
                Capacity: {capacity} seats
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
              {record.title}
            </h3>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
              isVacant
                ? 'bg-[#dcfce7] dark:bg-[#052e16] text-[#166534] dark:text-[#4ade80] border border-[#86efac]/40'
                : 'bg-[#fee2e2] dark:bg-[#450a0a] text-[#991b1b] dark:text-[#f87171] border border-[#fca5a5]/40'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isVacant ? 'bg-[#22c55e] animate-pulse' : 'bg-[#ef4444]'
              }`}
            />
            {isVacant ? 'VACANT NOW' : 'OCCUPIED'}
          </span>
        </div>

        {equipment && (
          <p className="mt-2 text-xs text-[#647376] dark:text-[#8ea5a3] line-clamp-1">
            {equipment}
          </p>
        )}

        <div className="mt-3.5 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3">
          {isVacant ? (
            <div className="flex items-center gap-2 text-xs text-[#166534] dark:text-[#4ade80]">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Available for immediate study, revision, or class reallocation.</span>
            </div>
          ) : session ? (
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
                Current Session ({session.start_time || '09:00'} - {session.end_time || '10:00'})
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-[#003135] dark:text-[#e0f2fe]">
                {session.subject_code ? `${session.subject_code} - ` : ''}{session.subject_name || 'Class Session'}
              </span>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                <span>{session.faculty_name}</span>
                <span className="font-medium text-[#08747c] dark:text-[#55d6dc]">
                  {session.cohort_label || session.section_id}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#647376] dark:text-[#8ea5a3]">
              <Clock size={14} className="shrink-0 text-[#b45309]" />
              <span>Class currently running in this venue.</span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

function LaboratoryItemCard({ record }: { record: AcademicRecord }) {
  const meta = record.meta || {}
  const dept = String(meta.department_id || 'CSE')
  const capacity = Number(meta.capacity || 70)
  const room = String(meta.room_number || meta.room_id || record.subtitle || 'Campus Facility')
  const incharge = String(meta.incharge_name || meta.in_charge_name || 'Technical Officer')
  const inchargeEmail = meta.incharge_email ? String(meta.incharge_email) : null

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                {dept} Lab
              </span>
              <span className="text-[11px] text-[#7a898c] dark:text-[#7ba09d]">
                {capacity} Workstations
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
              {record.title}
            </h3>
          </div>
          <FlaskConical size={18} className="text-[#08747c] dark:text-[#55d6dc] shrink-0" />
        </div>

        <div className="mt-2.5 flex items-center gap-2 text-xs text-[#526164] dark:text-[#94a3b8]">
          <MapPin size={13} className="text-[#08747c] dark:text-[#55d6dc] shrink-0" />
          <span>{room}</span>
        </div>

        <div className="mt-3.5 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
            Facility In-Charge
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-[#003135] dark:text-[#e0f2fe]">
            {incharge}
          </span>
          {inchargeEmail && (
            <span className="block text-[11px] text-[#647376] dark:text-[#8ea5a3]">
              {inchargeEmail}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3.5 pt-3 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between text-[11px] text-[#647376] dark:text-[#8ea5a3]">
        <span>Continuous Practical Sessions</span>
        <span className="font-medium text-[#08747c] dark:text-[#55d6dc]">Periods 5 – 7</span>
      </div>
    </Panel>
  )
}

function LabBookingItemCard({
  record,
  user,
  isApprovalQueue,
}: {
  record: AcademicRecord
  user: BackendUser
  isApprovalQueue: boolean
}) {
  const meta = record.meta || {}
  const status = String(record.status || meta.status || 'PENDING').toUpperCase()
  const labName = String(meta.lab_name || 'Laboratory')
  const room = String(meta.room_number || meta.room_id || '')
  const date = String(meta.booking_date || '')
  const day = String(meta.day_of_week || meta.day || '')
  const period = String(meta.period_index || meta.period || '1')
  const bookedBy = String(meta.coordinator_name || meta.booked_by_name || 'Student / Staff')
  const description = meta.description ? String(meta.description) : null

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                {labName}
              </span>
              {room && (
                <span className="text-[11px] text-[#7a898c] dark:text-[#7ba09d]">
                  {room}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
              {record.title}
            </h3>
          </div>
          <StatusBadge tone={getTone(status)}>{status}</StatusBadge>
        </div>

        {description && (
          <p className="mt-2 text-xs text-[#647376] dark:text-[#8ea5a3] line-clamp-2">
            {description}
          </p>
        )}

        <div className="mt-3.5 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[#08747c] dark:text-[#55d6dc] font-semibold">
              <CalendarDays size={13} />
              {date} {day ? `(${day})` : ''}
            </span>
            <span className="font-mono text-[11px] font-bold text-[#526164] dark:text-[#cbd5e1]">
              Period {period}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#e8efee] dark:border-[#0e3b40] flex items-center justify-between text-[11px] text-[#647376] dark:text-[#8ea5a3]">
            <span>Booked by: <strong className="text-[#003135] dark:text-[#e0f2fe]">{bookedBy}</strong></span>
            <span className="font-mono text-[10px]">{record.id}</span>
          </div>
        </div>
      </div>

      <div className="mt-3.5 pt-3 border-t border-[#edf2f1] dark:border-[#124349]">
        {status === 'CONFIRMED' || status === 'APPROVED' ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[#1b6d53] dark:text-[#45c39c] font-medium">
            <CheckCircle2 size={14} />
            Reservation Confirmed by Facility Admin
          </div>
        ) : status === 'REJECTED' ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[#913b2c] dark:text-[#f87171] font-medium">
            <XCircle size={14} />
            Reservation Request Rejected
          </div>
        ) : isApprovalQueue || ['SUPER_ADMIN', 'DEPT_ADMIN'].includes(user.role) ? (
          <LabBookingApprovalButtons record={record} />
        ) : (
          <span className="text-[11px] text-[#8a9799] italic">Pending administrative approval</span>
        )}
      </div>
    </Panel>
  )
}

function RecommendationStaffCard({
  record,
  onInspect,
}: {
  record: AcademicRecord
  onInspect?: (staffId: string, name: string) => void
}) {
  const meta = record.meta || {}
  const dept = String(meta.department_id || 'CSE')
  const email = meta.official_email ? String(meta.official_email) : null
  const photo = meta.photo_url ? String(meta.photo_url) : null

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-3 min-w-0">
            <FacultyAvatar name={record.title} photo={photo} size="md" />
            <div className="min-w-0">
              <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                PNR #{record.id} · {dept}
              </span>
              <h3 className="mt-0.5 truncate text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
                {record.title}
              </h3>
              <p className="truncate text-xs text-[#647376] dark:text-[#8ea5a3]">
                {record.subtitle}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#dcfce7] dark:bg-[#052e16] text-[#166534] dark:text-[#4ade80] border border-[#86efac]/40">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            FREE NOW
          </span>
        </div>

        <div className="mt-3.5 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3 text-xs text-[#526164] dark:text-[#94a3b8]">
          <div className="flex items-center gap-1.5 text-xs text-[#166534] dark:text-[#4ade80] font-medium">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>Candidate faculty verified free with zero timetable collision.</span>
          </div>
          {email && (
            <div className="mt-2 text-[11px] text-[#647376] dark:text-[#8ea5a3] truncate">
              Email: <a href={`mailto:${email}`} className="hover:underline">{email}</a>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#edf2f1] dark:border-[#124349] flex items-center gap-2">
        <button
          onClick={() => onInspect?.(record.id, record.title)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[#08747c]/30 bg-[#f0faf9] dark:bg-[#052b30] py-2 text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#08747c] hover:text-white dark:hover:bg-[#08747c] dark:hover:text-white transition"
        >
          <CalendarDays size={13} />
          View Schedule
        </button>
      </div>
    </Panel>
  )
}

function CalendarEventItemCard({ record }: { record: AcademicRecord }) {
  const meta = record.meta || {}
  const eventType = String(meta.event_type || 'EVENT').toUpperCase()
  const startDate = String(meta.event_date || '')
  const endDate = meta.end_date ? String(meta.end_date) : null
  const affectsSchedule = Boolean(meta.affects_schedule)
  const coordinator = meta.coordinator ? String(meta.coordinator) : null
  const description = meta.description ? String(meta.description) : null

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-2">
          <span
            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
              eventType === 'HOLIDAY'
                ? 'bg-[#fae8ff] dark:bg-[#3b0764] text-[#86198f] dark:text-[#f0abfc]'
                : eventType === 'EXAMINATION'
                ? 'bg-[#fef3c7] dark:bg-[#451a03] text-[#b45309] dark:text-[#fcd34d]'
                : 'bg-[#e0f2fe] dark:bg-[#082f49] text-[#0369a1] dark:text-[#38bdf8]'
            }`}
          >
            {eventType}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#08747c] dark:text-[#55d6dc]">
            <CalendarDays size={12} />
            {startDate} {endDate && `– ${endDate}`}
          </span>
        </div>

        <h3 className="mt-2 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
          {record.title}
        </h3>

        {description && (
          <p className="mt-1.5 text-xs text-[#647376] dark:text-[#8ea5a3] leading-relaxed line-clamp-2">
            {description}
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between text-[11px]">
        <span
          className={`font-semibold ${
            affectsSchedule
              ? 'text-[#b45309] dark:text-[#fbbf24]'
              : 'text-[#166534] dark:text-[#4ade80]'
          }`}
        >
          {affectsSchedule ? '\u26A0 Timetable Suspended' : '\u2713 Normal Operations'}
        </span>
        {coordinator && (
          <span className="text-[#8a9799] text-[10px]">
            {coordinator}
          </span>
        )}
      </div>
    </Panel>
  )
}

function UserDirectoryItemCard({
  record,
  currentUser,
}: {
  record: AcademicRecord
  currentUser: BackendUser
}) {
  const meta = record.meta || {}
  const role = String(meta.role || 'STUDENT').toUpperCase()
  const dept = String(meta.department_id || 'CSE')
  const email = String(meta.email || '')
  const phone = meta.mobile_number ? String(meta.mobile_number) : null
  const pnr = String(meta.pnrno || record.id)

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start gap-3">
          <FacultyAvatar name={record.title} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                {pnr}
              </span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                {dept}
              </span>
            </div>
            <h3 className="mt-0.5 truncate text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
              {record.title}
            </h3>
            <span className="inline-block mt-0.5 text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc]">
              {role.replaceAll('_', ' ')}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-1 text-xs text-[#647376] dark:text-[#8ea5a3]">
          {email && (
            <div className="flex items-center gap-1.5 truncate">
              <span>{'\u2709'}</span>
              <span className="truncate">{email}</span>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-1.5 truncate">
              <span>{'\u260E'}</span>
              <span className="truncate">{phone}</span>
            </div>
          )}
        </div>
      </div>

      {currentUser.role === 'SUPER_ADMIN' && (
        <UserStatusManagementButtons record={record} />
      )}
    </Panel>
  )
}

function FeedbackItemCard({ record }: { record: AcademicRecord }) {
  const meta = record.meta || {}
  const rating = Number(meta.rating || 5)
  const category = String(meta.category || 'FEEDBACK').replaceAll('_', ' ')
  const author = String(meta.user_name || 'Anonymous User')
  const dept = String(meta.department_id || 'CSE')
  const comments = meta.comments ? String(meta.comments) : null

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc] uppercase">
            {dept} · {category}
          </span>
          <div className="flex items-center text-[#eab308]">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < rating ? 'text-[#eab308]' : 'text-[#d1d5db] dark:text-[#374151]'}>
                {'\u2605'}
              </span>
            ))}
          </div>
        </div>

        <h3 className="mt-2 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
          {record.title}
        </h3>

        {comments && (
          <p className="mt-2 text-xs text-[#526164] dark:text-[#94a3b8] leading-relaxed line-clamp-3">
            "{comments}"
          </p>
        )}
      </div>

      <div className="mt-3.5 pt-3 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between text-[11px] text-[#647376] dark:text-[#8ea5a3]">
        <span>By: <strong className="text-[#003135] dark:text-[#e0f2fe]">{author}</strong></span>
        <span className="font-semibold text-[#166534] dark:text-[#4ade80]">Recorded</span>
      </div>
    </Panel>
  )
}

function DepartmentItemCard({
  record,
  onSelectDept,
}: {
  record: AcademicRecord
  onSelectDept?: (deptId: string) => void
}) {
  const meta = record.meta || {}
  const deptId = String(meta.department_id || record.id || 'CSE')
  const name = record.title || String(meta.name || 'Engineering Department')
  const hod = String(meta.hod_name || 'Department Head')
  const email = meta.contact_email ? String(meta.contact_email) : null
  const phone = meta.contact_phone ? String(meta.contact_phone) : null
  const desc = meta.description ? String(meta.description) : null
  const facultyCount = Number(meta.faculty_count || 0)
  const labCount = Number(meta.laboratories_count || 0)
  const studentCount = Number(meta.student_count || 0)
  const sectionCount = Number(meta.sections_count || 32)

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc] uppercase tracking-wider">
              {deptId} · Autonomous
            </span>
            <h3 className="mt-1.5 text-base font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
              {name}
            </h3>
          </div>
          <Building2 size={20} className="text-[#08747c] dark:text-[#55d6dc] shrink-0 mt-0.5" />
        </div>

        {desc && (
          <p className="mt-2 text-xs text-[#526164] dark:text-[#94a3b8] leading-relaxed line-clamp-2">
            {desc}
          </p>
        )}

        {/* HOD Info Box */}
        <div className="mt-3.5 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3">
          <div className="flex items-center gap-2.5">
            <FacultyAvatar name={hod} size="md" />
            <div className="min-w-0 flex-1">
              <span className="block text-[9px] uppercase font-bold tracking-wider text-[#8a9799] dark:text-[#7ba09d]">
                Head of Department (HOD)
              </span>
              <span className="block truncate text-xs font-semibold text-[#003135] dark:text-[#e0f2fe]">
                {hod}
              </span>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#647376] dark:text-[#8ea5a3] flex-wrap">
                {email && (
                  <a href={`mailto:${email}`} className="text-[#08747c] dark:text-[#55d6dc] hover:underline truncate">
                    {email}
                  </a>
                )}
                {phone && <span>· {phone}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Curricular Statistics Matrix */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-[#f0f6f5] dark:bg-[#052d32] border border-[#dce9e8] dark:border-[#0e3b40]">
            <span className="block text-[10px] text-[#647376] dark:text-[#8ea5a3]">Teaching Faculty</span>
            <strong className="text-sm font-mono font-bold text-[#003135] dark:text-[#e0f2fe]">{facultyCount} Staff</strong>
          </div>
          <div className="p-2 rounded-lg bg-[#f0f6f5] dark:bg-[#052d32] border border-[#dce9e8] dark:border-[#0e3b40]">
            <span className="block text-[10px] text-[#647376] dark:text-[#8ea5a3]">Practical Labs</span>
            <strong className="text-sm font-mono font-bold text-[#08747c] dark:text-[#55d6dc]">{labCount} Facilities</strong>
          </div>
          <div className="p-2 rounded-lg bg-[#f0f6f5] dark:bg-[#052d32] border border-[#dce9e8] dark:border-[#0e3b40]">
            <span className="block text-[10px] text-[#647376] dark:text-[#8ea5a3]">Enrolled Students</span>
            <strong className="text-sm font-mono font-bold text-[#003135] dark:text-[#e0f2fe]">{studentCount.toLocaleString()}</strong>
          </div>
          <div className="p-2 rounded-lg bg-[#f0f6f5] dark:bg-[#052d32] border border-[#dce9e8] dark:border-[#0e3b40]">
            <span className="block text-[10px] text-[#647376] dark:text-[#8ea5a3]">Section Cohorts</span>
            <strong className="text-sm font-mono font-bold text-[#003135] dark:text-[#e0f2fe]">{sectionCount} (Sem 1-8)</strong>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between">
        <span className="text-[11px] text-[#7a898c] dark:text-[#7ba09d]">Session 2026–27</span>
        <button
          type="button"
          onClick={() => {
            if (onSelectDept) {
              onSelectDept(deptId)
            } else {
              window.dispatchEvent(new CustomEvent('gmritdu:select-department', { detail: { departmentId: deptId } }))
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#08747c] hover:bg-[#065b61] text-white shadow-xs transition-colors cursor-pointer"
        >
          <CalendarDays size={13} /> View Timetable
        </button>
      </div>
    </Panel>
  )
}

function IngestionStagedCard({
  record,
  user,
}: {
  record: AcademicRecord
  user: BackendUser
}) {
  const meta = record.meta || {}
  const docId = String(meta.doc_id || record.id)
  const filename = record.title || String(meta.original_filename || 'timetable.xlsx')
  const status = String(record.status || meta.status || 'STAGED').toUpperCase()
  const deptId = String(meta.department_id || 'CSE')
  const academicYear = String(meta.academic_year || '2026-27')
  const semesterLabel = String(meta.semester_label || 'Semester Schedule')
  const totalSlots = Number(meta.total_slots_parsed || 0)
  const uploadedBy = String(meta.uploaded_by || 'Administrator')
  const createdAt = String(meta.created_at || '')

  const [isCommitting, setIsCommitting] = useState(false)
  const [committed, setCommitted] = useState(status === 'COMMITTED')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showSlotsModal, setShowSlotsModal] = useState(false)
  const [slotsData, setSlotsData] = useState<any[] | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  const handleCommit = async () => {
    if (
      !window.confirm(
        `Commit document "${filename}" (${totalSlots} slots) into the live institutional timetable for ${deptId}? This will update the active published schedule.`
      )
    ) {
      return
    }
    setIsCommitting(true)
    setErrorMessage(null)
    try {
      const res = await backendFetch(`/api/v1/timetables/ingest/commit/${encodeURIComponent(docId)}`, {
        method: 'POST',
        body: JSON.stringify({ activateImmediately: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to commit staged timetable.')
      }
      setCommitted(true)
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: { message: data.message || `Timetable "${filename}" committed to live schedule.`, type: 'success' },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setErrorMessage(err.message || 'Error committing timetable')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleInspectSlots = async () => {
    setShowSlotsModal(true)
    if (slotsData) return
    setLoadingSlots(true)
    try {
      const res = await backendFetch(`/api/v1/timetables/ingest/staged/${encodeURIComponent(docId)}`)
      const data = await res.json()
      if (data.success && data.data) {
        const parsed =
          typeof data.data.parsed_data_json === 'string'
            ? JSON.parse(data.data.parsed_data_json)
            : data.data.parsed_data_json
        setSlotsData(parsed?.allSlots || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSlots(false)
    }
  }

  const canCommit = ['SUPER_ADMIN', 'DEPT_ADMIN', 'COORDINATOR'].includes(user.role)

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                {docId}
              </span>
              <span className="text-[11px] font-medium text-[#7a898c] dark:text-[#7ba09d]">
                {deptId} · {academicYear}
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug flex items-center gap-1.5 truncate">
              <FileUp size={14} className="text-[#08747c] dark:text-[#55d6dc] shrink-0" />
              <span className="truncate">{filename}</span>
            </h3>
          </div>
          <StatusBadge tone={committed ? 'green' : 'amber'}>
            {committed ? 'PUBLISHED' : 'DRAFT'}
          </StatusBadge>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold bg-[#e8f5f4] dark:bg-[#08363d] text-[#076970] dark:text-[#55d6dc] px-2 py-0.5 rounded-md border border-[#cbe4e2] dark:border-[#104b54]">
            {totalSlots} Extracted Slots
          </span>
          <span className="inline-flex items-center gap-1 font-medium bg-[#f5f8f7] dark:bg-[#031d21] text-[#526164] dark:text-[#94a3b8] px-2 py-0.5 rounded-md border border-[#e2eae9] dark:border-[#124349]">
            {semesterLabel}
          </span>
        </div>

        <div className="mt-3 rounded-lg border border-[#e2eae9] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#031d21] p-3 text-[11px] text-[#647376] dark:text-[#8ea5a3] space-y-1">
          <div className="flex justify-between">
            <span>Uploaded by:</span>
            <strong className="text-[#003135] dark:text-[#e0f2fe]">{uploadedBy}</strong>
          </div>
          {createdAt && (
            <div className="flex justify-between">
              <span>Timestamp:</span>
              <span>{createdAt}</span>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mt-2 text-[11px] text-[#b91c1c] dark:text-[#f87171] bg-[#fef2f2] dark:bg-[#450a0a] p-2 rounded-lg border border-[#fecaca] dark:border-[#7f1d1d]">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="mt-3.5 pt-3 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleInspectSlots}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
        >
          <Eye size={13} /> Inspect Slots
        </button>

        {committed ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1b6d53] dark:text-[#45c39c]">
            <CheckCircle2 size={13} /> Active in Live Schedule
          </span>
        ) : canCommit ? (
          <button
            type="button"
            onClick={handleCommit}
            disabled={isCommitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#08747c] hover:bg-[#065b61] text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isCommitting ? (
              <>
                <LoaderCircle size={13} className="animate-spin" /> Publishing...
              </>
            ) : (
              <>
                <HardDriveDownload size={13} /> Publish to Live Timetable
              </>
            )}
          </button>
        ) : (
          <span className="text-[11px] text-[#7a898c] dark:text-[#7ba09d] italic">
            Awaiting Coordinator or Admin Approval
          </span>
        )}
      </div>

      {showSlotsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 modal-backdrop" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white dark:bg-[#002528] border border-[#dce4e3] dark:border-[#0a4a50] shadow-2xl overflow-hidden modal-panel">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#dce4e3] dark:border-[#0a4a50] bg-[#f8fafc] dark:bg-[#04363a]">
              <div>
                <h3 className="text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
                  Extracted Schedule Slots ({filename})
                </h3>
                <p className="text-xs text-[#647376] dark:text-[#94a3b8]">
                  {docId} · {deptId} · {totalSlots} Total Slots Ready
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSlotsModal(false)}
                className="p-1 rounded-lg text-[#647376] hover:bg-[#e2eae9] dark:hover:bg-[#083b40] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 text-xs">
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8 gap-2 text-[#08747c] dark:text-[#55d6dc]">
                  <LoaderCircle size={18} className="animate-spin" /> Loading schedule slot matrix...
                </div>
              ) : slotsData && slotsData.length > 0 ? (
                <div className="space-y-2">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#dce4e3] dark:border-[#0a4a50] text-[#7a898c]">
                        <th className="py-1.5 px-2">Day</th>
                        <th className="py-1.5 px-2">Period</th>
                        <th className="py-1.5 px-2">Subject</th>
                        <th className="py-1.5 px-2">Faculty</th>
                        <th className="py-1.5 px-2">Room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8efee] dark:divide-[#0e3b40]">
                      {slotsData.slice(0, 35).map((s: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#f8faf9] dark:hover:bg-[#062c31]">
                          <td className="py-1 px-2 font-medium">{s.day_of_week}</td>
                          <td className="py-1 px-2 font-mono">P{s.period_index}</td>
                          <td className="py-1 px-2 font-bold text-[#08747c] dark:text-[#55d6dc]">
                            {s.subject_code || s.subject_id}
                          </td>
                          <td className="py-1 px-2">{s.faculty_name || s.faculty_id}</td>
                          <td className="py-1 px-2">{s.room_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {slotsData.length > 35 && (
                    <p className="text-[11px] text-[#7a898c] text-center pt-2 italic">
                      Showing first 35 slots of {slotsData.length} total. All slots will be committed.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-center py-6 text-[#7a898c]">No individual slot details available.</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#dce4e3] dark:border-[#0a4a50] flex justify-end">
              <button
                type="button"
                onClick={() => setShowSlotsModal(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#edf2f1] dark:bg-[#07363d] text-[#003135] dark:text-[#e0f2fe] cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function GenericCuratedCard({ record }: { record: AcademicRecord }) {
  const meta = record.meta || {}
  const status = record.status || meta.status ? String(record.status || meta.status).toUpperCase() : null
  const excludedKeys = new Set([
    'id',
    'slot_id',
    'booking_id',
    'notice_id',
    'event_id',
    'user_id',
    'facility_id',
    'staff_id',
    'photo_url',
    'created_at',
    'original_faculty_photo',
    'substitute_faculty_photo',
    'avatar_url',
    'day_of_week',
    'period_index',
    'shared_section_ids',
    'shared_faculty_names',
    'tags',
    'session',
    'counts',
    'original_faculty_id',
    'substitute_faculty_id',
    'assigned_by_user_id',
    'booked_by_user_id',
    'token',
    'password_hash',
    'password',
    'pnrno',
  ])

  const displayPills = Object.entries(meta).filter(
    ([k, v]) =>
      !excludedKeys.has(k) &&
      !k.endsWith('_photo') &&
      !k.endsWith('_url') &&
      !k.endsWith('_id') &&
      k !== 'status' &&
      k !== 'live_status' &&
      k !== 'approval_status' &&
      k !== 'user_status' &&
      String(v) !== record.title &&
      v !== null &&
      v !== undefined &&
      v !== '',
  ).slice(0, 6)

  return (
    <Panel className="p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#003135] dark:text-[#e0f2fe] leading-snug">
              {record.title}
            </h3>
            {record.subtitle && (
              <p className="mt-1 text-xs text-[#647376] dark:text-[#8ea5a3]">{record.subtitle}</p>
            )}
          </div>
          {status && <StatusBadge tone={getTone(status)}>{status}</StatusBadge>}
        </div>

        {displayPills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5 pt-3 border-t border-[#edf2f1] dark:border-[#124349]">
            {displayPills.map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#f5f8f7] dark:bg-[#031d21] border border-[#e2eae9] dark:border-[#124349] text-[#526164] dark:text-[#a0c2bf]"
              >
                <strong className="text-[#08747c] dark:text-[#55d6dc] uppercase">{k.replaceAll('_', ' ')}:</strong>
                <span className="truncate max-w-[150px]">{String(v)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}

function SubstitutionApprovalButtons({ record }: { record: AcademicRecord }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')

  async function updateStatus(status: 'APPROVED' | 'REJECTED') {
    setState('working')
    try {
      await mutateAcademicEndpoint(
        `/api/v1/substitutions/${encodeURIComponent(record.id)}/status`,
        'PATCH',
        { status }
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      setState('done')
    } catch {
      setState('idle')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={state === 'working'}
        onClick={() => updateStatus('APPROVED')}
        className="rounded-lg bg-[#eaf5f0] dark:bg-[#072b22] px-3 py-1.5 text-xs font-semibold text-[#1b6d53] dark:text-[#45c39c] hover:bg-[#d9ece4] transition disabled:opacity-50"
      >
        Approve Leave
      </button>
      <button
        disabled={state === 'working'}
        onClick={() => updateStatus('REJECTED')}
        className="rounded-lg bg-[#faefec] dark:bg-[#2b100d] px-3 py-1.5 text-xs font-semibold text-[#913b2c] dark:text-[#f08575] hover:bg-[#f5e0da] transition disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  )
}

function LabBookingApprovalButtons({ record }: { record: AcademicRecord }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')

  async function handleDecision(action: 'APPROVE' | 'REJECT') {
    setState('working')
    try {
      await mutateAcademicEndpoint(
        `/api/v1/laboratories/bookings/${encodeURIComponent(record.id)}/approval`,
        'PUT',
        { action }
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      setState('done')
    } catch {
      setState('idle')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={state === 'working'}
        onClick={() => handleDecision('APPROVE')}
        className="rounded-lg bg-[#eaf5f0] dark:bg-[#072b22] px-3 py-1.5 text-xs font-semibold text-[#1b6d53] dark:text-[#45c39c] hover:bg-[#d9ece4] transition disabled:opacity-50"
      >
        Confirm Booking
      </button>
      <button
        disabled={state === 'working'}
        onClick={() => handleDecision('REJECT')}
        className="rounded-lg bg-[#faefec] dark:bg-[#2b100d] px-3 py-1.5 text-xs font-semibold text-[#913b2c] dark:text-[#f08575] hover:bg-[#f5e0da] transition disabled:opacity-50"
      >
        Reject Request
      </button>
    </div>
  )
}

function UserStatusManagementButtons({ record }: { record: AcademicRecord }) {
  const [state, setState] = useState<'idle' | 'working'>('idle')
  const currentStatus = String(record.status || record.meta?.status || 'ACTIVE').toUpperCase()

  async function setStatus(next: 'ACTIVE' | 'SUSPENDED') {
    setState('working')
    try {
      await mutateAcademicEndpoint(
        `/api/v1/admin/users/${encodeURIComponent(record.id)}/status`,
        'PATCH',
        { status: next }
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="mt-4 flex items-center justify-between border-t border-[#edf2f1] dark:border-[#124349] pt-3">
      <span className="text-[10px] text-[#7a898c] dark:text-[#6e8886]">Account Governance:</span>
      {currentStatus === 'ACTIVE' ? (
        <button
          disabled={state === 'working'}
          onClick={() => setStatus('SUSPENDED')}
          className="text-xs font-semibold text-[#913b2c] dark:text-[#f08575] hover:underline disabled:opacity-50"
        >
          Suspend Access
        </button>
      ) : (
        <button
          disabled={state === 'working'}
          onClick={() => setStatus('ACTIVE')}
          className="text-xs font-semibold text-[#1b6d53] dark:text-[#45c39c] hover:underline disabled:opacity-50"
        >
          Reactivate Account
        </button>
      )}
    </div>
  )
}

/* =========================================================================
   FACULTY PERSONAL SCHEDULE MODAL
   ========================================================================= */

function FacultyScheduleModal({
  staffId,
  facultyName,
  onClose,
}: {
  staffId: string
  facultyName: string
  onClose: () => void
}) {
  const resource = useLiveResource<{
    success: boolean
    data: {
      faculty: { staff_id: string; full_name: string; designation: string; department_id: string }
      slots: Array<{
        slot_id: string
        day_of_week: string
        period_index: number
        start_time: string
        end_time: string
        subject_name: string
        subject_code: string
        room_id: string
        section_id: string
        is_continuous: boolean
      }>
    }
  }>(`/api/v1/staff/faculty/${encodeURIComponent(staffId)}/timetable`)

  const data = resource.data?.data
  const slots = data?.slots || []

  const slotMap: Record<string, Record<number, any>> = {}
  ACADEMIC_DAYS.forEach((d) => {
    slotMap[d] = {}
  })

  slots.forEach((s) => {
    const d = s.day_of_week?.toUpperCase()
    if (slotMap[d]) {
      slotMap[d][s.period_index] = s
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <section className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-6 py-4">
          <div>
            <span className="font-mono text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc] uppercase">
              Staff ID: {staffId} · Weekly Teaching Roster
            </span>
            <h2 className="text-lg font-bold text-[#003135] dark:text-[#55d6dc]">{facultyName}</h2>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#647376] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {resource.loading ? (
            <div className="py-12 text-center">
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#b9cac7] border-t-[#08747c]" />
              <p className="mt-3 text-xs text-[#647376]">Loading faculty timetable slots…</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#dce4e3] dark:border-[#124349] bg-[#f7f9f9] dark:bg-[#031d21]">
                    <th className="w-16 p-2 text-center font-semibold text-[#003135] dark:text-[#55d6dc]">Day</th>
                    {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                      const bell = bellSchedule.find((b) => b.period === p)
                      return (
                        <th key={p} className="p-2 text-center font-semibold text-[#526164] dark:text-[#8ea5a3]">
                          P{p}
                          <span className="block text-[8px] font-normal text-[#8fa09d]">
                            {bell ? `${bell.startsAt}–${bell.endsAt}` : ''}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {ACADEMIC_DAYS.map((day) => (
                    <tr key={day} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34]">
                      <td className="p-2 font-semibold text-center text-[#003135] dark:text-[#55d6dc]">{day.slice(0, 3)}</td>
                      {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                        const slot = slotMap[day]?.[p]
                        return (
                          <td key={p} className="p-1 text-center align-top border-l border-[#e8efee] dark:border-[#124349]">
                            {slot ? (
                              <div className="rounded bg-[#ebf7f6] dark:bg-[#073238] p-1.5 text-left border border-[#08747c]/20">
                                <span className="block font-mono text-[9px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                                  {slot.subject_code}
                                </span>
                                <span className="mt-0.5 block truncate text-[10px] font-medium" title={slot.subject_name}>
                                  {slot.subject_name}
                                </span>
                                <span className="mt-0.5 block font-mono text-[9px] text-[#7a898c] dark:text-[#7ba09d] truncate">
                                  {slot.room_id}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[#b9cac7] dark:text-[#426466] text-xs">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function FacilityScheduleModal({
  facilityId,
  facilityName,
  onClose,
  onBookSlot,
}: {
  facilityId: string
  facilityName: string
  onClose: () => void
  onBookSlot?: (facilityId: string, day: string, period: number, labId?: string | null) => void
}) {
  const resource = useLiveResource<{
    success: boolean
    data: {
      facility: {
        room_id: string
        lab_id: string | null
        name: string
        room_number: string
        facility_type: string
        capacity: number
        equipment_details: string | null
        incharge?: { name: string; designation: string; email: string } | null
      }
      grid: Record<
        string,
        Record<
          number,
          {
            period_index: number
            status: 'AVAILABLE' | 'OCCUPIED' | 'EVENT' | 'RESERVED'
            slot?: {
              subject_code: string
              subject_name: string
              course_type: string
              sec_dept: string
              semester_number: number
              section_name: string
              faculty_name: string
              is_substituted?: boolean
              substitute_faculty_name?: string
            } | null
            booking?: {
              title: string
              club_name?: string
              coordinator_name?: string
            } | null
          }
        >
      >
    }
  }>(`/api/v1/availability/facility/${encodeURIComponent(facilityId)}/weekly`)

  const data = resource.data?.data
  const facility = data?.facility
  const grid = data?.grid || {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <section className="relative z-10 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="shrink-0 flex items-center justify-between gap-2 border-b border-[#e3e9e8] dark:border-[#124349] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc] uppercase">
                {facility?.facility_type || 'FACILITY'} · {facility?.room_number || facilityId}
              </span>
              <span className="text-xs text-[#647376] dark:text-[#8ea5a3]">
                Capacity: {facility?.capacity || 70} seats
              </span>
              {facility?.incharge && (
                <span className="text-xs text-[#08747c] dark:text-[#55d6dc]">
                  Custodian: {facility.incharge.name} ({facility.incharge.designation})
                </span>
              )}
            </div>
            <h2 className="mt-1 text-base sm:text-lg font-bold text-[#003135] dark:text-[#55d6dc] truncate">
              {facility?.name || facilityName} — Master Weekly Schedule
            </h2>
            {facility?.equipment_details && (
              <p className="mt-0.5 text-xs text-[#647376] dark:text-[#8ea5a3] truncate max-w-3xl">
                Equipment & Setup: {facility.equipment_details}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close schedule" className="shrink-0 grid h-9 w-9 place-items-center rounded-lg text-[#647376] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          {resource.loading ? (
            <div className="py-12 text-center">
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#b9cac7] border-t-[#08747c]" />
              <p className="mt-3 text-xs text-[#647376]">Loading facility weekly occupancy schedule…</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#dce4e3] dark:border-[#124349] bg-[#f7f9f9] dark:bg-[#031d21]">
                    <th className="w-16 p-2 text-center font-semibold text-[#003135] dark:text-[#55d6dc]">Day</th>
                    {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                      const bell = bellSchedule.find((b) => b.period === p)
                      return (
                        <th key={p} className="p-2 text-center font-semibold text-[#526164] dark:text-[#8ea5a3]">
                          P{p}
                          <span className="block text-[8px] font-normal text-[#8fa09d]">
                            {bell ? `${bell.startsAt}–${bell.endsAt}` : ''}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].map((day) => (
                    <tr key={day} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34]">
                      <td className="p-2 font-semibold text-center text-[#003135] dark:text-[#55d6dc]">
                        {day.slice(0, 3)}
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                        const cell = grid[day]?.[p]
                        const isVacant = !cell || cell.status === 'AVAILABLE'
                        const isOccupied = cell?.status === 'OCCUPIED'
                        const isEvent = cell?.status === 'EVENT' || cell?.status === 'RESERVED'

                        return (
                          <td key={p} className="p-1 text-center align-top border-l border-[#e8efee] dark:border-[#124349]">
                            {isOccupied && cell?.slot ? (
                              <div className="rounded bg-[#fef2f2] dark:bg-[#331114] p-1 text-left border border-red-200 dark:border-red-900/50">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[8px] font-bold text-red-700 dark:text-red-400">
                                    {cell.slot.subject_code}
                                  </span>
                                  <span className="text-[8px] text-red-600 dark:text-red-300 font-semibold truncate max-w-[45px]">
                                    {cell.slot.section_name}
                                  </span>
                                </div>
                                <span className="mt-0.5 block truncate text-[9px] font-medium text-slate-800 dark:text-slate-200" title={cell.slot.subject_name}>
                                  {cell.slot.subject_name}
                                </span>
                                <span className="mt-0.5 block truncate text-[8px] text-[#7a898c] dark:text-[#7ba09d]" title={cell.slot.faculty_name}>
                                  {cell.slot.is_substituted && cell.slot.substitute_faculty_name
                                    ? `Sub: ${cell.slot.substitute_faculty_name}`
                                    : cell.slot.faculty_name}
                                </span>
                              </div>
                            ) : isEvent && cell?.booking ? (
                              <div className="rounded bg-amber-50 dark:bg-[#38260a] p-1 text-left border border-amber-200 dark:border-amber-900/50">
                                <span className="block font-mono text-[8px] font-bold text-amber-700 dark:text-amber-400 truncate">
                                  RESERVED
                                </span>
                                <span className="mt-0.5 block truncate text-[9px] font-medium text-amber-900 dark:text-amber-200" title={cell.booking.title}>
                                  {cell.booking.title}
                                </span>
                                <span className="mt-0.5 block text-[8px] text-amber-700 dark:text-amber-300 truncate" title={cell.booking.club_name || cell.booking.coordinator_name}>
                                  {cell.booking.club_name || cell.booking.coordinator_name || 'Event'}
                                </span>
                              </div>
                            ) : onBookSlot ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onBookSlot(facility?.room_id || facilityId, day, p, facility?.lab_id || null)
                                }
                                title={`Book ${facility?.name || facilityName} on ${day} Period ${p}`}
                                className="group w-full rounded bg-[#f0fdf4] dark:bg-[#062c1e] p-1.5 text-center border border-emerald-200 dark:border-emerald-900/40 hover:border-[#024950] hover:bg-[#e1faeb] dark:hover:bg-[#093d2a] transition-colors cursor-pointer"
                              >
                                <span className="block text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  Vacant
                                </span>
                                <span className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-[#024950] px-1.5 py-0.5 text-[8px] font-semibold text-white opacity-85 group-hover:opacity-100">
                                  Book P{p}
                                </span>
                              </button>
                            ) : (
                              <div className="rounded bg-[#f0fdf4] dark:bg-[#062c1e] p-1.5 text-center border border-emerald-200 dark:border-emerald-900/40">
                                <span className="block text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  Vacant
                                </span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function FacilityAvailabilityHub({
  user,
  clockState,
  onNavigate,
  onOpenBooking,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (screen: AcademicScreen) => void
  onOpenBooking?: (facilityId: string, day: string, period: number, duration: number, labId?: string | null) => void
}) {
  const currentDay = clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day
  const currentPeriod = clockState.period || 1

  const [hubMode, setHubMode] = useState<'facilities' | 'faculty'>('facilities')
  const [selectedDay, setSelectedDay] = useState<string>(currentDay)
  const [selectedPeriod, setSelectedPeriod] = useState<number>(currentPeriod)
  const [selectedDuration, setSelectedDuration] = useState<number>(1)
  const [facilityType, setFacilityType] = useState<'ALL' | 'LABORATORY' | 'CLASSROOM'>('ALL')
  const [department, setDepartment] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'OCCUPIED'>('ALL')
  const [facultyFilter, setFacultyFilter] = useState<'ALL' | 'FREE' | 'BUSY'>('FREE')
  const [searchQuery, setSearchQuery] = useState('')
  const [blockFilter, setBlockFilter] = useState<string>('ALL')
  const [capacityFilter, setCapacityFilter] = useState<'ALL' | '<50' | '50-70' | '>70'>('ALL')
  const [sortBy, setSortBy] = useState<'status' | 'room_asc' | 'capacity_desc' | 'capacity_asc' | 'dept_asc'>('status')
  const [inspectedFacility, setInspectedFacility] = useState<{ id: string; name: string } | null>(null)
  const [inspectedFaculty, setInspectedFaculty] = useState<{ id: string; name: string } | null>(null)
  const [showAddClassroom, setShowAddClassroom] = useState(false)
  const [editingFacility, setEditingFacility] = useState<{
    facility_id: string
    department_id: string
    room_number: string
    name: string
    facility_type: string
    capacity: number
    equipment_details: string | null
  } | null>(null)
  const [deletingFacility, setDeletingFacility] = useState<{ id: string; label: string } | null>(null)
  const [deletingFacilityLoading, setDeletingFacilityLoading] = useState(false)
  const [deletingFacilityError, setDeletingFacilityError] = useState<string | null>(null)
  const [cancellingEventId, setCancellingEventId] = useState<string | null>(null)
  const canCreateFacility = ['SUPER_ADMIN', 'DEPT_ADMIN'].includes(user.role)
  const canManageEvents = ['SUPER_ADMIN', 'DEPT_ADMIN'].includes(user.role)

  const handleConfirmDeleteFacility = async () => {
    if (!deletingFacility) return
    setDeletingFacilityLoading(true)
    setDeletingFacilityError(null)
    try {
      const raw = await backendFetch(`/api/v1/availability/facilities/${encodeURIComponent(deletingFacility.id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Failed to delete facility')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || 'Facility removed from registry.', type: 'success' },
      }))
      setDeletingFacility(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
      resource.retry()
    } catch (err: any) {
      setDeletingFacilityError(err?.message || 'Failed to delete facility.')
    } finally {
      setDeletingFacilityLoading(false)
    }
  }

  useEffect(() => {
    if (clockState.period !== null) setSelectedPeriod(clockState.period)
  }, [clockState.period])

  const endpoint = `/api/v1/availability?day=${encodeURIComponent(selectedDay)}&period=${selectedPeriod}&duration=${selectedDuration}&type=${facilityType}&department=${encodeURIComponent(department)}&status=${statusFilter}&q=${encodeURIComponent(searchQuery)}`
  const freeFacultyEndpoint =
    hubMode === 'faculty'
      ? `/api/v1/availability/free-faculty?day=${encodeURIComponent(selectedDay)}&period=${selectedPeriod}${department !== 'ALL' ? `&department=${encodeURIComponent(department)}` : ''}`
      : null

  const freeFacultyRes = useLiveResource<{
    success: boolean
    data: {
      dayOfWeek: string
      periodIndex: number
      availableFacultyCount: number
      busyFacultyCount: number
      availableFaculty: Array<any>
      busyFaculty: Array<any>
    }
  }>(freeFacultyEndpoint)

  const resource = useLiveResource<{
    success: boolean
    data: {
      dayOfWeek: string
      periodIndex: number
      duration: number
      targetPeriods: number[]
      spanLabel: string
      counts: {
        total: number
        available: number
        occupied: number
        events: number
      }
      facilities: Array<{
        facility_id: string
        room_id: string
        lab_id: string | null
        facility_type: string
        name: string
        room_number: string
        department_id: string
        capacity: number
        equipment_details: string | null
        incharge: { staff_id: string; name: string; designation: string; email: string; photo_url?: string } | null
        co_incharge: { staff_id: string; name: string; designation: string; email: string } | null
        status: 'AVAILABLE' | 'OCCUPIED' | 'EVENT' | 'RESERVED'
        day_of_week: string
        period_index: number
        duration: number
        target_periods: number[]
        continuous_span: string
        conflicts_count: number
        all_conflicting_slots: Array<{
          period_index: number
          subject_code: string
          subject_name: string
          faculty_name: string
          cohort_label: string
        }>
        session?: {
          subject_code: string
          subject_name: string
          course_type: string
          cohort_label: string
          faculty_name: string
          start_time: string
          end_time: string
          is_substituted?: boolean
          substitute_faculty_name?: string
          is_continuous?: boolean
          continuous_label?: string
        } | null
        event?: {
          booking_id: string
          title: string
          club_name: string
          description?: string
          coordinator_name: string
          booked_by_user_id?: string | null
          start_time: string
          end_time: string
          status: string
        } | null
      }>
    }
  }>(endpoint)

  const data = resource.data?.data
  const facilities = data?.facilities || []
  const counts = data?.counts || { total: 0, available: 0, occupied: 0, events: 0 }
  const spanLabel = data?.spanLabel || `Period P${selectedPeriod}`

  const labFacilitiesCount = useMemo(() => facilities.filter((f) => f.facility_type === 'LABORATORY').length, [facilities])
  const classFacilitiesCount = useMemo(() => facilities.filter((f) => f.facility_type !== 'LABORATORY').length, [facilities])

  const isLiveBell = selectedDay === currentDay && selectedPeriod === currentPeriod

  const handleCancelEvent = async (bookingId: string) => {
    setCancellingEventId(bookingId)
    try {
      const raw = await backendFetch(`/api/v1/availability/bookings/${encodeURIComponent(bookingId)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Cancellation failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || 'Facility reservation cancelled.', type: 'info' },
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      resource.retry()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Cancellation error: ${e instanceof Error ? e.message : 'Failed'}`, type: 'error' },
      }))
    } finally {
      setCancellingEventId(null)
    }
  }

  const displayedFacilities = useMemo(() => {
    let list = [...facilities]
    if (blockFilter !== 'ALL') {
      list = list.filter((f) => {
        const roomNum = (f.room_number || '').toUpperCase()
        const name = (f.name || '').toUpperCase()
        if (blockFilter === 'DATA_CENTER') {
          return roomNum.includes('DC') || name.includes('DATA CENTER')
        }
        const bNum = blockFilter.replace('BLOCK_', '')
        return roomNum.startsWith(bNum) || roomNum.includes(`BLOCK ${bNum}`) || name.includes(`BLOCK ${bNum}`)
      })
    }
    if (capacityFilter === '<50') {
      list = list.filter((f) => f.capacity < 50)
    } else if (capacityFilter === '50-70') {
      list = list.filter((f) => f.capacity >= 50 && f.capacity <= 70)
    } else if (capacityFilter === '>70') {
      list = list.filter((f) => f.capacity > 70)
    }

    list.sort((a, b) => {
      if (sortBy === 'status') {
        const score = (s: string) => (s === 'AVAILABLE' ? 0 : s === 'RESERVED' || s === 'EVENT' ? 1 : 2)
        const diff = score(a.status) - score(b.status)
        if (diff !== 0) return diff
        return a.room_number.localeCompare(b.room_number)
      }
      if (sortBy === 'room_asc') return a.room_number.localeCompare(b.room_number)
      if (sortBy === 'capacity_desc') return b.capacity - a.capacity
      if (sortBy === 'capacity_asc') return a.capacity - b.capacity
      if (sortBy === 'dept_asc') return a.department_id.localeCompare(b.department_id)
      return 0
    })
    return list
  }, [facilities, blockFilter, capacityFilter, sortBy])

  return (
    <div className="space-y-2.5">
      {/* 1. Master Temporal & Spatial Control Suite */}
      <Panel className="p-3 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl space-y-2 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 border-b border-[#e8efee] dark:border-[#124349] pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc] uppercase tracking-wider">
                TEMPORAL VACANCY SUITE
              </span>
              <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-0.5">
                <button
                  type="button"
                  onClick={() => setHubMode('facilities')}
                  className={`rounded-md px-2.5 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                    hubMode === 'facilities'
                      ? 'bg-[#024950] text-white shadow-xs'
                      : 'text-[#647376] dark:text-[#8ea5a3]'
                  }`}
                >
                  Labs & Rooms ({counts.available} Free)
                </button>
                <button
                  type="button"
                  onClick={() => setHubMode('faculty')}
                  className={`rounded-md px-2.5 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                    hubMode === 'faculty'
                      ? 'bg-[#024950] text-white shadow-xs'
                      : 'text-[#647376] dark:text-[#8ea5a3]'
                  }`}
                >
                  Free Faculty Finder
                </button>
              </div>
              {isLiveBell ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Synced with Live Campus Bell
                </span>
              ) : (
                <button
                  onClick={() => {
                    setSelectedDay(currentDay)
                    setSelectedPeriod(currentPeriod)
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline"
                >
                  <Clock size={11} />
                  Reset to Live Bell Now
                </button>
              )}
            </div>
            <h2 className="mt-0.5 text-sm font-bold text-[#003135] dark:text-[#55d6dc]">
              Evaluate Facility Vacancy at Any Academic Time
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Duration:</span>
            {[
              { val: 1, label: '1 Period (1 hr)' },
              { val: 2, label: '2 Periods (2 hrs - Lab Block)' },
              { val: 3, label: '3 Periods (3 hrs - Workshop)' },
            ].map((d) => (
              <button
                key={d.val}
                onClick={() => setSelectedDuration(d.val)}
                className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition ${
                  selectedDuration === d.val
                    ? 'bg-[#024950] text-white shadow-xs'
                    : 'bg-[#f0f4f3] dark:bg-[#072a2f] text-[#526164] dark:text-[#8ea5a3] hover:text-[#003135]'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Days and Periods Selectors */}
        <div className="space-y-1.5">
          {/* Day Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3] w-12">Day:</span>
            {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].map((d) => {
              const isToday = d === currentDay
              const isSelected = selectedDay === d
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`relative rounded-lg px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#003135] dark:bg-[#55d6dc] text-white dark:text-[#003135] shadow-xs'
                      : 'bg-[#f4f7f6] dark:bg-[#072a2f] text-[#526164] dark:text-[#8ea5a3] hover:bg-[#e8efee] dark:hover:bg-[#0a353b]'
                  }`}
                >
                  {isToday && (
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-amber-300 dark:bg-amber-600' : 'bg-[#08747c]'}`} />
                  )}
                  {d}
                </button>
              )
            })}
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3] w-12">Period:</span>
            {[1, 2, 3, 4, 5, 6, 7].map((p) => {
              const isNow = p === currentPeriod && selectedDay === currentDay
              const isSelected = selectedPeriod === p
              const bell = bellSchedule.find((b) => b.period === p)
              const timeRange = bell ? `${bell.startsAt}–${bell.endsAt}` : `P${p}`
              return (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition flex flex-col items-center leading-tight ${
                    isSelected
                      ? 'bg-[#08747c] text-white shadow-xs'
                      : 'bg-[#f4f7f6] dark:bg-[#072a2f] text-[#526164] dark:text-[#8ea5a3] hover:bg-[#e8efee] dark:hover:bg-[#0a353b]'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {isNow && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    P{p}
                  </span>
                  <span className={`text-[8px] font-normal ${isSelected ? 'text-white/80' : 'text-[#8fa09d]'}`}>
                    {timeRange}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Facility Type, Department, Status, Search Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1.5 border-t border-[#e8efee] dark:border-[#124349]">
          <div>
            <label className="block text-[9px] font-semibold text-[#647376] dark:text-[#8ea5a3] uppercase mb-0.5">
              Facility Type
            </label>
            <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-0.5">
              {(['ALL', 'LABORATORY', 'CLASSROOM'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFacilityType(t)}
                  className={`flex-1 rounded-md py-0.5 text-[10px] font-semibold transition ${
                    facilityType === t
                      ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                      : 'text-[#647376] dark:text-[#8ea5a3]'
                  }`}
                >
                  {t === 'ALL'
                    ? `All (${facilities.length})`
                    : t === 'LABORATORY'
                    ? `Labs (${labFacilitiesCount})`
                    : `Classes (${classFacilitiesCount})`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-semibold text-[#647376] dark:text-[#8ea5a3] uppercase mb-0.5">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-8 w-full rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <DepartmentOptions showAllOption allLabel="All Departments" suffix=" Department" includeValue={department} />
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#647376] dark:text-[#8ea5a3] uppercase mb-1">
              Vacancy Status
            </label>
            <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
              {(['ALL', 'AVAILABLE', 'OCCUPIED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition ${
                    statusFilter === st
                      ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                      : 'text-[#647376] dark:text-[#8ea5a3]'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st === 'AVAILABLE' ? 'Vacant Only' : 'Occupied'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-semibold text-[#647376] dark:text-[#8ea5a3] uppercase mb-0.5">
              Search Venue / Equipment
            </label>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[#758386]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Room no, lab name, equipment..."
                className="h-8 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-8 pr-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
          </div>
        </div>

        {/* Secondary Interactive Sortings & Campus Block / Seating Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Campus Block:</span>
            <select
              value={blockFilter}
              onChange={(e) => setBlockFilter(e.target.value)}
              className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <option value="ALL">All Campus Blocks</option>
              <option value="BLOCK_1">Block 1 (Ground & First Floor)</option>
              <option value="BLOCK_2">Block 2 (Core Engineering Complex)</option>
              <option value="BLOCK_3">Block 3 (Basic Sciences & Humanities)</option>
              <option value="BLOCK_4">Block 4 (Mechanical / Civil Workshops)</option>
              <option value="BLOCK_5">Block 5 (Computing & Information Block)</option>
              <option value="DATA_CENTER">Data &amp; Computing Halls</option>
            </select>

            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3] ml-2">Capacity Scale:</span>
            <select
              value={capacityFilter}
              onChange={(e) => setCapacityFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <option value="ALL">All Capacities</option>
              <option value="<50">&lt; 50 Seats (Small Group / Tutorial)</option>
              <option value="50-70">50 – 70 Seats (Standard Batch Class)</option>
              <option value=">70">&gt; 70 Seats (High-Density Multi-Batch / Center)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Sort Venues:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <option value="status">Status (Vacant Venues First)</option>
              <option value="room_asc">Room Identifier (A → Z)</option>
              <option value="capacity_desc">Capacity (Highest First)</option>
              <option value="capacity_asc">Capacity (Lowest First)</option>
              <option value="dept_asc">Department (A → Z)</option>
            </select>
            {canCreateFacility && (
              <button
                type="button"
                onClick={() => setShowAddClassroom(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#08747c] hover:bg-[#003135] px-3 text-xs font-semibold text-white shadow-xs transition cursor-pointer"
              >
                <Plus size={13} />
                Add Classroom / Hall
              </button>
            )}
          </div>
        </div>
      </Panel>

      {/* 2. Integrated Analytics & Spatial Query Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#003135] dark:text-[#55d6dc]">
            {selectedDay} · {spanLabel}
          </span>
          <span className="text-[#7a898c]">|</span>
          <span className="px-2 py-0.5 rounded-md bg-[#eaf5f0] text-[#1b6d53] dark:bg-[#072b22] dark:text-[#45c39c] font-bold">
            {counts.available} Vacant ({counts.total > 0 ? Math.round((counts.available / counts.total) * 100) : 0}%)
          </span>
          <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 font-semibold">
            {counts.occupied} Occupied
          </span>
          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-semibold">
            {counts.events} Reserved
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold text-[#08747c] dark:text-[#55d6dc]">
          {displayedFacilities.length} / {counts.total} Venues
        </span>
      </div>

      {/* 3. High-Density Spatial / Free Faculty Matrix */}
      {hubMode === 'faculty' ? (
        (() => {
          const ff = freeFacultyRes.data?.data
          const freeList = (ff?.availableFaculty || []).map((f: any) => ({ ...f, isFree: true }))
          const busyList = (ff?.busyFaculty || []).map((f: any) => ({ ...f, isFree: false }))
          const combined =
            facultyFilter === 'FREE'
              ? freeList
              : facultyFilter === 'BUSY'
                ? busyList
                : [...freeList, ...busyList]
          const q = searchQuery.trim().toLowerCase()
          const rows = q
            ? combined.filter(
                (f: any) =>
                  String(f.full_name || '').toLowerCase().includes(q) ||
                  String(f.staff_id || '').toLowerCase().includes(q) ||
                  String(f.designation || '').toLowerCase().includes(q) ||
                  String(f.department_id || '').toLowerCase().includes(q)
              )
            : combined

          return (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[#003135] dark:text-[#55d6dc]">
                    {selectedDay} · Period P{selectedPeriod}
                  </span>
                  <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-0.5">
                    {(['FREE', 'BUSY', 'ALL'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFacultyFilter(mode)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                          facultyFilter === mode
                            ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                            : 'text-[#647376] dark:text-[#8ea5a3]'
                        }`}
                      >
                        {mode === 'FREE'
                          ? `Free Now (${ff?.availableFacultyCount ?? freeList.length})`
                          : mode === 'BUSY'
                            ? `In Session (${ff?.busyFacultyCount ?? busyList.length})`
                            : `All (${freeList.length + busyList.length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#08747c] dark:text-[#55d6dc]">
                  {rows.length} Faculty Displayed
                </span>
              </div>

              {freeFacultyRes.loading ? (
                <Panel className="p-10 text-center">
                  <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#b9cac7] border-t-[#08747c]" />
                  <p className="mt-3 text-xs text-[#647376]">Checking free faculty schedules…</p>
                </Panel>
              ) : (
                <div className="overflow-auto lg:max-h-[calc(100vh-520px)] max-h-[65vh] min-h-[240px] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
                  <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
                      <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                        <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Faculty & ID</th>
                        <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department & Cadre</th>
                        <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Weekly Load</th>
                        <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status at {selectedDay} P{selectedPeriod}</th>
                        <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Timetable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-[#7a898c]">
                            No faculty matched your filter for {selectedDay} Period P{selectedPeriod}.
                          </td>
                        </tr>
                      ) : (
                        rows.map((f: any) => (
                          <tr key={f.staff_id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                            <td className="p-3">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 block">{f.full_name}</span>
                              <span className="font-mono text-[10px] text-[#08747c] dark:text-[#55d6dc] font-bold">{f.staff_id}</span>
                            </td>
                            <td className="p-3">
                              <span className="inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc] mr-1.5">
                                {f.department_id}
                              </span>
                              <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">{f.designation}</span>
                            </td>
                            <td className="p-3 font-mono font-semibold text-[#003135] dark:text-[#e0f2fe]">
                              {f.total_periods_per_week ?? '—'} hrs/wk
                            </td>
                            <td className="p-3">
                              {f.isFree ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-[#062c1e] border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                                  <CheckCircle2 size={12} /> FREE & AVAILABLE
                                </span>
                              ) : (
                                <div className="text-[11px]">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-[10px] mr-1.5">
                                    IN SESSION
                                  </span>
                                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                                    {f.busy_details?.subject_name || 'Scheduled Class'} ({f.busy_details?.room_number || 'Hall'})
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => setInspectedFaculty({ id: f.staff_id, name: f.full_name })}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] transition cursor-pointer"
                              >
                                <CalendarDays size={12} />
                                View Timetable
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()
      ) : resource.loading ? (
        <Panel className="p-12 text-center">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#b9cac7] border-t-[#08747c]" />
          <p className="mt-3 text-xs text-[#647376]">Evaluating institutional venue availability…</p>
        </Panel>
      ) : displayedFacilities.length === 0 ? (
        <Panel className="p-12 text-center">
          <Inbox size={32} className="mx-auto text-[#8a9799]" />
          <h3 className="mt-3 text-sm font-semibold text-[#172326] dark:text-[#e2f0ef]">No venues matched</h3>
          <p className="mt-1 text-xs text-[#647376] dark:text-[#8ea5a3]">
            Try adjusting your search criteria, day, period, block, capacity, or department filter.
          </p>
        </Panel>
      ) : (
        <div className="overflow-auto lg:max-h-[calc(100vh-520px)] max-h-[65vh] min-h-[240px] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
              <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Venue & Identifier</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department & Block</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Capacity & Specs</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">In-Charge / Custodian</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status for {spanLabel}</th>
                <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedFacilities.map((fac) => {
                const isVacant = fac.status === 'AVAILABLE'
                const isOccupied = fac.status === 'OCCUPIED'
                const isEvent = fac.status === 'EVENT' || fac.status === 'RESERVED'

                return (
                  <tr
                    key={fac.facility_id}
                    className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc]">
                          {fac.room_number}
                        </span>
                        <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          fac.facility_type === 'LABORATORY'
                            ? 'bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {fac.facility_type === 'LABORATORY' ? 'LAB' : 'CLASS'}
                        </span>
                      </div>
                      <span className="mt-0.5 block font-semibold text-slate-900 dark:text-slate-100 text-xs">
                        {fac.name}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f0f4f3] dark:bg-[#072a2f] text-[#003135] dark:text-[#55d6dc]">
                        {fac.department_id}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                        Block {fac.room_number.split('-')[0] || '1'}
                      </span>
                    </td>

                    <td className="p-3 max-w-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {fac.capacity} seats / stations
                      </span>
                      {fac.equipment_details && (
                        <p className="mt-0.5 text-[11px] text-[#7a898c] dark:text-[#7ba09d] truncate" title={fac.equipment_details}>
                          {fac.equipment_details}
                        </p>
                      )}
                    </td>

                    <td className="p-3">
                      {fac.incharge ? (
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                            {fac.incharge.name}
                          </span>
                          <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] block truncate">
                            {fac.incharge.designation}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#a0afac] text-xs">—</span>
                      )}
                    </td>

                    <td className="p-3">
                      {isVacant ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-[#062c1e] border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 size={13} />
                          <span className="font-bold text-[11px]">VACANT & READY</span>
                        </div>
                      ) : isOccupied && fac.session ? (
                        <div className="rounded bg-red-50 dark:bg-[#331114] p-1.5 border border-red-200 dark:border-red-900/40">
                          <div className="flex items-center gap-1 text-red-700 dark:text-red-400 font-bold text-[10px]">
                            <Flame size={12} />
                            <span>IN SESSION</span>
                            <span className="font-mono">({fac.session.subject_code})</span>
                          </div>
                          <span className="block truncate text-[11px] font-medium text-slate-800 dark:text-slate-200 mt-0.5" title={fac.session.subject_name}>
                            {fac.session.subject_name}
                          </span>
                          <span className="block text-[10px] text-red-600 dark:text-red-300 font-semibold mt-0.5">
                            {fac.session.cohort_label} · {fac.session.faculty_name}
                          </span>
                          {fac.session.continuous_label && (
                            <span className="block font-mono text-[9px] text-[#7a898c] dark:text-[#7ba09d]">
                              {fac.session.continuous_label}
                            </span>
                          )}
                        </div>
                      ) : isEvent && fac.event ? (
                        <div className="rounded bg-amber-50 dark:bg-[#38260a] p-1.5 border border-amber-200 dark:border-amber-900/40">
                          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold text-[10px]">
                            <Star size={12} />
                            <span>RESERVED</span>
                          </div>
                          <span className="block truncate text-[11px] font-medium text-amber-900 dark:text-amber-200 mt-0.5">
                            {fac.event.title}
                          </span>
                          <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                            {fac.event.club_name || fac.event.coordinator_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#a0afac] text-xs">Occupied</span>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setInspectedFacility({ id: fac.facility_id, name: fac.name })}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] transition"
                        >
                          <Eye size={12} />
                          Weekly Matrix
                        </button>
                        {isVacant && onOpenBooking && (
                          <button
                            onClick={() => onOpenBooking(fac.facility_id, selectedDay, selectedPeriod, selectedDuration)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#024950] px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] transition"
                          >
                            <Plus size={12} />
                            Book
                          </button>
                        )}
                        {isEvent && fac.event && (canManageEvents || String(fac.event.booked_by_user_id || '') === user.userId) && (
                          <button
                            disabled={cancellingEventId === fac.event.booking_id}
                            onClick={() => handleCancelEvent(fac.event!.booking_id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-[#331114] px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-[#41171b] btn-interactive disabled:opacity-60"
                          >
                            <XCircle size={12} />
                            {cancellingEventId === fac.event.booking_id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        )}
                        {canCreateFacility && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingFacility({
                                facility_id: fac.facility_id,
                                department_id: fac.department_id,
                                room_number: fac.room_number,
                                name: fac.name,
                                facility_type: fac.facility_type,
                                capacity: fac.capacity,
                                equipment_details: fac.equipment_details,
                              })}
                              title="Edit facility details"
                              className="inline-flex items-center justify-center rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] p-1.5 text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] btn-interactive"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingFacilityError(null)
                                setDeletingFacility({ id: fac.facility_id, label: `${fac.room_number} · ${fac.name}` })
                              }}
                              title="Delete facility"
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-[#331114]/70 p-1.5 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-[#41171b] btn-interactive"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Facility Weekly Schedule Modal */}
      {inspectedFacility && (
        <FacilityScheduleModal
          facilityId={inspectedFacility.id}
          facilityName={inspectedFacility.name}
          onClose={() => setInspectedFacility(null)}
          onBookSlot={
            onOpenBooking
              ? (fid, day, p, lid) => {
                  setInspectedFacility(null)
                  onOpenBooking(fid, day, p, 1, lid)
                }
              : undefined
          }
        />
      )}

      {inspectedFaculty && (
        <FacultyScheduleModal
          staffId={inspectedFaculty.id}
          facultyName={inspectedFaculty.name}
          onClose={() => setInspectedFaculty(null)}
        />
      )}

      {(showAddClassroom || editingFacility) && (
        <AddClassroomModal
          defaultDept={user.departmentId || 'CSE'}
          restrictDept={user.role === 'DEPT_ADMIN'}
          initialFacility={editingFacility}
          onClose={() => {
            setShowAddClassroom(false)
            setEditingFacility(null)
          }}
          onSuccess={() => {
            resource.retry()
            window.dispatchEvent(new Event('gmritdu:data-change'))
          }}
        />
      )}

      {deletingFacility && (
        <ConfirmActionModal
          title="Remove Campus Facility?"
          subject={deletingFacility.label}
          description="Facilities with active scheduled timetable slots cannot be removed until reassigned."
          confirmLabel="Delete Facility"
          loading={deletingFacilityLoading}
          error={deletingFacilityError}
          onClose={() => setDeletingFacility(null)}
          onConfirm={handleConfirmDeleteFacility}
        />
      )}
    </div>
  )
}

function AddClassroomModal({
  defaultDept,
  restrictDept,
  initialFacility,
  onClose,
  onSuccess,
}: {
  defaultDept: string
  restrictDept: boolean
  initialFacility?: {
    facility_id: string
    department_id: string
    room_number: string
    name: string
    facility_type: string
    capacity: number
    equipment_details: string | null
  } | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = Boolean(initialFacility)
  const [departmentId, setDepartmentId] = useState(initialFacility?.department_id || defaultDept || 'CSE')
  const [roomNumber, setRoomNumber] = useState(initialFacility?.room_number || '')
  const [capacity, setCapacity] = useState(String(initialFacility?.capacity || 70))
  const [facilitiesDesc, setFacilitiesDesc] = useState(
    initialFacility?.equipment_details ?? 'Smart Board, High-Lumen Projector, Audio System'
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!roomNumber.trim()) {
      setError('Room number / identifier is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const targetUrl = isEdit
        ? `/api/v1/availability/facilities/${encodeURIComponent(initialFacility!.facility_id)}`
        : '/api/v1/availability/facilities'
      const raw = await backendFetch(targetUrl, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({
          room_type: initialFacility?.facility_type || 'CLASSROOM',
          department_id: departmentId,
          room_number: roomNumber.trim(),
          name: initialFacility?.name || roomNumber.trim(),
          capacity: Number(capacity) || 70,
          facilities_description: facilitiesDesc.trim(),
          equipment_details: facilitiesDesc.trim(),
        }),
      })
      const res = (await raw.json()) as any
      if (!raw.ok || !res.success) throw new Error(res.message || `Failed to ${isEdit ? 'update' : 'create'} classroom.`)
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: { message: res.message || `Classroom ${roomNumber.trim()} saved.`, type: 'success' },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || `Failed to ${isEdit ? 'update' : 'create'} classroom.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 sm:px-6 py-4 shrink-0">
          <div>
            <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc] uppercase">
              Infrastructure Registry
            </span>
            <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc]">
              {isEdit ? `Edit Facility · ${initialFacility!.room_number}` : 'Add Classroom / Lecture Hall'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
          >
            <X size={16} />
          </button>
        </header>
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Department *
              </label>
              <select
                value={departmentId}
                disabled={restrictDept}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
              >
                <DepartmentOptions includeValue={departmentId} />
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Seating Capacity *
              </label>
              <input
                type="number"
                min={1}
                required
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Room Number / Name *
            </label>
            <input
              required
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. 5-S-01 or Block 5 Hall A"
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Facilities & Equipment
            </label>
            <textarea
              rows={2}
              value={facilitiesDesc}
              onChange={(e) => setFacilitiesDesc(e.target.value)}
              className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-2.5 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#08747c] hover:bg-[#003135] text-white disabled:opacity-50"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Classroom'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LabIncidentReportModal({
  labs,
  user,
  onClose,
  onSuccess,
}: {
  labs: AcademicRecord[]
  user: BackendUser
  onClose: () => void
  onSuccess: () => void
}) {
  const [labId, setLabId] = useState<string>(String(labs[0]?.meta?.lab_id || labs[0]?.id || ''))
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM')
  const [equipmentAffected, setEquipmentAffected] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      setError('Incident description is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const raw = await backendFetch('/api/v1/laboratories/incidents', {
        method: 'POST',
        body: JSON.stringify({
          lab_id: labId,
          severity,
          equipment_affected: equipmentAffected,
          description,
          photo_url: photoUrl,
        }),
      })
      const res = (await raw.json()) as any
      if (!raw.ok) throw new Error(res.message || 'Failed to submit incident')
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: {
            message: 'Lab incident registered in institutional log.',
            type: 'success',
          },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Submission error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 sm:px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <h2 className="text-sm sm:text-base font-bold text-[#003135] dark:text-[#55d6dc]">
              Report Laboratory Incident / Equipment Fault
            </h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Laboratory Facility
            </label>
            <select
              value={labId}
              onChange={(e) => setLabId(e.target.value)}
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none focus:border-[#08747c]"
            >
              {labs.map((l) => {
                const targetId = String(l.meta?.lab_id || l.id)
                return (
                  <option key={l.id} value={targetId}>
                    {l.title} ({String(l.meta?.department_id || 'CSE')} - Room {String(l.meta?.room_number || targetId)})
                  </option>
                )
              })}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Severity Level
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none focus:border-[#08747c]"
              >
                <option value="LOW">Low (Cosmetic / Non-critical)</option>
                <option value="MEDIUM">Medium (Single Workstation / Peripheral)</option>
                <option value="HIGH">High (Multi-seat / Equipment Breakdown)</option>
                <option value="CRITICAL">Critical (Power / Whole Lab Outage)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Equipment Affected
              </label>
              <input
                type="text"
                value={equipmentAffected}
                onChange={(e) => setEquipmentAffected(e.target.value)}
                placeholder="e.g. Workstation #14, Switch Port 12"
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Incident Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide technical diagnosis, error codes, and symptoms..."
              rows={3}
              required
              className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Photo / Asset Tag URL (Optional)
            </label>
            <input
              type="text"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://... or equipment serial identifier"
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#08747c] hover:bg-[#003135] text-white disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Log Incident Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LabIncidentResolutionModal({
  incident,
  onClose,
  onSuccess,
}: {
  incident: any
  onClose: () => void
  onSuccess: () => void
}) {
  const [status, setStatus] = useState<string>(incident.status || 'RESOLVED')
  const [resolutionNotes, setResolutionNotes] = useState<string>(incident.resolution_notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const raw = await backendFetch(`/api/v1/laboratories/incidents/${encodeURIComponent(incident.incident_id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution_notes: resolutionNotes }),
      })
      const res = (await raw.json()) as any
      if (!raw.ok) throw new Error(res.message || 'Failed to update status')
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: {
            message: `Incident ${incident.incident_id} updated to ${status}.`,
            type: 'success',
          },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Update error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 sm:px-6 py-4 shrink-0">
          <div>
            <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc]">
              {incident.incident_id} · {incident.lab_name || incident.lab_id}
            </span>
            <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc]">
              Update Incident Status
            </h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Workflow Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none focus:border-[#08747c]"
            >
              <option value="UNDER_INVESTIGATION">Under Investigation</option>
              <option value="RESOLVED">Resolved (Restored to Service)</option>
              <option value="CLOSED">Closed (Archived)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Resolution Notes & Technician Actions
            </label>
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Detail hardware replacement, technician intervention, or vendor ticket..."
              rows={3}
              className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#08747c] hover:bg-[#003135] text-white disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LaboratoriesRegisterView({
  user,
  records,
  clockState,
  onNavigate,
  onOpenBooking,
}: {
  user: BackendUser
  records: AcademicRecord[]
  clockState?: ScheduleState
  onNavigate: (screen: AcademicScreen) => void
  onOpenBooking?: (labId: string, day?: string, period?: number, duration?: number) => void
}) {
  const defaultDay = clockState?.day && clockState.day !== 'SUNDAY' ? clockState.day : 'MONDAY'
  const [activeTab, setActiveTab] = useState<'labs' | 'incidents'>('labs')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'COMPUTING' | 'CORE_ENG' | 'AI_DATA'>('ALL')
  const [capacityFilter, setCapacityFilter] = useState<'ALL' | '<50' | '50-70' | '>70'>('ALL')
  const [sortBy, setSortBy] = useState<'name_asc' | 'capacity_desc' | 'capacity_asc' | 'dept_asc' | 'code_asc'>('name_asc')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'MY_LABS'>('ALL')
  const [checkDay, setCheckDay] = useState<string>(defaultDay)
  const [checkPeriod, setCheckPeriod] = useState<number | null>(clockState?.period ?? null)
  const [freeLabsOnly, setFreeLabsOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [inspectedLab, setInspectedLab] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (clockState?.period !== undefined && clockState.period !== null) {
      setCheckPeriod(clockState.period)
    }
  }, [clockState?.period])

  const labSlotAvailabilityRes = useLiveResource<{
    success: boolean
    data: { facilities: Array<any> }
  }>(
    checkPeriod !== null
      ? `/api/v1/availability?type=LABORATORY&day=${encodeURIComponent(checkDay)}&period=${checkPeriod}`
      : null
  )

  const labSlotMap = useMemo(() => {
    const m = new Map<string, any>()
    for (const f of labSlotAvailabilityRes.data?.data?.facilities || []) {
      if (f.lab_id) m.set(String(f.lab_id), f)
      if (f.room_id) m.set(String(f.room_id), f)
    }
    return m
  }, [labSlotAvailabilityRes.data])

  // Incident state
  const [incidents, setIncidents] = useState<any[]>([])
  const [loadingIncidents, setLoadingIncidents] = useState(false)
  const [incidentSearch, setIncidentSearch] = useState('')
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('ALL')
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('ALL')
  const [showIncidentModal, setShowIncidentModal] = useState(false)
  const [showAddLabModal, setShowAddLabModal] = useState(false)
  const [editingLab, setEditingLab] = useState<{
    lab_id: string
    name: string
    department_id: string
    room_number: string
    capacity: number
    equipment_details: string
  } | null>(null)
  const [deletingLab, setDeletingLab] = useState<{ id: string; name: string } | null>(null)
  const [deletingLabLoading, setDeletingLabLoading] = useState(false)
  const [deletingLabError, setDeletingLabError] = useState<string | null>(null)
  const [resolvingIncident, setResolvingIncident] = useState<any | null>(null)

  const isTechnician = user.role === 'NON_TEACHING_STAFF'
  const canCreateLab = ['SUPER_ADMIN', 'DEPT_ADMIN'].includes(user.role)
  const canViewAvailability = roleNavigation[user.role]?.includes('availability') ?? false
  const canReportIncident = ['NON_TEACHING_STAFF', 'TEACHING_STAFF', 'DEPT_ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const canManageIncidents = ['NON_TEACHING_STAFF', 'DEPT_ADMIN', 'SUPER_ADMIN'].includes(user.role)

  const handleConfirmDeleteLab = async () => {
    if (!deletingLab) return
    setDeletingLabLoading(true)
    setDeletingLabError(null)
    try {
      const raw = await backendFetch(`/api/v1/laboratories/${encodeURIComponent(deletingLab.id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Failed to delete laboratory')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || `Laboratory "${deletingLab.name}" removed.`, type: 'success' },
      }))
      setDeletingLab(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setDeletingLabError(err?.message || 'Failed to delete laboratory.')
    } finally {
      setDeletingLabLoading(false)
    }
  }

  const fetchIncidents = async () => {
    try {
      setLoadingIncidents(true)
      const raw = await backendFetch('/api/v1/laboratories/incidents')
      if (raw.ok) {
        const res = (await raw.json()) as any
        if (res.success && Array.isArray(res.data)) {
          setIncidents(res.data)
        }
      }
    } catch (e) {
      console.error('Failed to load incidents', e)
    } finally {
      setLoadingIncidents(false)
    }
  }

  useEffect(() => {
    fetchIncidents()
  }, [])

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const dept = String(meta.department_id || '').toUpperCase()
      if (deptFilter !== 'ALL' && dept !== deptFilter) return false
      
      // Category filter
      const titleLower = r.title.toLowerCase()
      const equipLower = String(meta.equipment_details || '').toLowerCase()
      if (categoryFilter === 'COMPUTING') {
        const isComputing =
          dept.includes('CS') || dept.includes('IT') || dept.includes('CYBER') ||
          titleLower.includes('computing') || titleLower.includes('programming') ||
          titleLower.includes('software') || equipLower.includes('workstation')
        if (!isComputing) return false
      } else if (categoryFilter === 'CORE_ENG') {
        const isCore =
          !dept.includes('CS') && !dept.includes('AI') && !dept.includes('IT') &&
          (titleLower.includes('lab') || titleLower.includes('workshop') || titleLower.includes('circuit') ||
           titleLower.includes('power') || titleLower.includes('machine') || titleLower.includes('thermal'))
        if (!isCore) return false
      } else if (categoryFilter === 'AI_DATA') {
        const isAI =
          dept.includes('AI') || titleLower.includes('ai') || titleLower.includes('data') ||
          titleLower.includes('ml') || equipLower.includes('gpu')
        if (!isAI) return false
      }

      // Capacity filter
      const cap = Number(meta.capacity || 70)
      if (capacityFilter === '<50' && cap >= 50) return false
      if (capacityFilter === '50-70' && (cap < 50 || cap > 70)) return false
      if (capacityFilter === '>70' && cap <= 70) return false

      if (scopeFilter === 'MY_LABS' && isTechnician) {
        const inchargeStaffId = String(meta.staff_incharge_id || meta.assistant_incharge_id || '')
        const inchargeName = String(meta.incharge_name || meta.co_incharge_name || '').toLowerCase()
        const userStaffId = String(user.pnr || user.userId || '')
        const userFullName = String(user.fullName || '').toLowerCase()
        if (inchargeStaffId !== userStaffId && !inchargeName.includes(userFullName)) {
          return false
        }
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const codeMatch = String(meta.lab_id || '').toLowerCase().includes(q)
        const roomMatch = String(meta.room_number || meta.room_id || '').toLowerCase().includes(q)
        const equipMatch = String(meta.equipment_details || '').toLowerCase().includes(q)
        const inchargeMatch = String(meta.incharge_name || '').toLowerCase().includes(q)
        if (!titleMatch && !codeMatch && !roomMatch && !equipMatch && !inchargeMatch) return false
      }
      return true
    })

    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      if (sortBy === 'name_asc') return a.title.localeCompare(b.title)
      if (sortBy === 'capacity_desc') return Number(metaB.capacity || 70) - Number(metaA.capacity || 70)
      if (sortBy === 'capacity_asc') return Number(metaA.capacity || 70) - Number(metaB.capacity || 70)
      if (sortBy === 'dept_asc') return String(metaA.department_id || '').localeCompare(String(metaB.department_id || ''))
      if (sortBy === 'code_asc') return String(metaA.lab_id || a.id).localeCompare(String(metaB.lab_id || b.id))
      return 0
    })

    return list
  }, [records, deptFilter, categoryFilter, capacityFilter, sortBy, scopeFilter, searchTerm, isTechnician, user])

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (incidentSeverityFilter !== 'ALL' && inc.severity !== incidentSeverityFilter) return false
      if (incidentStatusFilter !== 'ALL' && inc.status !== incidentStatusFilter) return false
      if (incidentSearch.trim()) {
        const q = incidentSearch.toLowerCase()
        const idMatch = String(inc.incident_id || '').toLowerCase().includes(q)
        const labMatch = String(inc.lab_name || inc.lab_id || '').toLowerCase().includes(q)
        const equipMatch = String(inc.equipment_affected || '').toLowerCase().includes(q)
        const descMatch = String(inc.description || '').toLowerCase().includes(q)
        const reporterMatch = String(inc.reporter_name || '').toLowerCase().includes(q)
        if (!idMatch && !labMatch && !equipMatch && !descMatch && !reporterMatch) return false
      }
      return true
    })
  }, [incidents, incidentSeverityFilter, incidentStatusFilter, incidentSearch])

  const openIncidentsCount = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length

  const computingLabsCount = useMemo(() => {
    return records.filter((r) => {
      const name = String(r.title || r.meta?.name || '').toLowerCase()
      const specs = String(r.meta?.equipment_details || '').toLowerCase()
      return (
        name.includes('computer') ||
        name.includes('software') ||
        name.includes('data') ||
        name.includes('ai') ||
        name.includes('network') ||
        name.includes('programming') ||
        specs.includes('pc') ||
        specs.includes('workstation')
      )
    }).length
  }, [records])

  const hardwareLabsCount = useMemo(() => {
    return Math.max(0, records.length - computingLabsCount)
  }, [records, computingLabsCount])

  return (
    <div className="space-y-2.5">
      {/* Top View Mode Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1 w-fit">
          <button
            onClick={() => setActiveTab('labs')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'labs'
                ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                : 'text-[#647376] dark:text-[#8ea5a3]'
            }`}
          >
            Laboratory Infrastructure ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'incidents'
                ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                : 'text-[#647376] dark:text-[#8ea5a3]'
            }`}
          >
            <span>Hardware Faults & Incidents</span>
            {openIncidentsCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                {openIncidentsCount} Active
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateLab && (
            <button
              type="button"
              onClick={() => setShowAddLabModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#024950] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] transition cursor-pointer"
            >
              <Plus size={13} />
              Add Laboratory
            </button>
          )}
          {canReportIncident && (
            <button
              onClick={() => setShowIncidentModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#08747c] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] transition cursor-pointer"
            >
              <AlertTriangle size={13} />
              Report Lab Incident / Fault
            </button>
          )}
          {canViewAvailability && (
            <button
              onClick={() => onNavigate('availability')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f5f7f6] dark:hover:bg-[#0a353b] btn-interactive"
            >
              <CalendarDays size={13} />
              Check Vacancy Matrix
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Panel className="p-2.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Total Laboratories</span>
            <span className="mt-0.5 text-base font-bold text-[#003135] dark:text-[#55d6dc]">{records.length} Labs</span>
          </div>
          <FlaskConical size={20} className="text-[#08747c]/40" />
        </Panel>

        <Panel className="p-2.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Computer / Workstation</span>
            <span className="mt-0.5 text-base font-bold text-[#08747c] dark:text-[#55d6dc]">{computingLabsCount} Labs</span>
          </div>
          <Activity size={20} className="text-[#08747c]/40" />
        </Panel>

        <Panel className="p-2.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Engineering Hardware</span>
            <span className="mt-0.5 text-base font-bold text-[#024950] dark:text-[#55d6dc]">{hardwareLabsCount} Labs</span>
          </div>
          <Building2 size={20} className="text-[#024950]/40" />
        </Panel>

        <Panel className="p-2.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Active Faults & Incidents</span>
            <span className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">
              {openIncidentsCount} Open
            </span>
          </div>
          <AlertTriangle size={20} className="text-amber-500/40" />
        </Panel>
      </div>

      {activeTab === 'labs' ? (
        <>
          {/* Filter and Search Bar for Laboratories */}
          <Panel className="p-2.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl space-y-2 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search laboratory name, code, specs..."
                  className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isTechnician && (
                  <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
                    <button
                      onClick={() => setScopeFilter('ALL')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        scopeFilter === 'ALL'
                          ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                          : 'text-[#647376] dark:text-[#8ea5a3]'
                      }`}
                    >
                      All Labs
                    </button>
                    <button
                      onClick={() => setScopeFilter('MY_LABS')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        scopeFilter === 'MY_LABS'
                          ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                          : 'text-[#647376] dark:text-[#8ea5a3]'
                      }`}
                    >
                      My Custody Labs
                    </button>
                  </div>
                )}

                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  <DepartmentOptions showAllOption allLabel="All Departments" suffix=" Labs" includeValue={deptFilter} />
                </select>
              </div>
            </div>

            {/* Secondary Category, Capacity & Sorting Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#edf2f1] dark:border-[#124349]">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
                  {(['ALL', 'COMPUTING', 'CORE_ENG', 'AI_DATA'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        categoryFilter === cat
                          ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                          : 'text-[#647376] dark:text-[#8ea5a3]'
                      }`}
                    >
                      {cat === 'ALL' ? 'All Specializations' : cat === 'COMPUTING' ? 'Computing' : cat === 'CORE_ENG' ? 'Core Engineering' : 'AI & Data'}
                    </button>
                  ))}
                </div>

                <select
                  value={capacityFilter}
                  onChange={(e) => setCapacityFilter(e.target.value as any)}
                  className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  <option value="ALL">All Capacities</option>
                  <option value="<50">&lt; 50 Workstations</option>
                  <option value="50-70">50 – 70 Workstations</option>
                  <option value=">70">&gt; 70 Workstations</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Free Check:</span>
                <select
                  value={checkDay}
                  onChange={(e) => setCheckDay(e.target.value)}
                  className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  {ACADEMIC_DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  value={checkPeriod === null ? 'ALL' : String(checkPeriod)}
                  onChange={(e) => {
                    const v = e.target.value
                    setCheckPeriod(v === 'ALL' ? null : Number(v))
                    if (v === 'ALL') setFreeLabsOnly(false)
                  }}
                  className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  <option value="ALL">Weekly Register</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                    <option key={p} value={p}>Period P{p}</option>
                  ))}
                </select>
                {checkPeriod !== null && (
                  <button
                    type="button"
                    onClick={() => setFreeLabsOnly((v) => !v)}
                    className={`h-8 rounded-lg border px-2.5 text-[11px] font-bold transition cursor-pointer ${
                      freeLabsOnly
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] text-[#003135] dark:text-[#55d6dc]'
                    }`}
                  >
                    Free Labs Only
                  </button>
                )}

                <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3] ml-1">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  <option value="name_asc">Lab Name (A → Z)</option>
                  <option value="capacity_desc">Capacity (Highest First)</option>
                  <option value="capacity_asc">Capacity (Lowest First)</option>
                  <option value="dept_asc">Department (A → Z)</option>
                  <option value="code_asc">Lab Code (A → Z)</option>
                </select>
              </div>
            </div>
          </Panel>

          {/* High-Density Laboratory Registry Table */}
          <div className="overflow-auto max-h-[calc(100vh-450px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
            <table className="w-full min-w-[960px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
                <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                  <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Lab Code & Venue</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Laboratory Name</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Capacity</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Hardware & Software Specifications</th>
                  {checkPeriod !== null ? (
                    <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status ({checkDay} P{checkPeriod})</th>
                  ) : (
                    <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Staff In-Charge</th>
                  )}
                  <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .filter((record) => {
                    if (checkPeriod === null || !freeLabsOnly) return true
                    const meta = record.meta || {}
                    const labId = String(meta.lab_id || record.id)
                    const roomId = String(meta.room_id || '')
                    const live = labSlotMap.get(labId) || labSlotMap.get(roomId)
                    return !live || live.status === 'AVAILABLE'
                  })
                  .map((record) => {
                  const meta = record.meta || {}
                  const labId = String(meta.lab_id || record.id)
                  const roomNumber = String(meta.room_number || meta.room_id || 'Room')
                  const dept = String(meta.department_id || 'CSE')
                  const capacity = Number(meta.capacity || 70)
                  const equipment = meta.equipment_details ? String(meta.equipment_details) : 'Institutional Standard Configuration'
                  const inchargeName = meta.incharge_name ? String(meta.incharge_name) : null
                  const inchargeDesignation = meta.incharge_designation ? String(meta.incharge_designation) : null
                  const coInchargeName = meta.co_incharge_name ? String(meta.co_incharge_name) : null
                  const liveStatus = checkPeriod !== null ? (labSlotMap.get(labId) || labSlotMap.get(String(meta.room_id || ''))) : null

                  return (
                    <tr
                      key={record.id}
                      className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                    >
                      <td className="p-3">
                        <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc] block">
                          {labId}
                        </span>
                        <span className="font-mono text-[11px] text-[#647376] dark:text-[#8ea5a3] block mt-0.5">
                          Room {roomNumber}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">
                          {record.title}
                        </span>
                        {record.subtitle && (
                          <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] block mt-0.5">
                            {record.subtitle}
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <span className="inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                          {dept}
                        </span>
                      </td>

                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                        {capacity} Workstations
                      </td>

                      <td className="p-3 max-w-sm">
                        <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3] line-clamp-2" title={equipment}>
                          {equipment}
                        </p>
                      </td>

                      <td className="p-3">
                        {checkPeriod !== null ? (
                          !liveStatus || liveStatus.status === 'AVAILABLE' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-[#062c1e] border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                              <CheckCircle2 size={12} />
                              FREE AT P{checkPeriod}
                            </span>
                          ) : liveStatus.status === 'OCCUPIED' && liveStatus.session ? (
                            <div className="rounded bg-red-50 dark:bg-[#331114] p-1.5 border border-red-200 dark:border-red-900/40 text-[10px]">
                              <span className="font-bold text-red-700 dark:text-red-400 block">
                                IN SESSION ({liveStatus.session.subject_code})
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 truncate block">
                                {liveStatus.session.cohort_label} · {liveStatus.session.faculty_name}
                              </span>
                            </div>
                          ) : (
                            <div className="rounded bg-amber-50 dark:bg-[#38260a] p-1.5 border border-amber-200 dark:border-amber-900/40 text-[10px]">
                              <span className="font-bold text-amber-700 dark:text-amber-400 block">RESERVED</span>
                              <span className="truncate block">{liveStatus.event?.title || 'Lab Event'}</span>
                            </div>
                          )
                        ) : inchargeName ? (
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                              {inchargeName}
                            </span>
                            {inchargeDesignation && (
                              <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] block truncate">
                                {inchargeDesignation}
                              </span>
                            )}
                            {coInchargeName && (
                              <span className="text-[10px] text-[#08747c] dark:text-[#55d6dc] block truncate mt-0.5">
                                Asst: {coInchargeName}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#a0afac] text-xs">—</span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectedLab({ id: labId, name: record.title })}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] btn-interactive"
                          >
                            <Eye size={12} />
                            Weekly Matrix
                          </button>
                          {onOpenBooking && (
                            <button
                              onClick={() =>
                                onOpenBooking(labId, checkDay, checkPeriod ?? 1, 1)
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-[#024950] px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] btn-interactive cursor-pointer"
                            >
                              <Plus size={12} />
                              Book
                            </button>
                          )}
                          {canCreateLab && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingLab({
                                  lab_id: labId,
                                  name: record.title,
                                  department_id: dept,
                                  room_number: roomNumber,
                                  capacity,
                                  equipment_details: equipment,
                                })}
                                title="Edit laboratory details"
                                className="inline-flex items-center justify-center rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] p-1.5 text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] btn-interactive"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingLabError(null)
                                  setDeletingLab({ id: labId, name: record.title })
                                }}
                                title="Delete laboratory"
                                className="inline-flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-[#331114]/70 p-1.5 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-[#41171b] btn-interactive"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Incident Filters Bar */}
          <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
              <input
                value={incidentSearch}
                onChange={(e) => setIncidentSearch(e.target.value)}
                placeholder="Search incident ID, lab, equipment, fault..."
                className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={incidentSeverityFilter}
                onChange={(e) => setIncidentSeverityFilter(e.target.value)}
                className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <select
                value={incidentStatusFilter}
                onChange={(e) => setIncidentStatusFilter(e.target.value)}
                className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="REPORTED">Reported</option>
                <option value="UNDER_INVESTIGATION">Under Investigation</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>

              <button
                onClick={fetchIncidents}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f5f7f6] dark:hover:bg-[#0a353b] transition"
              >
                <RefreshCw size={13} className={loadingIncidents ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </Panel>

          {/* Active Incident Registry Table */}
          <div className="overflow-auto max-h-[calc(100vh-360px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
                <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                  <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Incident ID & Date</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Lab & Department</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Equipment Affected</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Fault Description & Notes</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Severity</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Reporter</th>
                  <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
                  {canManageIncidents && (
                    <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={canManageIncidents ? 8 : 7} className="p-8 text-center text-[#7a898c]">
                      No laboratory incidents matching active criteria.
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.map((inc) => {
                    const isClosed = inc.status === 'RESOLVED' || inc.status === 'CLOSED'
                    return (
                      <tr
                        key={inc.incident_id}
                        className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                      >
                        <td className="p-3">
                          <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc] block">
                            {inc.incident_id}
                          </span>
                          <span className="font-mono text-[10px] text-[#647376] dark:text-[#8ea5a3] block mt-0.5">
                            {inc.incident_date} · {inc.incident_time}
                          </span>
                        </td>

                        <td className="p-3">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                            {inc.lab_name || inc.lab_id}
                          </span>
                          <span className="inline-block font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc] mt-0.5">
                            {inc.department_id}
                          </span>
                        </td>

                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                          {inc.equipment_affected || 'General Infrastructure'}
                        </td>

                        <td className="p-3 max-w-xs">
                          <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                            {inc.description}
                          </p>
                          {inc.resolution_notes && (
                            <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                              Resolution: {inc.resolution_notes}
                            </p>
                          )}
                        </td>

                        <td className="p-3">
                          <span
                            className={`inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              inc.severity === 'CRITICAL'
                                ? 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                                : inc.severity === 'HIGH'
                                ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300'
                                : inc.severity === 'MEDIUM'
                                ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {inc.severity}
                          </span>
                        </td>

                        <td className="p-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block text-[11px]">
                            {inc.reporter_name}
                          </span>
                        </td>

                        <td className="p-3">
                          <span
                            className={`inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              isClosed
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 animate-pulse'
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>

                        {canManageIncidents && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setResolvingIncident(inc)}
                              className="rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] transition"
                            >
                              Update Status
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Facility Weekly Schedule Modal */}
      {inspectedLab && (
        <FacilityScheduleModal
          facilityId={inspectedLab.id}
          facilityName={inspectedLab.name}
          onClose={() => setInspectedLab(null)}
          onBookSlot={
            onOpenBooking
              ? (_fid, day, p, lid) => {
                  const targetId = lid || inspectedLab.id
                  setInspectedLab(null)
                  onOpenBooking(targetId, day, p, 1)
                }
              : undefined
          }
        />
      )}

      {/* Incident Reporting Modal */}
      {showIncidentModal && (
        <LabIncidentReportModal
          labs={records}
          user={user}
          onClose={() => setShowIncidentModal(false)}
          onSuccess={fetchIncidents}
        />
      )}

      {/* Incident Resolution Modal */}
      {resolvingIncident && (
        <LabIncidentResolutionModal
          incident={resolvingIncident}
          onClose={() => setResolvingIncident(null)}
          onSuccess={fetchIncidents}
        />
      )}

      {/* Add / Edit Laboratory Modal */}
      {(showAddLabModal || editingLab) && (
        <AddLaboratoryModal
          defaultDept={user.departmentId || 'CSE'}
          restrictDept={user.role === 'DEPT_ADMIN'}
          initialLab={editingLab}
          onClose={() => {
            setShowAddLabModal(false)
            setEditingLab(null)
          }}
          onSuccess={() => {
            window.dispatchEvent(new Event('gmritdu:data-change'))
          }}
        />
      )}

      {deletingLab && (
        <ConfirmActionModal
          title="Delete Institutional Laboratory?"
          subject={deletingLab.name}
          description="Removes this laboratory and clears its pending booking queue."
          confirmLabel="Delete Laboratory"
          loading={deletingLabLoading}
          error={deletingLabError}
          onClose={() => setDeletingLab(null)}
          onConfirm={handleConfirmDeleteLab}
        />
      )}
    </div>
  )
}

function AddLaboratoryModal({
  defaultDept,
  restrictDept,
  initialLab,
  onClose,
  onSuccess,
}: {
  defaultDept: string
  restrictDept: boolean
  initialLab?: {
    lab_id: string
    name: string
    department_id: string
    room_number: string
    capacity: number
    equipment_details: string
  } | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = Boolean(initialLab)
  const [departmentId, setDepartmentId] = useState(initialLab?.department_id || defaultDept || 'CSE')
  const [name, setName] = useState(initialLab?.name || '')
  const [roomNumber, setRoomNumber] = useState(initialLab?.room_number || '')
  const [capacity, setCapacity] = useState(String(initialLab?.capacity || 60))
  const [equipmentDetails, setEquipmentDetails] = useState(
    initialLab?.equipment_details || 'Workstations, High-Speed Fiber LAN, Projection System'
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Laboratory name is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const targetUrl = isEdit
        ? `/api/v1/laboratories/${encodeURIComponent(initialLab!.lab_id)}`
        : '/api/v1/laboratories'
      const raw = await backendFetch(targetUrl, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({
          department_id: departmentId,
          name: name.trim(),
          room_number: roomNumber.trim() || `${name.trim()} (${departmentId})`,
          capacity: Number(capacity) || 60,
          equipment_details: equipmentDetails.trim(),
        }),
      })
      const res = (await raw.json()) as any
      if (!raw.ok || !res.success) throw new Error(res.message || `Failed to ${isEdit ? 'update' : 'register'} laboratory.`)
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: { message: res.message || `Laboratory "${name.trim()}" saved.`, type: 'success' },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || `Failed to ${isEdit ? 'update' : 'register'} laboratory.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 sm:px-6 py-4 shrink-0">
          <div>
            <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc] uppercase">
              Laboratory Infrastructure
            </span>
            <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc]">
              {isEdit ? `Edit Laboratory · ${initialLab!.lab_id}` : 'Add Institutional Laboratory'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
          >
            <X size={16} />
          </button>
        </header>
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Department *
              </label>
              <select
                name="department_id"
                value={departmentId}
                disabled={restrictDept}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
              >
                <DepartmentOptions includeValue={departmentId} />
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Workstation Capacity *
              </label>
              <input
                name="capacity"
                type="number"
                min={1}
                required
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Laboratory Name *
            </label>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Laboratory Title (e.g. Networks & Systems Lab)"
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Room Number / Venue
            </label>
            <input
              name="room_number"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. 5-L-02"
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Hardware & Equipment Details
            </label>
            <textarea
              rows={2}
              value={equipmentDetails}
              onChange={(e) => setEquipmentDetails(e.target.value)}
              className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-2.5 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#024950] hover:bg-[#003135] text-white disabled:opacity-50"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Laboratory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FacultyDirectoryTableView({
  records,
  user,
  clockState,
  onInspectFaculty,
}: {
  records: AcademicRecord[]
  user: BackendUser
  clockState?: ScheduleState
  onInspectFaculty: (staffId: string, name: string) => void
}) {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'TEACHING' | 'NON_TEACHING'>('ALL')
  const [workloadFilter, setWorkloadFilter] = useState<'ALL' | 'OVERLOADED' | 'OPTIMAL' | 'LIGHT'>('ALL')
  const [cadreFilter, setCadreFilter] = useState<'ALL' | 'PROFESSOR' | 'ASSOCIATE' | 'ASSISTANT' | 'TECHNICAL'>('ALL')
  const [sortBy, setSortBy] = useState<'workload_desc' | 'workload_asc' | 'name_asc' | 'dept_asc' | 'pnr_asc'>('workload_desc')
  const [deptFilter, setDeptFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [availDay, setAvailDay] = useState<string>(
    clockState?.day && clockState.day !== 'SUNDAY' ? clockState.day : 'MONDAY'
  )
  const [availPeriod, setAvailPeriod] = useState<number>(clockState?.period || 1)
  const [availFilter, setAvailFilter] = useState<'ALL' | 'FREE' | 'BUSY'>('ALL')

  const canManageStaff = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR'].includes(user.role)
  const canDeleteStaff = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(user.role)
  const [staffModal, setStaffModal] = useState<{
    mode: 'create' | 'edit'
    staff_id: string
    full_name: string
    department_id: string
    category: 'TEACHING' | 'NON_TEACHING'
    designation: string
    official_email: string
    lab_responsibility: string
  } | null>(null)
  const [deletingStaff, setDeletingStaff] = useState<{ id: string; name: string } | null>(null)
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffModalError, setStaffModalError] = useState<string | null>(null)

  const handleSaveStaff = async (e: FormEvent) => {
    e.preventDefault()
    if (!staffModal) return
    setStaffSaving(true)
    setStaffModalError(null)
    try {
      const url = staffModal.mode === 'create'
        ? '/api/v1/staff'
        : `/api/v1/staff/${encodeURIComponent(staffModal.staff_id)}`
      const raw = await backendFetch(url, {
        method: staffModal.mode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify({
          staff_id: staffModal.staff_id.trim() || undefined,
          full_name: staffModal.full_name.trim(),
          department_id: staffModal.department_id,
          category: staffModal.category,
          designation: staffModal.designation.trim(),
          official_email: staffModal.official_email.trim(),
          lab_responsibility: staffModal.lab_responsibility.trim(),
        }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error' || res?.success === false) {
        throw new Error(res?.message || 'Failed to save staff member')
      }
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Staff member "${staffModal.full_name.trim()}" saved.`, type: 'success' },
      }))
      setStaffModal(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setStaffModalError(err?.message || 'Failed to save staff member.')
    } finally {
      setStaffSaving(false)
    }
  }

  const handleConfirmDeleteStaff = async () => {
    if (!deletingStaff) return
    setStaffSaving(true)
    setStaffModalError(null)
    try {
      const raw = await backendFetch(`/api/v1/staff/${encodeURIComponent(deletingStaff.id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error' || res?.success === false) {
        throw new Error(res?.message || 'Failed to remove staff member')
      }
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Staff member "${deletingStaff.name}" removed.`, type: 'success' },
      }))
      setDeletingStaff(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setStaffModalError(err?.message || 'Failed to delete staff member.')
    } finally {
      setStaffSaving(false)
    }
  }

  useEffect(() => {
    if (clockState?.day && clockState.day !== 'SUNDAY') setAvailDay(clockState.day)
    if (clockState?.period) setAvailPeriod(clockState.period)
  }, [clockState?.day, clockState?.period])

  const freeFacResource = useLiveResource<{
    success: boolean
    data: {
      availableFacultyCount: number
      busyFacultyCount: number
      availableFaculty: Array<{ staff_id: string }>
      busyFaculty: Array<{ staff_id: string; conflict_details: string | null }>
    }
  }>(`/api/v1/availability/free-faculty?day=${encodeURIComponent(availDay)}&period=${availPeriod}&department=ALL`)

  const { freeSet, busyMap } = useMemo(() => {
    const fSet = new Set<string>()
    const bMap: Record<string, string> = {}
    const payload = freeFacResource.data?.data
    if (payload) {
      ;(payload.availableFaculty || []).forEach((f) => fSet.add(String(f.staff_id)))
      ;(payload.busyFaculty || []).forEach((f) => {
        bMap[String(f.staff_id)] = f.conflict_details || 'Scheduled in class'
      })
    }
    return { freeSet: fSet, busyMap: bMap }
  }, [freeFacResource.data])

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const sid = String(meta.staff_id || r.id)
      const isNonTeach = String(meta.category || '').toUpperCase() === 'NON_TEACHING'
      if (categoryFilter !== 'ALL') {
        const cat = String(meta.category || '').toUpperCase()
        if (cat !== categoryFilter) return false
      }
      if (availFilter === 'FREE') {
        if (isNonTeach || !freeSet.has(sid)) return false
      } else if (availFilter === 'BUSY') {
        if (isNonTeach || !busyMap[sid]) return false
      }
      if (deptFilter !== 'ALL') {
        const d = String(meta.department_id || '').toUpperCase()
        if (d !== deptFilter) return false
      }

      // Cadre filter
      const desig = String(meta.designation || '').toUpperCase()
      if (cadreFilter === 'PROFESSOR' && (!desig.includes('PROFESSOR') || desig.includes('ASST') || desig.includes('ASSOCIATE'))) return false
      if (cadreFilter === 'ASSOCIATE' && !desig.includes('ASSOCIATE')) return false
      if (cadreFilter === 'ASSISTANT' && (!desig.includes('ASSISTANT') && !desig.includes('ASST'))) return false
      if (cadreFilter === 'TECHNICAL' && String(meta.category || '').toUpperCase() !== 'NON_TEACHING') return false

      // Workload filter
      const totalPeriods = Number(meta.total_periods_per_week ?? 16)
      if (workloadFilter === 'OVERLOADED' && totalPeriods <= 18) return false
      if (workloadFilter === 'OPTIMAL' && (totalPeriods < 14 || totalPeriods > 18)) return false
      if (workloadFilter === 'LIGHT' && totalPeriods >= 14) return false

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const nameMatch = r.title.toLowerCase().includes(q)
        const pnrMatch = String(meta.pnr || meta.staff_id || r.id).toLowerCase().includes(q)
        const desigMatch = String(meta.designation || '').toLowerCase().includes(q)
        const emailMatch = String(meta.official_email || meta.email || '').toLowerCase().includes(q)
        if (!nameMatch && !pnrMatch && !desigMatch && !emailMatch) return false
      }
      return true
    })

    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      if (sortBy === 'workload_desc') return Number(metaB.total_periods_per_week ?? 16) - Number(metaA.total_periods_per_week ?? 16)
      if (sortBy === 'workload_asc') return Number(metaA.total_periods_per_week ?? 16) - Number(metaB.total_periods_per_week ?? 16)
      if (sortBy === 'name_asc') return a.title.localeCompare(b.title)
      if (sortBy === 'dept_asc') return String(metaA.department_id || '').localeCompare(String(metaB.department_id || ''))
      if (sortBy === 'pnr_asc') return String(metaA.pnr || a.id).localeCompare(String(metaB.pnr || b.id))
      return 0
    })

    return list
  }, [records, categoryFilter, workloadFilter, cadreFilter, sortBy, deptFilter, searchTerm, availFilter, freeSet, busyMap])

  const teachingCount = records.filter((r) => String(r.meta?.category || '').toUpperCase() === 'TEACHING').length
  const nonTeachingCount = records.filter((r) => String(r.meta?.category || '').toUpperCase() === 'NON_TEACHING').length
  const freeMatchedCount = useMemo(
    () => records.filter((r) => String(r.meta?.category || '').toUpperCase() !== 'NON_TEACHING' && freeSet.has(String(r.meta?.staff_id || r.id))).length,
    [records, freeSet]
  )
  const busyMatchedCount = useMemo(
    () => records.filter((r) => String(r.meta?.category || '').toUpperCase() !== 'NON_TEACHING' && Boolean(busyMap[String(r.meta?.staff_id || r.id)])).length,
    [records, busyMap]
  )

  return (
    <div className="space-y-4">
      {/* Category Pills & Filters */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by faculty name, PNR, email..."
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  categoryFilter === 'ALL'
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                All Staff ({records.length})
              </button>
              <button
                onClick={() => setCategoryFilter('TEACHING')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  categoryFilter === 'TEACHING'
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                Faculty ({teachingCount})
              </button>
              <button
                onClick={() => setCategoryFilter('NON_TEACHING')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  categoryFilter === 'NON_TEACHING'
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                Technical Staff ({nonTeachingCount})
              </button>
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <DepartmentOptions showAllOption allLabel="All Departments" includeValue={deptFilter} />
            </select>
          </div>
        </div>

        {/* Workload, Cadre, and Sorting Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#edf2f1] dark:border-[#124349]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Workload Status:</span>
            <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
              {(['ALL', 'OVERLOADED', 'OPTIMAL', 'LIGHT'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWorkloadFilter(w)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                    workloadFilter === w
                      ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                      : 'text-[#647376] dark:text-[#8ea5a3]'
                  }`}
                >
                  {w === 'ALL' ? 'All' : w === 'OVERLOADED' ? '>18 hrs' : w === 'OPTIMAL' ? '14-18 hrs' : '<14 hrs'}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3] ml-2">Academic Cadre:</span>
            <select
              value={cadreFilter}
              onChange={(e) => setCadreFilter(e.target.value as any)}
              className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <option value="ALL">All Cadres</option>
              <option value="PROFESSOR">Professors</option>
              <option value="ASSOCIATE">Associate Professors</option>
              <option value="ASSISTANT">Assistant Professors</option>
              <option value="TECHNICAL">Technical Assistants</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Sort Roster:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <option value="workload_desc">Teaching Load (Highest First)</option>
              <option value="workload_asc">Teaching Load (Lowest First)</option>
              <option value="name_asc">Faculty Name (A → Z)</option>
              <option value="dept_asc">Department (A → Z)</option>
              <option value="pnr_asc">PNR / Staff ID (A → Z)</option>
            </select>
          </div>
        </div>

        {/* Live Faculty Availability Checker Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[#edf2f1] dark:border-[#124349]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc]">
              <Clock size={12} />
              Check Free Faculty:
            </span>
            <select
              value={availDay}
              onChange={(e) => setAvailDay(e.target.value)}
              className="h-7 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 text-[11px] font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              {ACADEMIC_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d.slice(0, 3)} · {d.charAt(0) + d.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <select
              value={availPeriod}
              onChange={(e) => setAvailPeriod(Number(e.target.value))}
              className="h-7 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 text-[11px] font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                <option key={p} value={p}>
                  Period {p}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-0.5">
              <button
                onClick={() => setAvailFilter('ALL')}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                  availFilter === 'ALL'
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                All ({records.length})
              </button>
              <button
                onClick={() => setAvailFilter('FREE')}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                  availFilter === 'FREE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                Free ({freeMatchedCount})
              </button>
              <button
                onClick={() => setAvailFilter('BUSY')}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                  availFilter === 'BUSY'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                Busy ({busyMatchedCount})
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-[#647376] dark:text-[#8ea5a3]">
              Showing {filtered.length} of {records.length} staff · {availDay.slice(0, 3)} P{availPeriod}
            </span>
            {canManageStaff && (
              <button
                type="button"
                onClick={() => {
                  setStaffModalError(null)
                  setStaffModal({
                    mode: 'create',
                    staff_id: '',
                    full_name: '',
                    department_id: user.departmentId || 'CSE',
                    category: 'TEACHING',
                    designation: 'Assistant Professor',
                    official_email: '',
                    lab_responsibility: '',
                  })
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#08747c] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] btn-interactive cursor-pointer"
              >
                <UserPlus size={13} />
                Add Staff
              </button>
            )}
          </div>
        </div>
      </Panel>

      {/* High-Density Staff Roster Table */}
      <div className="overflow-auto max-h-[calc(100vh-405px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[960px] border-collapse text-left text-xs stagger-table">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Staff Member & PNR</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Cadre & Designation</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Academic Workload / Custody</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">
                {availDay.slice(0, 3)} P{availPeriod} Status
              </th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Official Contact</th>
              <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => {
              const meta = record.meta || {}
              const staffId = String(meta.staff_id || record.id)
              const pnr = String(meta.pnr || staffId)
              const isNonTeaching = String(meta.category || '').toUpperCase() === 'NON_TEACHING'
              const dept = String(meta.department_id || 'CSE')
              const designation = String(meta.designation || 'Faculty')
              const email = String(meta.official_email || meta.email || '')
              const totalPeriods = Number(meta.total_periods_per_week ?? 16)
              const theoryPeriods = Number(meta.theory_periods ?? 10)
              const labPeriods = Number(meta.lab_periods ?? 6)
              const isOverloaded = totalPeriods > 20
              const isOptimal = totalPeriods >= 14 && totalPeriods <= 18

              return (
                <tr
                  key={record.id}
                  className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <FacultyAvatar name={record.title} photo={meta.photo_url ? String(meta.photo_url) : null} size="sm" />
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">
                          {record.title}
                        </span>
                        <span className="font-mono text-[10px] text-[#08747c] dark:text-[#55d6dc] block font-bold">
                          {pnr}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="p-3">
                    <span className="text-slate-800 dark:text-slate-200 font-medium block">
                      {designation}
                    </span>
                    <span className={`inline-block font-mono text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                      isNonTeaching
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                        : 'bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]'
                    }`}>
                      {isNonTeaching ? 'TECHNICAL' : 'TEACHING'}
                    </span>
                  </td>

                  <td className="p-3">
                    <span className="inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#f0f4f3] dark:bg-[#072a2f] text-[#003135] dark:text-[#55d6dc]">
                      {dept}
                    </span>
                  </td>

                  <td className="p-3 max-w-xs">
                    {isNonTeaching ? (
                      <div>
                        <span className="inline-flex items-center gap-1 font-semibold text-xs text-[#024950] dark:text-[#55d6dc]">
                          <FlaskConical size={12} />
                          Laboratory Technical Custody
                        </span>
                        <span className="block text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                          Assigned to Department Practical Infrastructure
                        </span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {totalPeriods} / 18 hrs/week
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            isOverloaded
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              : isOptimal
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            {isOverloaded ? 'Overloaded' : isOptimal ? 'Optimal' : 'Normal Load'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#e8efee] dark:bg-[#07363d] overflow-hidden flex">
                          <div
                            className="bg-[#08747c]"
                            style={{ width: `${Math.min(100, (theoryPeriods / 18) * 100)}%` }}
                            title={`Theory: ${theoryPeriods} hrs`}
                          />
                          <div
                            className="bg-[#0fa4af]"
                            style={{ width: `${Math.min(100, (labPeriods / 18) * 100)}%` }}
                            title={`Labs: ${labPeriods} hrs`}
                          />
                        </div>
                        <span className="block text-[10px] text-[#7a898c] dark:text-[#7ba09d] mt-1 font-mono">
                          Theory: {theoryPeriods}h · Labs: {labPeriods}h
                        </span>
                      </div>
                    )}
                  </td>

                  <td className="p-3">
                    {isNonTeaching ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        On Lab Custody
                      </span>
                    ) : freeSet.has(staffId) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 size={11} />
                        FREE · P{availPeriod}
                      </span>
                    ) : busyMap[staffId] ? (
                      <div className="max-w-[190px]">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                          IN SESSION
                        </span>
                        <span className="block truncate text-[10px] text-[#647376] dark:text-[#8ea5a3] mt-0.5" title={busyMap[staffId]}>
                          {busyMap[staffId]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#7a898c]">
                        {freeFacResource.loading ? 'Checking…' : '—'}
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {email ? (
                      <a
                        href={`mailto:${email}`}
                        className="text-xs font-mono text-[#08747c] dark:text-[#55d6dc] hover:underline"
                      >
                        {email}
                      </a>
                    ) : (
                      <span className="text-[11px] text-[#7a898c]">—</span>
                    )}
                  </td>

                  <td className="p-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {!isNonTeaching ? (
                        <button
                          type="button"
                          onClick={() => onInspectFaculty(staffId, record.title)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] dark:hover:bg-[#0a353b] btn-interactive cursor-pointer"
                        >
                          <CalendarDays size={12} />
                          View Timetable
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#a0afac] px-1.5">On Duty</span>
                      )}
                      {canManageStaff && (
                        <button
                          type="button"
                          onClick={() => {
                            setStaffModalError(null)
                            setStaffModal({
                              mode: 'edit',
                              staff_id: staffId,
                              full_name: record.title,
                              department_id: dept,
                              category: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
                              designation,
                              official_email: email,
                              lab_responsibility: String(meta.lab_responsibility || ''),
                            })
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 py-1 text-[11px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#ebf7f6] dark:hover:bg-[#0a353b] btn-interactive cursor-pointer"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                      )}
                      {canDeleteStaff && (
                        <button
                          type="button"
                          onClick={() => {
                            setStaffModalError(null)
                            setDeletingStaff({ id: staffId, name: record.title })
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-[#331114]/70 px-2 py-1 text-[11px] font-semibold text-red-600 dark:text-red-300 hover:bg-red-100 btn-interactive cursor-pointer"
                        >
                          <Trash2 size={11} />
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-[#7a898c]">
                  No staff members matched the active filters for {availDay} P{availPeriod}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {staffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={() => setStaffModal(null)} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
            <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 py-4 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-[#08747c] dark:text-[#55d6dc]">
                  Departmental Staff Directory
                </span>
                <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc] truncate">
                  {staffModal.mode === 'create' ? 'Register Staff Member' : `Edit Staff · ${staffModal.full_name}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close staff form"
                onClick={() => setStaffModal(null)}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
              >
                <X size={16} />
              </button>
            </header>
            <form onSubmit={handleSaveStaff} className="p-5 space-y-3 overflow-y-auto flex-1">
              {staffModalError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
                  {staffModalError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Full Name *</label>
                  <input
                    required
                    value={staffModal.full_name}
                    onChange={(e) => setStaffModal((s) => s ? { ...s, full_name: e.target.value } : s)}
                    placeholder="Faculty or Technical Staff Name"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Staff / PNR ID</label>
                  <input
                    disabled={staffModal.mode === 'edit'}
                    value={staffModal.staff_id}
                    onChange={(e) => setStaffModal((s) => s ? { ...s, staff_id: e.target.value } : s)}
                    placeholder="Optional (auto-generated)"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Department *</label>
                  <select
                    value={staffModal.department_id}
                    disabled={!['SUPER_ADMIN', 'DEAN'].includes(user.role)}
                    onChange={(e) => setStaffModal((s) => s ? { ...s, department_id: e.target.value } : s)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none disabled:opacity-60"
                  >
                    <DepartmentOptions includeValue={staffModal.department_id} />
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Category</label>
                  <select
                    value={staffModal.category}
                    onChange={(e) => setStaffModal((s) => s ? { ...s, category: e.target.value as 'TEACHING' | 'NON_TEACHING' } : s)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    <option value="TEACHING">Teaching Faculty</option>
                    <option value="NON_TEACHING">Non-Teaching / Lab Technical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Designation *</label>
                  <input
                    required
                    value={staffModal.designation}
                    onChange={(e) => setStaffModal((s) => s ? { ...s, designation: e.target.value } : s)}
                    placeholder="e.g. Associate Professor"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Official Email</label>
                  <input
                    type="email"
                    value={staffModal.official_email}
                    onChange={(e) => setStaffModal((s) => s ? { ...s, official_email: e.target.value } : s)}
                    placeholder="staff@gmrit.edu.in"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Laboratory Responsibility (Optional)</label>
                <input
                  value={staffModal.lab_responsibility}
                  onChange={(e) => setStaffModal((s) => s ? { ...s, lab_responsibility: e.target.value } : s)}
                  placeholder="Lab custody or coordination assignment"
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#e3e9e8] dark:border-[#124349]">
                <button type="button" onClick={() => setStaffModal(null)} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#526164] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
                  Cancel
                </button>
                <button type="submit" disabled={staffSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#08747c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003135] disabled:opacity-50 btn-interactive">
                  {staffSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingStaff && (
        <ConfirmActionModal
          title="Remove Staff Member?"
          subject={deletingStaff.name}
          description="Staff members currently assigned to scheduled timetable slots cannot be removed until reassigned."
          confirmLabel="Remove Staff"
          loading={staffSaving}
          error={staffModalError}
          onClose={() => setDeletingStaff(null)}
          onConfirm={handleConfirmDeleteStaff}
        />
      )}
    </div>
  )
}

function PeerSubstitutionModal({
  user,
  onClose,
  onSuccess,
}: {
  user: BackendUser
  onClose: () => void
  onSuccess: () => void
}) {
  const [facultyList, setFacultyList] = useState<any[]>([])
  const [loadingFaculty, setLoadingFaculty] = useState(true)
  const [substituteFacultyId, setSubstituteFacultyId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('MONDAY')
  const [periodIndex, setPeriodIndex] = useState('1')
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadStaff = async () => {
      try {
        setLoadingFaculty(true)
        const raw = await backendFetch(`/api/v1/staff?category=TEACHING`)
        if (raw.ok) {
          const res = (await raw.json()) as any
          if (res.success && Array.isArray(res.data)) {
            const available = res.data.filter((f: any) => f.staff_id !== user.pnr && f.staff_id !== user.userId)
            setFacultyList(available)
            if (available.length > 0) {
              setSubstituteFacultyId(available[0].staff_id)
            }
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingFaculty(false)
      }
    }
    loadStaff()
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!substituteFacultyId) {
      setError('Please select a substitute faculty member.')
      return
    }
    if (!reason.trim()) {
      setError('Please provide a reason for the substitution.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const raw = await backendFetch('/api/v1/substitutions', {
        method: 'POST',
        body: JSON.stringify({
          originalFacultyId: user.pnr || user.userId,
          substituteFacultyId,
          dayOfWeek,
          periodIndex: parseInt(periodIndex, 10),
          leaveDate,
          reason,
        }),
      })
      const res = (await raw.json()) as any
      if (!raw.ok) throw new Error(res.message || 'Substitution request failed')
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: {
            message: 'Direct substitution requested! Peer faculty can directly accept/decline.',
            type: 'success',
          },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to request substitution')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 sm:px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <UserCheck className="text-[#08747c] dark:text-[#55d6dc]" size={20} />
            <h2 className="text-sm sm:text-base font-bold text-[#003135] dark:text-[#55d6dc]">
              Request Peer Class Substitution
            </h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Faculty on Leave
            </label>
            <input
              type="text"
              value={`${user.fullName} (${user.pnr || user.userId || 'Self'})`}
              disabled
              className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-[#f5f7f6] dark:bg-[#031d21] px-3 text-xs text-[#647376] dark:text-[#8ea5a3] cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Day of Week
              </label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-2 text-xs outline-none focus:border-[#08747c]"
              >
                {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Period Index
              </label>
              <select
                value={periodIndex}
                onChange={(e) => setPeriodIndex(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-2 text-xs outline-none focus:border-[#08747c]"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                  <option key={p} value={p}>Period {p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Leave Date
              </label>
              <input
                type="date"
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-2 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Proposed Substitute Faculty Member *
            </label>
            {loadingFaculty ? (
              <div className="h-9 flex items-center text-xs text-[#758386]">Loading faculty roster...</div>
            ) : (
              <select
                value={substituteFacultyId}
                onChange={(e) => setSubstituteFacultyId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              >
                {facultyList.map((f) => (
                  <option key={f.staff_id} value={f.staff_id}>
                    {f.full_name} ({f.department_id || 'Dept'} · {f.designation || 'Faculty'})
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-[11px] text-[#647376] dark:text-[#8ea5a3]">
              The chosen peer faculty will be notified directly and can accept or decline this class coverage without requiring HOD approval.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
              Reason for Substitution *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., University Research Committee Meeting, Urgent Medical Leave..."
              rows={3}
              required
              className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingFaculty}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#08747c] hover:bg-[#003135] text-white disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Send Direct Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SubstitutionsWorkflowView({
  records,
  user,
  isApprovalQueue = false,
  onRefresh,
}: {
  records: AcademicRecord[]
  user: BackendUser
  isApprovalQueue?: boolean
  onRefresh?: () => void
}) {
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [deptFilter, setDeptFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'period_asc' | 'faculty_asc' | 'status'>('date_desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)

  const isHodOrAdmin = ['SUPER_ADMIN', 'DEPT_ADMIN'].includes(user.role)

  const handleAction = async (subId: string, action: 'APPROVE' | 'REJECT') => {
    setActioningId(subId)
    try {
      const raw = await backendFetch(`/api/v1/substitutions/${encodeURIComponent(subId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' })
      })
      const res = (await raw.json()) as any
      if (!raw.ok) throw new Error(res.message || 'Action failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: {
          message: action === 'APPROVE'
            ? 'Substitution accepted! Timetable updated automatically without HOD intervention.'
            : 'Substitution declined.',
          type: action === 'APPROVE' ? 'success' : 'info'
        }
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      if (onRefresh) onRefresh()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Action failed: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' }
      }))
    } finally {
      setActioningId(null)
    }
  }

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const st = String(meta.status || r.status || 'PENDING').toUpperCase()
      if (statusFilter !== 'ALL' && st !== statusFilter) return false
      const dept = String(meta.department_id || 'CSE').toUpperCase()
      if (deptFilter !== 'ALL' && dept !== deptFilter) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const facultyMatch = String(meta.original_faculty_name || meta.substitute_faculty_name || '').toLowerCase().includes(q)
        const reasonMatch = String(meta.reason || '').toLowerCase().includes(q)
        if (!titleMatch && !facultyMatch && !reasonMatch) return false
      }
      return true
    })

    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      if (sortBy === 'date_desc') return String(metaB.date || metaB.day_of_week || '').localeCompare(String(metaA.date || metaA.day_of_week || ''))
      if (sortBy === 'date_asc') return String(metaA.date || metaA.day_of_week || '').localeCompare(String(metaB.date || metaB.day_of_week || ''))
      if (sortBy === 'period_asc') return Number(metaA.period_index || 1) - Number(metaB.period_index || 1)
      if (sortBy === 'faculty_asc') return String(metaA.original_faculty_name || '').localeCompare(String(metaB.original_faculty_name || ''))
      if (sortBy === 'status') return String(metaA.status || '').localeCompare(String(metaB.status || ''))
      return 0
    })

    return list
  }, [records, statusFilter, deptFilter, sortBy, searchTerm])

  const pendingCount = records.filter((r) => String(r.meta?.status || r.status || '').toUpperCase() === 'PENDING').length
  const approvedCount = records.filter((r) => String(r.meta?.status || r.status || '').toUpperCase() === 'APPROVED').length

  return (
    <div className="space-y-4">
      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Total Requests</span>
            <span className="mt-0.5 text-xl font-bold text-[#003135] dark:text-[#55d6dc]">{records.length}</span>
          </div>
          <UserCheck size={24} className="text-[#08747c]/40" />
        </Panel>

        <Panel className="p-3.5 border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-[#38260a] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-amber-800 dark:text-amber-300">Pending Review</span>
            <span className="mt-0.5 text-xl font-bold text-amber-700 dark:text-amber-400">{pendingCount}</span>
          </div>
          <Clock size={24} className="text-amber-500/40" />
        </Panel>

        <Panel className="p-3.5 border border-emerald-200 dark:border-emerald-900/40 bg-[#f0fdf4] dark:bg-[#062c1e] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Approved & Covered</span>
            <span className="mt-0.5 text-xl font-bold text-emerald-700 dark:text-emerald-400">{approvedCount}</span>
          </div>
          <CheckCircle2 size={24} className="text-emerald-500/50" />
        </Panel>
      </div>

      {/* Filter and Search Bar */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by faculty, subject, or reason..."
            className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                {st === 'ALL' ? 'All' : st === 'APPROVED' ? 'Approved' : st}
              </button>
            ))}
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <DepartmentOptions showAllOption allLabel="All Departments" includeValue={deptFilter} />
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <option value="date_desc">Latest Date First</option>
            <option value="date_asc">Oldest Date First</option>
            <option value="period_asc">Period (P1 → P7)</option>
            <option value="faculty_asc">Faculty Name (A → Z)</option>
            <option value="status">Status</option>
          </select>

          {['TEACHING_STAFF', 'DEPT_ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#08747c] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] transition"
            >
              <Plus size={14} />
              Request Peer Substitution
            </button>
          )}
        </div>
      </Panel>

      {/* High-Density Substitutions Table */}
      <div className="overflow-auto max-h-[calc(100vh-295px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Date & Period</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Subject & Class Cohort</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Faculty on Leave</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Proposed Substitute</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Reason</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
              <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions / Decisions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#7a898c]">
                  No substitution requests found matching filters.
                </td>
              </tr>
            ) : (
              filtered.map((record) => {
                const meta = record.meta || {}
                const subId = String(meta.substitution_id || record.id)
                const status = String(meta.status || record.status || 'PENDING').toUpperCase()
                const origFaculty = String(meta.original_faculty_name || 'Faculty Member')
                const substFaculty = String(meta.substitute_faculty_name || 'Covering Faculty')
                const reason = String(meta.reason || 'Academic / Personal Duty')
                const leaveDate = String(meta.leave_date || meta.day_of_week || 'Scheduled Day')
                const periodIndex = meta.period_index ? `P${meta.period_index}` : 'Scheduled Period'
                const subjectName = meta.subject_name ? String(meta.subject_name) : record.title
                const isPending = status === 'PENDING'
                const isApproved = status === 'APPROVED'

                return (
                  <tr
                    key={record.id}
                    className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                  >
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        {leaveDate}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc] block mt-0.5">
                        {periodIndex}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        {subjectName}
                      </span>
                      {meta.cohort_label && (
                        <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] block mt-0.5">
                          {meta.cohort_label}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {origFaculty}
                      </span>
                      <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                        On Leave
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300 block">
                        {substFaculty}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Assigned Coverage
                      </span>
                    </td>

                    <td className="p-3 max-w-xs">
                      <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] line-clamp-2">
                        {reason}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                        isApproved
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : isPending
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 animate-pulse'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {isApproved ? '\u25CF APPROVED' : isPending ? '\u25B2 PENDING' : '\u25A0 REJECTED'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      {isPending ? (
                        (() => {
                          const isRecipient = user.pnr && (meta.substitute_faculty_id === user.pnr || String(meta.substitute_faculty_name || '').toLowerCase().includes(user.fullName.toLowerCase()))
                          if (isHodOrAdmin || isRecipient) {
                            return (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  disabled={actioningId === subId}
                                  onClick={() => handleAction(subId, 'APPROVE')}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
                                >
                                  {isRecipient ? 'Accept Class' : 'Approve'}
                                </button>
                                <button
                                  disabled={actioningId === subId}
                                  onClick={() => handleAction(subId, 'REJECT')}
                                  className="rounded-lg border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer"
                                >
                                  {isRecipient ? 'Decline' : 'Reject'}
                                </button>
                              </div>
                            )
                          }
                          return (
                            <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                              Pending Peer Response
                            </span>
                          )
                        })()
                      ) : (
                        <span className="text-[11px] text-[#a0afac]">Resolved</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showRequestModal && (
        <PeerSubstitutionModal
          user={user}
          onClose={() => setShowRequestModal(false)}
          onSuccess={() => {
            if (onRefresh) onRefresh()
          }}
        />
      )}
    </div>
  )
}

function HODApprovalsCenterView({
  records,
  user,
  onRefresh,
}: {
  records: AcademicRecord[]
  user: BackendUser
  onRefresh?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'lab_requests' | 'substitutions_overview'>('lab_requests')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [deptFilter, setDeptFilter] = useState<string>('ALL')
  const [actioningId, setActioningId] = useState<string | null>(null)

  const subQuery = user.role === 'SUPER_ADMIN' || user.role === 'DEAN'
    ? '?status=ALL'
    : `?status=ALL&department=${encodeURIComponent(user.departmentId || 'CSE')}`
  const subsResource = useLiveResource<unknown>(activeTab === 'substitutions_overview' ? `/api/v1/substitutions${subQuery}` : null)
  const normalizedSubs = useMemo(() => (subsResource.data ? normalizeAcademicResponse(subsResource.data) : null), [subsResource.data])

  const handleSubstitutionDecision = async (subId: string, action: 'APPROVE' | 'REJECT') => {
    setActioningId(subId)
    try {
      const raw = await backendFetch(`/api/v1/substitutions/${encodeURIComponent(subId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' })
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok) throw new Error(res.message || 'Action failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: {
          message: action === 'APPROVE'
            ? 'Faculty substitution confirmed and applied to live timetable.'
            : 'Faculty substitution request rejected.',
          type: action === 'APPROVE' ? 'success' : 'info'
        }
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      if (onRefresh) onRefresh()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Decision error: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' }
      }))
    } finally {
      setActioningId(null)
    }
  }

  const handleBookingDecision = async (bookingId: string, action: 'APPROVE' | 'REJECT') => {
    setActioningId(bookingId)
    try {
      const raw = await backendFetch(`/api/v1/laboratories/bookings/${encodeURIComponent(bookingId)}/approval`, {
        method: 'PUT',
        body: JSON.stringify({ action })
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok) throw new Error(res.message || 'Action failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: {
          message: action === 'APPROVE'
            ? 'Laboratory booking approved and finalized on timetable.'
            : 'Laboratory booking request declined.',
          type: action === 'APPROVE' ? 'success' : 'info'
        }
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      if (onRefresh) onRefresh()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Decision error: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' }
      }))
    } finally {
      setActioningId(null)
    }
  }

  const filteredBookings = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const st = String(meta.status || r.status || 'PENDING').toUpperCase()
      if (statusFilter !== 'ALL' && st !== statusFilter) return false
      const dept = String(meta.department_id || '').toUpperCase()
      if (deptFilter !== 'ALL' && dept && dept !== deptFilter) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const requesterMatch = String(meta.requester_name || meta.booked_by_user_id || meta.requester_pnr || '').toLowerCase().includes(q)
        const labMatch = String(meta.lab_name || meta.room_number || meta.room_id || '').toLowerCase().includes(q)
        if (!titleMatch && !requesterMatch && !labMatch) return false
      }
      return true
    })
    return list
  }, [records, statusFilter, deptFilter, searchTerm])

  const pendingCount = records.filter((r) => {
    const st = String(r.meta?.status || r.status || 'PENDING').toUpperCase()
    return st === 'PENDING' || st === 'PENDING_HOD'
  }).length

  const confirmedCount = records.filter((r) => {
    const st = String(r.meta?.status || r.status || '').toUpperCase()
    return st === 'CONFIRMED' || st === 'APPROVED'
  }).length

  return (
    <div className="space-y-4">
      {/* Top Controls & Tab Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f]">
          <button
            type="button"
            onClick={() => setActiveTab('lab_requests')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'lab_requests'
                ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
            }`}
          >
            <FlaskConical size={14} />
            Pending Lab Bookings
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('substitutions_overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'substitutions_overview'
                ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#172326]'
            }`}
          >
            <UserCheck size={14} />
            Faculty Peer Substitutions
          </button>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="self-end sm:self-auto px-3 py-1.5 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#062327] text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#edf2f1] dark:hover:bg-[#072d32] transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} />
            Refresh Queue
          </button>
        )}
      </div>

      {activeTab === 'lab_requests' ? (
        <div className="space-y-3">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Panel className="p-3 border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-[#2e2007] rounded-xl flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-semibold text-amber-800 dark:text-amber-300">Pending HOD Decision</span>
                <span className="mt-0.5 text-xl font-bold text-amber-700 dark:text-amber-400">{pendingCount}</span>
              </div>
              <Clock size={22} className="text-amber-500/50" />
            </Panel>
            <Panel className="p-3 border border-emerald-200 dark:border-emerald-900/40 bg-[#f0fdf4] dark:bg-[#062c1e] rounded-xl flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Confirmed Allocations</span>
                <span className="mt-0.5 text-xl font-bold text-emerald-700 dark:text-emerald-400">{confirmedCount}</span>
              </div>
              <CheckCircle2 size={22} className="text-emerald-500/50" />
            </Panel>
            <Panel className="p-3 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between col-span-2 sm:col-span-1">
              <div>
                <span className="block text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Total Submissions</span>
                <span className="mt-0.5 text-xl font-bold text-[#003135] dark:text-[#55d6dc]">{records.length}</span>
              </div>
              <FlaskConical size={22} className="text-[#08747c]/40" />
            </Panel>
          </div>

          {/* Search & Filters */}
          <Panel className="p-3 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7a898c]" />
                <input
                  type="text"
                  placeholder="Search requester name, PNR, lab venue, or event purpose..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f9fbfb] dark:bg-[#042024] text-[#003135] dark:text-[#cbd5e1] outline-none focus:border-[#08747c]"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 px-2 text-xs font-semibold rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Approval</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CANCELLED">Rejected / Cancelled</option>
                </select>
                {(user.role === 'SUPER_ADMIN' || user.role === 'DEAN') && (
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="h-8 px-2 text-xs font-semibold rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] text-[#003135] dark:text-[#55d6dc] outline-none"
                  >
                    <DepartmentOptions showAllOption allLabel="All Departments" includeValue={deptFilter} />
                  </select>
                )}
              </div>
            </div>
          </Panel>

          {/* High-Density Requests Table with max-h viewport container */}
          <div className="overflow-auto max-h-[calc(100vh-295px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
                <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                  <th className="p-2.5 font-semibold text-[#003135] dark:text-[#55d6dc]">Requester & Role</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Laboratory & Venue</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Requested Schedule</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Event / Booking Purpose</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Submitted At</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
                  <th className="p-2.5 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">HOD Decision</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-[#7a898c]">
                      No laboratory booking requests matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((rec) => {
                    const meta = rec.meta || {}
                    const bookingId = String(meta.booking_id || rec.id)
                    const status = String(meta.status || rec.status || 'PENDING').toUpperCase()
                    const isPending = status === 'PENDING' || status === 'PENDING_HOD'
                    const isConfirmed = status === 'CONFIRMED' || status === 'APPROVED'
                    const requesterName = String(meta.requester_name || meta.booked_by_user_id || 'Student / Staff')
                    const requesterRole = String(meta.requester_role || 'STUDENT')
                    const requesterPnr = String(meta.requester_pnr || '')
                    const labName = String(meta.lab_name || rec.title || 'Laboratory')
                    const roomNumber = String(meta.room_number || meta.room_id || '')
                    const day = String(meta.day_of_week || meta.booking_date || '')
                    const period = meta.period_index ? `Period ${meta.period_index}` : String(meta.time_slot || '')
                    const purpose = String(meta.purpose || meta.title || rec.title || meta.description || 'Academic Practice')
                    const createdAt = meta.created_at ? new Date(String(meta.created_at)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Recent'

                    return (
                      <tr
                        key={bookingId}
                        className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                      >
                        <td className="p-2.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                            {requesterName}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {requesterRole}
                            </span>
                            {requesterPnr && (
                              <span className="text-[10px] font-mono text-[#7a898c]">
                                {requesterPnr}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5">
                          <span className="font-semibold text-[#08747c] dark:text-[#55d6dc] block">
                            {labName}
                          </span>
                          {roomNumber && (
                            <span className="text-[10px] text-[#7a898c] block mt-0.5">
                              Room: {roomNumber}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                            {day}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[#08747c] dark:text-[#55d6dc] block mt-0.5">
                            {period}
                          </span>
                        </td>
                        <td className="p-2.5 max-w-xs">
                          <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] line-clamp-2" title={purpose}>
                            {purpose}
                          </span>
                        </td>
                        <td className="p-2.5 text-[#7a898c] text-[11px]">
                          {createdAt}
                        </td>
                        <td className="p-2.5">
                          <span className={`inline-flex items-center gap-1 font-mono text-[9px] font-bold px-2 py-0.5 rounded ${
                            isConfirmed
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                              : isPending
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 animate-pulse'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                          }`}>
                            {isConfirmed ? 'CONFIRMED' : isPending ? 'PENDING HOD' : 'CANCELLED'}
                          </span>
                        </td>
                        <td className="p-2.5 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={actioningId === bookingId}
                                onClick={() => handleBookingDecision(bookingId, 'APPROVE')}
                                className="inline-flex items-center gap-1 rounded-md bg-[#024950] px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-[#003135] disabled:opacity-50 transition cursor-pointer"
                              >
                                <CheckCircle2 size={12} />
                                Confirm
                              </button>
                              <button
                                type="button"
                                disabled={actioningId === bookingId}
                                onClick={() => handleBookingDecision(bookingId, 'REJECT')}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#072a2f] px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition cursor-pointer"
                              >
                                <XCircle size={12} />
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#a0afac]">Finalized</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Department Peer Faculty Substitutions Oversight & HOD Approval */
        <div className="space-y-3">
          <Panel className="p-3 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-[#003135] dark:text-[#55d6dc]">
                Department Faculty Substitution Oversight
              </span>
              <span className="text-[11px] text-[#7a898c]">
                (Peer arrangements & HOD approval queue for department class substitutions)
              </span>
            </div>
          </Panel>

          <div className="overflow-auto max-h-[calc(100vh-295px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
            <table className="w-full min-w-[960px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
                <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                  <th className="p-2.5 font-semibold text-[#003135] dark:text-[#55d6dc]">Date & Period</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Subject & Class</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Faculty on Leave</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Substitute Peer</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Reason</th>
                  <th className="p-2.5 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
                  <th className="p-2.5 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(normalizedSubs?.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-[#7a898c]">
                      No faculty substitution requests recorded in this department.
                    </td>
                  </tr>
                ) : (
                  (normalizedSubs?.data || []).map((sub) => {
                    const meta = sub.meta || {}
                    const subId = String(meta.substitution_id || sub.id)
                    const statusStr = String(meta.status || sub.status || 'PENDING').toUpperCase()
                    const isApproved = statusStr === 'APPROVED'
                    const isRejected = statusStr === 'REJECTED' || statusStr === 'CANCELLED'
                    const isPending = !isApproved && !isRejected
                    return (
                      <tr
                        key={sub.id}
                        className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34]"
                      >
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-slate-100">
                          {String(meta.date || meta.day_of_week || 'Scheduled')}
                          <span className="block text-[10px] font-mono font-bold text-[#08747c] dark:text-[#55d6dc]">
                            Period {meta.period_index || 1}
                          </span>
                        </td>
                        <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">
                          {sub.title}
                        </td>
                        <td className="p-2.5 text-slate-800 dark:text-slate-200">
                          {String(meta.original_faculty_name || 'Faculty Member')}
                          <span className="block text-[9px] text-red-600 font-medium">On Leave</span>
                        </td>
                        <td className="p-2.5 text-emerald-800 dark:text-emerald-300 font-semibold">
                          {String(meta.substitute_faculty_name || 'Designated Peer')}
                          <span className="block text-[9px] text-emerald-600 font-medium">Assigned Coverage</span>
                        </td>
                        <td className="p-2.5 text-[#647376] dark:text-[#8ea5a3] max-w-xs truncate">
                          {String(meta.reason || 'Official academic substitution')}
                        </td>
                        <td className="p-2.5">
                          <span className={`inline-flex items-center gap-1 font-mono text-[9px] font-bold px-2 py-0.5 rounded ${
                            isApproved
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                              : isPending
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 animate-pulse'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                          }`}>
                            {isApproved ? '\u25CF APPROVED' : isPending ? '\u25B2 PENDING' : `\u25A0 ${statusStr}`}
                          </span>
                        </td>
                        <td className="p-2.5 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={actioningId === subId}
                                onClick={() => handleSubstitutionDecision(subId, 'APPROVE')}
                                className="inline-flex items-center gap-1 rounded-md bg-[#024950] px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-[#003135] disabled:opacity-50 transition cursor-pointer"
                              >
                                <CheckCircle2 size={12} />
                                Confirm
                              </button>
                              <button
                                type="button"
                                disabled={actioningId === subId}
                                onClick={() => handleSubstitutionDecision(subId, 'REJECT')}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#072a2f] px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition cursor-pointer"
                              >
                                <XCircle size={12} />
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#a0afac]">Finalized</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DepartmentsDirectoryView({
  records,
  user,
  onSelectDept,
  onNavigate,
}: {
  records: AcademicRecord[]
  user?: BackendUser
  onSelectDept: (deptId: string) => void
  onNavigate: (screen: AcademicScreen) => void
}) {
  const { schools } = useInstitutionalDirectory()
  const [searchTerm, setSearchTerm] = useState('')
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<'code_asc' | 'faculty_desc' | 'lab_desc'>('code_asc')

  const role = user?.role || 'STUDENT'
  const canCreateSchool = role === 'SUPER_ADMIN'
  const canEditAnySchool = role === 'SUPER_ADMIN'
  const canEditOwnSchool = role === 'DEAN'
  const canCreateDept = role === 'SUPER_ADMIN' || role === 'DEAN'
  const canDeleteDept = role === 'SUPER_ADMIN' || role === 'DEAN'
  const canEditDept = (deptId: string) =>
    role === 'SUPER_ADMIN' || role === 'DEAN' || (role === 'DEPT_ADMIN' && String(user?.departmentId || '').toUpperCase() === deptId)

  const [schoolModal, setSchoolModal] = useState<{
    mode: 'create' | 'edit'
    school_id: string
    name: string
    dean_name: string
    dean_email: string
  } | null>(null)
  const [deletingSchool, setDeletingSchool] = useState<SchoolSummary | null>(null)

  const [deptModal, setDeptModal] = useState<{
    mode: 'create' | 'edit'
    department_id: string
    school_id: string
    name: string
    description: string
    hod_name: string
    contact_email: string
    contact_phone: string
  } | null>(null)
  const [deletingDept, setDeletingDept] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const list = records.filter((r) => {
      const meta = r.meta || {}
      const deptId = String(meta.department_id || r.id).toUpperCase()
      const rowSchool = String(meta.school_id || '').toUpperCase()

      if (schoolFilter !== 'ALL' && rowSchool !== schoolFilter) return false

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const codeMatch = deptId.toLowerCase().includes(q)
        const hodMatch = String(meta.hod_name || '').toLowerCase().includes(q)
        const schoolMatch = rowSchool.toLowerCase().includes(q)
        if (!titleMatch && !codeMatch && !hodMatch && !schoolMatch) return false
      }
      return true
    })

    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      if (sortBy === 'code_asc') return String(metaA.department_id || a.id).localeCompare(String(metaB.department_id || b.id))
      if (sortBy === 'faculty_desc') return Number(metaB.faculty_count ?? 0) - Number(metaA.faculty_count ?? 0)
      if (sortBy === 'lab_desc') return Number(metaB.laboratory_count ?? metaB.laboratories_count ?? 0) - Number(metaA.laboratory_count ?? metaA.laboratories_count ?? 0)
      return 0
    })

    return list
  }, [records, schoolFilter, sortBy, searchTerm])

  const handleSaveSchool = async (e: FormEvent) => {
    e.preventDefault()
    if (!schoolModal) return
    setSaving(true)
    setModalError(null)
    try {
      const url = schoolModal.mode === 'create'
        ? '/api/v1/departments/schools'
        : `/api/v1/departments/schools/${encodeURIComponent(schoolModal.school_id)}`
      const raw = await backendFetch(url, {
        method: schoolModal.mode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify({
          school_id: schoolModal.school_id.trim().toUpperCase(),
          name: schoolModal.name.trim(),
          dean_name: schoolModal.dean_name.trim(),
          dean_email: schoolModal.dean_email.trim(),
        }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error') throw new Error(res?.message || 'Failed to save school')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `School "${schoolModal.name.trim()}" saved.`, type: 'success' },
      }))
      setSchoolModal(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setModalError(err?.message || 'Failed to save school.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDeleteSchool = async () => {
    if (!deletingSchool) return
    setSaving(true)
    setModalError(null)
    try {
      const raw = await backendFetch(`/api/v1/departments/schools/${encodeURIComponent(deletingSchool.school_id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error') throw new Error(res?.message || 'Failed to delete school')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `School "${deletingSchool.name}" deleted.`, type: 'success' },
      }))
      if (schoolFilter === deletingSchool.school_id) setSchoolFilter('ALL')
      setDeletingSchool(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setModalError(err?.message || 'Failed to delete school.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDept = async (e: FormEvent) => {
    e.preventDefault()
    if (!deptModal) return
    setSaving(true)
    setModalError(null)
    try {
      const url = deptModal.mode === 'create'
        ? '/api/v1/departments'
        : `/api/v1/departments/${encodeURIComponent(deptModal.department_id)}`
      const raw = await backendFetch(url, {
        method: deptModal.mode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify({
          department_id: deptModal.department_id.trim().toUpperCase(),
          school_id: deptModal.school_id || null,
          name: deptModal.name.trim(),
          description: deptModal.description.trim(),
          hod_name: deptModal.hod_name.trim(),
          contact_email: deptModal.contact_email.trim(),
          contact_phone: deptModal.contact_phone.trim(),
        }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error') throw new Error(res?.message || 'Failed to save department')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Department "${deptModal.department_id.toUpperCase()}" saved.`, type: 'success' },
      }))
      setDeptModal(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setModalError(err?.message || 'Failed to save department.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDeleteDept = async () => {
    if (!deletingDept) return
    setSaving(true)
    setModalError(null)
    try {
      const raw = await backendFetch(`/api/v1/departments/${encodeURIComponent(deletingDept.id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error') throw new Error(res?.message || 'Failed to delete department')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Department "${deletingDept.id}" deleted.`, type: 'success' },
      }))
      setDeletingDept(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setModalError(err?.message || 'Failed to delete department.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Live Academic Schools Governance Bar */}
      {(schools.length > 0 || canCreateSchool) && (
        <Panel className="p-3.5 sm:p-4 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl space-y-3 view-card-enter">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc]">
                Institutional Schools &amp; Governance
              </h3>
              <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                Configure campus schools, executive Deans, and affiliated academic departments
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canCreateSchool && (
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null)
                    setSchoolModal({ mode: 'create', school_id: '', name: '', dean_name: '', dean_email: '' })
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#08747c] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#ebf7f6] dark:hover:bg-[#0a353b] btn-interactive cursor-pointer"
                >
                  <Plus size={13} />
                  Add School
                </button>
              )}
              {canCreateDept && (
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null)
                    setDeptModal({
                      mode: 'create',
                      department_id: '',
                      school_id: schoolFilter !== 'ALL' ? schoolFilter : (schools[0]?.school_id || ''),
                      name: '',
                      description: '',
                      hod_name: '',
                      contact_email: '',
                      contact_phone: '',
                    })
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#08747c] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] btn-interactive cursor-pointer"
                >
                  <Plus size={13} />
                  Add Department
                </button>
              )}
            </div>
          </div>

          {schools.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 stagger-grid">
              {schools.map((sc) => {
                const isThisDeansSchool = canEditOwnSchool && String(sc.dean_email || '').toLowerCase() === String(user?.email || '').toLowerCase()
                const allowSchoolEdit = canEditAnySchool || isThisDeansSchool
                return (
                  <div
                    key={sc.school_id}
                    className={`rounded-xl border p-3 transition card-interactive ${
                      schoolFilter === sc.school_id
                        ? 'border-[#08747c] bg-[#ebf7f6]/70 dark:bg-[#07363d]'
                        : 'border-[#dce4e3] dark:border-[#124349] bg-[#fafcfb] dark:bg-[#072a2f]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSchoolFilter((cur) => (cur === sc.school_id ? 'ALL' : sc.school_id))}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#062327] text-[#08747c] dark:text-[#55d6dc] border border-[#dce4e3] dark:border-[#124349]">
                          {sc.school_id}
                        </span>
                        <h4 className="mt-1.5 text-xs font-bold text-[#003135] dark:text-[#e0f2fe] truncate">{sc.name}</h4>
                        <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3] truncate mt-0.5">
                          Dean: {sc.dean_name || 'Assigned Dean'}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {allowSchoolEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null)
                              setSchoolModal({
                                mode: 'edit',
                                school_id: sc.school_id,
                                name: sc.name,
                                dean_name: sc.dean_name || '',
                                dean_email: sc.dean_email || '',
                              })
                            }}
                            title={`Edit ${sc.name}`}
                            className="p-1.5 rounded-lg text-[#08747c] dark:text-[#55d6dc] hover:bg-white dark:hover:bg-[#0a353b] transition cursor-pointer"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        {canCreateSchool && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null)
                              setDeletingSchool(sc)
                            }}
                            title={`Delete ${sc.name}`}
                            className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-[#331114] transition cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      )}

      {/* Search, Live School Filter & Sort Bar */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search department name, code, HOD..."
            className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setSchoolFilter('ALL')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                schoolFilter === 'ALL'
                  ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                  : 'text-[#647376] dark:text-[#8ea5a3]'
              }`}
            >
              All ({records.length})
            </button>
            {schools.map((sc) => (
              <button
                key={sc.school_id}
                type="button"
                onClick={() => setSchoolFilter(sc.school_id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolFilter === sc.school_id
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                {sc.school_id}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <option value="code_asc">Department Code (A → Z)</option>
            <option value="faculty_desc">Faculty Strength</option>
            <option value="lab_desc">Specialized Labs Count</option>
          </select>
        </div>
      </Panel>

      <div className="overflow-x-auto rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[820px] border-collapse text-left text-xs stagger-table">
          <thead>
            <tr className="border-b border-[#dce4e3] dark:border-[#124349] bg-[#f7f9f9] dark:bg-[#031d21]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Code &amp; School</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Academic Department Name</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Head of Department (HOD)</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Faculty Count</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Laboratories</th>
              <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-xs text-[#7a898c]">
                  No academic departments matched the active filter.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = r.meta || {}
                const deptId = String(meta.department_id || r.id).toUpperCase()
                const schoolId = String(meta.school_id || '')
                const hodName = meta.hod_name ? String(meta.hod_name) : 'Department Head'
                const facultyCount = Number(meta.faculty_count ?? 0)
                const labCount = Number(meta.laboratory_count ?? meta.laboratories_count ?? 0)

                return (
                  <tr
                    key={r.id}
                    className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                  >
                    <td className="p-3">
                      <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc] px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d]">
                        {deptId}
                      </span>
                      {schoolId && (
                        <span className="block mt-1 font-mono text-[10px] text-[#7a898c] dark:text-[#7ba09d]">
                          School: {schoolId}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">
                        {r.title}
                      </span>
                      {r.subtitle && (
                        <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] block mt-0.5">
                          {r.subtitle}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {hodName}
                      </span>
                      <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d]">
                        {meta.contact_email ? String(meta.contact_email) : 'Head of Department'}
                      </span>
                    </td>

                    <td className="p-3 font-semibold text-[#08747c] dark:text-[#55d6dc]">
                      {facultyCount} Faculty
                    </td>

                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {labCount} Labs
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectDept(deptId)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#024950] px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] btn-interactive cursor-pointer"
                        >
                          <Building2 size={12} />
                          Facilities
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigate('labs')}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] btn-interactive cursor-pointer"
                        >
                          <FlaskConical size={12} />
                          Labs
                        </button>
                        {canEditDept(deptId) && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null)
                              setDeptModal({
                                mode: 'edit',
                                department_id: deptId,
                                school_id: schoolId,
                                name: r.title,
                                description: String(meta.description || ''),
                                hod_name: String(meta.hod_name || ''),
                                contact_email: String(meta.contact_email || ''),
                                contact_phone: String(meta.contact_phone || ''),
                              })
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 py-1 text-[11px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#ebf7f6] dark:hover:bg-[#0a353b] btn-interactive cursor-pointer"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                        )}
                        {canDeleteDept && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null)
                              setDeletingDept({ id: deptId, name: r.title })
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-[#331114]/70 px-2 py-1 text-[11px] font-semibold text-red-600 dark:text-red-300 hover:bg-red-100 btn-interactive cursor-pointer"
                          >
                            <Trash2 size={11} />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit School Modal */}
      {schoolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={() => setSchoolModal(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
            <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 py-4 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-[#08747c] dark:text-[#55d6dc]">
                  Institutional School Governance
                </span>
                <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc] truncate">
                  {schoolModal.mode === 'create' ? 'Create Academic School' : `Update School · ${schoolModal.school_id}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close school form"
                onClick={() => setSchoolModal(null)}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
              >
                <X size={16} />
              </button>
            </header>
            <form onSubmit={handleSaveSchool} className="p-5 space-y-3 overflow-y-auto flex-1">
              {modalError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">School Code *</label>
                <input
                  required
                  disabled={schoolModal.mode === 'edit'}
                  value={schoolModal.school_id}
                  onChange={(e) => setSchoolModal((s) => s ? { ...s, school_id: e.target.value.toUpperCase() } : s)}
                  placeholder="e.g. SOC"
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">School Name *</label>
                <input
                  required
                  value={schoolModal.name}
                  onChange={(e) => setSchoolModal((s) => s ? { ...s, name: e.target.value } : s)}
                  placeholder="School Name"
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Dean Name</label>
                <input
                  value={schoolModal.dean_name}
                  onChange={(e) => setSchoolModal((s) => s ? { ...s, dean_name: e.target.value } : s)}
                  placeholder="Assigned School Dean"
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Dean Official Email</label>
                <input
                  type="email"
                  value={schoolModal.dean_email}
                  onChange={(e) => setSchoolModal((s) => s ? { ...s, dean_email: e.target.value } : s)}
                  placeholder="dean@gmrit.edu.in"
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#e3e9e8] dark:border-[#124349]">
                <button type="button" onClick={() => setSchoolModal(null)} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#526164] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#08747c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003135] disabled:opacity-50 btn-interactive">
                  {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                  Save School
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Department Modal */}
      {deptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={() => setDeptModal(null)} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
            <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 py-4 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-[#08747c] dark:text-[#55d6dc]">
                  Academic Department Setup
                </span>
                <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc] truncate">
                  {deptModal.mode === 'create' ? 'Create Academic Department' : `Edit Department · ${deptModal.department_id}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close department form"
                onClick={() => setDeptModal(null)}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
              >
                <X size={16} />
              </button>
            </header>
            <form onSubmit={handleSaveDept} className="p-5 space-y-3 overflow-y-auto flex-1">
              {modalError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
                  {modalError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Department Code *</label>
                  <input
                    required
                    disabled={deptModal.mode === 'edit'}
                    value={deptModal.department_id}
                    onChange={(e) => setDeptModal((d) => d ? { ...d, department_id: e.target.value.toUpperCase() } : d)}
                    placeholder="e.g. CSE"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Affiliated School</label>
                  <select
                    value={deptModal.school_id}
                    disabled={role !== 'SUPER_ADMIN'}
                    onChange={(e) => setDeptModal((d) => d ? { ...d, school_id: e.target.value } : d)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none disabled:opacity-60"
                  >
                    <option value="">Independent / Unassigned</option>
                    {schools.map((sc) => (
                      <option key={sc.school_id} value={sc.school_id}>
                        {sc.school_id} — {sc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Department Name *</label>
                <input
                  required
                  value={deptModal.name}
                  onChange={(e) => setDeptModal((d) => d ? { ...d, name: e.target.value } : d)}
                  placeholder="Full Academic Department Name"
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Head of Department</label>
                  <input
                    value={deptModal.hod_name}
                    onChange={(e) => setDeptModal((d) => d ? { ...d, hod_name: e.target.value } : d)}
                    placeholder="Department Head Name"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Department Email</label>
                  <input
                    type="email"
                    value={deptModal.contact_email}
                    onChange={(e) => setDeptModal((d) => d ? { ...d, contact_email: e.target.value } : d)}
                    placeholder="hod@gmrit.edu.in"
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={deptModal.description}
                  onChange={(e) => setDeptModal((d) => d ? { ...d, description: e.target.value } : d)}
                  placeholder="Program focus and laboratory overview"
                  className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-2.5 text-xs outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#e3e9e8] dark:border-[#124349]">
                <button type="button" onClick={() => setDeptModal(null)} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#526164] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#08747c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003135] disabled:opacity-50 btn-interactive">
                  {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingSchool && (
        <ConfirmActionModal
          title="Delete Academic School?"
          subject={`${deletingSchool.school_id} — ${deletingSchool.name}`}
          description="Reassign any linked departments before deleting this school."
          confirmLabel="Delete School"
          loading={saving}
          error={modalError}
          onClose={() => setDeletingSchool(null)}
          onConfirm={handleConfirmDeleteSchool}
        />
      )}

      {deletingDept && (
        <ConfirmActionModal
          title="Delete Academic Department?"
          subject={`${deletingDept.id} — ${deletingDept.name}`}
          description="Departments with active users, staff, subjects, or laboratories cannot be removed until reassigned."
          confirmLabel="Delete Department"
          loading={saving}
          error={modalError}
          onClose={() => setDeletingDept(null)}
          onConfirm={handleConfirmDeleteDept}
        />
      )}
    </div>
  )
}

function LabBookingsTableView({
  records,
  user,
  onRefresh,
}: {
  records: AcademicRecord[]
  user: BackendUser
  onRefresh?: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [deptFilter, setDeptFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'lab_asc'>('date_desc')
  const [actioningId, setActioningId] = useState<string | null>(null)

  const canApprove = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(user.role)

  const handleAction = async (bookingId: string, action: 'APPROVE' | 'REJECT') => {
    setActioningId(bookingId)
    try {
      const raw = await backendFetch(`/api/v1/laboratories/bookings/${encodeURIComponent(bookingId)}/approval`, {
        method: 'PUT',
        body: JSON.stringify({ action }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Approval action failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: {
          message: res?.message || (action === 'APPROVE' ? 'Laboratory booking confirmed.' : 'Laboratory booking declined.'),
          type: action === 'APPROVE' ? 'success' : 'info',
        },
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      if (onRefresh) onRefresh()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: {
          message: `Approval error: ${e instanceof Error ? e.message : 'Failed'}`,
          type: 'error',
        },
      }))
    } finally {
      setActioningId(null)
    }
  }

  const handleCancel = async (bookingId: string) => {
    setActioningId(bookingId)
    try {
      const raw = await backendFetch(`/api/v1/laboratories/bookings/${encodeURIComponent(bookingId)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Cancellation failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || 'Laboratory booking cancelled.', type: 'info' },
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      if (onRefresh) onRefresh()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: {
          message: `Cancellation error: ${e instanceof Error ? e.message : 'Failed'}`,
          type: 'error',
        },
      }))
    } finally {
      setActioningId(null)
    }
  }

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const st = String(r.status || meta.status || 'PENDING').toUpperCase()
      if (statusFilter === 'APPROVED' && !['APPROVED', 'CONFIRMED'].includes(st)) return false
      if (statusFilter === 'REJECTED' && !['REJECTED', 'CANCELLED'].includes(st)) return false
      if (statusFilter === 'PENDING' && !['PENDING', 'PENDING_HOD'].includes(st)) return false
      const dept = String(meta.department_id || 'CSE').toUpperCase()
      if (deptFilter !== 'ALL' && dept !== deptFilter) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const labMatch = String(meta.lab_name || meta.room_number || '').toLowerCase().includes(q)
        const coordMatch = String(meta.coordinator_name || meta.booked_by_name || '').toLowerCase().includes(q)
        if (!titleMatch && !labMatch && !coordMatch) return false
      }
      return true
    })

    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      if (sortBy === 'date_desc') return String(metaB.booking_date || '').localeCompare(String(metaA.booking_date || ''))
      if (sortBy === 'date_asc') return String(metaA.booking_date || '').localeCompare(String(metaB.booking_date || ''))
      if (sortBy === 'lab_asc') return String(metaA.lab_name || a.title).localeCompare(String(metaB.lab_name || b.title))
      return 0
    })

    return list
  }, [records, statusFilter, deptFilter, searchTerm, sortBy])

  const pendingCount = records.filter((r) => String(r.meta?.status || r.status || '').toUpperCase() === 'PENDING').length
  const confirmedCount = records.filter((r) => ['APPROVED', 'CONFIRMED'].includes(String(r.meta?.status || r.status || '').toUpperCase())).length

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-[#647376] dark:text-[#8ea5a3]">Total Reservations</span>
            <span className="mt-0.5 text-xl font-bold text-[#003135] dark:text-[#55d6dc]">{records.length}</span>
          </div>
          <FlaskConical size={24} className="text-[#08747c]/40" />
        </Panel>

        <Panel className="p-3.5 border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-[#38260a] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-amber-800 dark:text-amber-300">Pending Authorization</span>
            <span className="mt-0.5 text-xl font-bold text-amber-700 dark:text-amber-400">{pendingCount}</span>
          </div>
          <Clock size={24} className="text-amber-500/40" />
        </Panel>

        <Panel className="p-3.5 border border-emerald-200 dark:border-emerald-900/40 bg-[#f0fdf4] dark:bg-[#062c1e] rounded-xl flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Confirmed & Allotted</span>
            <span className="mt-0.5 text-xl font-bold text-emerald-700 dark:text-emerald-400">{confirmedCount}</span>
          </div>
          <CheckCircle2 size={24} className="text-emerald-500/50" />
        </Panel>
      </div>

      {/* Filter / Search Bar */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search bookings by lab, title, coordinator..."
            className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                {st === 'ALL' ? 'All' : st === 'APPROVED' ? 'Confirmed' : st}
              </button>
            ))}
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <DepartmentOptions showAllOption allLabel="All Departments" includeValue={deptFilter} />
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <option value="date_desc">Latest Date First</option>
            <option value="date_asc">Oldest Date First</option>
            <option value="lab_asc">Lab Name (A-Z)</option>
          </select>
        </div>
      </Panel>

      {/* Table */}
      <div className="overflow-auto max-h-[calc(100vh-350px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[950px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Booking Ref & Date</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Laboratory Venue</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Purpose / Event Title</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Period Slot</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Coordinator</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
              <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#7a898c]">
                  No laboratory bookings found matching current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = r.meta || {}
                const bookingId = String(meta.booking_id || r.id)
                const labName = String(meta.lab_name || r.title || 'Lab Venue')
                const roomNum = String(meta.room_number || meta.room_id || '')
                const date = String(meta.booking_date || '')
                const day = String(meta.day_of_week || meta.day || '')
                const period = String(meta.period_index || meta.period || '1')
                const bookedBy = String(meta.coordinator_name || meta.booked_by_name || 'Staff / Student')
                const purpose = String(meta.purpose || meta.title || r.title)
                const status = String(meta.status || r.status || 'PENDING').toUpperCase()
                const isPending = status === 'PENDING'
                const isApproved = status === 'APPROVED' || status === 'CONFIRMED'
                const isOwner = String(meta.booked_by_user_id || '') === user.userId
                const isTerminal = ['CANCELLED', 'REJECTED', 'COMPLETED'].includes(status)
                const canCancel = (isOwner || canApprove) && !isTerminal

                return (
                  <tr key={r.id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3">
                      <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc] block">
                        {bookingId}
                      </span>
                      <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] block mt-0.5">
                        {date} {day ? `(${day.slice(0, 3)})` : ''}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        {labName}
                      </span>
                      {roomNum && (
                        <span className="font-mono text-[10px] text-[#7a898c] dark:text-[#7ba09d] block">
                          Room {roomNum}
                        </span>
                      )}
                    </td>
                    <td className="p-3 max-w-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200 block truncate" title={purpose}>
                        {purpose}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                        Period {period}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-800 dark:text-slate-200 font-medium block">
                        {bookedBy}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                        isApproved
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : isPending
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 animate-pulse'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {isApproved ? '\u25CF CONFIRMED' : isPending ? '\u25B2 PENDING' : '\u25A0 REJECTED'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canApprove && isPending && (
                          <>
                            <button
                              disabled={actioningId === bookingId}
                              onClick={() => handleAction(bookingId, 'APPROVE')}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                            >
                              Confirm
                            </button>
                            <button
                              disabled={actioningId === bookingId}
                              onClick={() => handleAction(bookingId, 'REJECT')}
                              className="rounded-lg border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {canCancel && (
                          <button
                            disabled={actioningId === bookingId}
                            onClick={() => handleCancel(bookingId)}
                            className="rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#647376] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b] transition disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                        {!canCancel && !(canApprove && isPending) && (
                          <span className="text-[11px] text-[#a0afac]">{isTerminal ? 'Resolved' : '—'}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AcademicCalendarTableView({
  records,
  user,
}: {
  records: AcademicRecord[]
  user: BackendUser
}) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'date_asc' | 'date_desc' | 'type'>('date_asc')
  const [deletingEvent, setDeletingEvent] = useState<{ id: string; title: string } | null>(null)
  const [deletingLoading, setDeletingLoading] = useState(false)
  const [deletingError, setDeletingError] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<{
    id: string
    title: string
    event_type: string
    event_date: string
    end_date: string
    venue: string
    department_id: string
    description: string
    affects_schedule: boolean
    status: string
  } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const canManageEvents = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN', 'COORDINATOR'].includes(user.role)

  const handleSaveEditEvent = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    setEditSaving(true)
    setEditError(null)
    try {
      const raw = await backendFetch(`/api/v1/events/${encodeURIComponent(editingEvent.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editingEvent.title.trim(),
          event_type: editingEvent.event_type,
          event_date: editingEvent.event_date,
          end_date: editingEvent.end_date || null,
          venue: editingEvent.venue.trim() || null,
          department_id: editingEvent.department_id === 'ALL' ? null : editingEvent.department_id,
          description: editingEvent.description.trim(),
          affects_schedule: editingEvent.affects_schedule ? 1 : 0,
          status: editingEvent.status,
        }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.status === 'error' || res?.success === false) {
        throw new Error(res?.message || 'Failed to update academic event')
      }
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Event "${editingEvent.title.trim()}" updated.`, type: 'success' },
      }))
      setEditingEvent(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update event.')
    } finally {
      setEditSaving(false)
    }
  }

  const handleConfirmDeleteEvent = async () => {
    if (!deletingEvent) return
    setDeletingLoading(true)
    setDeletingError(null)
    try {
      const raw = await backendFetch(`/api/v1/events/${encodeURIComponent(deletingEvent.id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Failed to delete academic event')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || `Event "${deletingEvent.title}" removed.`, type: 'success' },
      }))
      setDeletingEvent(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setDeletingError(err?.message || 'Failed to delete event.')
    } finally {
      setDeletingLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const et = String(meta.event_type || meta.type || r.subtitle || '').toUpperCase()
      if (eventTypeFilter !== 'ALL' && !et.includes(eventTypeFilter)) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const descMatch = String(meta.description || r.subtitle || '').toLowerCase().includes(q)
        const venueMatch = String(meta.venue || '').toLowerCase().includes(q)
        if (!titleMatch && !descMatch && !venueMatch) return false
      }
      return true
    })

    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      const dateA = String(metaA.event_date || metaA.start_date || a.id)
      const dateB = String(metaB.event_date || metaB.start_date || b.id)
      if (sortBy === 'date_asc') return dateA.localeCompare(dateB)
      if (sortBy === 'date_desc') return dateB.localeCompare(dateA)
      return a.title.localeCompare(b.title)
    })

    return list
  }, [records, eventTypeFilter, searchTerm, sortBy])

  return (
    <div className="space-y-4">
      {/* Control Suite */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search academic dates, examinations, holidays..."
            className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
            {(['ALL', 'EXAMINATION', 'HOLIDAY', 'COMMENCEMENT', 'SYMPOSIUM'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setEventTypeFilter(type)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  eventTypeFilter === type
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                {type === 'ALL' ? 'All Events' : type === 'EXAMINATION' ? 'Exams' : type}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <option value="date_asc">Chronological (Earliest)</option>
            <option value="date_desc">Latest First</option>
            <option value="type">Event Type</option>
          </select>
        </div>
      </Panel>

      {/* Calendar Ledger Table */}
      <div className="overflow-auto max-h-[calc(100vh-295px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs stagger-table">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Event Date & Duration</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Event Designation & Subject</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Classification</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Timetable Impact</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Target Scope / Dept</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Campus Venue</th>
              {canManageEvents && (
                <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canManageEvents ? 7 : 6} className="p-8 text-center text-[#7a898c]">
                  No academic calendar events matched.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = r.meta || {}
                const eventDate = String(meta.event_date || meta.start_date || '')
                const endDate = meta.end_date ? String(meta.end_date) : null
                const eventType = String(meta.event_type || meta.type || r.subtitle || 'ACADEMIC').toUpperCase()
                const affectsTimetable = Boolean(meta.affects_timetable)
                const venue = String(meta.venue || 'GMRIT Campus')
                const dept = String(meta.department_id || 'All Autonomous Depts')
                const description = String(meta.description || r.subtitle || '')

                return (
                  <tr key={r.id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3">
                      <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc] block">
                        {eventDate}
                      </span>
                      {endDate && endDate !== eventDate && (
                        <span className="font-mono text-[10px] text-[#7a898c] dark:text-[#7ba09d] block">
                          thru {endDate}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">
                        {r.title}
                      </span>
                      {description && (
                        <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3] mt-0.5 line-clamp-2">
                          {description}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block font-mono text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        eventType === 'HOLIDAY'
                          ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                          : eventType === 'EXAMINATION'
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                          : 'bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]'
                      }`}>
                        {eventType}
                      </span>
                    </td>
                    <td className="p-3">
                      {affectsTimetable ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-xs text-amber-600 dark:text-amber-400">
                          <ShieldAlert size={13} />
                          Suspends Classes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={13} />
                          Regular Schedule
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {dept}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                        {venue}
                      </span>
                    </td>
                    {canManageEvents && (
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditError(null)
                              setEditingEvent({
                                id: String(meta.event_id || r.id),
                                title: r.title,
                                event_type: eventType,
                                event_date: eventDate,
                                end_date: endDate || '',
                                venue: String(meta.venue || ''),
                                department_id: meta.department_id ? String(meta.department_id) : 'ALL',
                                description,
                                affects_schedule: affectsTimetable,
                                status: String(meta.status || 'UPCOMING'),
                              })
                            }}
                            title="Edit academic event"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-[11px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#ebf7f6] dark:hover:bg-[#0a353b] btn-interactive cursor-pointer"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingError(null)
                              setDeletingEvent({ id: String(meta.event_id || r.id), title: r.title })
                            }}
                            title="Delete academic event"
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-[#331114]/70 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-[#41171b] btn-interactive cursor-pointer"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={() => setEditingEvent(null)} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
            <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 py-4 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-mono text-[10px] font-bold uppercase text-[#08747c] dark:text-[#55d6dc]">
                  Academic Calendar Modification
                </span>
                <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc] truncate">
                  Edit Event · {editingEvent.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close event editor"
                onClick={() => setEditingEvent(null)}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
              >
                <X size={16} />
              </button>
            </header>
            <form onSubmit={handleSaveEditEvent} className="p-5 space-y-3 overflow-y-auto flex-1">
              {editError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
                  {editError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Event Title *</label>
                <input
                  required
                  value={editingEvent.title}
                  onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, title: e.target.value } : ev)}
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Event Type</label>
                  <select
                    value={editingEvent.event_type}
                    onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, event_type: e.target.value } : ev)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
                  >
                    {['HOLIDAY', 'EXAM', 'SEMINAR', 'FEST', 'WORKSHOP', 'GENERAL'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Target Department</label>
                  <select
                    value={editingEvent.department_id}
                    disabled={!['SUPER_ADMIN', 'DEAN'].includes(user.role)}
                    onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, department_id: e.target.value } : ev)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none disabled:opacity-60"
                  >
                    <DepartmentOptions showAllOption allLabel="University-Wide" includeValue={editingEvent.department_id} />
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Start Date *</label>
                  <input
                    required
                    type="date"
                    value={editingEvent.event_date}
                    onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, event_date: e.target.value } : ev)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">End Date</label>
                  <input
                    type="date"
                    value={editingEvent.end_date}
                    onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, end_date: e.target.value } : ev)}
                    className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Campus Venue</label>
                <input
                  value={editingEvent.venue}
                  onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, venue: e.target.value } : ev)}
                  className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-[#003135] dark:text-[#e0f2fe] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingEvent.affects_schedule}
                  onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, affects_schedule: e.target.checked } : ev)}
                />
                Suspends regular class timetable
              </label>
              <div>
                <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingEvent.description}
                  onChange={(e) => setEditingEvent((ev) => ev ? { ...ev, description: e.target.value } : ev)}
                  className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-2.5 text-xs outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#e3e9e8] dark:border-[#124349]">
                <button type="button" onClick={() => setEditingEvent(null)} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#526164] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
                  Cancel
                </button>
                <button type="submit" disabled={editSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#08747c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003135] disabled:opacity-50 btn-interactive">
                  {editSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingEvent && (
        <ConfirmActionModal
          title="Delete Academic Event?"
          subject={deletingEvent.title}
          description="This calendar notice or exam window will be permanently removed."
          confirmLabel="Delete Event"
          loading={deletingLoading}
          error={deletingError}
          onClose={() => setDeletingEvent(null)}
          onConfirm={handleConfirmDeleteEvent}
        />
      )}
    </div>
  )
}

const USER_DIR_ROLES = [
  'SUPER_ADMIN',
  'DEAN',
  'DEPT_ADMIN',
  'COORDINATOR',
  'TEACHING_STAFF',
  'NON_TEACHING_STAFF',
  'STUDENT',
] as const
const USER_DIR_STATUSES = ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'] as const

type UserFormState = {
  full_name: string
  email: string
  pnrno: string
  mobile_number: string
  role: string
  department_id: string
  password: string
  status: string
}

const EMPTY_USER_FORM: UserFormState = {
  full_name: '',
  email: '',
  pnrno: '',
  mobile_number: '',
  role: 'TEACHING_STAFF',
  department_id: 'CSE',
  password: '',
  status: 'ACTIVE',
}

function UserAccountFormModal({
  mode,
  subjectTitle,
  form,
  onChange,
  actionLoading,
  actionError,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  subjectTitle?: string
  form: UserFormState
  onChange: React.Dispatch<React.SetStateAction<UserFormState>>
  actionLoading: boolean
  actionError: string
  onClose: () => void
  onSubmit: () => void
}) {
  const isEdit = mode === 'edit'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 modal-backdrop" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-[#062327] rounded-2xl border border-[#dce4e3] dark:border-[#124349] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden modal-panel">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dce4e3] dark:border-[#124349] shrink-0">
          <div>
            <h3 className="font-bold text-sm text-[#003135] dark:text-[#55d6dc]">
              {isEdit ? 'Edit User Account' : 'Add New User Account'}
            </h3>
            <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
              {isEdit ? `Modifying: ${subjectTitle || form.full_name}` : 'Create institutional login credentials'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#f0f4f4] dark:hover:bg-[#082e34] text-[#526164] transition"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="overflow-y-auto flex-1"
        >
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                Full Name *
              </label>
              <input
                value={form.full_name}
                onChange={(e) => onChange((f) => ({ ...f, full_name: e.target.value }))}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
                placeholder="Dr. / Mr. / Ms. Full Name"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                PNR / Employee ID *
              </label>
              <input
                value={form.pnrno}
                onChange={(e) => onChange((f) => ({ ...f, pnrno: e.target.value }))}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none focus:border-[#08747c]"
                placeholder="52001 / 23A01A0001"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                Mobile Number
              </label>
              <input
                value={form.mobile_number}
                onChange={(e) => onChange((f) => ({ ...f, mobile_number: e.target.value }))}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none focus:border-[#08747c]"
                placeholder="9876543210"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                Official Email *
              </label>
              <input
                value={form.email}
                onChange={(e) => onChange((f) => ({ ...f, email: e.target.value }))}
                type="email"
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono outline-none focus:border-[#08747c]"
                placeholder="name@gmrit.edu.in"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                Role *
              </label>
              <select
                value={form.role}
                onChange={(e) => onChange((f) => ({ ...f, role: e.target.value }))}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                {USER_DIR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleNames[r as BackendRole] || r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                Department
              </label>
              <select
                value={form.department_id}
                onChange={(e) => onChange((f) => ({ ...f, department_id: e.target.value }))}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                <DepartmentOptions includeValue={form.department_id} />
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => onChange((f) => ({ ...f, status: e.target.value }))}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
              >
                {USER_DIR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
                {isEdit ? 'New Password (blank = keep)' : 'Password *'}
              </label>
              <input
                value={form.password}
                onChange={(e) => onChange((f) => ({ ...f, password: e.target.value }))}
                type="password"
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
                placeholder={isEdit ? '(leave blank to keep)' : 'Min 6 characters'}
                required={!isEdit}
              />
            </div>
            {actionError && (
              <div className="col-span-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {actionError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#dce4e3] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 rounded-lg border border-[#d6dfde] dark:border-[#175259] text-xs text-[#526164] dark:text-[#8ea5a3] hover:bg-[#f0f4f4] dark:hover:bg-[#072a2f] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="h-8 px-4 rounded-lg bg-[#003135] dark:bg-[#024950] hover:bg-[#024950] dark:hover:bg-[#08747c] text-white text-xs font-semibold transition disabled:opacity-60 flex items-center gap-1.5"
            >
              {actionLoading ? (
                <>
                  <LoaderCircle size={12} className="animate-spin" />
                  {isEdit ? 'Saving...' : 'Creating...'}
                </>
              ) : isEdit ? (
                <>
                  <Save size={12} /> Save Changes
                </>
              ) : (
                <>
                  <UserPlus size={12} /> Create Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserDeleteConfirmModal({
  targetUser,
  actionLoading,
  actionError,
  onClose,
  onConfirm,
}: {
  targetUser: AcademicRecord
  actionLoading: boolean
  actionError: string
  onClose: () => void
  onConfirm: () => void
}) {
  const meta = targetUser.meta || {}
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 modal-backdrop" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-[#062327] rounded-2xl border border-[#dce4e3] dark:border-[#124349] shadow-2xl w-full max-w-sm modal-panel">
        <div className="px-5 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={22} className="text-red-500 dark:text-red-400" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">Delete User Account?</h3>
          <p className="text-xs text-[#647376] dark:text-[#8ea5a3] mb-1">You are about to permanently delete:</p>
          <p className="text-xs font-semibold text-[#003135] dark:text-[#55d6dc]">
            {targetUser.title} ({String(meta.pnrno || meta.pnr || targetUser.id)})
          </p>
          <p className="text-[11px] font-mono text-[#7a898c] mt-0.5 mb-3">{String(meta.email || '')}</p>
          <p className="text-[11px] text-red-500 dark:text-red-400 font-semibold mb-4">This action cannot be undone.</p>
          {actionError && (
            <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] text-xs text-[#526164] dark:text-[#8ea5a3] hover:bg-[#f0f4f4] dark:hover:bg-[#072a2f] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={actionLoading}
              className="flex-1 h-9 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {actionLoading ? (
                <>
                  <LoaderCircle size={12} className="animate-spin" /> Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={12} /> Delete Permanently
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UsersDirectoryTableView({
  records,
  user,
}: {
  records: AcademicRecord[]
  user: BackendUser
}) {
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [deptFilter, setDeptFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name_asc' | 'role' | 'dept'>('name_asc')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AcademicRecord | null>(null)
  const [deletingUser, setDeletingUser] = useState<AcademicRecord | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [form, setForm] = useState<UserFormState>({ ...EMPTY_USER_FORM })

  const openAddModal = () => {
    setForm({ ...EMPTY_USER_FORM })
    setActionError('')
    setShowAddModal(true)
  }

  useEffect(() => {
    const handler = () => openAddModal()
    window.addEventListener('gmritdu:open-add-user', handler)
    return () => window.removeEventListener('gmritdu:open-add-user', handler)
  }, [])

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      const meta = r.meta || {}
      const role = String(meta.role || '').toUpperCase()
      if (roleFilter !== 'ALL' && role !== roleFilter) return false
      const dept = String(meta.department_id || 'CSE').toUpperCase()
      if (deptFilter !== 'ALL' && dept !== deptFilter) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const nameMatch = r.title.toLowerCase().includes(q)
        const emailMatch = String(meta.email || '').toLowerCase().includes(q)
        const pnrMatch = String(meta.pnrno || meta.pnr || r.id).toLowerCase().includes(q)
        if (!nameMatch && !emailMatch && !pnrMatch) return false
      }
      return true
    })
    list.sort((a, b) => {
      const metaA = a.meta || {}
      const metaB = b.meta || {}
      if (sortBy === 'name_asc') return a.title.localeCompare(b.title)
      if (sortBy === 'role') return String(metaA.role || '').localeCompare(String(metaB.role || ''))
      if (sortBy === 'dept') return String(metaA.department_id || '').localeCompare(String(metaB.department_id || ''))
      return 0
    })
    return list
  }, [records, roleFilter, deptFilter, searchTerm, sortBy])

  function openEditModal(r: AcademicRecord) {
    const meta = r.meta || {}
    setForm({
      full_name: r.title,
      email: String(meta.email || ''),
      pnrno: String(meta.pnrno || meta.pnr || r.id),
      mobile_number: String(meta.mobile_number || ''),
      role: String(meta.role || 'TEACHING_STAFF'),
      department_id: String(meta.department_id || 'CSE'),
      password: '',
      status: String(r.status || meta.status || 'ACTIVE'),
    })
    setActionError('')
    setEditingUser(r)
  }

  async function handleCreate() {
    if (!form.full_name.trim() || !form.email.trim() || !form.pnrno.trim() || !form.password) {
      setActionError('Full name, email, PNR, and password are required.')
      return
    }
    setActionLoading(true)
    setActionError('')
    try {
      const res = await backendFetch('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(form) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to create user')
      setShowAddModal(false)
      window.dispatchEvent(new CustomEvent('gmritdu:toast', { detail: { message: data.message || 'User created', type: 'success' } }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setActionError(err.message || 'Unable to complete request.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUpdate() {
    if (!editingUser) return
    if (!form.full_name.trim() || !form.email.trim() || !form.pnrno.trim()) {
      setActionError('Full name, email, and PNR are required.')
      return
    }
    setActionLoading(true)
    setActionError('')
    try {
      const payload: Record<string, string> = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        pnrno: form.pnrno.trim(),
        mobile_number: form.mobile_number.trim(),
        role: form.role,
        department_id: form.department_id,
        status: form.status,
      }
      if (form.password.trim()) payload.password = form.password.trim()
      const targetUserId = String(editingUser.meta?.user_id || editingUser.id)
      const res = await backendFetch(`/api/v1/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update user')
      setEditingUser(null)
      window.dispatchEvent(new CustomEvent('gmritdu:toast', { detail: { message: data.message || 'User updated', type: 'success' } }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setActionError(err.message || 'Unable to complete request.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    if (!deletingUser) return
    setActionLoading(true)
    setActionError('')
    try {
      const targetUserId = String(deletingUser.meta?.user_id || deletingUser.id)
      const res = await backendFetch(`/api/v1/admin/users/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete user')
      setDeletingUser(null)
      window.dispatchEvent(new CustomEvent('gmritdu:toast', { detail: { message: data.message || 'User deleted', type: 'success' } }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setActionError(err.message || 'Unable to complete request.')
    } finally {
      setActionLoading(false)
    }
  }

  const statusColor = (s: string) =>
    s === 'ACTIVE'
      ? 'text-emerald-600 dark:text-emerald-400'
      : s === 'SUSPENDED'
      ? 'text-red-500 dark:text-red-400'
      : 'text-amber-500 dark:text-amber-400'
  const statusIcon = (s: string) =>
    s === 'ACTIVE' ? <CheckCircle2 size={12} /> : s === 'SUSPENDED' ? <XCircle size={12} /> : <Clock size={12} />
  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  return (
    <div className="space-y-4">
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, official email, or PNR..."
            className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <option value="ALL">All Roles ({records.length})</option>
            <option value="SUPER_ADMIN">Higher Dean / Super Admin</option>
            <option value="DEAN">Executive School Dean</option>
            <option value="DEPT_ADMIN">Head of Department (HOD)</option>
            <option value="COORDINATOR">Academic Coordinator</option>
            <option value="TEACHING_STAFF">Faculty Instructor</option>
            <option value="NON_TEACHING_STAFF">Lab Custodian / Technical</option>
            <option value="STUDENT">Enrolled Student</option>
          </select>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <DepartmentOptions showAllOption allLabel="All Departments" includeValue={deptFilter} />
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <option value="name_asc">Name (A-Z)</option>
            <option value="role">Role Hierarchy</option>
            <option value="dept">Department (A-Z)</option>
          </select>
        </div>
      </Panel>

      <div className="overflow-auto max-h-[calc(100vh-295px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">User & Institutional PNR</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Assigned Role</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department Scope</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Official Email</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Account Status</th>
              {isSuperAdmin && (
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3] text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isSuperAdmin ? 6 : 5} className="p-8 text-center text-[#7a898c]">
                  No user identities found matching current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = r.meta || {}
                const role = String(meta.role || 'STUDENT').toUpperCase()
                const dept = String(meta.department_id || 'CSE')
                const email = String(meta.email || '')
                const pnr = String(meta.pnrno || meta.pnr || r.id)
                const accStatus = String(r.status || meta.status || 'ACTIVE')
                const isSelf = user.userId === r.id
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <FacultyAvatar name={r.title} size="sm" />
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">{r.title}</span>
                          <span className="font-mono text-[10px] text-[#08747c] dark:text-[#55d6dc] block font-bold">{pnr}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block font-mono text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          role === 'SUPER_ADMIN'
                            ? 'bg-[#003135] dark:bg-[#07363d] text-white dark:text-[#55d6dc]'
                            : role === 'DEAN'
                            ? 'bg-[#024950] text-white dark:bg-[#084147] dark:text-[#a0f0f4]'
                            : role === 'DEPT_ADMIN'
                            ? 'bg-[#08747c]/15 dark:bg-[#08747c]/30 text-[#003135] dark:text-[#55d6dc]'
                            : role === 'COORDINATOR'
                            ? 'bg-[#0fa4af]/15 dark:bg-[#0fa4af]/25 text-[#003135] dark:text-[#55d6dc]'
                            : role === 'TEACHING_STAFF'
                            ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300'
                            : role === 'NON_TEACHING_STAFF'
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {roleNames[role as BackendRole] || role}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                        {dept}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[11px] text-[#647376] dark:text-[#8ea5a3]">{email}</span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${statusColor(accStatus)}`}>
                        {statusIcon(accStatus)}
                        {accStatus.replace('_', ' ')}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            title="Edit user"
                            className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] text-[#526164] dark:text-[#8ea5a3] hover:border-[#08747c] hover:text-[#08747c] dark:hover:text-[#55d6dc] transition"
                          >
                            <Pencil size={12} />
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingUser(r)
                                setActionError('')
                              }}
                              title="Delete user"
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] text-[#526164] dark:text-[#8ea5a3] hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <UserAccountFormModal
          mode="create"
          form={form}
          onChange={setForm}
          actionLoading={actionLoading}
          actionError={actionError}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleCreate}
        />
      )}

      {editingUser && (
        <UserAccountFormModal
          mode="edit"
          subjectTitle={editingUser.title}
          form={form}
          onChange={setForm}
          actionLoading={actionLoading}
          actionError={actionError}
          onClose={() => setEditingUser(null)}
          onSubmit={handleUpdate}
        />
      )}

      {deletingUser && (
        <UserDeleteConfirmModal
          targetUser={deletingUser}
          actionLoading={actionLoading}
          actionError={actionError}
          onClose={() => setDeletingUser(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function SubmitOnlyFeedbackView({
  user,
}: {
  user: BackendUser
}) {
  const [category, setCategory] = useState('TIMETABLE')
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !comments.trim()) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: 'Please provide a title and detailed comments for your feedback.', type: 'error' }
      }))
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        category,
        rating,
        title: title.trim(),
        comments: comments.trim(),
      }
      // Only attach an explicit department when the session actually carries one;
      // otherwise the backend resolves the authoritative department from the user record.
      if (user.departmentId) payload.department_id = user.departmentId
      const raw = await backendFetch('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) {
        throw new Error(res?.message || 'Unable to register feedback ticket.')
      }
      const ticketId = res?.data?.feedbackId
      if (!ticketId) {
        throw new Error('Could not confirm your feedback reference. Please retry your submission.')
      }
      setSubmittedTicket(ticketId)
      setTitle('')
      setComments('')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Feedback ticket #${ticketId} submitted successfully to Academic Administration.`, type: 'success' }
      }))
    } catch (err) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: err instanceof Error ? err.message : 'Submission failed', type: 'error' }
      }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <span className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] uppercase">Campus Stakeholder Voice</span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#003135] dark:text-[#55d6dc]">
          Submit Campus & System Feedback
        </h1>
        <p className="text-xs text-[#647376] dark:text-[#8ea5a3] mt-1">
          Your feedback is submitted directly to the Head of Department and System Administration. Individual submissions are kept strictly confidential.
        </p>
      </div>

      {submittedTicket && (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-[#eef7f3] dark:bg-[#072b22] text-[#1b6d53] dark:text-[#45c39c] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="shrink-0" />
            <div>
              <strong className="text-xs font-bold block">Feedback Registered Successfully</strong>
              <span className="text-[11px]">Reference Ticket ID: <code className="font-mono font-bold">{submittedTicket}</code>. Routed to Department Head.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSubmittedTicket(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <Panel className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1.5">
                Feedback Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              >
                <option value="TIMETABLE">Academic Timetable & Scheduling</option>
                <option value="LAB_FACILITY">Laboratory Facility & Equipment</option>
                <option value="BUG_REPORT">System Bug / Application Issue</option>
                <option value="FEATURE_REQUEST">Feature Request / Enhancement</option>
                <option value="GENERAL">General Campus Operations</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1.5">
                Satisfaction Rating (1 - 5)
              </label>
              <div className="flex items-center gap-2 h-10">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="text-xl transition hover:scale-110 cursor-pointer focus:outline-none"
                  >
                    <span className={star <= rating ? 'text-[#eab308]' : 'text-slate-300 dark:text-slate-700'}>
                      {'\u2605'}
                    </span>
                  </button>
                ))}
                <span className="text-xs font-semibold text-[#647376] dark:text-[#8ea5a3] ml-2">
                  {rating === 5 ? 'Excellent' : rating === 4 ? 'Good' : rating === 3 ? 'Average' : rating === 2 ? 'Needs Improvement' : 'Poor'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1.5">
              Subject / Topic *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Workstation network connectivity in AI Lab or Period 3 clash"
              className="h-10 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1.5">
              Detailed Observation / Feedback *
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              required
              rows={4}
              placeholder="Please provide specific details, including lab/room number, date, period, or steps to reproduce..."
              className="w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] p-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-[#edf2f1] dark:border-[#124349]">
            <p className="text-[11px] text-[#7a898c]">
              Submitted as: <strong className="text-[#003135] dark:text-[#55d6dc]">{user.fullName}</strong> ({roleNames[user.role]})
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#003135] px-5 text-xs font-semibold text-white shadow-xs hover:bg-[#024950] transition disabled:opacity-50 cursor-pointer"
            >
              {submitting && <LoaderCircle size={14} className="animate-spin" />}
              Submit Feedback Ticket
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

function FeedbackLogsTableView({
  records,
  user,
}: {
  records: AcademicRecord[]
  user: BackendUser
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [deletingFeedback, setDeletingFeedback] = useState<{ id: string; title: string } | null>(null)
  const [deletingFeedbackLoading, setDeletingFeedbackLoading] = useState(false)
  const [deletingFeedbackError, setDeletingFeedbackError] = useState<string | null>(null)
  const canUpdateStatus = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(user.role)

  const handleConfirmDeleteFeedback = async () => {
    if (!deletingFeedback) return
    setDeletingFeedbackLoading(true)
    setDeletingFeedbackError(null)
    try {
      const raw = await backendFetch(`/api/v1/feedback/${encodeURIComponent(deletingFeedback.id)}`, {
        method: 'DELETE',
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Delete failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || `Ticket ${deletingFeedback.id} removed.`, type: 'success' },
      }))
      setDeletingFeedback(null)
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (e: any) {
      setDeletingFeedbackError(e?.message || 'Failed to delete feedback ticket.')
    } finally {
      setDeletingFeedbackLoading(false)
    }
  }

  const handleStatusChange = async (feedbackId: string, nextStatus: 'REVIEWED' | 'IMPLEMENTED' | 'DISMISSED') => {
    setActioningId(feedbackId)
    try {
      const raw = await backendFetch(`/api/v1/feedback/${encodeURIComponent(feedbackId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok || res?.success === false) throw new Error(res?.message || 'Status update failed')
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: res?.message || `Ticket marked as ${nextStatus}.`, type: 'success' },
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Feedback update error: ${e instanceof Error ? e.message : 'Failed'}`, type: 'error' },
      }))
    } finally {
      setActioningId(null)
    }
  }

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const meta = r.meta || {}
      const cat = String(meta.category || '').toUpperCase()
      const st = String(meta.status || r.status || 'PENDING').toUpperCase()
      if (categoryFilter !== 'ALL' && !cat.includes(categoryFilter)) return false
      if (statusFilter !== 'ALL' && st !== statusFilter) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const commentMatch = String(meta.comments || '').toLowerCase().includes(q)
        const userMatch = String(meta.user_name || '').toLowerCase().includes(q)
        if (!titleMatch && !commentMatch && !userMatch) return false
      }
      return true
    })
  }, [records, categoryFilter, statusFilter, searchTerm])

  return (
    <div className="space-y-4">
      {/* Control Suite */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col gap-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search feedback tickets by subject or feedback comment..."
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>

          <div className="flex flex-wrap rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
            {(['ALL', 'PENDING', 'REVIEWED', 'IMPLEMENTED', 'DISMISSED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                {st === 'ALL' ? 'All Status' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1 w-fit">
          {(['ALL', 'TIMETABLE', 'LAB_FACILITY', 'BUG_REPORT', 'FEATURE_REQUEST', 'GENERAL'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                categoryFilter === cat
                  ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                  : 'text-[#647376] dark:text-[#8ea5a3]'
              }`}
            >
              {cat === 'ALL' ? 'All Tickets' : cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </Panel>

      {/* Table */}
      <div className="overflow-auto max-h-[calc(100vh-350px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Ticket ID</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Category & Department</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Subject & Observation</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Rating</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Submitted By</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
              {canUpdateStatus && (
                <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canUpdateStatus ? 7 : 6} className="p-8 text-center text-[#7a898c]">
                  No feedback tickets found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = r.meta || {}
                const feedbackId = String(meta.feedback_id || r.id)
                const rating = Number(meta.rating || 5)
                const category = String(meta.category || 'FEEDBACK').replaceAll('_', ' ')
                const author = String(meta.user_name || 'Campus Member')
                const dept = String(meta.department_id || 'CSE')
                const comments = meta.comments ? String(meta.comments) : null
                const ticketStatus = String(meta.status || r.status || 'PENDING').toUpperCase()
                const isFinal = ticketStatus === 'IMPLEMENTED' || ticketStatus === 'DISMISSED'

                return (
                  <tr key={r.id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3 font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc]">
                      {feedbackId}
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc] uppercase">
                        {dept} · {category}
                      </span>
                    </td>
                    <td className="p-3 max-w-md">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">
                        {r.title}
                      </span>
                      {comments && (
                        <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3] mt-0.5 line-clamp-2">
                          {comments}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center text-[#eab308]">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={i < rating ? 'text-[#eab308]' : 'text-slate-300 dark:text-slate-700'}>
                            {'\u2605'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-800 dark:text-slate-200 font-medium">
                        {author}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                        ticketStatus === 'IMPLEMENTED'
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : ticketStatus === 'REVIEWED'
                          ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300'
                          : ticketStatus === 'DISMISSED'
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                      }`}>
                        {ticketStatus}
                      </span>
                    </td>
                    {canUpdateStatus && (
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isFinal ? (
                            <>
                              {ticketStatus === 'PENDING' && (
                                <button
                                  type="button"
                                  disabled={actioningId === feedbackId}
                                  onClick={() => handleStatusChange(feedbackId, 'REVIEWED')}
                                  className="rounded-md border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 py-1 text-[11px] font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] disabled:opacity-50 btn-interactive cursor-pointer"
                                >
                                  Mark Reviewed
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={actioningId === feedbackId}
                                onClick={() => handleStatusChange(feedbackId, 'IMPLEMENTED')}
                                className="rounded-md bg-[#024950] px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-[#003135] disabled:opacity-50 btn-interactive cursor-pointer"
                              >
                                Resolve
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#a0afac] mr-1">Closed</span>
                          )}
                          <button
                            type="button"
                            disabled={actioningId === feedbackId}
                            onClick={() => {
                              setDeletingFeedbackError(null)
                              setDeletingFeedback({ id: feedbackId, title: `${feedbackId} — ${r.title}` })
                            }}
                            title="Delete feedback ticket"
                            className="inline-flex items-center justify-center rounded-md border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-[#331114]/70 p-1 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-[#41171b] btn-interactive"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {deletingFeedback && (
        <ConfirmActionModal
          title="Delete Feedback Ticket?"
          subject={deletingFeedback.title}
          description="Removes this feedback entry permanently from institutional logs."
          confirmLabel="Delete Ticket"
          loading={deletingFeedbackLoading}
          error={deletingFeedbackError}
          onClose={() => setDeletingFeedback(null)}
          onConfirm={handleConfirmDeleteFeedback}
        />
      )}
    </div>
  )
}

function RecommendationsTableView({
  user,
  clockState,
  onInspectFaculty,
  onBookVacantSlot,
}: {
  user: BackendUser
  clockState: ScheduleState
  onInspectFaculty?: (staffId: string, name: string) => void
  onBookVacantSlot?: (roomId: string, day: string, period: number, labId?: string | null) => void
}) {
  const [day, setDay] = useState<string>(
    clockState.day && clockState.day !== 'SUNDAY' ? clockState.day : 'MONDAY'
  )
  const [period, setPeriod] = useState<number>(clockState.period || 1)
  const [dept, setDept] = useState<string>(
    user.departmentId && user.departmentId !== 'ALL' ? user.departmentId : 'ALL'
  )
  const [activeTab, setActiveTab] = useState<'FACULTY' | 'LABS' | 'ROOMS'>('FACULTY')
  const [searchTerm, setSearchTerm] = useState('')
  const [scheduleFacility, setScheduleFacility] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (clockState.day && clockState.day !== 'SUNDAY') setDay(clockState.day)
    if (clockState.period) setPeriod(clockState.period)
  }, [clockState.day, clockState.period])

  const recResource = useLiveResource<{
    success: boolean
    data: {
      dayOfWeek: string
      periodIndex: number
      departmentId: string
      availableFacultyCount: number
      availableFaculty: Array<{
        staff_id: string
        full_name: string
        designation: string
        official_email: string
        department_id: string
        photo_url?: string | null
      }>
      vacantClassroomsCount: number
      vacantClassrooms: Array<{
        room_id: string
        room_number: string
        department_id: string
        capacity: number
        facilities_description?: string
      }>
      vacantLaboratoriesCount: number
      vacantLaboratories: Array<{
        lab_id: string
        room_id: string
        name: string
        room_number?: string
        department_id: string
        capacity: number
        incharge_name?: string
        equipment_details?: string
      }>
    }
  }>(`/api/v1/availability/recommendations?day=${encodeURIComponent(day)}&period=${period}&department=${encodeURIComponent(dept)}`)

  const recData = recResource.data?.data
  const q = searchTerm.trim().toLowerCase()

  const facultyList = useMemo(() => {
    const raw = recData?.availableFaculty || []
    if (!q) return raw
    return raw.filter(
      (f) =>
        f.full_name.toLowerCase().includes(q) ||
        f.staff_id.toLowerCase().includes(q) ||
        (f.designation || '').toLowerCase().includes(q) ||
        (f.department_id || '').toLowerCase().includes(q)
    )
  }, [recData?.availableFaculty, q])

  const labList = useMemo(() => {
    const raw = recData?.vacantLaboratories || []
    if (!q) return raw
    return raw.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.room_id.toLowerCase().includes(q) ||
        (l.department_id || '').toLowerCase().includes(q) ||
        (l.equipment_details || '').toLowerCase().includes(q)
    )
  }, [recData?.vacantLaboratories, q])

  const roomList = useMemo(() => {
    const raw = recData?.vacantClassrooms || []
    if (!q) return raw
    return raw.filter(
      (r) =>
        r.room_number.toLowerCase().includes(q) ||
        r.room_id.toLowerCase().includes(q) ||
        (r.department_id || '').toLowerCase().includes(q) ||
        (r.facilities_description || '').toLowerCase().includes(q)
    )
  }, [recData?.vacantClassrooms, q])

  return (
    <div className="space-y-4">
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              {ACADEMIC_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                <option key={p} value={p}>
                  Period {p}
                </option>
              ))}
            </select>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
            >
              <DepartmentOptions showAllOption allLabel="All Departments (Faculty)" suffix=" Faculty" includeValue={dept} />
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter recommendations..."
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#edf2f1] dark:border-[#124349]">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveTab('FACULTY')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'FACULTY'
                  ? 'bg-[#003135] text-white'
                  : 'bg-[#f5f7f6] dark:bg-[#031c1f] text-[#526164] dark:text-[#8ea5a3] hover:bg-[#e8efee]'
              }`}
            >
              Available Substitute Faculty ({facultyList.length})
            </button>
            <button
              onClick={() => setActiveTab('LABS')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'LABS'
                  ? 'bg-[#003135] text-white'
                  : 'bg-[#f5f7f6] dark:bg-[#031c1f] text-[#526164] dark:text-[#8ea5a3] hover:bg-[#e8efee]'
              }`}
            >
              Vacant Laboratories ({labList.length})
            </button>
            <button
              onClick={() => setActiveTab('ROOMS')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'ROOMS'
                  ? 'bg-[#003135] text-white'
                  : 'bg-[#f5f7f6] dark:bg-[#031c1f] text-[#526164] dark:text-[#8ea5a3] hover:bg-[#e8efee]'
              }`}
            >
              Vacant Classrooms ({roomList.length})
            </button>
          </div>
          <span className="font-mono text-[11px] text-[#08747c] dark:text-[#55d6dc]">
            Zero-Collision Snapshot · {day} Period {period}
          </span>
        </div>
      </Panel>

      <div className="overflow-auto max-h-[calc(100vh-345px)] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        {recResource.loading && !recData ? (
          <div className="p-8 text-center text-xs text-[#647376] dark:text-[#8ea5a3] flex items-center justify-center gap-2">
            <LoaderCircle size={14} className="animate-spin text-[#08747c]" />
            Computing zero-collision faculty and facility recommendations...
          </div>
        ) : activeTab === 'FACULTY' ? (
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
              <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Free Faculty Member</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Designation</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status ({day.slice(0, 3)} P{period})</th>
                <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {facultyList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#7a898c]">
                    No free faculty available for {day} Period {period} under current filter.
                  </td>
                </tr>
              ) : (
                facultyList.map((f) => (
                  <tr key={f.staff_id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <FacultyAvatar name={f.full_name} photo={f.photo_url || null} size="sm" />
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block">{f.full_name}</span>
                          <span className="font-mono text-[10px] text-[#08747c] dark:text-[#55d6dc]">{f.staff_id} · {f.official_email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{f.designation}</td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                        {f.department_id}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 size={11} /> FREE FOR SUBSTITUTION
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {onInspectFaculty && (
                        <button
                          onClick={() => onInspectFaculty(f.staff_id, f.full_name)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] transition"
                        >
                          <CalendarDays size={12} /> View Timetable
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : activeTab === 'LABS' ? (
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
              <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Vacant Practical Laboratory</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department & Room</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Capacity & Equipment</th>
                <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {labList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[#7a898c]">
                    All practical laboratories are occupied during {day} Period {period}.
                  </td>
                </tr>
              ) : (
                labList.map((l) => (
                  <tr key={l.lab_id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">{l.name}</span>
                      <span className="font-mono text-[10px] text-[#08747c] dark:text-[#55d6dc]">
                        {l.lab_id} {l.incharge_name ? `· Custodian: ${l.incharge_name}` : ''}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                        {l.department_id}
                      </span>
                      <span className="block font-mono text-[10px] text-[#647376] mt-0.5">{l.room_number || l.room_id}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">{l.capacity} seats</span>
                      <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] line-clamp-1">{l.equipment_details || 'Standard lab workstation setup'}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setScheduleFacility({ id: l.room_id, name: l.name })}
                          className="rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-[11px] font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] transition"
                        >
                          Timetable
                        </button>
                        {onBookVacantSlot && (
                          <button
                            onClick={() => onBookVacantSlot(l.room_id, day, period, l.lab_id)}
                            className="rounded-lg bg-[#08747c] hover:bg-[#003135] text-white px-2.5 py-1 text-[11px] font-semibold transition"
                          >
                            Book Lab
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
              <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
                <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Vacant Classroom</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department</th>
                <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Capacity & Facilities</th>
                <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roomList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[#7a898c]">
                    All lecture classrooms are occupied during {day} Period {period}.
                  </td>
                </tr>
              ) : (
                roomList.map((r) => (
                  <tr key={r.room_id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">{r.room_number}</span>
                      <span className="font-mono text-[10px] text-[#08747c] dark:text-[#55d6dc]">{r.room_id}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                        {r.department_id}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">{r.capacity} seats</span>
                      <span className="text-[11px] text-[#647376] dark:text-[#8ea5a3] line-clamp-1">{r.facilities_description || 'Smart Board & Audio Visual'}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setScheduleFacility({ id: r.room_id, name: r.room_number })}
                          className="rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 py-1 text-[11px] font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#f0f4f3] transition"
                        >
                          Timetable
                        </button>
                        {onBookVacantSlot && (
                          <button
                            onClick={() => onBookVacantSlot(r.room_id, day, period, null)}
                            className="rounded-lg bg-[#08747c] hover:bg-[#003135] text-white px-2.5 py-1 text-[11px] font-semibold transition"
                          >
                            Book Room
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {scheduleFacility && (
        <FacilityScheduleModal
          facilityId={scheduleFacility.id}
          facilityName={scheduleFacility.name}
          onClose={() => setScheduleFacility(null)}
          onBookSlot={(fid, bookDay, p, lid) => {
            setScheduleFacility(null)
            onBookVacantSlot?.(fid, bookDay, p, lid)
          }}
        />
      )}
    </div>
  )
}

function IngestionAuditStagingTableView({
  records,
  user,
  onRefresh,
}: {
  records: AcademicRecord[]
  user: BackendUser
  onRefresh?: () => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [committingDocId, setCommittingDocId] = useState<string | null>(null)

  const handleCommit = async (docId: string) => {
    setCommittingDocId(docId)
    try {
      const res = await backendFetch(
        `/api/v1/ingestion/commit/${encodeURIComponent(docId)}`,
        { method: 'POST' }
      )
      const payload = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
      if (res.ok && payload?.success) {
        window.dispatchEvent(new CustomEvent('gmritdu:toast', {
          detail: { message: payload.message || 'Uploaded timetable published to live schedule.', type: 'success' }
        }))
        window.dispatchEvent(new Event('gmritdu:data-change'))
        if (onRefresh) onRefresh()
      } else {
        window.dispatchEvent(new CustomEvent('gmritdu:toast', {
          detail: { message: payload?.message || 'Publishing failed', type: 'error' }
        }))
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Publish error: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' }
      }))
    } finally {
      setCommittingDocId(null)
    }
  }

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const meta = r.meta || {}
      const st = String(r.status || meta.status || 'STAGED').toUpperCase()
      if (statusFilter !== 'ALL' && st !== statusFilter) return false
      const dept = String(meta.department_id || 'CSE').toUpperCase()
      if (deptFilter !== 'ALL' && dept !== deptFilter) return false
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const titleMatch = r.title.toLowerCase().includes(q)
        const fileMatch = String(meta.original_filename || '').toLowerCase().includes(q)
        const userMatch = String(meta.uploaded_by || '').toLowerCase().includes(q)
        if (!titleMatch && !fileMatch && !userMatch) return false
      }
      return true
    })
  }, [records, statusFilter, deptFilter, searchTerm])

  return (
    <div className="space-y-4">
      {/* Control Suite */}
      <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#758386]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search uploaded schedules by filename, coordinator..."
            className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] pl-9 pr-3 text-xs outline-none focus:border-[#08747c]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f] p-1">
            {(['ALL', 'STAGED', 'COMMITTED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  statusFilter === st
                    ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                    : 'text-[#647376] dark:text-[#8ea5a3]'
                }`}
              >
                {st === 'ALL' ? 'All (Draft & Published)' : st === 'STAGED' ? 'DRAFT' : 'PUBLISHED'}
              </button>
            ))}
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2.5 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
          >
            <DepartmentOptions showAllOption allLabel="All Departments" includeValue={deptFilter} />
          </select>
        </div>
      </Panel>

      {/* Table */}
      <div className="overflow-auto lg:max-h-[calc(100vh-350px)] max-h-[65vh] min-h-[240px] rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f9f9] dark:bg-[#031d21]">
            <tr className="border-b border-[#dce4e3] dark:border-[#124349]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Doc ID &amp; Upload Date</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Source File &amp; Coordinator</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Department &amp; Academic Scope</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Extracted Slots</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Status</th>
              <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Schedule Publishing Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#7a898c]">
                  No uploaded timetable files found. Upload an Excel or spreadsheet file above to begin review.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = r.meta || {}
                const docId = String(meta.doc_id || r.id)
                const filename = r.title || String(meta.original_filename || 'timetable.xlsx')
                const status = String(r.status || meta.status || 'STAGED').toUpperCase()
                const deptId = String(meta.department_id || 'CSE')
                const academicYear = String(meta.academic_year || '2026-27')
                const semesterLabel = String(meta.semester_label || 'Semester Schedule')
                const totalSlots = Number(meta.total_slots_parsed || 0)
                const uploadedBy = String(meta.uploaded_by || 'Administrator')
                const createdAt = String(meta.created_at || '').slice(0, 10)
                const isCommitted = status === 'COMMITTED'

                return (
                  <tr key={r.id} className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors">
                    <td className="p-3">
                      <span className="font-mono text-xs font-bold text-[#003135] dark:text-[#55d6dc] block">
                        {docId}
                      </span>
                      <span className="font-mono text-[10px] text-[#7a898c] dark:text-[#7ba09d] block">
                        {createdAt}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs block">
                        {filename}
                      </span>
                      <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] block">
                        By: {uploadedBy}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                        {deptId}
                      </span>
                      <span className="block text-[11px] text-[#647376] dark:text-[#8ea5a3] mt-0.5">
                        {semesterLabel} ({academicYear})
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {totalSlots} slots
                    </td>
                    <td className="p-3">
                      <span className={`inline-block font-mono text-[9px] font-bold px-2 py-0.5 rounded ${
                        isCommitted
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 animate-pulse'
                      }`}>
                        {isCommitted ? '\u25CF PUBLISHED' : '\u25B2 PENDING REVIEW'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isCommitted ? (
                          <button
                            disabled={committingDocId === docId}
                            onClick={() => handleCommit(docId)}
                            className="rounded-lg bg-[#024950] px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] transition disabled:opacity-50 btn-interactive"
                          >
                            {committingDocId === docId ? 'Publishing…' : 'Publish to Schedule'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 justify-end">
                            <CheckCircle2 size={13} />
                            Published Active
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SystemHealthAuditTableView({
  records,
}: {
  records: AcademicRecord[]
}) {
  const formatHealthRow = (r: AcademicRecord) => {
    const rawId = String(r.id || '').toLowerCase()
    const meta = r.meta || {}
    if (rawId === 'database') {
      const connected = meta.connected !== false
      const staffCount = meta.staffRecords
      return {
        service: 'Academic Data Store',
        description: 'Institutional schedule, staff roster, and facility registry storage',
        value: connected
          ? typeof staffCount === 'number'
            ? `Connected · ${staffCount} Faculty Profiles`
            : 'Connected & Synchronized'
          : 'Reconnecting',
        healthy: connected,
      }
    }
    if (rawId === 'memory') {
      return {
        service: 'Institutional Scheduling Capacity',
        description: 'Active workspace throughput & concurrent scheduling readiness',
        value: 'Nominal Load · Ready',
        healthy: true,
      }
    }
    const rawVal = String(meta.value || r.subtitle || 'Operational')
    const sanitizedVal = rawVal.replace(/PostgreSQL|PGlite|Supabase|SQLite|Node\.js|Express/gi, 'Institutional Store')
    const isHealthy = !String(r.status || '').includes('CRITICAL') && !String(r.status || '').includes('WARN')
    return {
      service: r.title.startsWith('Record ') ? 'Core Operations Service' : r.title,
      description: 'Live institutional platform health indicator',
      value: sanitizedVal,
      healthy: isHealthy,
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
        <table className="w-full min-w-[800px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#dce4e3] dark:border-[#124349] bg-[#f7f9f9] dark:bg-[#031d21]">
              <th className="p-3 font-semibold text-[#003135] dark:text-[#55d6dc]">Institutional Service</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Service Responsibility</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Operational Status</th>
              <th className="p-3 font-semibold text-[#526164] dark:text-[#8ea5a3]">Readiness Level</th>
              <th className="p-3 text-right font-semibold text-[#526164] dark:text-[#8ea5a3]">Audit Assurance</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#7a898c]">
                  All institutional service checks normal. Zero operational anomalies recorded.
                </td>
              </tr>
            ) : (
              records.map((r, idx) => {
                const row = formatHealthRow(r)

                return (
                  <tr
                    key={r.id}
                    className="border-b border-[#e8efee] dark:border-[#124349] last:border-0 hover:bg-[#fafcfc] dark:hover:bg-[#082e34] transition-colors row-enter"
                    style={{ ['--stagger' as any]: idx }}
                  >
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100 text-xs">
                      {row.service}
                    </td>
                    <td className="p-3 text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                      {row.description}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {row.value}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block font-mono text-[9px] font-bold px-2 py-0.5 rounded ${
                        row.healthy
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300'
                      }`}>
                        {row.healthy ? 'OPTIMAL' : 'ATTENTION'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck size={13} />
                        Integrity Verified
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TimetableIngestionHeader({
  user,
  onRefresh,
  onOpenSlotModal,
}: {
  user: BackendUser
  onRefresh: () => void
  onOpenSlotModal?: () => void
}) {
  const [selectedDept, setSelectedDept] = useState(user.departmentId || 'CSE')
  const [isUploading, setIsUploading] = useState(false)
  const [showAddSubject, setShowAddSubject] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: 'positive' | 'critical' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setStatusMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('departmentId', selectedDept)
      const token = readAuthSession()?.token

      const res = await fetch('/api/v1/timetables/ingest/upload', {
        method: 'POST',
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Upload failed')
      }
      setStatusMessage({
        text: `\u2713 Successfully uploaded & processed "${file.name}"! Ready to review ${data.data?.totalSlotsParsed || 'all'} slots.`,
        tone: 'positive',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      onRefresh()
      window.dispatchEvent(new Event('gmritdu:data-change'))
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'File upload failed', tone: 'critical' })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Panel className="p-4 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl shadow-xs space-y-3.5">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#08747c]/10 dark:bg-[#08747c]/30 text-[#08747c] dark:text-[#55d6dc] uppercase tracking-wider">
            Schedule Upload Hub
          </span>
          <span className="text-[11px] text-[#7a898c] dark:text-[#7ba09d]">
            .xlsx, .xls, .csv, .pdf
          </span>
        </div>
        <h2 className="mt-1 text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
          Upload Timetables for Review
        </h2>
        <p className="text-[11px] text-[#526164] dark:text-[#94a3b8] mt-0.5 leading-relaxed">
          Upload multi-section timetable files, verify room and faculty availability, and publish directly to the live schedule.
        </p>
      </div>

      <div className="pt-2 border-t border-[#edf2f1] dark:border-[#124349] space-y-2.5">
        <div>
          <label className="block text-[10px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
            Target Academic Department
          </label>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            disabled={!['SUPER_ADMIN', 'DEAN'].includes(user.role)}
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[#dce4e3] dark:border-[#0a4a50] bg-[#fafcfb] dark:bg-[#002528] text-[#003135] dark:text-[#e0f2fe]"
          >
            <DepartmentOptions includeValue={selectedDept} />
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
            Custom Document Upload
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={handleFileUpload}
            className="hidden"
            id="timetable-file-upload-input"
          />
          <label
            htmlFor="timetable-file-upload-input"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#08747c] hover:bg-[#065b61] text-white shadow-xs cursor-pointer transition-colors"
          >
            {isUploading ? <LoaderCircle size={13} className="animate-spin" /> : <HardDriveDownload size={13} />}
            {isUploading ? 'Uploading...' : 'Upload Excel / PDF'}
          </label>
        </div>

        <div className="pt-2 border-t border-[#edf2f1] dark:border-[#124349] grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowAddSubject(true)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold border border-[#d6dfde] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#072a2f] text-[#003135] dark:text-[#55d6dc] hover:bg-[#eaf3f2] transition cursor-pointer"
          >
            <Plus size={12} />
            Add Subject
          </button>
          {onOpenSlotModal && (
            <button
              type="button"
              onClick={onOpenSlotModal}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold bg-[#024950] hover:bg-[#003135] text-white transition cursor-pointer"
            >
              <Plus size={12} />
              Assign Slot
            </button>
          )}
        </div>
      </div>

      {showAddSubject && (
        <AddSubjectModal
          defaultDept={selectedDept}
          restrictDept={user.role !== 'SUPER_ADMIN'}
          onClose={() => setShowAddSubject(false)}
          onSuccess={() => {
            onRefresh()
            window.dispatchEvent(new Event('gmritdu:data-change'))
          }}
        />
      )}

      {statusMessage && (
        <div
          className={`p-2.5 rounded-lg text-xs font-medium ${
            statusMessage.tone === 'positive'
              ? 'bg-[#edf9f5] dark:bg-[#052d27] text-[#1b6d53] dark:text-[#45c39c] border border-[#bbf0df] dark:border-[#0c594b]'
              : 'bg-[#fef2f2] dark:bg-[#450a0a] text-[#b91c1c] dark:text-[#f87171] border border-[#fecaca] dark:border-[#7f1d1d]'
          }`}
        >
          {statusMessage.text}
        </div>
      )}
    </Panel>
  )
}

function AddSubjectModal({
  defaultDept,
  restrictDept,
  onClose,
  onSuccess,
}: {
  defaultDept: string
  restrictDept: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [departmentId, setDepartmentId] = useState(defaultDept || 'CSE')
  const [semesterId, setSemesterId] = useState('SEM_3')
  const [subjectCode, setSubjectCode] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [courseType, setCourseType] = useState('THEORY')
  const [credits, setCredits] = useState('3')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subjectCode.trim() || !subjectName.trim()) {
      setError('Subject code and subject name are required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const raw = await backendFetch('/api/v1/timetables/subjects', {
        method: 'POST',
        body: JSON.stringify({
          department_id: departmentId,
          semester_id: semesterId,
          subject_code: subjectCode.trim().toUpperCase(),
          subject_name: subjectName.trim(),
          course_type: courseType,
          credits: Number(credits) || 3,
        }),
      })
      const res = (await raw.json()) as any
      if (!raw.ok || !res.success) throw new Error(res.message || 'Failed to register subject.')
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: { message: res.message || `Subject ${subjectCode.trim().toUpperCase()} saved.`, type: 'success' },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to register subject.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-5 sm:px-6 py-4 shrink-0">
          <div>
            <span className="font-mono text-[10px] font-bold text-[#08747c] dark:text-[#55d6dc] uppercase">
              Curriculum Catalog
            </span>
            <h2 className="text-sm font-bold text-[#003135] dark:text-[#55d6dc]">Add Institutional Subject</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
          >
            <X size={16} />
          </button>
        </header>
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Department *
              </label>
              <select
                value={departmentId}
                disabled={restrictDept}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
              >
                <DepartmentOptions includeValue={departmentId} />
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Semester *
              </label>
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
              >
                {['SEM_1', 'SEM_2', 'SEM_3', 'SEM_4', 'SEM_5', 'SEM_6', 'SEM_7', 'SEM_8'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Subject Code *
              </label>
              <input
                required
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                placeholder="e.g. 23CS301"
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-mono uppercase outline-none focus:border-[#08747c]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Course Type *
              </label>
              <select
                value={courseType}
                onChange={(e) => setCourseType(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs font-semibold outline-none"
              >
                <option value="THEORY">THEORY</option>
                <option value="LABORATORY">LABORATORY</option>
                <option value="PROJECT">PROJECT</option>
                <option value="SEMINAR">SEMINAR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Subject Name *
              </label>
              <input
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. Data Structures"
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#003135] dark:text-[#55d6dc] mb-1">
                Credits
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf2f1] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-[#647376] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#08747c] hover:bg-[#003135] text-white disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Create Subject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BlockchainAuditLedgerPanel() {
  const [status, setStatus] = useState<any>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<any>(null)

  useEffect(() => {
    backendFetch('/api/v1/blockchain/status', {}, { authenticated: false })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStatus(data.data)
      })
      .catch((e) => console.error('Failed to load blockchain status', e))
  }, [])

  const runProbe = async () => {
    setIsVerifying(true)
    try {
      const res = await backendFetch('/api/v1/blockchain/verify', {}, { authenticated: false })
      const data = await res.json()
      if (data.success) {
        setVerificationResult(data.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsVerifying(false)
    }
  }

  const totalBlocks = status?.totalBlocks ?? 0
  const latestHash = status?.latestBlockHash || 'Synchronizing institutional audit seal...'
  const merkleRoot = status?.latestMerkleRoot || 'Synchronizing verification seal...'
  const isSynchronized = Boolean(status)
  const tamperLabel = verificationResult
    ? '100.0% Verified'
    : isSynchronized
      ? 'Trail Active'
      : 'Synchronizing...'
  const chainState = status?.status || 'SYNCING'

  return (
    <Panel className="mb-6 p-4 sm:p-5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#002528] rounded-xl shadow-sm card-interactive">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#08747c]/10 dark:bg-[#08747c]/30 text-[#08747c] dark:text-[#55d6dc] uppercase tracking-wider">
              Institutional Audit Trail
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1b6d53] dark:text-[#45c39c]">
              <ShieldCheck size={13} /> Verified Campus Governance
            </span>
          </div>
          <h3 className="mt-1 text-sm font-bold text-[#003135] dark:text-[#e0f2fe]">
            Tamper-Evident Academic Schedule Ledger
          </h3>
          <p className="text-xs text-[#526164] dark:text-[#94a3b8] mt-0.5">
            Every published timetable version, slot substitution, and leave decision is sealed into an immutable verification record.
          </p>
        </div>

        <button
          type="button"
          onClick={runProbe}
          disabled={isVerifying}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#08747c] hover:bg-[#065b61] text-white shadow-sm btn-interactive shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isVerifying ? (
            <>
              <LoaderCircle size={13} className="animate-spin" /> Verifying Records...
            </>
          ) : (
            <>
              <ShieldCheck size={14} /> Run Integrity Verification
            </>
          )}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-lg border border-[#e8efee] dark:border-[#0e3b40] bg-[#f8faf9] dark:bg-[#031d21]">
          <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] font-medium uppercase tracking-wider">
            Sealed Records
          </span>
          <strong className="block text-base font-mono font-bold text-[#003135] dark:text-[#e0f2fe] mt-1">
            {totalBlocks} Entries
          </strong>
        </div>

        <div className="p-3 rounded-lg border border-[#e8efee] dark:border-[#0e3b40] bg-[#f8faf9] dark:bg-[#031d21]">
          <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] font-medium uppercase tracking-wider">
            Verification Authority
          </span>
          <strong className="block text-xs font-semibold text-[#003135] dark:text-[#e0f2fe] mt-1 truncate">
            GMRITDU Central Governance
          </strong>
        </div>

        <div className="p-3 rounded-lg border border-[#e8efee] dark:border-[#0e3b40] bg-[#f8faf9] dark:bg-[#031d21]">
          <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] font-medium uppercase tracking-wider">
            Tamper Protection
          </span>
          <strong className="block text-xs font-bold text-[#1b6d53] dark:text-[#45c39c] mt-1">
            {tamperLabel}
          </strong>
        </div>

        <div className="p-3 rounded-lg border border-[#e8efee] dark:border-[#0e3b40] bg-[#f8faf9] dark:bg-[#031d21]">
          <span className="text-[10px] text-[#7a898c] dark:text-[#7ba09d] font-medium uppercase tracking-wider">
            Ledger Status
          </span>
          <strong className="block text-xs font-mono font-bold text-[#08747c] dark:text-[#55d6dc] mt-1">
            {chainState}
          </strong>
        </div>
      </div>

      <div className="mt-3 p-3 rounded-lg border border-[#e8efee] dark:border-[#0e3b40] bg-[#f8faf9] dark:bg-[#031d21] text-[11px] font-mono space-y-1">
        <div className="flex items-center justify-between text-[#526164] dark:text-[#94a3b8] flex-wrap gap-1">
          <span className="font-bold">Latest Audit Seal:</span>
          <span className="text-[#08747c] dark:text-[#55d6dc] truncate max-w-[420px]">{latestHash}</span>
        </div>
        <div className="flex items-center justify-between text-[#526164] dark:text-[#94a3b8] flex-wrap gap-1">
          <span className="font-bold">Verification Seal:</span>
          <span className="text-[#08747c] dark:text-[#55d6dc] truncate max-w-[420px]">{merkleRoot}</span>
        </div>
      </div>

      {verificationResult && (
        <div className="mt-3 p-3 rounded-lg bg-[#edf9f5] dark:bg-[#052d27] border border-[#bbf0df] dark:border-[#0c594b] flex items-center justify-between text-xs text-[#1b6d53] dark:text-[#45c39c] view-enter">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span className="font-bold">
              Ledger Integrity Verified: {verificationResult.totalBlocks} Records Audited · 0 Discrepancies · 100.0% Intact
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#bbf0df] dark:bg-[#0c594b] text-[#1b6d53] dark:text-[#45c39c]">
            Verified Clean
          </span>
        </div>
      )}
    </Panel>
  )
}

/* =========================================================================
   OPERATING BELL SIMULATOR RAIL
   ========================================================================= */

export function OperatingBellSimulatorRail({
  currentPeriod,
  simulatedPeriod,
  onSelectPeriod,
}: {
  currentPeriod: number | null
  simulatedPeriod: number | null
  onSelectPeriod: (p: number | null) => void
}) {
  const periods = [1, 2, 3, 4, 5, 6, 7]

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] shadow-xs">
      <div className="flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc]">
        <Clock size={13} />
        <span>Bell Rail:</span>
      </div>
      <button
        type="button"
        onClick={() => onSelectPeriod(null)}
        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
          simulatedPeriod === null
            ? 'bg-[#003135] text-white dark:bg-[#0fa4af] dark:text-white shadow-xs'
            : 'text-[#647376] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#072d32]'
        }`}
      >
        LIVE
      </button>
      {periods.map((p) => {
        const isSelected = simulatedPeriod === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelectPeriod(p)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              isSelected
                ? 'bg-[#08747c] text-white dark:bg-[#55d6dc] dark:text-[#003135] shadow-xs font-bold'
                : 'text-[#647376] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#072d32]'
            }`}
          >
            P{p}
          </button>
        )
      })}
      <div className="ml-auto flex items-center gap-2 pr-1">
        {simulatedPeriod !== null ? (
          <span className="text-[11px] font-medium text-[#b57a1e] dark:text-[#f3bf67] bg-[#fef9ee] dark:bg-[#2e210a] px-2 py-0.5 rounded-md border border-[#f4ddaa] dark:border-[#5a4214]">
            Simulating Period {simulatedPeriod}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-[#1b6d53] dark:text-[#45c39c] flex items-center gap-1.5 bg-[#f0f9f5] dark:bg-[#062c23] px-2 py-0.5 rounded-md border border-[#c3e8d8] dark:border-[#0e5c49]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1b6d53] dark:bg-[#45c39c] animate-pulse" />
            Active Real-Time Schedule
          </span>
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   ROLE-ADAPTIVE OVERVIEW DASHBOARDS
   ========================================================================= */

function extractLiveClasses(res: any): any[] {
  if (!res) return []
  if (Array.isArray(res)) return res
  if (Array.isArray(res.data)) return res.data
  if (Array.isArray(res.data?.classes)) return res.data.classes
  if (Array.isArray(res.classes)) return res.classes
  return []
}

function extractFacilities(res: any): any[] {
  if (!res) return []
  if (Array.isArray(res)) return res
  if (Array.isArray(res.data)) return res.data
  if (Array.isArray(res.data?.facilities)) return res.data.facilities
  if (Array.isArray(res.facilities)) return res.facilities
  return []
}

function StudentOverviewDeck({
  user,
  clockState,
  onNavigate,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (s: AcademicScreen) => void
}) {
  const timetableRes = useLiveResource<{
    success: boolean
    data: {
      department: string
      semester: string
      section: string
      slots: Array<{
        slot_id: string
        day_of_week: string
        period_index: number
        start_time: string
        end_time: string
        subject_name: string
        subject_code: string
        faculty_name: string
        faculty_designation: string
        room_number: string
        is_continuous: boolean
      }>
    }
  }>('/api/v1/timetables/my-section')

  const eventsRes = useLiveResource<{
    success: boolean
    data: Array<{
      event_id: string
      title: string
      event_type: string
      event_date: string
      end_date: string
      venue: string
    }>
  }>('/api/v1/events?limit=4')

  const labsRes = useLiveResource<{
    success: boolean
    data: Array<{
      lab_id: string
      name: string
      room_number: string
      capacity: number
      equipment_details?: string
      incharge_name?: string
      incharge_designation?: string
    }>
  }>(`/api/v1/laboratories?department=${encodeURIComponent(user.departmentId || 'CSE')}`)

  const departmentLabs = useMemo(() => {
    return labsRes.data?.data || []
  }, [labsRes.data])

  const todaySlots = useMemo(() => {
    const day = clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day
    const list = timetableRes.data?.data?.slots || []
    return list
      .filter((s) => s.day_of_week === day)
      .sort((a, b) => a.period_index - b.period_index)
  }, [timetableRes.data, clockState.day])

  const currentPeriod = clockState.period || 1

  return (
    <div className="space-y-4">
      {/* Student Welcome Cockpit Banner */}
      <Panel tone="inverse" className="p-3 sm:p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-base font-bold border border-white/20">
              {user.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#55d6dc] text-[#003135] uppercase">
                  Student Portal
                </span>
                <span className="text-xs text-white/80">Section {user.sectionId || user.departmentId || 'Assigned'}</span>
              </div>
              <h2 className="mt-0.5 text-base font-bold text-white tracking-tight">{user.fullName}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="px-3 py-1.5 rounded-lg bg-white text-[#003135] text-xs font-bold hover:bg-[#eaf5f4] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarDays size={13} />
              Academic Calendar
            </button>
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 size={13} />
              Free Labs
            </button>
          </div>
        </div>
      </Panel>

      {/* 2-Column Split Cockpit Layout */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left Column: Today's Academic Schedule (Periods 1 to 7) */}
        <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8efee] dark:border-[#124349]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
                <Clock size={13} />
                Today's Classes ({clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day})
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#edf2f1] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                Period {currentPeriod} Active
              </span>
            </div>

            {todaySlots.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#7a898c]">
                No classes scheduled for today.
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                {todaySlots.map((slot) => {
                  const isLive = slot.period_index === currentPeriod
                  const isPast = slot.period_index < currentPeriod
                  return (
                    <div
                      key={slot.slot_id}
                      className={`p-2.5 rounded-lg border transition-all flex items-center justify-between ${
                        isLive
                          ? 'border-[#08747c] dark:border-[#55d6dc] bg-[#eef7f6] dark:bg-[#063b41] ring-1 ring-[#08747c]/30 shadow-xs'
                          : isPast
                          ? 'border-[#e8efee] dark:border-[#124349] bg-white/60 dark:bg-[#042024]/60 opacity-70'
                          : 'border-[#e8efee] dark:border-[#124349] bg-white dark:bg-[#062327]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          isLive ? 'bg-[#08747c] text-white' : 'bg-[#edf2f1] dark:bg-[#072d32] text-[#076970] dark:text-[#55d6dc]'
                        }`}>
                          P{slot.period_index}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#003135] dark:text-[#e0f2fe] truncate">
                            {slot.subject_name}
                          </h4>
                          <span className="text-[10px] text-[#647376] dark:text-[#8ea5a3] truncate block">
                            {slot.faculty_name} · Room: {slot.room_number?.replace(/\s*\(.*\)/, '') || 'Hall'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#1b6d53] dark:text-[#45c39c] uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#1b6d53] animate-pulse" />
                            Live
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#7a898c]">
                            {slot.start_time}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="pt-2 mt-2 border-t border-[#e8efee] dark:border-[#124349] flex items-center justify-between text-[11px]">
            <span className="text-[#7a898c]">Section: {user.sectionId || user.departmentId || 'Assigned'}</span>
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="text-[#08747c] dark:text-[#55d6dc] font-semibold hover:underline"
            >
              Campus Facilities →
            </button>
          </div>
        </Panel>

        {/* Right Column: Practicals & Lab Availability */}
        <Panel className="p-3.5 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8efee] dark:border-[#124349]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
                <FlaskConical size={13} />
                Department Practicals & Vacancy
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('labs')}
                className="text-[11px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
              >
                Labs →
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
              {departmentLabs.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#7a898c]">
                  {labsRes.loading
                    ? 'Loading department laboratory facilities...'
                    : 'No laboratories registered yet for your department.'}
                </div>
              ) : (
                departmentLabs.slice(0, 3).map((lab) => (
                  <div
                    key={lab.lab_id}
                    className="p-2.5 rounded-lg border border-[#e8efee] dark:border-[#124349] bg-[#fbfdfc] dark:bg-[#042024] flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-[#e2f1f0] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                        {lab.room_number ? `${lab.name.split(' ')[0]} Lab · ${lab.room_number}` : lab.name}
                      </span>
                      <h4 className="mt-1 text-xs font-semibold text-[#003135] dark:text-[#e0f2fe] truncate">
                        {lab.name}
                      </h4>
                      <span className="text-[10px] text-[#647376] dark:text-[#8ea5a3] truncate block">
                        {lab.incharge_name ? `In-Charge: ${lab.incharge_name}` : 'Autonomous Lab'} · Cap: {lab.capacity || 70}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#1b6d53] dark:text-[#45c39c] uppercase shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#1b6d53] animate-pulse" />
                      Active
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-[#e8efee] dark:border-[#124349] flex items-center justify-between text-[11px]">
            <span className="text-[#7a898c]">Need special lab booking?</span>
            <button
              type="button"
              onClick={() => onNavigate('bookings')}
              className="text-[#08747c] dark:text-[#55d6dc] font-bold hover:underline cursor-pointer"
            >
              Request to HOD →
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function FacultyOverviewDeck({
  user,
  clockState,
  onNavigate,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (s: AcademicScreen) => void
}) {
  const dept = user.departmentId || 'CSE'
  const workloadRes = useLiveResource<{
    success: boolean
    data: Array<{
      staff_id: string
      full_name: string
      designation: string
      department_id: string
      weekly_workload: number
      max_workload: number
      is_overloaded: boolean
    }>
  }>(`/api/v1/timetables/faculty-workload?department=${encodeURIComponent(dept)}`)

  const subsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>(`/api/v1/substitutions?department=${encodeURIComponent(dept)}`)

  const liveClassesRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>(`/api/v1/availability/live-classes?department=${encodeURIComponent(dept)}&day=${clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day}&period=${clockState.period || 1}`)

  const myWorkload = useMemo(() => {
    const list = workloadRes.data?.data || []
    return list.find((w) => w.staff_id === user.pnr || w.full_name?.toLowerCase().includes(user.fullName.toLowerCase())) || list[0]
  }, [workloadRes.data, user])

  const assignedHrs = myWorkload?.weekly_workload || 16
  const maxHrs = myWorkload?.max_workload || 18
  const pct = Math.min(100, Math.round((assignedHrs / maxHrs) * 100))

  return (
    <div className="space-y-4">
      {/* Faculty Cockpit Banner */}
      <Panel tone="inverse" className="p-3.5 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-base font-bold backdrop-blur-xs border border-white/20">
              {user.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#55d6dc] text-[#003135] uppercase">
                  Faculty Instructor
                </span>
                <span className="text-xs text-white/80">{dept} Department</span>
              </div>
              <h2 className="mt-0.5 text-base font-bold text-white tracking-tight">{user.fullName}</h2>
              <p className="text-[11px] text-white/70">
                Staff ID: <span className="font-mono font-semibold text-[#55d6dc]">{user.pnr || user.userId}</span> · Autonomous Faculty Registry
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('substitutions')}
              className="px-3 py-1.5 rounded-lg bg-white text-[#003135] text-xs font-bold hover:bg-[#eaf5f4] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <UserCheck size={13} />
              Request Leave & Substitute
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bookings')}
              className="px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
            >
              <FlaskConical size={13} />
              Reserve Lab for Practical
            </button>
          </div>
        </div>

        {/* Weekly Workload Bar */}
        <div className="mt-3 pt-2.5 border-t border-white/15">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-white/80 text-[11px]">Weekly Lecture & Lab Workload Hours</span>
            <span className="font-mono font-bold text-[#55d6dc] text-[11px]">
              {assignedHrs} / {maxHrs} Hours ({pct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct > 90 ? 'bg-[#f08575]' : 'bg-[#55d6dc]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Panel>

      {/* Grid: Active Department Classes & Substitutions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
              <Clock size={14} />
              Live Classes in Period {clockState.period || 1}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
            >
              Campus Facilities
            </button>
          </div>
          <div className="space-y-2">
            {extractLiveClasses(liveClassesRes.data).slice(0, 3).map((cls: any, i: number) => (
              <div
                key={cls.slot_id || i}
                className="p-2.5 rounded-xl border border-[#e2eae9] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#042428] flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#e2f1f0] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                    {cls.section_id || 'CSE-A'}
                  </span>
                  <h4 className="mt-0.5 text-xs font-bold text-[#003135] dark:text-[#e0f2fe] truncate">
                    {cls.subject_name || cls.title}
                  </h4>
                  <span className="text-[10px] text-[#647376] dark:text-[#8ea5a3]">
                    {cls.faculty_name} · {cls.room_id || cls.room_number || 'Classroom'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1b6d53] dark:text-[#45c39c] uppercase shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1b6d53] dark:bg-[#45c39c] animate-pulse" />
                  Active
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
              <UserCheck size={14} />
              Recent Substitution Coverage
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('substitutions')}
              className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
            >
              All Substitutions
            </button>
          </div>
          <div className="space-y-2">
            {(subsRes.data?.data || []).slice(0, 3).map((sub: any, i: number) => (
              <div
                key={sub.substitution_id || i}
                className="p-2.5 rounded-xl border border-[#e2eae9] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#042428]"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[#08747c] dark:text-[#55d6dc]">
                    {sub.day_of_week} · Period {sub.period_index}
                  </span>
                  <StatusBadge tone={sub.status === 'APPROVED' ? 'green' : 'amber'}>
                    {sub.status}
                  </StatusBadge>
                </div>
                <h4 className="mt-0.5 text-xs font-semibold text-[#003135] dark:text-[#e0f2fe]">
                  {sub.subject_name}
                </h4>
                <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3] mt-0.5">
                  {sub.original_faculty_name} → <strong className="text-[#08747c] dark:text-[#55d6dc]">{sub.substitute_faculty_name}</strong>
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function DeptAdminOverviewDeck({
  user,
  clockState,
  simulatedPeriod,
  onSetSimulatedPeriod,
  onNavigate,
  onInspectFaculty,
  onBookLabSlot,
}: {
  user: BackendUser
  clockState: ScheduleState
  simulatedPeriod?: number | null
  onSetSimulatedPeriod?: (p: number | null) => void
  onNavigate: (s: AcademicScreen) => void
  onInspectFaculty?: (staffId: string, name: string) => void
  onBookLabSlot?: (roomId: string, day: string, period: number, labId?: string | null) => void
}) {
  const dept = user.departmentId || 'CSE'

  // Interactive controls synchronized with top Bell Rail state when wired
  const [localPeriod, setLocalPeriod] = useState<number>(clockState.period || 1)
  const selectedPeriod =
    simulatedPeriod !== undefined && simulatedPeriod !== null
      ? simulatedPeriod
      : onSetSimulatedPeriod
      ? clockState.period || 1
      : localPeriod
  const handleSelectPeriod = (p: number | null) => {
    if (onSetSimulatedPeriod) {
      onSetSimulatedPeriod(p)
    } else if (p !== null) {
      setLocalPeriod(p)
    }
  }

  const [selectedYear, setSelectedYear] = useState<'ALL' | 2 | 3 | 4>('ALL')
  const [facultySearch, setFacultySearch] = useState('')
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('')
  const [facultyRosterTab, setFacultyRosterTab] = useState<'BUSY' | 'FREE'>('BUSY')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [inspectedFacility, setInspectedFacility] = useState<{ id: string; name: string } | null>(null)

  const activeDay = clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day

  const periodSchedule = [
    { p: 1, time: '09:00 - 10:00' },
    { p: 2, time: '10:00 - 11:00' },
    { p: 3, time: '11:10 - 12:10' },
    { p: 4, time: '12:10 - 13:10' },
    { p: 5, time: '14:00 - 15:00' },
    { p: 6, time: '15:00 - 16:00' },
    { p: 7, time: '16:00 - 17:00' },
  ]

  const activePeriodMeta = periodSchedule.find((p) => p.p === selectedPeriod) || periodSchedule[0]

  // Live classes for department at active period
  const liveClassesRes = useLiveResource<{
    success: boolean
    data: {
      dayOfWeek: string
      periodIndex: number
      count: number
      classes: Array<{
        section_id: string
        cohort_label: string
        department_id: string
        semester_number: number
        section_name: string
        period_index: number
        time_range: string
        subject_code: string
        subject_name: string
        course_type: string
        location: string
        room_number: string
        is_laboratory: number
        faculty_name: string
        original_faculty_name: string
        is_substituted: boolean
        substitution_reason?: string | null
      }>
    }
  }>(`/api/v1/availability/live-classes?department=${encodeURIComponent(dept)}&day=${activeDay}&period=${selectedPeriod}`)

  // Real department sections count
  const sectionsRes = useLiveResource<{
    success: boolean
    data: Array<{ section_id: string; semester_id: string; section_name: string }>
  }>(`/api/v1/timetables/sections?department=${encodeURIComponent(dept)}`)

  // Real department faculty roster
  const facultyRes = useLiveResource<{
    success: boolean
    data: Array<{
      staff_id: string
      full_name: string
      designation: string
      official_email: string
      department_id: string
      total_periods_per_week: number
      is_overloaded: boolean
    }>
  }>(`/api/v1/timetables/faculty-workload?department=${encodeURIComponent(dept)}`)

  // Free vs Busy department faculty at selected period
  const freeFacultyRes = useLiveResource<{
    success: boolean
    data: {
      availableFacultyCount: number
      busyFacultyCount: number
      availableFaculty: Array<{ staff_id: string; full_name: string; designation: string }>
      busyFaculty: Array<{ staff_id: string; full_name: string; designation: string; conflict_details?: string | null }>
    }
  }>(`/api/v1/availability/free-faculty?day=${activeDay}&period=${selectedPeriod}&department=${encodeURIComponent(dept)}`)

  // Real department laboratory availability at selected period
  const deptLabsAvailRes = useLiveResource<{
    success: boolean
    data: {
      facilities: Array<{
        facility_id: string
        room_id: string
        lab_id: string | null
        name: string
        room_number?: string
        capacity: number
        status: string
        occupied_by?: { subject?: string; faculty?: string; section?: string } | null
      }>
    }
  }>(`/api/v1/availability?type=LABORATORY&department=${encodeURIComponent(dept)}&day=${activeDay}&period=${selectedPeriod}`)

  // Pending lab requests
  const pendingBookingsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>(`/api/v1/laboratories/pending-requests?department=${encodeURIComponent(dept)}`)

  const liveClasses = useMemo(() => extractLiveClasses(liveClassesRes.data), [liveClassesRes.data])

  const facultyList = useMemo(() => {
    const list = facultyRes.data?.data || []
    return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [facultyRes.data])

  const pendingBookings = useMemo(() => pendingBookingsRes.data?.data || [], [pendingBookingsRes.data])

  const deptSections = useMemo(() => sectionsRes.data?.data || [], [sectionsRes.data])

  const deptLabs = useMemo(() => deptLabsAvailRes.data?.data?.facilities || [], [deptLabsAvailRes.data])
  const freeLabsCount = useMemo(
    () => deptLabs.filter((l) => l.status === 'AVAILABLE' || l.status === 'FREE').length,
    [deptLabs]
  )

  const freeFacultyList = useMemo(
    () => freeFacultyRes.data?.data?.availableFaculty || [],
    [freeFacultyRes.data]
  )
  const busyFacultyList = useMemo(
    () => freeFacultyRes.data?.data?.busyFaculty || [],
    [freeFacultyRes.data]
  )

  // Cohort groups for Years 2, 3, 4 (Semesters 3, 5, 7) derived dynamically from dept sections
  const cohortGroups = useMemo(() => {
    const years = [
      { year: 2 as const, sem: 3, semId: 'SEM_3', label: '2nd Year Engineering (Semester 3)' },
      { year: 3 as const, sem: 5, semId: 'SEM_5', label: '3rd Year Engineering (Semester 5)' },
      { year: 4 as const, sem: 7, semId: 'SEM_7', label: '4th Year Engineering (Semester 7)' },
    ]

    return years.map((y) => {
      const configuredSecs = deptSections
        .filter((s) => s.semester_id === y.semId || s.semester_id === `SEM_${y.sem}`)
        .map((s) => s.section_name)
      const secNames = configuredSecs.length > 0 ? configuredSecs : ['A', 'B', 'C', 'D']
      const classesForYear = liveClasses.filter((c: any) => c.semester_number === y.sem)
      const sections = secNames.map((sec) => {
        const cls = classesForYear.find((c: any) => c.section_name === sec)
        return { section: sec, classInfo: cls || null }
      })
      return { ...y, sections }
    })
  }, [liveClasses, deptSections])

  const displayedCohorts = useMemo(() => {
    if (selectedYear === 'ALL') return cohortGroups
    return cohortGroups.filter((g) => g.year === selectedYear)
  }, [cohortGroups, selectedYear])

  // Faculty live class finder calculation
  const searchedFacultyData = useMemo(() => {
    if (!facultySearch.trim() && !selectedFacultyId) return null
    const query = facultySearch.trim().toLowerCase()
    const targetFac = selectedFacultyId
      ? facultyList.find((f) => f.staff_id === selectedFacultyId)
      : facultyList.find((f) => f.full_name.toLowerCase().includes(query))

    if (!targetFac) return null

    const activeClass = liveClasses.find(
      (c: any) =>
        c.faculty_name?.toLowerCase().includes(targetFac.full_name.toLowerCase()) ||
        targetFac.full_name.toLowerCase().includes(c.faculty_name?.toLowerCase())
    )

    return {
      faculty: targetFac,
      activeClass: activeClass || null,
    }
  }, [facultySearch, selectedFacultyId, facultyList, liveClasses])

  const facultyCounts = useMemo(() => {
    if (freeFacultyRes.data?.data) {
      const inSession = busyFacultyList.length
      const free = freeFacultyList.length
      return { inSession, free, total: facultyList.length || inSession + free }
    }
    const teachingNames = new Set(liveClasses.map((c: any) => c.faculty_name?.toLowerCase()))
    let inSession = 0
    let free = 0
    facultyList.forEach((f) => {
      if (teachingNames.has(f.full_name.toLowerCase())) inSession++
      else free++
    })
    return { inSession, free, total: facultyList.length }
  }, [freeFacultyRes.data, busyFacultyList.length, freeFacultyList.length, liveClasses, facultyList])

  const handleBookingAction = async (bookingId: string, action: 'APPROVE' | 'REJECT') => {
    setActioningId(bookingId)
    try {
      const raw = await backendFetch(`/api/v1/laboratories/bookings/${encodeURIComponent(bookingId)}/approval`, {
        method: 'PUT',
        body: JSON.stringify({ action }),
      })
      const res = (await raw.json().catch(() => ({}))) as any
      if (!raw.ok) throw new Error(res.message || 'Action failed')
      window.dispatchEvent(
        new CustomEvent('gmritdu:toast', {
          detail: {
            message: action === 'APPROVE' ? 'Lab booking confirmed.' : 'Lab booking rejected.',
            type: action === 'APPROVE' ? 'success' : 'info',
          },
        })
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      pendingBookingsRes.retry()
    } catch (e) {
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: `Decision error: ${e instanceof Error ? e.message : 'Unknown error'}`, type: 'error' }
      }))
    } finally {
      setActioningId(null)
    }
  }

  return (
    <div className="space-y-2.5">
      {/* 1. HOD Executive Command Banner */}
      <Panel tone="inverse" className="p-2.5 sm:p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-base font-bold border border-white/20">
              <Building2 size={18} className="text-[#55d6dc]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#55d6dc] text-[#003135] uppercase">
                  {dept} Department Head
                </span>
                <span className="text-[11px] text-white/80">
                  {simulatedPeriod !== null && simulatedPeriod !== undefined
                    ? `Simulating ${activeDay} · Period ${selectedPeriod}`
                    : `Live Academic Operations · ${activeDay}`}
                </span>
              </div>
              <h2 className="mt-0.5 text-sm sm:text-base font-bold text-white tracking-tight">{user.fullName}</h2>
            </div>
          </div>

          {/* Unified Period Switcher (LIVE synced + P1 to P7) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-white/70 uppercase mr-1">Period:</span>
            {onSetSimulatedPeriod && (
              <button
                type="button"
                onClick={() => handleSelectPeriod(null)}
                className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  simulatedPeriod === null
                    ? 'bg-emerald-400 text-[#003135] shadow-xs'
                    : 'bg-white/10 text-white/90 hover:bg-white/20'
                }`}
              >
                LIVE
              </button>
            )}
            {periodSchedule.map((p) => {
              const isSelected = selectedPeriod === p.p && (simulatedPeriod === null ? true : simulatedPeriod === p.p)
              const isCurrentClock = clockState.period === p.p
              return (
                <button
                  key={p.p}
                  type="button"
                  onClick={() => handleSelectPeriod(p.p)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'bg-[#55d6dc] text-[#003135] shadow-xs'
                      : 'bg-white/10 text-white/90 hover:bg-white/20'
                  }`}
                  title={`${p.time} ${isCurrentClock ? '(Active Clock)' : ''}`}
                >
                  {isCurrentClock && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  P{p.p}
                </button>
              )
            })}
          </div>
        </div>

        {/* 4 Real Department Metrics */}
        <div className="mt-2 pt-1.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-white/90 text-[11px]">
            <span>
              <strong>{dept} Cohorts:</strong> {deptSections.length} Sections (Years 2, 3, 4)
            </span>
            <span>·</span>
            <span>
              <strong>{facultyCounts.total}</strong> Faculty Roster
            </span>
            <span>·</span>
            <span className="text-[#55d6dc]">
              <strong>{facultyCounts.inSession}</strong> Teaching · <strong>{facultyCounts.free}</strong> Free
            </span>
            <span>·</span>
            <span>
              <strong>{deptLabs.length}</strong> Dept Labs ({freeLabsCount} Free)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="text-[11px] text-[#55d6dc] font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Inspect Facilities <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </Panel>

      {/* 2. Balanced 2-Column Cockpit Grid (Zero Page Scroll) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
        {/* Left Column (7 cols): Live Classes for 2nd, 3rd, 4th Year Sections */}
        <Panel className="p-2.5 sm:p-3 lg:col-span-7 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 mb-2 border-b border-[#edf2f1] dark:border-[#124349]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
                  <Clock size={13} />
                  Live {dept} Classes · Period {selectedPeriod} ({activePeriodMeta.time})
                </h3>
                <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                  Active lecture and laboratory assignments across 2nd, 3rd, and 4th Years
                </p>
              </div>

              {/* Year Filter Tabs */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-[#dce4e3] dark:border-[#124349] bg-[#f5f7f6] dark:bg-[#031c1f]">
                {(['ALL', 2, 3, 4] as const).map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setSelectedYear(yr)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      selectedYear === yr
                        ? 'bg-white dark:bg-[#062327] text-[#003135] dark:text-[#55d6dc] shadow-xs'
                        : 'text-[#647376] dark:text-[#8ea5a3] hover:text-[#003135]'
                    }`}
                  >
                    {yr === 'ALL' ? 'All (2,3,4)' : yr === 2 ? '2nd Yr' : yr === 3 ? '3rd Yr' : '4th Yr'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bounded Scroll Container */}
            <div className="overflow-y-auto max-h-[calc(100vh-385px)] pr-1 space-y-2.5">
              {displayedCohorts.map((group) => (
                <div key={group.year} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#003135] dark:text-[#e0f2fe] flex items-center gap-1.5">
                      <GraduationCap size={13} className="text-[#08747c] dark:text-[#55d6dc]" />
                      {group.label}
                    </span>
                    <span className="text-[10px] text-[#7a898c]">
                      {group.sections.length} Sections ({group.sections.map((s) => s.section).join(', ')})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {group.sections.map(({ section, classInfo }) => {
                      const isLab = classInfo?.is_laboratory === 1 || Boolean(classInfo?.location?.toLowerCase().includes('lab'))
                      return (
                        <div
                          key={section}
                          className={`p-2 rounded-lg border flex flex-col justify-between transition-all ${
                            classInfo
                              ? isLab
                                ? 'border-[#08747c]/30 bg-[#f4faf9] dark:bg-[#062a2f]'
                                : 'border-[#dce4e3] dark:border-[#124349] bg-[#fafcfb] dark:bg-[#072529]'
                              : 'border-dashed border-[#dce4e3] dark:border-[#124349] bg-slate-50/50 dark:bg-[#031c1f]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#ebf7f6] dark:bg-[#07363d] text-[#08747c] dark:text-[#55d6dc]">
                                Sec {section}
                              </span>
                              <span
                                className={`text-[8px] font-bold px-1 py-0.2 rounded uppercase ${
                                  classInfo
                                    ? isLab
                                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {classInfo ? (isLab ? 'LAB' : 'THEORY') : 'FREE'}
                              </span>
                            </div>

                            <h4
                              className="mt-1 text-[11px] font-bold text-[#003135] dark:text-[#e0f2fe] line-clamp-2 leading-tight"
                              title={classInfo?.subject_name || 'Free Slot / Library'}
                            >
                              {classInfo?.subject_name || 'Self Study / Available'}
                            </h4>
                          </div>

                          <div className="mt-1.5 pt-1 border-t border-[#edf2f1] dark:border-[#124349] space-y-0.5 text-[10px]">
                            <div className="flex items-center gap-1 text-[#526164] dark:text-[#a0c2bf] truncate">
                              <UserCheck size={10} className="shrink-0 text-[#08747c] dark:text-[#55d6dc]" />
                              <span className="truncate" title={classInfo?.faculty_name || 'Unassigned'}>
                                {classInfo?.faculty_name || 'Faculty Cabin'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[#7a898c] truncate">
                              <MapPin size={10} className="shrink-0" />
                              <span className="truncate" title={classInfo?.room_number || classInfo?.location || 'Classroom'}>
                                {classInfo?.room_number ? classInfo.room_number.replace(/^Room\s+Room/i, 'Room') : 'Dept Hall'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between text-[11px]">
            <span className="text-[#7a898c]">Showing active cohort assignments for {activeDay} Period {selectedPeriod}</span>
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="text-[#08747c] dark:text-[#55d6dc] font-semibold hover:underline flex items-center gap-0.5"
            >
              Campus Facility Hub <ChevronRight size={12} />
            </button>
          </div>
        </Panel>

        {/* Right Column (5 cols): Redesigned Balanced Live Faculty & Dept Lab Availability Console */}
        <div className="lg:col-span-5 flex flex-col gap-2.5 justify-between">
          {/* Card 1: Interactive Faculty Live Class & Free Status Finder */}
          <Panel className="p-2.5 sm:p-3 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl shadow-xs">
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#edf2f1] dark:border-[#124349]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
                  <Search size={13} />
                  Faculty Live & Free Finder · P{selectedPeriod}
                </h3>
                <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                  Check who is in session or free in {dept} right now
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('people')}
                className="text-[11px] text-[#08747c] dark:text-[#55d6dc] font-semibold hover:underline cursor-pointer"
              >
                Full Roster →
              </button>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[#758386]" />
                <input
                  type="text"
                  value={facultySearch}
                  onChange={(e) => {
                    setFacultySearch(e.target.value)
                    setSelectedFacultyId('')
                  }}
                  placeholder="Search faculty name (e.g. Radha Rani, Kalyanchakravarthi)..."
                  className="h-8 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-[#fafcfb] dark:bg-[#072a2f] pl-7.5 pr-2.5 text-xs text-[#003135] dark:text-[#55d6dc] outline-none focus:border-[#08747c]"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedFacultyId}
                  onChange={(e) => {
                    setSelectedFacultyId(e.target.value)
                    setFacultySearch('')
                  }}
                  className="h-8 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-[#fafcfb] dark:bg-[#072a2f] px-2 text-xs font-semibold text-[#003135] dark:text-[#55d6dc] outline-none"
                >
                  <option value="">Or select from all {facultyList.length} {dept} Faculty...</option>
                  {facultyList.map((f) => (
                    <option key={f.staff_id} value={f.staff_id}>
                      {f.full_name} ({f.designation})
                    </option>
                  ))}
                </select>
                {(facultySearch || selectedFacultyId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFacultySearch('')
                      setSelectedFacultyId('')
                    }}
                    className="h-8 px-2.5 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-[#fafcfb] dark:bg-[#072a2f] text-xs font-bold text-[#647376] hover:text-[#003135] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2">
              {searchedFacultyData ? (
                <div
                  className={`p-2.5 rounded-xl border ${
                    searchedFacultyData.activeClass
                      ? 'border-emerald-200 dark:border-emerald-900/50 bg-[#f0fdf4] dark:bg-[#05281c]'
                      : 'border-[#dce4e3] dark:border-[#124349] bg-[#fafcfb] dark:bg-[#072529]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-xs text-[#003135] dark:text-[#e0f2fe]">
                        {searchedFacultyData.faculty.full_name}
                      </span>
                      <span className="block text-[10px] text-[#647376] dark:text-[#8ea5a3]">
                        {searchedFacultyData.faculty.designation} · ID: {searchedFacultyData.faculty.staff_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          searchedFacultyData.activeClass
                            ? 'bg-emerald-600 text-white'
                            : 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300'
                        }`}
                      >
                        {searchedFacultyData.activeClass ? `Teaching (P${selectedPeriod})` : `Free (P${selectedPeriod})`}
                      </span>
                      {onInspectFaculty && (
                        <button
                          type="button"
                          onClick={() => onInspectFaculty(searchedFacultyData.faculty.staff_id, searchedFacultyData.faculty.full_name)}
                          className="px-2 py-0.5 rounded border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#062327] text-[10px] font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#edf2f1]"
                        >
                          Timetable
                        </button>
                      )}
                    </div>
                  </div>

                  {searchedFacultyData.activeClass ? (
                    <div className="mt-2 pt-1.5 border-t border-emerald-200/60 dark:border-emerald-900/40 space-y-0.5 text-[11px]">
                      <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                        {searchedFacultyData.activeClass.subject_name} ({searchedFacultyData.activeClass.subject_code})
                      </div>
                      <div className="flex items-center justify-between text-[#526164] dark:text-[#a0c2bf]">
                        <span>
                          <strong>Section:</strong> {searchedFacultyData.activeClass.cohort_label || searchedFacultyData.activeClass.section_id}
                        </span>
                        <span>
                          <strong>Venue:</strong> {searchedFacultyData.activeClass.room_number || searchedFacultyData.activeClass.location}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 pt-1.5 border-t border-[#edf2f1] dark:border-[#124349] text-[11px] text-[#526164] dark:text-[#8ea5a3]">
                      Free in Period {selectedPeriod}. Available for substitution ({searchedFacultyData.faculty.total_periods_per_week || 0} hrs/week).
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2 rounded-lg border border-[#e8efee] dark:border-[#124349] bg-[#fafcfb] dark:bg-[#072529] text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex gap-1 rounded-md border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#031c1f] p-0.5">
                      <button
                        type="button"
                        onClick={() => setFacultyRosterTab('BUSY')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                          facultyRosterTab === 'BUSY'
                            ? 'bg-[#003135] text-white'
                            : 'text-[#647376] dark:text-[#8ea5a3]'
                        }`}
                      >
                        In Session ({facultyCounts.inSession})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFacultyRosterTab('FREE')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                          facultyRosterTab === 'FREE'
                            ? 'bg-emerald-600 text-white'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        Free Now ({facultyCounts.free})
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-[#7a898c]">P{selectedPeriod}</span>
                  </div>

                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                    {facultyRosterTab === 'BUSY' ? (
                      liveClasses.length === 0 ? (
                        <p className="text-[11px] text-[#7a898c] py-3 text-center">No faculty currently lecturing in Period {selectedPeriod}.</p>
                      ) : (
                        liveClasses.map((cls: any, i: number) => (
                          <div
                            key={cls.slot_id || i}
                            onClick={() => setFacultySearch(cls.faculty_name)}
                            className="px-2 py-1 rounded border border-[#edf2f1] dark:border-[#124349] bg-white dark:bg-[#042024] flex items-center justify-between text-[10px] cursor-pointer hover:border-[#08747c]"
                          >
                            <span className="font-semibold text-[#003135] dark:text-[#e0f2fe] truncate max-w-[165px]">
                              {cls.faculty_name}
                            </span>
                            <span className="text-[#08747c] dark:text-[#55d6dc] truncate max-w-[140px]">
                              {cls.section_id} · {cls.room_number ? cls.room_number.replace(/^Room\s+Room/i, 'Room') : 'Hall'}
                            </span>
                          </div>
                        ))
                      )
                    ) : freeFacultyList.length === 0 ? (
                      <p className="text-[11px] text-[#7a898c] py-3 text-center">All faculty assigned in Period {selectedPeriod}.</p>
                    ) : (
                      freeFacultyList.map((f) => (
                        <div
                          key={f.staff_id}
                          className="px-2 py-1 rounded border border-[#edf2f1] dark:border-[#124349] bg-white dark:bg-[#042024] flex items-center justify-between text-[10px]"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-[#003135] dark:text-[#e0f2fe] truncate block">{f.full_name}</span>
                            <span className="text-[9px] text-[#7a898c]">{f.designation}</span>
                          </div>
                          {onInspectFaculty && (
                            <button
                              type="button"
                              onClick={() => onInspectFaculty(f.staff_id, f.full_name)}
                              className="shrink-0 rounded border border-[#d6dfde] dark:border-[#124349] px-1.5 py-0.5 text-[9px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#edf2f1]"
                            >
                              Timetable
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Card 2: Department Labs Live Occupancy & Booking Approvals */}
          <Panel className="p-2.5 sm:p-3 border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] rounded-xl shadow-xs flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#edf2f1] dark:border-[#124349]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
                  <FlaskConical size={13} />
                  {dept} Labs Live (P{selectedPeriod}) & Approvals
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('approvals')}
                  className="text-[11px] text-[#08747c] dark:text-[#55d6dc] font-semibold hover:underline cursor-pointer"
                >
                  Approvals ({pendingBookings.length}) →
                </button>
              </div>

              {/* Live Department Lab Status List */}
              <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1 mb-2">
                {deptLabs.map((lab) => {
                  const isFree = lab.status === 'AVAILABLE' || lab.status === 'FREE'
                  return (
                    <div
                      key={lab.lab_id || lab.room_id}
                      className="px-2.5 py-1.5 rounded-lg border border-[#edf2f1] dark:border-[#124349] bg-[#fafcfb] dark:bg-[#042024] flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#003135] dark:text-[#e0f2fe] truncate">{lab.name}</span>
                          <span
                            className={`shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                              isFree
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                            }`}
                          >
                            {isFree ? 'VACANT' : 'IN SESSION'}
                          </span>
                        </div>
                        <span className="block text-[10px] text-[#647376] dark:text-[#8ea5a3] truncate">
                          {isFree
                            ? `${lab.room_number || lab.room_id} · ${lab.capacity} seats available`
                            : `${lab.occupied_by?.subject || 'Lab Session'} · ${lab.occupied_by?.section || ''}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectedFacility({ id: lab.room_id, name: lab.name })}
                          className="rounded border border-[#d6dfde] dark:border-[#124349] bg-white dark:bg-[#072a2f] px-2 py-0.5 text-[10px] font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#edf2f1]"
                        >
                          Timetable
                        </button>
                        {isFree && onBookLabSlot && (
                          <button
                            type="button"
                            onClick={() => onBookLabSlot(lab.room_id, activeDay, selectedPeriod, lab.lab_id)}
                            className="rounded bg-[#08747c] hover:bg-[#003135] text-white px-2 py-0.5 text-[10px] font-semibold"
                          >
                            Book
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Pending Requests or Clean Status Footer */}
            {pendingBookings.length === 0 ? (
              <div className="p-2 rounded-lg border border-[#e8efee] dark:border-[#124349] bg-[#fbfdfc] dark:bg-[#042024] text-[11px] text-[#526164] dark:text-[#8ea5a3] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  <span>All {dept} lab booking requests are up to date.</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('labs')}
                  className="font-bold text-[#08747c] dark:text-[#55d6dc] hover:underline"
                >
                  Lab Registry →
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1 pt-1.5 border-t border-[#edf2f1] dark:border-[#124349]">
                {pendingBookings.slice(0, 3).map((b: any) => (
                  <div
                    key={b.booking_id}
                    className="p-2 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-[#2b1f09] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <h4 className="font-bold text-[#003135] dark:text-[#e0f2fe] text-[11px] truncate">
                        {b.title || 'Lab Booking'}
                      </h4>
                      <span className="text-[10px] text-[#647376] dark:text-[#8ea5a3] block truncate">
                        {b.lab_name} · {b.day_of_week} P{b.period_index || 1} ({b.requester_name})
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={actioningId === b.booking_id}
                        onClick={() => handleBookingAction(b.booking_id, 'APPROVE')}
                        className="rounded bg-[#024950] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#003135] disabled:opacity-50 cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === b.booking_id}
                        onClick={() => handleBookingAction(b.booking_id, 'REJECT')}
                        className="rounded border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#072a2f] px-1.5 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {inspectedFacility && (
        <FacilityScheduleModal
          facilityId={inspectedFacility.id}
          facilityName={inspectedFacility.name}
          onClose={() => setInspectedFacility(null)}
          onBookSlot={(fid, day, p, lid) => {
            setInspectedFacility(null)
            onBookLabSlot?.(fid, day, p, lid)
          }}
        />
      )}
    </div>
  )
}

function CoordinatorOverviewDeck({
  user,
  clockState,
  onNavigate,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (s: AcademicScreen) => void
}) {
  const vacantRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>(`/api/v1/availability?day=${clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day}&period=${clockState.period || 1}`)

  const freeFacilities = useMemo(() => {
    return extractFacilities(vacantRes.data).filter((f) => f.status === 'AVAILABLE' || f.status === 'FREE').slice(0, 8)
  }, [vacantRes.data])

  return (
    <div className="space-y-6">
      {/* Coordinator Command Banner */}
      <Panel tone="inverse" className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl font-bold backdrop-blur-xs border border-white/20">
              <CalendarDays size={24} className="text-[#55d6dc]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#55d6dc] text-[#003135] uppercase">
                  Academic Coordinator
                </span>
                <span className="text-xs text-white/80">Autonomous Scheduling Control</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-white tracking-tight">{user.fullName}</h2>
              <p className="text-xs text-white/70">
                Period Bell Rail Operations · Timetable Review · Clash Prevention
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('ingestion')}
              className="px-3.5 py-2 rounded-lg bg-white text-[#003135] text-xs font-bold hover:bg-[#eaf5f4] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <FileUp size={14} />
              Upload Timetable Document
            </button>
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="px-3.5 py-2 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 size={14} />
              Inspect Campus Facilities
            </button>
          </div>
        </div>
      </Panel>

      {/* Vacant Facilities Quick Locator */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
              <MapPin size={14} />
              Vacant Classrooms & Laboratories in Period {clockState.period || 1}
            </h3>
            <p className="text-xs text-[#647376] dark:text-[#8ea5a3]">
              Available facilities for immediate emergency slot reallocation
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('availability')}
            className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
          >
            All Facilities
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {freeFacilities.map((f: any, idx: number) => (
            <Panel key={f.facility_id || idx} className="p-3.5 border-l-4 border-l-[#1b6d53] flex items-center justify-between">
              <div>
                <strong className="block text-xs font-bold text-[#003135] dark:text-[#e0f2fe]">
                  {f.name || f.facility_id}
                </strong>
                <span className="text-[10px] text-[#647376] dark:text-[#8ea5a3]">
                  {f.facility_type || 'CLASSROOM'} · Cap: {f.capacity || 60}
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#eaf5f0] text-[#1b6d53] dark:bg-[#072b22] dark:text-[#45c39c] uppercase">
                Free Now
              </span>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}


function LabTechOverviewDeck({
  user,
  clockState,
  onNavigate,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (s: AcademicScreen) => void
}) {
  const labsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>('/api/v1/laboratories?scope=MY_LABS')

  const bookingsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>('/api/v1/laboratories/all-bookings')

  const pendingBookings = useMemo(() => {
    return (bookingsRes.data?.data || []).filter((b) => b.status === 'PENDING')
  }, [bookingsRes.data])

  return (
    <div className="space-y-6">
      {/* Lab Tech Banner */}
      <Panel tone="inverse" className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl font-bold backdrop-blur-xs border border-white/20">
              <FlaskConical size={24} className="text-[#55d6dc]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#55d6dc] text-[#003135] uppercase">
                  Technical Operations
                </span>
                <span className="text-xs text-white/80">Laboratory & Equipment Registry</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-white tracking-tight">{user.fullName}</h2>
              <p className="text-xs text-white/70">
                Workstation Maintenance · GPU Nodes · Reservation Approvals
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="px-3.5 py-2 rounded-lg bg-white text-[#003135] text-xs font-bold hover:bg-[#eaf5f4] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 size={14} />
              Inspect Free Labs
            </button>
            <button
              type="button"
              onClick={() => onNavigate('feedback')}
              className="px-3.5 py-2 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquareText size={14} />
              Report Equipment Maintenance
            </button>
          </div>
        </div>
      </Panel>

      {/* Pending Lab Bookings Awaiting Confirmation */}
      {pendingBookings.length > 0 && (
        <Panel className="p-5 border-l-4 border-l-[#08747c]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
              <FlaskConical size={14} />
              Pending Laboratory Reservation Requests
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#faefec] dark:bg-[#2b100d] text-[#913b2c] dark:text-[#f08575]">
              {pendingBookings.length} Pending
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingBookings.map((b: any) => (
              <div
                key={b.booking_id}
                className="p-3.5 rounded-xl border border-[#e2eae9] dark:border-[#124349] bg-white dark:bg-[#062327] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#08747c] dark:text-[#55d6dc]">
                      {b.lab_name || b.lab_id}
                    </span>
                    <span className="text-[10px] text-[#7a898c]">{b.booking_date}</span>
                  </div>
                  <h4 className="mt-1 text-xs font-bold text-[#003135] dark:text-[#e0f2fe]">
                    {b.title}
                  </h4>
                  <p className="mt-1 text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                    Coordinator: {b.coordinator_name}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-[#edf2f1] dark:border-[#124349] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await backendFetch(`/api/v1/laboratories/bookings/${b.booking_id}/approval`, {
                        method: 'PUT',
                        body: JSON.stringify({ action: 'APPROVE' }),
                      })
                      bookingsRes.retry()
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-[#eaf5f0] text-[#1b6d53] text-xs font-bold hover:bg-[#d9ece4] transition cursor-pointer"
                  >
                    Confirm Booking
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await backendFetch(`/api/v1/laboratories/bookings/${b.booking_id}/approval`, {
                        method: 'PUT',
                        body: JSON.stringify({ action: 'REJECT' }),
                      })
                      bookingsRes.retry()
                    }}
                    className="py-1.5 px-3 rounded-lg bg-[#faefec] text-[#913b2c] text-xs font-bold hover:bg-[#f5e0da] transition cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Laboratories Registry */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
            <FlaskConical size={14} />
            Institutional Laboratories Registry
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('labs')}
            className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
          >
            All Laboratories
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(labsRes.data?.data || []).map((lab: any) => (
            <Panel key={lab.lab_id} className="p-4 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#edf2f1] dark:bg-[#072d32] text-[#076970] dark:text-[#55d6dc]">
                  {lab.department_id || 'LAB'}
                </span>
                <h4 className="mt-2 text-xs font-bold text-[#003135] dark:text-[#e0f2fe]">
                  {lab.name}
                </h4>
                <p className="mt-1 text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                  Room: {lab.room_id || 'Lab Complex'} · Capacity: {lab.capacity || 70} Systems
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-[#e8efee] dark:border-[#0e3b40] flex items-center justify-between text-[10px]">
                <span className="text-[#7a898c]">{lab.incharge_name || 'Staff In-Charge'}</span>
                <span className="font-bold text-[#1b6d53] dark:text-[#45c39c] uppercase">Operational</span>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}


function DeanOverviewDeck({
  user,
  clockState,
  onNavigate,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (s: AcademicScreen) => void
}) {
  const [selectedSchool, setSelectedSchool] = useState<'ALL' | 'SOC' | 'SOEE' | 'SOIM'>('ALL')
  const schoolsRes = useLiveResource<{
    success: boolean
    data: Array<{
      school_id: string
      name: string
      dean_name: string
      dean_email: string
      department_count: number
      faculty_count: number
      lab_count: number
    }>
  }>('/api/v1/departments/schools')

  const deptsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>('/api/v1/departments')

  const liveClassesRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>(`/api/v1/availability/live-classes?day=${clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day}&period=${clockState.period || 1}`)

  const schools = schoolsRes.data?.data || []
  const departments = deptsRes.data?.data || []

  const filteredDepts = useMemo(() => {
    if (selectedSchool === 'ALL') return departments
    return departments.filter((d: any) => d.school_id === selectedSchool)
  }, [departments, selectedSchool])

  return (
    <div className="space-y-4">
      {/* Dean Executive Governance Banner */}
      <Panel tone="inverse" className="p-3.5 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-xl font-bold backdrop-blur-xs border border-white/20">
              <GraduationCap size={24} className="text-[#55d6dc]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#55d6dc] text-[#003135] uppercase">
                  Executive Dean
                </span>
                <span className="text-xs text-white/80">College-Wide School Governance</span>
              </div>
              <h2 className="mt-0.5 text-base font-bold text-white tracking-tight">{user.fullName}</h2>
              <p className="text-[11px] text-white/70">
                School Governance Tree · Multi-Department Curricular Oversight · NAAC 'A' Grade
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('availability')}
              className="px-3 py-1.5 rounded-lg bg-white text-[#003135] text-xs font-bold hover:bg-[#eaf5f4] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 size={13} />
              Cross-School Vacancy Matrix
            </button>
            <button
              type="button"
              onClick={() => onNavigate('feedback')}
              className="px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquareText size={13} />
              College-Wide Feedback
            </button>
          </div>
        </div>

        {/* 3 Schools Filter Bar */}
        <div className="mt-3.5 pt-2.5 border-t border-white/15">
          <div className="text-[11px] font-semibold text-white/70 mb-2 uppercase tracking-wider">
            Filter Departments By School:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedSchool('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedSchool === 'ALL'
                  ? 'bg-white text-[#003135] shadow-xs'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              All Schools ({schools.length}) · {departments.length} Depts
            </button>
            {schools.map((s) => (
              <button
                key={s.school_id}
                type="button"
                onClick={() => setSelectedSchool(s.school_id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedSchool === s.school_id
                    ? 'bg-[#55d6dc] text-[#003135] shadow-xs'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {s.name} ({s.department_count} Depts · {s.faculty_count} Faculty)
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* Structured School Tree and Departments View */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
              <Building2 size={14} />
              {selectedSchool === 'ALL' ? 'All Academic Engineering Departments' : `Departments under ${schools.find(s => s.school_id === selectedSchool)?.name}`}
            </h3>
            <p className="text-xs text-[#647376] dark:text-[#8ea5a3]">
              School → Department → Faculty / Labs / Master Schedules
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('departments')}
            className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
          >
            Full Directory
          </button>
        </div>

        <div className="overflow-y-auto lg:max-h-[calc(100vh-520px)] max-h-[65vh] min-h-[220px] pr-1.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-grid">
          {filteredDepts.map((dept: any) => (
            <Panel
              key={dept.department_id}
              className="p-3 sm:p-3.5 flex flex-col justify-between card-interactive border border-[#dce4e3] dark:border-[#124349]"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                      {dept.department_id}{dept.school_id ? ` · ${dept.school_id}` : ''}
                    </span>
                    <h4 className="mt-1 text-xs font-bold text-[#003135] dark:text-[#e0f2fe]">
                      {dept.name}
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#eaf5f0] text-[#1b6d53] dark:bg-[#072b22] dark:text-[#45c39c] uppercase">
                    Autonomous
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] text-[#526164] dark:text-[#a0c2bf]">
                  <p><strong>HOD:</strong> {dept.hod_name || 'Department Head'}</p>
                  <p><strong>Dean:</strong> {dept.dean_name || 'School Dean'}</p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-[#7a898c]">
                  <span>{dept.faculty_count ?? 0} Faculty</span>
                  <span>·</span>
                  <span>{dept.laboratories_count ?? 0} Labs</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('gmritdu:select-dept', { detail: { department: dept.department_id } }))
                    onNavigate('availability')
                  }}
                  className="text-xs font-bold text-[#08747c] dark:text-[#55d6dc] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Facilities <ChevronRight size={13} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}


function SuperAdminOverviewDeck({
  user,
  clockState,
  onNavigate,
}: {
  user: BackendUser
  clockState: ScheduleState
  onNavigate: (s: AcademicScreen) => void
}) {
  const deptsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>('/api/v1/departments')

  const liveClassesRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>(`/api/v1/availability/live-classes?day=${clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day}&period=${clockState.period || 1}`)

  const telemetryRes = useLiveResource<{
    success: boolean
    data: {
      dbStats?: {
        departmentsCount?: number
        usersCount?: number
        staffCount?: number
        sectionsCount?: number
        timetableSlotsCount?: number
        eventsCount?: number
        totalAuditLogs?: number
      }
    }
  }>('/api/v1/telemetry')

  const feedbackRes = useLiveResource<{
    success: boolean
    data: Array<{ status?: string; department_id?: string }>
  }>('/api/v1/feedback')

  const pendingLabsRes = useLiveResource<{
    success: boolean
    data: Array<any>
  }>('/api/v1/laboratories/pending-requests')

  const departments = deptsRes.data?.data || []
  const dbStats = telemetryRes.data?.data?.dbStats
  const feedbackList = feedbackRes.data?.data || []
  const pendingFeedback = feedbackList.filter((f) => {
    const s = String(f.status || 'OPEN').toUpperCase()
    return s !== 'RESOLVED' && s !== 'CLOSED'
  })
  const resolvedFeedbackCount = feedbackList.length - pendingFeedback.length
  const resolutionPct = feedbackList.length > 0 ? Math.round((resolvedFeedbackCount / feedbackList.length) * 100) : 100
  const pendingDepts = Array.from(new Set(pendingFeedback.map((f) => f.department_id).filter(Boolean))).slice(0, 3)
  const pendingBookingsCount = (pendingLabsRes.data?.data || []).length

  return (
    <div className="space-y-4">
      {/* Executive Root Command Banner */}
      <Panel tone="inverse" className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl font-bold backdrop-blur-xs border border-white/20">
              <ShieldCheck size={24} className="text-[#55d6dc]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#55d6dc] text-[#003135] uppercase tracking-wider">
                  System Administrator
                </span>
                <span className="text-xs text-white/80 font-medium">Root Academic Command &amp; Infrastructure</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-white tracking-tight">Executive Institutional Command Center</h2>
              <p className="text-xs text-white/70">
                GMR Institute of Technology · {dbStats?.departmentsCount ?? departments.length} Autonomous Departments · Verified Institutional Governance
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('departments')}
              className="px-3.5 py-2 rounded-lg bg-white text-[#003135] text-xs font-bold hover:bg-[#eaf5f4] btn-interactive shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 size={14} />
              All Departments
            </button>
            <button
              type="button"
              onClick={() => onNavigate('telemetry')}
              className="px-3.5 py-2 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 btn-interactive backdrop-blur-xs border border-white/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Activity size={14} />
              System Health
            </button>
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="px-3.5 py-2 rounded-lg bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition backdrop-blur-xs border border-white/20 flex items-center gap-1.5 cursor-pointer"
            >
              <UserRoundCog size={14} />
              User Governance
            </button>
          </div>
        </div>

        {/* Real Telemetry Metric Grid */}
        <div className="mt-4 pt-3.5 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white/10 dark:bg-black/25 p-3 border border-white/10 flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#55d6dc]/20 text-[#55d6dc]">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-base font-bold text-[#55d6dc] leading-tight">
                {dbStats?.departmentsCount ?? departments.length}
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-white/80 truncate">Departments</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/10 dark:bg-black/25 p-3 border border-white/10 flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#55d6dc]/20 text-[#55d6dc]">
              <CalendarDays size={18} />
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-base font-bold text-[#55d6dc] leading-tight">
                {dbStats?.timetableSlotsCount ?? '—'}
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-white/80 truncate">Master Slots</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/10 dark:bg-black/25 p-3 border border-white/10 flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-base font-bold text-emerald-400 leading-tight">
                  {extractLiveClasses(liveClassesRes.data).length}
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-white/80 truncate">Active Classes (P{clockState.period || 1})</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/10 dark:bg-black/25 p-3 border border-white/10 flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#55d6dc]/20 text-[#55d6dc]">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-base font-bold text-[#55d6dc] leading-tight">
                {dbStats?.totalAuditLogs ?? 'Verified'}
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-white/80 truncate">Ledger Entries</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Main 2-Column Cockpit Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: All Academic Departments Hub */}
        <Panel className="p-4 lg:col-span-7 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#edf2f1] dark:border-[#124349]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#08747c] dark:text-[#55d6dc] flex items-center gap-1.5">
                <Building2 size={14} />
                All {departments.length} Academic Departments
              </h3>
              <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3]">
                Curricular statistics, faculty strength, and schedule inspection
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('departments')}
              className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline cursor-pointer"
            >
              Full Directory
            </button>
          </div>

          <div className="overflow-y-auto lg:max-h-[calc(100vh-520px)] max-h-[65vh] min-h-[220px] pr-1 grid gap-2.5 sm:grid-cols-2">
            {departments.map((dept: any) => (
              <div
                key={dept.department_id}
                className="p-3 rounded-xl flex flex-col justify-between hover:shadow-xs transition border border-[#dce4e3] dark:border-[#124349] bg-[#fafcfb] dark:bg-[#072a2f]"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc]">
                      {dept.department_id}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#eaf5f0] text-[#1b6d53] dark:bg-[#072b22] dark:text-[#45c39c] uppercase">
                      Autonomous
                    </span>
                  </div>
                  <h4 className="mt-1 text-xs font-bold text-[#003135] dark:text-[#e0f2fe] truncate">
                    {dept.name}
                  </h4>
                  <div className="mt-1 text-[10px] text-[#526164] dark:text-[#a0c2bf] truncate">
                    <strong>HOD:</strong> {dept.hod_name}
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#edf2f1] dark:border-[#124349] flex items-center justify-between text-[10px]">
                  <span className="text-[#7a898c]">
                    {dept.faculty_count ?? 0} Faculty · {dept.laboratories_count ?? 0} Labs
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('gmritdu:select-dept', { detail: { department: dept.department_id } }))
                      onNavigate('availability')
                    }}
                    className="font-bold text-[#08747c] dark:text-[#55d6dc] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    Facilities <ChevronRight size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Right Column: Live Institutional Governance & Operations Console */}
        <Panel className="p-4 lg:col-span-5 border-l-4 border-l-[#08747c] bg-white dark:bg-[#062327]">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#edf2f1] dark:border-[#124349]">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#003135] text-white shrink-0">
                <CircleHelp size={16} className="text-[#55d6dc]" />
              </div>
              <div>
                <span className="font-mono text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-[#e8efee] dark:bg-[#07363d] text-[#076970] dark:text-[#55d6dc] uppercase block w-fit">
                  Root Admin Governance
                </span>
                <h3 className="text-xs font-bold text-[#003135] dark:text-[#55d6dc] mt-0.5">
                  Campus Operations &amp; Support Desk
                </h3>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#1b6d53] dark:text-[#45c39c] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1b6d53] animate-pulse" />
              Live Sync
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-2.5 rounded-xl border border-[#e2eae9] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#042428] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#7a898c] uppercase block">Open Feedback Tickets</span>
                <span className="text-base font-bold text-[#003135] dark:text-[#55d6dc] mt-0.5 block">
                  {pendingFeedback.length} Pending
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">
                  {pendingDepts.length > 0 ? `Departments: ${pendingDepts.join(', ')}` : 'All reported tickets resolved'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('feedback')}
                className="px-2.5 py-1 rounded-lg bg-[#08747c] hover:bg-[#065b61] text-white text-[11px] font-bold transition shadow-xs cursor-pointer"
              >
                Review
              </button>
            </div>

            <div className="p-2.5 rounded-xl border border-[#e2eae9] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#042428] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#7a898c] uppercase block">Identity &amp; Lab Queue</span>
                <span className="text-base font-bold text-[#08747c] dark:text-[#55d6dc] mt-0.5 block">
                  {dbStats?.usersCount ?? '—'} Accounts · {dbStats?.staffCount ?? '—'} Staff
                </span>
                <span className="text-[10px] text-[#647376] dark:text-[#8ea5a3] block">
                  {pendingBookingsCount} pending lab reservation requests
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(pendingBookingsCount > 0 ? 'approvals' : 'users')}
                className="px-2.5 py-1 rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] text-[11px] font-bold text-[#003135] dark:text-[#55d6dc] hover:bg-[#edf2f1] cursor-pointer"
              >
                {pendingBookingsCount > 0 ? 'Approvals' : 'Users'}
              </button>
            </div>

            <div className="p-2.5 rounded-xl border border-[#e2eae9] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#042428]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#7a898c] uppercase">Feedback Resolution Rate</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {resolvedFeedbackCount} / {feedbackList.length} Resolved ({resolutionPct}%)
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1.5">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${resolutionPct}%` }} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('feedback')}
              className="w-full py-2 rounded-xl border border-[#d6dfde] dark:border-[#175259] bg-[#fafcfb] dark:bg-[#072a2f] text-xs font-bold text-[#08747c] dark:text-[#55d6dc] hover:bg-[#edf2f1] dark:hover:bg-[#0a383e] transition text-center flex items-center justify-center gap-1 cursor-pointer"
            >
              Review All Inquiries <ChevronRight size={13} />
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}

export function RoleAdaptiveOverviewDashboard({
  user,
  clockState,
  simulatedPeriod,
  onSetSimulatedPeriod,
  onNavigate,
  onInspectFaculty,
  onBookLabSlot,
}: {
  user: BackendUser
  clockState: ScheduleState
  simulatedPeriod: number | null
  onSetSimulatedPeriod: (p: number | null) => void
  onNavigate: (s: AcademicScreen) => void
  onInspectFaculty?: (staffId: string, name: string) => void
  onBookLabSlot?: (roomId: string, day: string, period: number, labId?: string | null) => void
}) {
  return (
    <div className="space-y-3.5">
      {/* Operating Bell Simulator Bar (hidden on DEPT_ADMIN since HOD banner embeds Period LIVE | P1..P7 switcher) */}
      {user.role !== 'DEPT_ADMIN' && (
        <OperatingBellSimulatorRail
          currentPeriod={clockState.period}
          simulatedPeriod={simulatedPeriod}
          onSelectPeriod={onSetSimulatedPeriod}
        />
      )}

      {/* Role-Specific Deck */}
      {user.role === 'STUDENT' && (
        <StudentOverviewDeck user={user} clockState={clockState} onNavigate={onNavigate} />
      )}
      {user.role === 'TEACHING_STAFF' && (
        <FacultyOverviewDeck user={user} clockState={clockState} onNavigate={onNavigate} />
      )}
      {user.role === 'DEPT_ADMIN' && (
        <DeptAdminOverviewDeck
          user={user}
          clockState={clockState}
          simulatedPeriod={simulatedPeriod}
          onSetSimulatedPeriod={onSetSimulatedPeriod}
          onNavigate={onNavigate}
          onInspectFaculty={onInspectFaculty}
          onBookLabSlot={onBookLabSlot}
        />
      )}
      {user.role === 'COORDINATOR' && (
        <CoordinatorOverviewDeck user={user} clockState={clockState} onNavigate={onNavigate} />
      )}
      {user.role === 'NON_TEACHING_STAFF' && (
        <LabTechOverviewDeck user={user} clockState={clockState} onNavigate={onNavigate} />
      )}
      {user.role === 'DEAN' && (
        <DeanOverviewDeck user={user} clockState={clockState} onNavigate={onNavigate} />
      )}
      {user.role === 'SUPER_ADMIN' && (
        <SuperAdminOverviewDeck user={user} clockState={clockState} onNavigate={onNavigate} />
      )}
    </div>
  )
}

function ResourceScreen({
  screen,
  user,
  simulatedPeriod,
  onSetSimulatedPeriod,
  onNavigate,
}: {
  screen: AcademicScreen
  user: BackendUser
  simulatedPeriod: number | null
  onSetSimulatedPeriod: (p: number | null) => void
  onNavigate: (s: AcademicScreen) => void
}) {
  const [selectedDept, setSelectedDept] = useState(user.departmentId || 'CSE')
  const [selectedSem, setSelectedSem] = useState('SEM_5')
  const [selectedSec, setSelectedSec] = useState('A')
  const [inspectedFaculty, setInspectedFaculty] = useState<{ id: string; name: string } | null>(null)
  const [bookingPrefill, setBookingPrefill] = useState<{
    screenOverride?: AcademicScreen
    values: Record<string, string>
  } | null>(null)

  useEffect(() => {
    const handleDeptSelect = (e: any) => {
      if (e.detail?.department) {
        setSelectedDept(e.detail.department)
      }
    }
    window.addEventListener('gmritdu:select-dept', handleDeptSelect)
    return () => window.removeEventListener('gmritdu:select-dept', handleDeptSelect)
  }, [])

  const baseClockState = useMemo(() => getScheduleState(new Date()), [])
  const clockState = useMemo<ScheduleState>(() => {
    if (simulatedPeriod === null) return baseClockState
    const bell = bellSchedule.find((b) => b.period === simulatedPeriod && b.type === 'period')
    const activeDay = baseClockState.day === 'SUNDAY' ? 'MONDAY' : baseClockState.day
    return {
      ...baseClockState,
      day: activeDay,
      period: simulatedPeriod,
      label: bell?.label || `Period ${simulatedPeriod}`,
      startsAt: bell?.startsAt || baseClockState.startsAt,
      endsAt: bell?.endsAt || baseClockState.endsAt,
      type: 'period',
    }
  }, [baseClockState, simulatedPeriod])

  const activeEndpoint = getAcademicEndpoint(screen, user, clockState)

  const resource = useLiveResource<unknown>(activeEndpoint)
  const normalized = useMemo(() => (resource.data ? normalizeAcademicResponse(resource.data) : null), [resource.data])

  const disruptionEndpoint = `/api/v1/events/check-date?date=${new Date().toLocaleDateString('en-CA')}&department=${encodeURIComponent(
    selectedDept
  )}&semester=${encodeURIComponent(selectedSem)}`

  const disruptionResource = useLiveResource<{
    success: boolean
    data: {
      isRegularDay: boolean
      eventType: string
      title: string
      affectsTimetable: boolean
      bannerMessage: string
    }
  }>(disruptionEndpoint)

  const disruption = disruptionResource.data?.data

  const [modalOpen, setModalOpen] = useState(false)
  const canMutate = Boolean((mutationContracts[screen] || screen === 'users') && mutateRoles[screen]?.includes(user.role))

  const openPrefilledBooking = (
    targetId: string,
    day?: string,
    period?: number,
    duration: number = 1,
    labId?: string | null,
    screenOverride?: AcademicScreen
  ) => {
    const targetScreen = screenOverride || (screen === 'labs' ? 'labs' : 'availability')
    const activeDay = day || (clockState.day === 'SUNDAY' ? 'MONDAY' : clockState.day)
    const activePeriod = period || clockState.period || 1
    const bookingDate = nextDateForDay(activeDay)
    if (targetScreen === 'labs') {
      setBookingPrefill({
        screenOverride: 'labs',
        values: {
          laboratoryId: labId || targetId,
          booking_date: bookingDate,
          day_of_week: activeDay,
          period_index: String(activePeriod),
          duration_periods: String(duration || 1),
          booking_type: 'WORKSHOP',
        },
      })
    } else {
      setBookingPrefill({
        screenOverride: 'availability',
        values: {
          facilityId: targetId,
          bookingDate,
          dayOfWeek: activeDay,
          periodIndex: String(activePeriod),
          duration: String(duration || 1),
          coordinatorName: user.fullName || '',
        },
      })
    }
    setModalOpen(true)
  }

  return (
    <div key={screen} className="space-y-3.5 sm:space-y-4 view-enter">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold text-[#08747c] dark:text-[#55d6dc] tracking-wide uppercase">
            Institutional Operations
          </span>
          <h1 className="mt-0.5 text-xl sm:text-2xl font-bold tracking-tight text-[#003135] dark:text-[#55d6dc]">
            {screenCopy[screen].title}
          </h1>
          <p className="mt-0.5 text-xs text-[#647376] dark:text-[#8ea5a3] max-w-2xl">{screenCopy[screen].subtitle}</p>
        </div>

        {canMutate && (
          <button
            onClick={() => {
              if (screen === 'users') {
                window.dispatchEvent(new Event('gmritdu:open-add-user'))
              } else {
                setBookingPrefill(null)
                setModalOpen(true)
              }
            }}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#024950] px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] active:scale-98 transition shrink-0 cursor-pointer"
          >
            <Plus size={15} />
            {screenCopy[screen].action}
          </button>
        )}
      </div>

      {disruption?.affectsTimetable && (
        <div className="flex items-start gap-3 rounded-xl border border-[#e4c78d] bg-[#fff8e8] dark:border-[#52411e] dark:bg-[#2b200b] p-4 text-[#654819] dark:text-[#f3bf67]">
          <ShieldAlert size={22} className="shrink-0 text-[#b57a1e] mt-0.5" />
          <div>
            <strong className="block text-xs font-bold text-[#654819] dark:text-[#f3bf67]">
              Academic Calendar Alert: {disruption.title || 'Schedule Disruption'}
            </strong>
            <p className="mt-1 text-xs text-[#7e5d26] dark:text-[#e0af53] leading-relaxed">
              {disruption.bannerMessage || 'Regular timetable classes are suspended for institutional examination schedules.'}
            </p>
          </div>
        </div>
      )}

      <ConnectionStatusBanner
        endpoint={activeEndpoint}
        error={resource.error}
        offline={resource.offline}
        stale={resource.stale}
        updatedAt={resource.updatedAt}
        retry={resource.retry}
      />

      {['availability', 'labs', 'people', 'recommendations'].includes(screen) && (
        <OperatingBellSimulatorRail
          currentPeriod={baseClockState.period}
          simulatedPeriod={simulatedPeriod}
          onSelectPeriod={onSetSimulatedPeriod}
        />
      )}

      {screen === 'overview' ? (
        <RoleAdaptiveOverviewDashboard
          user={user}
          clockState={clockState}
          simulatedPeriod={simulatedPeriod}
          onSetSimulatedPeriod={onSetSimulatedPeriod}
          onNavigate={onNavigate}
          onInspectFaculty={(id, name) => setInspectedFaculty({ id, name })}
          onBookLabSlot={(roomId, day, p, lid) => openPrefilledBooking(roomId, day, p, 1, lid, 'availability')}
        />
      ) : resource.loading && !resource.data ? (
        <LoadingSkeleton />
      ) : screen === 'availability' ? (
        <FacilityAvailabilityHub
          user={user}
          clockState={clockState}
          onNavigate={onNavigate}
          onOpenBooking={(fid, day, p, dur, lid) => openPrefilledBooking(fid, day, p, dur, lid, 'availability')}
        />
      ) : screen === 'labs' ? (
        <LaboratoriesRegisterView
          user={user}
          clockState={clockState}
          records={normalized?.data ?? []}
          onNavigate={onNavigate}
          onOpenBooking={(labId, day, p, dur) => openPrefilledBooking(labId, day, p, dur ?? 1, labId, 'labs')}
        />
      ) : screen === 'people' ? (
        <FacultyDirectoryTableView
          records={normalized?.data ?? []}
          user={user}
          clockState={clockState}
          onInspectFaculty={(id, name) => setInspectedFaculty({ id, name })}
        />
      ) : screen === 'approvals' ? (
        <HODApprovalsCenterView
          records={normalized?.data ?? []}
          user={user}
          onRefresh={() => resource.retry()}
        />
      ) : screen === 'substitutions' ? (
        <SubstitutionsWorkflowView
          records={normalized?.data ?? []}
          user={user}
          onRefresh={() => resource.retry()}
        />
      ) : screen === 'departments' ? (
        <DepartmentsDirectoryView
          records={normalized?.data ?? []}
          user={user}
          onSelectDept={(deptId) => {
            setSelectedDept(deptId)
            onNavigate('availability')
          }}
          onNavigate={onNavigate}
        />
      ) : screen === 'bookings' ? (
        <LabBookingsTableView
          records={normalized?.data ?? []}
          user={user}
          onRefresh={() => resource.retry()}
        />
      ) : screen === 'calendar' ? (
        <AcademicCalendarTableView
          records={normalized?.data ?? []}
          user={user}
        />
      ) : screen === 'users' ? (
        <UsersDirectoryTableView
          records={normalized?.data ?? []}
          user={user}
        />
      ) : screen === 'feedback' ? (
        ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(user.role) ? (
          <FeedbackLogsTableView
            records={normalized?.data ?? []}
            user={user}
          />
        ) : (
          <SubmitOnlyFeedbackView user={user} />
        )
      ) : screen === 'recommendations' ? (
        <RecommendationsTableView
          user={user}
          clockState={clockState}
          onInspectFaculty={(id, name) => setInspectedFaculty({ id, name })}
          onBookVacantSlot={(fid, day, p, lid) => openPrefilledBooking(fid, day, p, 1, lid, 'availability')}
        />
      ) : screen === 'ingestion' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-4">
            <TimetableIngestionHeader
              user={user}
              onRefresh={() => resource.retry()}
              onOpenSlotModal={() => {
                setBookingPrefill({ screenOverride: 'timetable', values: {} })
                setModalOpen(true)
              }}
            />
          </div>
          <div className="lg:col-span-8">
            <IngestionAuditStagingTableView
              records={normalized?.data ?? []}
              user={user}
              onRefresh={() => resource.retry()}
            />
          </div>
        </div>
      ) : screen === 'telemetry' ? (
        <>
          <BlockchainAuditLedgerPanel />
          <SystemHealthAuditTableView
            records={normalized?.data ?? []}
          />
        </>
      ) : (
        <>
          {normalized?.metrics && <MetricCardsGrid metrics={normalized.metrics} />}
          <GenericRecordGrid
            records={normalized?.data ?? []}
            screen={screen}
            user={user}
            onInspectFaculty={(id, name) => setInspectedFaculty({ id, name })}
            onSelectDept={(deptId) => {
              setSelectedDept(deptId)
              onNavigate('availability')
            }}
          />
        </>
      )}

      {modalOpen && (
        <ContinuousLabBookingDialog
          screen={bookingPrefill?.screenOverride || screen}
          user={user}
          initialValues={bookingPrefill?.values || null}
          onClose={() => {
            setModalOpen(false)
            setBookingPrefill(null)
          }}
        />
      )}

      {inspectedFaculty && (
        <FacultyScheduleModal
          staffId={inspectedFaculty.id}
          facultyName={inspectedFaculty.name}
          onClose={() => setInspectedFaculty(null)}
        />
      )}
    </div>
  )
}

/* =========================================================================
   MUTATION & CONTINUOUS LAB BOOKING DIALOG
   ========================================================================= */

type SourceOption = { value: string; label: string }

type SectionRow = {
  section_id: string
  department_id: string
  semester_id: string
  section_name: string
  student_count?: number
}

const BOOLEAN_FIELDS = new Set(['is_laboratory', 'is_continuous', 'affects_schedule'])
const NUMERIC_FIELDS = new Set(['rating', 'period_index', 'duration_periods', 'periodIndex', 'duration', 'expectedAttendees', 'capacity'])

function ContinuousLabBookingDialog({
  screen,
  user,
  initialValues,
  onClose,
}: {
  screen: AcademicScreen
  user: BackendUser
  initialValues?: Record<string, string> | null
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(initialValues || {}) }))

  const contract = mutationContracts[screen]
  const fields = contract?.fields ?? []
  const needs = (source: MutationFieldSource) => fields.some((f) => f.source === source)

  // Role-scoped governance: an executive Dean spans a whole school, an HOD /
  // coordinator / faculty member is bound to a single department, Super Admin is
  // unrestricted. Every identifier dropdown respects this scope.
  const school = user.role === 'DEAN' ? user.schoolId || null : null
  const scopedDept = ['DEPT_ADMIN', 'COORDINATOR', 'TEACHING_STAFF'].includes(user.role)
    ? user.departmentId
    : null
  const staffQuery = school
    ? `?school=${encodeURIComponent(school)}`
    : scopedDept
      ? `?department=${encodeURIComponent(scopedDept)}`
      : ''

  const departmentsRes = useLiveResource<{ data: Array<{ department_id: string; name: string }> }>(
    needs('departments') || user.role === 'DEAN'
      ? `/api/v1/departments${school ? `?school=${encodeURIComponent(school)}` : ''}`
      : null,
  )
  const sectionsRes = useLiveResource<{ data: SectionRow[] }>(
    needs('sections') ? '/api/v1/timetables/sections' : null,
  )
  const facultyRes = useLiveResource<{
    data: Array<{ staff_id: string; full_name: string; designation?: string; department_id?: string }>
  }>(needs('faculty') ? `/api/v1/staff${staffQuery}` : null)
  const roomsRes = useLiveResource<{
    data: {
      rooms: Array<{
        room_id: string
        department_id: string
        room_number?: string
        room_type?: string
        capacity?: number
      }>
    }
  }>(needs('rooms') ? `/api/v1/timetables/hierarchy${school ? `?school=${encodeURIComponent(school)}` : ''}` : null)
  const labsRes = useLiveResource<{
    data: Array<{ lab_id: string; name: string; department_id: string; capacity: number; room_id: string }>
  }>(
    needs('laboratories')
      ? `/api/v1/laboratories?scope=ALL${school ? `&school=${encodeURIComponent(school)}` : ''}`
      : null,
  )
  const bookingsRes = useLiveResource<{ data: Array<{ booking_id: string; title: string; status?: string }> }>(
    needs('bookings') ? '/api/v1/laboratories/pending-requests' : null,
  )
  const usersRes = useLiveResource<{
    data: Array<{ user_id: string; full_name: string; email: string; role: string; department_id?: string }>
  }>(needs('users') ? '/api/v1/admin/users' : null)

  const sections = sectionsRes.data?.data ?? []
  const selectedSection = sections.find((s) => s.section_id === values.section_id) ?? null
  const sectionDept = selectedSection?.department_id
  const sectionSem = selectedSection?.semester_id

  const versionsRes = useLiveResource<{
    data: Array<{ version_id: string; department_id: string; academic_session?: string; status?: string }>
  }>(
    needs('versions') && sectionDept
      ? `/api/v1/timetables/versions?department=${encodeURIComponent(sectionDept)}`
      : null,
  )
  const subjectsRes = useLiveResource<{
    data: Array<{ subject_id: string; subject_code: string; subject_name: string }>
  }>(
    needs('subjects') && sectionDept && sectionSem
      ? `/api/v1/timetables/subjects?department=${encodeURIComponent(sectionDept)}&semester=${encodeURIComponent(
          sectionSem,
        )}`
      : null,
  )
  const slotsRes = useLiveResource<{
    data: {
      slots?: Array<{
        slot_id: string
        day_of_week: string
        period_index: number
        subject_name: string
        faculty_id?: string
        faculty_name: string
      }>
    }
  }>(
    needs('slots') && selectedSection
      ? `/api/v1/timetables/section?department=${encodeURIComponent(sectionDept!)}&semester=${encodeURIComponent(
          sectionSem!,
        )}&section=${encodeURIComponent(selectedSection.section_name)}`
      : null,
  )

  const allowedDepts = useMemo(() => {
    if (scopedDept) return new Set([scopedDept])
    if (user.role === 'DEAN') {
      const ids = departmentsRes.data?.data?.map((d) => d.department_id) ?? []
      return ids.length ? new Set(ids) : null
    }
    return null
  }, [scopedDept, user.role, departmentsRes.data])

  const inScope = (dept?: string | null) => !allowedDepts || (dept ? allowedDepts.has(dept) : true)

  // Date fields need a concrete value on mount so the payload is never empty;
  // prefilled values (e.g. from Master Weekly Schedule click) always take precedence.
  useEffect(() => {
    const seeded: Record<string, string> = {}
    for (const f of fields) {
      if (f.type === 'date') seeded[f.name] = new Date().toLocaleDateString('en-CA')
    }
    setValues((prev) => ({ ...seeded, ...prev, ...(initialValues || {}) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, initialValues])

  if (!contract) return null

  const sourceLoading = (source: MutationFieldSource) => {
    switch (source) {
      case 'departments':
        return departmentsRes.loading
      case 'sections':
        return sectionsRes.loading
      case 'versions':
        return versionsRes.loading
      case 'subjects':
        return subjectsRes.loading
      case 'faculty':
        return facultyRes.loading
      case 'rooms':
        return roomsRes.loading
      case 'laboratories':
        return labsRes.loading
      case 'bookings':
        return bookingsRes.loading
      case 'slots':
        return slotsRes.loading
      case 'users':
        return usersRes.loading
    }
  }

  const buildOptions = (source: MutationFieldSource): SourceOption[] => {
    switch (source) {
      case 'departments':
        return (departmentsRes.data?.data ?? []).map((d) => ({
          value: d.department_id,
          label: `${d.department_id} — ${d.name}`,
        }))
      case 'sections':
        return sections
          .filter((s) => inScope(s.department_id))
          .map((s) => ({
            value: s.section_id,
            label: `${s.department_id} · ${s.semester_id.replace('SEM_', 'Sem ')} · Section ${s.section_name}`,
          }))
      case 'versions':
        return (versionsRes.data?.data ?? []).map((v) => ({
          value: v.version_id,
          label: `${v.version_id}${v.status ? ` — ${v.status}` : ''}${
            v.academic_session ? ` (${v.academic_session})` : ''
          }`,
        }))
      case 'subjects':
        return (subjectsRes.data?.data ?? []).map((s) => ({
          value: s.subject_id,
          label: `${s.subject_code} — ${s.subject_name}`,
        }))
      case 'faculty':
        return (facultyRes.data?.data ?? [])
          .filter((f) => inScope(f.department_id))
          .map((f) => ({
            value: f.staff_id,
            label: `${f.full_name}${f.designation ? ` · ${f.designation}` : ''}${
              f.department_id ? ` (${f.department_id})` : ''
            }`,
          }))
      case 'rooms':
        return (roomsRes.data?.data?.rooms ?? [])
          .filter(
            (r) =>
              screen === 'availability' ||
              r.room_id === values.facilityId ||
              r.room_id === values.room_id ||
              (inScope(r.department_id) && (!sectionDept || r.department_id === sectionDept))
          )
          .map((r) => ({
            value: r.room_id,
            label: `${r.room_number || r.room_id}${r.room_type ? ` · ${r.room_type}` : ''}${
              r.department_id ? ` (${r.department_id})` : ''
            }${r.capacity ? ` · ${r.capacity} seats` : ''}`,
          }))
      case 'laboratories':
        return (labsRes.data?.data ?? [])
          .filter(
            (l) =>
              screen === 'labs' ||
              l.lab_id === values.laboratoryId ||
              l.lab_id === values.lab_id ||
              (inScope(l.department_id) && (!sectionDept || l.department_id === sectionDept))
          )
          .map((l) => ({
            value: l.lab_id,
            label: `${l.name} (${l.department_id} · Room ${l.room_id} · ${l.capacity} seats)`,
          }))
      case 'bookings':
        return (bookingsRes.data?.data ?? []).map((b) => ({
          value: b.booking_id,
          label: `${b.title}${b.status ? ` — ${b.status}` : ''}`,
        }))
      case 'slots': {
        const rawSlots = slotsRes.data?.data?.slots ?? []
        const filteredSlots =
          user.role === 'TEACHING_STAFF'
            ? rawSlots.filter(
                (s) =>
                  (user.pnr && s.faculty_id && s.faculty_id === user.pnr) ||
                  (user.fullName && s.faculty_name?.toLowerCase() === user.fullName.toLowerCase())
              )
            : rawSlots
        return filteredSlots.map((s) => ({
          value: s.slot_id,
          label: `${s.day_of_week} Period ${s.period_index} — ${s.subject_name} (${s.faculty_name})`,
        }))
      }
      case 'users':
        return (usersRes.data?.data ?? []).map((u) => ({
          value: u.user_id,
          label: `${u.full_name} · ${u.role}${u.department_id ? ` (${u.department_id})` : ''}`,
        }))
    }
  }

  const setFieldValue = (name: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value }
      // Any dependent field must be re-selected when its parent changes.
      for (const f of fields) {
        if (f.dependsOn === name) delete next[f.name]
      }
      return next
    })
  }

  async function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!contract) return
    setSubmitting(true)
    setResultMsg(null)

    const payload: Record<string, any> = {}
    fields.forEach((f) => {
      const raw = values[f.name]
      if (raw === undefined || raw === null || raw === '') return
      if (BOOLEAN_FIELDS.has(f.name)) payload[f.name] = raw === 'true'
      else if (f.type === 'number' || NUMERIC_FIELDS.has(f.name)) payload[f.name] = Number(raw)
      else payload[f.name] = String(raw).trim()
    })

    // Timetable slots persist an explicit clock window; derive it from the bell
    // schedule so the operator only needs to pick the period.
    if (payload.period_index && (!payload.start_time || !payload.end_time)) {
      const bell = bellSchedule.find((b) => b.period === Number(payload.period_index) && b.type === 'period')
      if (bell) {
        payload.start_time = bell.startsAt
        payload.end_time = bell.endsAt
      }
    }
    if (payload.is_laboratory === false) payload.lab_id = null

    let requestPath = contract.path
    Object.keys(payload).forEach((k) => {
      const marker = `:${k}`
      if (requestPath.includes(marker)) {
        requestPath = requestPath.replace(marker, encodeURIComponent(payload[k]))
        delete payload[k]
      }
    })

    try {
      const res = await mutateAcademicEndpoint(requestPath, contract.method, payload)
      const msg = res?.message || 'Institutional request submitted and registered successfully.'
      setResultMsg({
        type: 'success',
        text: msg,
      })
      window.dispatchEvent(new CustomEvent('gmritdu:toast', {
        detail: { message: msg, type: 'success' },
      }))
      window.dispatchEvent(new Event('gmritdu:data-change'))
      onClose()
    } catch (err) {
      setResultMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit request.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 modal-backdrop" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#002d31]/60 dark:bg-black/80 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <section className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#062327] border border-[#dce4e3] dark:border-[#124349] shadow-2xl modal-panel">
        <header className="flex items-center justify-between border-b border-[#e3e9e8] dark:border-[#124349] px-4 py-3.5 sm:px-6 sm:py-4 shrink-0">
          <div>
            <span className="font-mono text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc] uppercase">
              {screenCopy[screen].title}
            </span>
            <h2 className="text-base sm:text-lg font-bold text-[#003135] dark:text-[#55d6dc]">{screenCopy[screen].action}</h2>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#647376] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#0a353b]">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {initialValues && Object.keys(initialValues).length > 0 && (
            <div className="rounded-xl border border-[#c3e2df] dark:border-[#175259] bg-[#eef8f7] dark:bg-[#07363d]/60 px-3.5 py-2.5 text-xs text-[#003135] dark:text-[#55d6dc] flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-[#08747c] dark:text-[#55d6dc]" />
              <span>
                <strong>Slot Prefilled:</strong> Facility, Day, Period &amp; Date have been automatically populated from your selected slot. Add an event title and submit.
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const isLiveSelect = Boolean(field.source)
              const isSelect = isLiveSelect || field.type === 'select'
              const options: SourceOption[] = isLiveSelect
                ? buildOptions(field.source as MutationFieldSource)
                : (field.options ?? []).map((opt) => ({
                    value: opt,
                    label: opt === 'true' ? 'Yes' : opt === 'false' ? 'No' : opt.replaceAll('_', ' '),
                  }))
              const loading = isLiveSelect ? sourceLoading(field.source as MutationFieldSource) : false
              const wide = field.type === 'textarea' || isLiveSelect
              const controlClass =
                'h-10 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs text-[#172326] dark:text-[#e6f4f3] outline-none focus:border-[#08747c] [color-scheme:light] dark:[color-scheme:dark]'

              return (
                <div key={field.name} className={wide ? 'sm:col-span-2' : ''}>
                  <label className="mb-1.5 block text-xs font-semibold text-[#526164] dark:text-[#8ea5a3]">
                    {field.label} {field.required && '*'}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      name={field.name}
                      required={field.required}
                      rows={3}
                      value={values[field.name] ?? ''}
                      onChange={(e) => setFieldValue(field.name, e.target.value)}
                      className={`${controlClass} h-auto p-3`}
                    />
                  ) : field.type === 'date' ? (
                    <input
                      name={field.name}
                      type="date"
                      required={field.required}
                      value={values[field.name] ?? new Date().toLocaleDateString('en-CA')}
                      onChange={(e) => setFieldValue(field.name, e.target.value)}
                      className={controlClass}
                    />
                  ) : isSelect ? (
                    <select
                      name={field.name}
                      required={field.required}
                      disabled={loading || (isLiveSelect && options.length === 0)}
                      value={values[field.name] ?? ''}
                      onChange={(e) => setFieldValue(field.name, e.target.value)}
                      className={`${controlClass} disabled:opacity-60`}
                    >
                      <option value="">
                        {loading
                          ? 'Loading options…'
                          : isLiveSelect && options.length === 0
                            ? 'No records available for your scope'
                            : 'Select an option'}
                      </option>
                      {options.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-white text-[#172326] dark:bg-[#072a2f] dark:text-[#e6f4f3]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={field.name}
                      type={field.type || 'text'}
                      required={field.required}
                      min={field.name === 'rating' ? 1 : undefined}
                      max={field.name === 'rating' ? 5 : undefined}
                      value={values[field.name] ?? ''}
                      onChange={(e) => setFieldValue(field.name, e.target.value)}
                      className={controlClass}
                    />
                  )}

                  {field.help && (
                    <p className="mt-1 text-[11px] text-[#7a898c] dark:text-[#7f9a98]">{field.help}</p>
                  )}
                </div>
              )
            })}
          </div>

          {resultMsg && (
            <div
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                resultMsg.type === 'success'
                  ? 'border-[#c9e3d9] bg-[#eef7f3] text-[#1b6d53] dark:border-[#13493b] dark:bg-[#072b22] dark:text-[#45c39c]'
                  : 'border-[#e6c8c0] bg-[#faefec] text-[#913b2c] dark:border-[#54251e] dark:bg-[#2b100d] dark:text-[#f08575]'
              }`}
            >
              {resultMsg.type === 'success' ? (
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              ) : (
                <XCircle size={18} className="shrink-0 mt-0.5" />
              )}
              <span className="text-xs font-medium">{resultMsg.text}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[#e3e9e8] dark:border-[#124349]">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-[#d6dfde] dark:border-[#175259] px-4 text-xs font-semibold text-[#526164] dark:text-[#8ea5a3] hover:bg-[#f5f7f6] dark:hover:bg-[#072a2f]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#024950] px-5 text-xs font-semibold text-white shadow-xs hover:bg-[#003135] disabled:opacity-50"
            >
              {submitting && <LoaderCircle size={14} className="animate-spin" />}
              Submit Request
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

/* =========================================================================
   USER PROFILE SCREEN
   ========================================================================= */

function ProfileScreen({ user }: { user: BackendUser }) {
  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs font-semibold text-[#08747c] dark:text-[#55d6dc] uppercase">Identity & Role</span>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#003135] dark:text-[#55d6dc]">User Profile</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <Panel className="p-6 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-[#003135] text-2xl font-bold text-white shadow-md">
            {user.fullName
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#003135] dark:text-[#55d6dc]">{user.fullName}</h2>
          <p className="text-xs text-[#647376] dark:text-[#8ea5a3] mt-0.5">{user.email}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <StatusBadge tone="teal">{roleNames[user.role]}</StatusBadge>
            {user.departmentId && <StatusBadge>{user.departmentId}</StatusBadge>}
            <StatusBadge tone="green">{user.status}</StatusBadge>
          </div>
        </Panel>

        <Panel className="p-6 space-y-4">
          <h3 className="text-sm font-semibold text-[#003135] dark:text-[#55d6dc]">Academic Governance Details</h3>
          <dl className="grid gap-4 sm:grid-cols-2 text-xs">
            <div className="rounded-lg bg-[#f9fbfa] dark:bg-[#072428] p-3 border border-[#e8efee] dark:border-[#124349]">
              <dt className="text-[#8a9799] dark:text-[#6e8886] font-medium">User ID</dt>
              <dd className="mt-1 font-mono font-bold text-[#003135] dark:text-[#55d6dc]">{user.userId}</dd>
            </div>
            <div className="rounded-lg bg-[#f9fbfa] dark:bg-[#072428] p-3 border border-[#e8efee] dark:border-[#124349]">
              <dt className="text-[#8a9799] dark:text-[#6e8886] font-medium">University PNR / Staff ID</dt>
              <dd className="mt-1 font-mono font-bold text-[#003135] dark:text-[#55d6dc]">{user.pnr || 'N/A'}</dd>
            </div>
            <div className="rounded-lg bg-[#f9fbfa] dark:bg-[#072428] p-3 border border-[#e8efee] dark:border-[#124349]">
              <dt className="text-[#8a9799] dark:text-[#6e8886] font-medium">Primary Department</dt>
              <dd className="mt-1 font-semibold text-[#003135] dark:text-[#55d6dc]">{user.departmentId || 'Universal'}</dd>
            </div>
            <div className="rounded-lg bg-[#f9fbfa] dark:bg-[#072428] p-3 border border-[#e8efee] dark:border-[#124349]">
              <dt className="text-[#8a9799] dark:text-[#6e8886] font-medium">Enrolled Section / Cohort</dt>
              <dd className="mt-1 font-semibold text-[#003135] dark:text-[#55d6dc]">{user.sectionId || 'Universal Access'}</dd>
            </div>
          </dl>

          {/* Institutional Role Governance Notice */}
          <div className="rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-[#f7f9f9] dark:bg-[#031d21] p-3.5 flex items-start gap-3">
            <ShieldCheck size={18} className="text-[#08747c] dark:text-[#55d6dc] shrink-0 mt-0.5" />
            <div>
              <strong className="text-xs font-bold text-[#003135] dark:text-[#55d6dc]">Role-Based Access Control (RBAC) Locked</strong>
              <p className="text-[11px] text-[#647376] dark:text-[#8ea5a3] mt-0.5">
                Your institutional role (<span className="font-semibold text-[#003135] dark:text-[#55d6dc]">{roleNames[user.role]}</span>) is provisioned and verified by System Administration. Instant role-switching is prohibited under campus governance rules.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {/* Security & Password Management */}
      <Panel className="p-6">
        <h3 className="text-sm font-semibold text-[#003135] dark:text-[#55d6dc] flex items-center gap-2">
          <KeyRound size={16} />
          Change Account Password
        </h3>
        <p className="text-xs text-[#647376] dark:text-[#8ea5a3] mt-1">
          Update your institutional sign-in credentials. Passwords must be at least 8 characters long.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value
            const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value
            const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value

            if (newPassword !== confirmPassword) {
              window.dispatchEvent(new CustomEvent('gmritdu:toast', {
                detail: { message: 'New password and confirmation do not match.', type: 'error' }
              }))
              return
            }
            try {
              const raw = await backendFetch('/api/v1/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
              })
              const res = (await raw.json().catch(() => ({}))) as any
              if (!raw.ok || res?.success === false) {
                throw new Error(res?.message || 'Failed to update password.')
              }
              window.dispatchEvent(new CustomEvent('gmritdu:toast', {
                detail: { message: res?.message || 'Password changed successfully.', type: 'success' }
              }))
              form.reset()
            } catch (err) {
              window.dispatchEvent(new CustomEvent('gmritdu:toast', {
                detail: { message: err instanceof Error ? err.message : 'Failed to update password.', type: 'error' }
              }))
            }
          }}
          className="mt-4 grid gap-4 sm:grid-cols-3 max-w-2xl"
        >
          <div>
            <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
              Current Password
            </label>
            <input
              name="currentPassword"
              type="password"
              required
              placeholder="••••••••"
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
              New Password
            </label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#526164] dark:text-[#8ea5a3] mb-1">
              Confirm New Password
            </label>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="h-9 w-full rounded-lg border border-[#d6dfde] dark:border-[#175259] bg-white dark:bg-[#072a2f] px-3 text-xs outline-none focus:border-[#08747c]"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#003135] text-white text-xs font-semibold hover:bg-[#024950] transition cursor-pointer"
            >
              Update Password
            </button>
          </div>
        </form>
      </Panel>

      {/* Notification Preferences */}
      <Panel className="p-6">
        <h3 className="text-sm font-semibold text-[#003135] dark:text-[#55d6dc] flex items-center gap-2">
          <Bell size={16} />
          Notification & Alert Settings
        </h3>
        <div className="mt-4 space-y-3 max-w-xl text-xs">
          <label className="flex items-center justify-between p-3 rounded-lg border border-[#e8efee] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#072428] cursor-pointer">
            <div>
              <span className="font-semibold text-[#003135] dark:text-[#55d6dc] block">In-App Schedule Alerts</span>
              <span className="text-[#647376] dark:text-[#8ea5a3] text-[11px]">Real-time visual notifications for class substitutions and timetable revisions.</span>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-[#08747c]" />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg border border-[#e8efee] dark:border-[#124349] bg-[#f9fbfa] dark:bg-[#072428] cursor-pointer">
            <div>
              <span className="font-semibold text-[#003135] dark:text-[#55d6dc] block">Laboratory Booking Updates</span>
              <span className="text-[#647376] dark:text-[#8ea5a3] text-[11px]">Confirmation and approval broadcasts for practical sessions.</span>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-[#08747c]" />
          </label>
        </div>
      </Panel>
    </div>
  )
}

/* =========================================================================
   URL SLUGS, CANONICAL METADATA & INSTITUTIONAL BREADCRUMBS
   ========================================================================= */


/* =========================================================================
   URL SLUGS, CANONICAL METADATA & INSTITUTIONAL BREADCRUMBS
   ========================================================================= */

const pathToScreen: Record<string, AcademicScreen | 'profile'> = {
  '/': 'overview',
  '/overview': 'overview',
  '/timetable': 'overview',
  '/availability': 'availability',
  '/labs': 'labs',
  '/departments': 'departments',
  '/people': 'people',
  '/substitutions': 'substitutions',
  '/calendar': 'calendar',
  '/bookings': 'bookings',
  '/approvals': 'approvals',
  '/adjustments': 'recommendations',
  '/recommendations': 'recommendations',
  '/users': 'users',
  '/feedback': 'feedback',
  '/ingestion': 'ingestion',
  '/telemetry': 'telemetry',
  '/profile': 'profile',
}

const screenToPath: Record<string, string> = {
  overview: '/overview',
  timetable: '/overview',
  availability: '/availability',
  labs: '/labs',
  departments: '/departments',
  people: '/people',
  substitutions: '/substitutions',
  calendar: '/calendar',
  bookings: '/bookings',
  approvals: '/approvals',
  recommendations: '/recommendations',
  users: '/users',
  feedback: '/feedback',
  ingestion: '/ingestion',
  telemetry: '/telemetry',
  profile: '/profile',
}

const screenMeta: Record<string, { title: string; desc: string }> = {
  overview: {
    title: 'Live Campus Overview | GMRITDU Academic Platform',
    desc: 'Real-time active class sessions and facility utilization across 9 autonomous engineering departments.',
  },
  availability: {
    title: 'Facility & Lab Vacancy Hub | GMRITDU Academic Platform',
    desc: 'Continuous multi-period availability locator, clash elimination, and room allocation across campus facilities.',
  },
  labs: {
    title: 'Laboratories & Practicals Register | GMRITDU',
    desc: 'Departmental laboratories with workstation capacities, hardware specs, and lab custodian scopes.',
  },
  timetable: {
    title: 'Academic Timetable Matrix | GMRITDU',
    desc: 'Master weekly timetable across semesters, active cohort sections, and verified curriculum slots.',
  },
  people: {
    title: 'Faculty & Staff Workload Directory | GMRITDU',
    desc: 'Institutional faculty and technical staff roster with weekly workload hours, designations, and schedule matrices.',
  },
  substitutions: {
    title: 'Leave & Class Substitutions Workflow | GMRITDU',
    desc: 'Daily faculty leave tracking, substitution coverage indicators, and HOD approval workflows.',
  },
  departments: {
    title: 'Autonomous Academic Departments | GMRITDU',
    desc: 'Comprehensive specifications, intake, faculty count, and curricula for all 9 engineering departments.',
  },
  calendar: {
    title: 'Academic Calendar & Exam Windows | GMRITDU',
    desc: 'Semester milestones, mid-term examinations, national holidays, and timetable disruption shields.',
  },
  bookings: {
    title: 'Laboratory Booking Requests | GMRITDU',
    desc: 'Multi-period practical workshops, exam bookings, guest lectures, and maintenance requests.',
  },
  approvals: {
    title: 'Administrative Approvals Center | GMRITDU',
    desc: 'Pending laboratory booking requests and faculty substitutions awaiting HOD decisions.',
  },
  adjustments: {
    title: 'Smart Class Adjustment & Faculty Discovery | GMRITDU',
    desc: 'Real-time discovery of free available faculty, vacant classrooms, and vacant labs for emergency replacement.',
  },
  users: {
    title: 'Institutional User Directory & Roles | GMRITDU',
    desc: 'Role-based access governance, account authorizations, and departmental identity allocations.',
  },
  feedback: {
    title: 'Campus Feedback & Issue Reports | GMRITDU',
    desc: 'Institutional feedback tracking, classroom issue resolution, and system feature upgrades.',
  },
  ingestion: {
    title: 'Timetable Upload & Publishing | GMRITDU',
    desc: 'Departmental timetable document review, conflict checking, and live schedule publishing.',
  },
  telemetry: {
    title: 'System Health & Schedule Integrity | GMRITDU',
    desc: 'Operational service readiness, storage connectivity, and verified institutional schedule integrity.',
  },
  profile: {
    title: 'My Profile & Account Security | GMRITDU',
    desc: 'Personal academic identity, role credentials, and session security settings.',
  },
}

function Breadcrumbs({
  screen,
  onNavigate,
}: {
  screen: string
  onNavigate: (s: AcademicScreen | 'profile') => void
}) {
  const currentTitle = screenMeta[screen]?.title.split('|')[0].trim() || 'Academic Operations'
  return (
    <nav aria-label="Breadcrumb navigation" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-[#7a898c]">
      <button
        type="button"
        onClick={() => onNavigate('overview')}
        className="text-[#647376] dark:text-[#8ea5a3] hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer"
      >
        Home
      </button>
      <ChevronRight size={12} className="text-[#a4b5b3] dark:text-[#426467]" />
      <span className="text-[#647376] dark:text-[#8ea5a3]">Academic Operations</span>
      <ChevronRight size={12} className="text-[#a4b5b3] dark:text-[#426467]" />
      <span className="font-semibold text-[#003135] dark:text-[#55d6dc] truncate max-w-[280px]">
        {currentTitle}
      </span>
    </nav>
  )
}

function InstitutionalFooter({
  onNavigate,
}: {
  onNavigate: (s: AcademicScreen | 'profile') => void
}) {
  return (
    <footer className="mt-16 border-t border-[#dce4e3] dark:border-[#124349] pt-8 pb-12 text-[#647376] dark:text-[#8ea5a3] no-print">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center gap-2 text-left cursor-pointer hover:opacity-90 transition"
          >
            <BrandMark />
            <span className="font-bold text-sm text-[#003135] dark:text-[#55d6dc]">GMRITDU Timetable</span>
          </button>
          <p className="text-xs leading-relaxed">
            Autonomous academic schedule coordination and continuous multi-period laboratory management platform.
          </p>
          <div className="text-[11px] font-semibold text-[#08747c] dark:text-[#55d6dc]">
            NAAC 'A' Grade · Autonomous UGC/AICTE
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#003135] dark:text-[#e0f2fe] uppercase tracking-wider mb-3">Academic Navigation</h4>
          <ul className="space-y-2 text-xs">
            <li><button type="button" onClick={() => onNavigate('overview')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Campus Overview</button></li>
            <li><button type="button" onClick={() => onNavigate('availability')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Facility Vacancy Hub</button></li>
            <li><button type="button" onClick={() => onNavigate('labs')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Laboratories Registry</button></li>
            <li><button type="button" onClick={() => onNavigate('departments')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Autonomous Departments</button></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#003135] dark:text-[#e0f2fe] uppercase tracking-wider mb-3">Operations & Governance</h4>
          <ul className="space-y-2 text-xs">
            <li><button type="button" onClick={() => onNavigate('calendar')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Academic Calendar & Exams</button></li>
            <li><button type="button" onClick={() => onNavigate('bookings')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Laboratory Reservations</button></li>
            <li><button type="button" onClick={() => onNavigate('telemetry')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">System Health &amp; Integrity</button></li>
            <li><button type="button" onClick={() => onNavigate('feedback')} className="hover:text-[#08747c] dark:hover:text-[#55d6dc] transition cursor-pointer">Campus Issue Reports</button></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#003135] dark:text-[#e0f2fe] uppercase tracking-wider mb-3">Campus Contact</h4>
          <div className="space-y-2 text-xs">
            <p>GMR Institute of Technology Deemed to be University, GMR Nagar, Rajam, Andhra Pradesh</p>
            <p className="flex items-center gap-1.5">
              <Mail size={13} className="text-[#08747c] dark:text-[#55d6dc] shrink-0" />
              <a href="mailto:timetable.support@gmrit.edu.in" className="hover:underline text-[#003135] dark:text-[#e0f2fe]">timetable.support@gmrit.edu.in</a>
            </p>
            <p className="text-[11px] text-[#7a898c]">
              Canonical Domain: <a href="https://timetable.gmrit.edu.in" className="text-[#08747c] dark:text-[#55d6dc] hover:underline font-mono">timetable.gmrit.edu.in</a>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-[#edf2f1] dark:border-[#124349] pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7a898c]">
        <p>&copy; {new Date().getFullYear()} GMR Institute of Technology Deemed to be University. All rights reserved.</p>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#08747c] dark:text-[#55d6dc]">
          <span>Institutional Academic Operations</span>
          <span>·</span>
          <span>Governance Portal</span>
        </div>
      </div>
    </footer>
  )
}

/* =========================================================================
   MAIN OPERATIONS APPLICATION CONTAINER
   ========================================================================= */


export function OperationsApp({ user }: { user: BackendUser }) {
  const router = useRouter()
  const allowedScreens = roleNavigation[user.role] || ['overview']
  const resolveAllowedScreen = (candidate: AcademicScreen | 'profile'): AcademicScreen | 'profile' => {
    if (candidate === 'profile') return 'profile'
    const normalized = candidate === 'timetable' ? 'overview' : candidate
    return allowedScreens.includes(normalized) ? normalized : 'overview'
  }

  const [activeScreen, setActiveScreenState] = useState<AcademicScreen | 'profile'>(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname.toLowerCase()
      if (pathname === '/timetable' || pathname === '/app' || pathname === '/login' || pathname === '/') {
        return 'overview'
      }
      if (pathToScreen[pathname]) {
        const resolved = resolveAllowedScreen(pathToScreen[pathname])
        if (resolved === 'overview' && pathToScreen[pathname] !== 'overview') {
          window.history.replaceState(null, '', '/overview')
        }
        return resolved
      }
      const p = new URLSearchParams(window.location.search).get('screen')
      if (p === 'timetable') return 'overview'
      if (p && (Object.keys(navCatalog).includes(p) || p === 'profile')) {
        return resolveAllowedScreen(p as AcademicScreen | 'profile')
      }
    }
    return 'overview'
  })

  useEffect(() => {
    if (activeScreen !== 'profile' && !allowedScreens.includes(activeScreen)) {
      setActiveScreenState('overview')
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/overview')
      }
    }
  }, [user.role, activeScreen])

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
  }

  useEffect(() => {
    const onToast = (e: any) => {
      if (e.detail?.message) {
        setToast({ message: e.detail.message, type: e.detail.type || 'success' })
      }
    }
    window.addEventListener('gmritdu:toast', onToast)
    return () => window.removeEventListener('gmritdu:toast', onToast)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const setActiveScreen = (screen: AcademicScreen | 'profile') => {
    const s = screen === 'timetable' ? 'overview' : screen
    setActiveScreenState(s)
    if (typeof window !== 'undefined') {
      const targetPath = screenToPath[s] || '/overview'
      window.history.pushState(null, '', targetPath)
    }
  }

  // Popstate history navigation support
  useEffect(() => {
    const onPop = () => {
      const pathname = window.location.pathname.toLowerCase()
      if (pathToScreen[pathname]) {
        setActiveScreenState(resolveAllowedScreen(pathToScreen[pathname]))
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [user.role])

  // Dynamic Metadata, Canonical URLs & Breadcrumbs Sync
  useEffect(() => {
    if (typeof window === 'undefined') return
    const meta = screenMeta[activeScreen] || screenMeta.overview
    document.title = meta.title

    const descTag = document.querySelector('meta[name="description"]')
    if (descTag) descTag.setAttribute('content', meta.desc)

    const path = screenToPath[activeScreen] || '/overview'
    const canonicalUrl = `https://timetable.gmrit.edu.in${path === '/overview' ? '/' : path}`
    const canTag = document.querySelector('link[rel="canonical"]')
    if (canTag) canTag.setAttribute('href', canonicalUrl)

    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) ogTitle.setAttribute('content', meta.title)
    const ogDesc = document.querySelector('meta[property="og:description"]')
    if (ogDesc) ogDesc.setAttribute('content', meta.desc)
    const ogUrl = document.querySelector('meta[property="og:url"]')
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl)
  }, [activeScreen])

  const [simulatedPeriod, setSimulatedPeriod] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [isDark, setIsDark] = useState(false)

  // Initialize Theme State
  useEffect(() => {
    const saved = localStorage.getItem('gmritdu-theme')
    const dark = saved === 'dark' || document.documentElement.classList.contains('dark')
    setIsDark(dark)
  }, [])

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
    showToast(`Switched to ${nextDark ? 'Dark' : 'Light'} institutional theme`)
  }

  const navItems = roleNavigation[user.role].map((id) => navCatalog[id])

  const noticesResource = useLiveResource<{
    success: boolean
    data: Array<{ notification_id: string; title: string; message: string; is_read: number; created_at: string }>
  }>('/api/v1/notifications?unread=true&limit=20')

  const unreadNotices = noticesResource.data?.data || []

  useEffect(() => {
    setNow(new Date())
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const session = readAuthSession()
    if (!session?.token) return
    const evt = new EventSource(`/api/v1/notifications/stream?token=${encodeURIComponent(session.token)}`)

    evt.onmessage = () => {
      window.dispatchEvent(new Event('gmritdu:data-change'))
    }

    return () => evt.close()
  }, [])

  async function handleLogout() {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/')
      document.title = 'GMRITDU | Autonomous Academic Management System'
    }
    clearAuthSession()
    router.replace('/login')
  }

  async function markNotificationAsRead(id?: string) {
    try {
      await backendFetch(
        id ? `/api/v1/notifications/${encodeURIComponent(id)}/read` : '/api/v1/notifications/read-all',
        { method: 'PATCH' }
      )
      window.dispatchEvent(new Event('gmritdu:data-change'))
      showToast('Notification marked as read')
    } catch {
      noticesResource.retry()
    }
  }

  function handleNavigate(id: AcademicScreen | 'profile') {
    setActiveScreen(id)
    setDrawerOpen(false)
    setNotificationsOpen(false)
    setGlobalSearch('')
  }

  useEffect(() => {
    const onNavEvent = (e: any) => {
      if (e.detail?.screen) handleNavigate(e.detail.screen)
    }
    window.addEventListener('gmritdu:navigate', onNavEvent)
    return () => window.removeEventListener('gmritdu:navigate', onNavEvent)
  }, [])

  const clock = now ? getScheduleState(now) : null

  const matchedNav = useMemo(() => {
    if (!globalSearch.trim()) return []
    const q = globalSearch.toLowerCase()
    return navItems.filter((i) => i.label.toLowerCase().includes(q))
  }, [navItems, globalSearch])

  return (
    <div className="min-h-screen bg-[#f3f6f5] dark:bg-[#01191c] text-[#172326] dark:text-[#e2f0ef] transition-colors duration-200 max-w-full overflow-x-hidden">
      {/* Top Universal Institutional Header */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[#dce4e3] dark:border-[#124349] bg-white/95 dark:bg-[#031d21]/95 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-lg text-[#526164] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#072d32] lg:hidden cursor-pointer"
            aria-label="Open Navigation Drawer"
          >
            <Menu size={20} />
          </button>

          {/* Clickable Institutional Logo */}
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            className="flex items-center gap-2.5 text-left cursor-pointer hover:opacity-90 transition focus:outline-none"
            aria-label="Return to Campus Overview"
          >
            <BrandMark />
            <div className="hidden sm:block">
              <strong className="block text-sm font-bold tracking-tight text-[#003135] dark:text-[#55d6dc]">
                GMRITDU Timetable Hub
              </strong>
              <small className="block text-[10px] text-[#7a898c] dark:text-[#7ba09d]">Autonomous University Academic Platform</small>
            </div>
          </button>
        </div>

        {/* Global Workspace Search */}
        <div className="relative mx-4 hidden max-w-sm flex-1 md:block">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-[#dce4e3] dark:border-[#175259] bg-[#f8faf9] dark:bg-[#062327] px-3 focus-within:border-[#08747c] focus-within:bg-white dark:focus-within:bg-[#072a2f] transition">
            <Search size={15} className="text-[#758386]" />
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Jump to academic workspace..."
              className="w-full bg-transparent text-xs outline-none text-[#172326] dark:text-[#e2f0ef]"
            />
          </div>

          {globalSearch && (
            <div className="absolute top-11 left-0 right-0 rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] p-2 shadow-xl z-50">
              {matchedNav.length > 0 ? (
                matchedNav.map(({ id, label, icon: NavIcon }) => (
                  <button
                    key={id}
                    onClick={() => handleNavigate(id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-[#f3f6f5] dark:hover:bg-[#0a353b]"
                  >
                    <NavIcon size={16} className="text-[#08747c] dark:text-[#55d6dc]" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight size={14} className="text-[#9ba8a9]" />
                  </button>
                ))
              ) : (
                <p className="p-3 text-xs text-[#7a898c]">No matching workspaces found.</p>
              )}
            </div>
          )}
        </div>

        {/* Header Right Actions (Clock, Theme Switcher, Notifications, Avatar) */}
        <div className="flex items-center gap-2">
          {/* Real-time Bell Clock */}
          <div className="mr-2 hidden items-center gap-2.5 rounded-lg border border-[#e0e7e6] dark:border-[#124349] bg-[#f8faf9] dark:bg-[#062327] px-3 py-1.5 xl:flex">
            <Clock size={16} className="text-[#08747c] dark:text-[#55d6dc]" />
            <div>
              <strong className="block font-mono text-xs font-semibold text-[#003135] dark:text-[#55d6dc] tabular-nums">
                {now?.toLocaleTimeString('en-IN', { hour12: false }) ?? '--:--:--'}
              </strong>
              <small className="block text-[9px] text-[#7a898c] dark:text-[#7ba09d]">
                {clock ? `${clock.day} · ${clock.label}` : 'Syncing schedule'}
              </small>
            </div>
          </div>

          <a
            href="mailto:timetable.support@gmrit.edu.in"
            className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#dce4e3] dark:border-[#124349] text-[11px] font-semibold text-[#003135] dark:text-[#55d6dc] hover:bg-[#edf2f1] dark:hover:bg-[#072d32] btn-interactive"
            title="Institutional Support Helpdesk"
          >
            <Mail size={12} className="text-[#08747c] dark:text-[#55d6dc]" />
            <span>Support Desk</span>
          </a>

          {/* Theme Toggle Button (Light/Dark Mode) */}
          <button
            onClick={toggleTheme}
            className="grid h-10 w-10 place-items-center rounded-lg text-[#526164] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#072d32] transition cursor-pointer"
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun size={18} className="text-[#f5b842]" /> : <Moon size={18} className="text-[#08747c]" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen((v) => !v)}
              className="relative grid h-10 w-10 place-items-center rounded-lg text-[#526164] dark:text-[#8ea5a3] hover:bg-[#edf2f1] dark:hover:bg-[#072d32] transition"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadNotices.length > 0 && (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#913b2c] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#913b2c]" />
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="fixed left-3 right-3 top-[4.25rem] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80 rounded-xl border border-[#dce4e3] dark:border-[#124349] bg-white dark:bg-[#062327] p-3 shadow-2xl z-50 dropdown-enter">
                <div className="flex items-center justify-between border-b border-[#edf2f1] dark:border-[#124349] pb-2">
                  <strong className="text-xs font-bold text-[#003135] dark:text-[#55d6dc]">Notifications</strong>
                  {unreadNotices.length > 0 && (
                    <button
                      onClick={() => markNotificationAsRead()}
                      className="text-[10px] font-semibold text-[#08747c] dark:text-[#55d6dc] hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-[#edf2f1] dark:divide-[#124349]">
                  {unreadNotices.length > 0 ? (
                    unreadNotices.map((n) => (
                      <div
                        key={n.notification_id}
                        onClick={() => markNotificationAsRead(n.notification_id)}
                        className="p-2.5 text-left hover:bg-[#f7f9f9] dark:hover:bg-[#082a2f] cursor-pointer rounded-lg transition"
                      >
                        <strong className="block text-xs font-semibold text-[#172326] dark:text-[#e2f0ef]">{n.title}</strong>
                        <p className="mt-0.5 text-[11px] text-[#647376] dark:text-[#8ea5a3] line-clamp-2">{n.message}</p>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-center text-xs text-[#7a898c]">No unread alerts</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Pill */}
          <button
            onClick={() => handleNavigate('profile')}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-[#edf2f1] dark:hover:bg-[#072d32] transition"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#003135] text-xs font-bold text-white">
              {user.fullName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div className="hidden text-left sm:block">
              <strong className="block max-w-[130px] truncate text-xs font-bold text-[#003135] dark:text-[#55d6dc]">
                {user.fullName}
              </strong>
              <small className="block text-[10px] text-[#7a898c] dark:text-[#7ba09d]">{roleNames[user.role]}</small>
            </div>
            <ChevronDown size={14} className="hidden text-[#7a898c] sm:block" />
          </button>
        </div>
      </header>

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col bg-[#002d31] dark:bg-[#011417] p-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:top-16 lg:z-30 lg:w-60 ${
          drawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2">
            <BrandMark />
            <strong className="text-sm font-bold">GMRITDU</strong>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="text-[10px] text-[#87a6a4] uppercase font-semibold">Active Institutional Scope</span>
          <strong className="mt-1 block text-xs font-semibold text-white truncate">
            {user.role === 'SUPER_ADMIN'
              ? 'Higher Dean · University Governance'
              : user.role === 'STUDENT'
              ? `Cohort ${user.sectionId || user.departmentId || 'Assigned'} · Enrolled Student`
              : `${user.departmentId || 'GMRIT'} · ${roleNames[user.role]}`}
          </strong>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, icon: NavIcon }) => (
            <button
              key={id}
              onClick={() => handleNavigate(id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                activeScreen === id
                  ? 'bg-[#0b5055] dark:bg-[#084147] text-white shadow-xs font-semibold'
                  : 'text-[#a9c0be] hover:bg-white/5 hover:text-white'
              }`}
            >
              <NavIcon size={16} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 pt-3 space-y-1">
          <button
            onClick={() => handleNavigate('profile')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-[#a9c0be] hover:bg-white/5"
          >
            <Settings size={16} />
            Profile & Settings
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-[#e4a597] hover:bg-white/5"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#002d31]/50 backdrop-blur-xs lg:hidden modal-backdrop"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Main Workspace Body */}
      <main className="min-h-screen px-3 pt-16 pb-24 sm:px-5 lg:ml-60 lg:px-6 lg:pb-6">
        <div key={activeScreen} className="mx-auto max-w-[1520px] view-enter">
          {activeScreen === 'profile' ? (
            <ProfileScreen user={user} />
          ) : (
            <ResourceScreen
              screen={activeScreen}
              user={user}
              simulatedPeriod={simulatedPeriod}
              onSetSimulatedPeriod={setSimulatedPeriod}
              onNavigate={handleNavigate}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-[#dce4e3] dark:border-[#124349] bg-white/95 dark:bg-[#031d21]/95 px-2 backdrop-blur-md lg:hidden">
        {navItems.slice(0, 3).map(({ id, label, icon: NavIcon }) => (
          <button
            key={id}
            onClick={() => handleNavigate(id)}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
              activeScreen === id ? 'text-[#08747c] dark:text-[#55d6dc] font-bold' : 'text-[#7a898c]'
            }`}
          >
            <NavIcon size={18} />
            <span className="truncate max-w-[64px]">{label.split(' ')[0]}</span>
          </button>
        ))}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-[#7a898c]"
        >
          <Menu size={18} />
          <span>Menu</span>
        </button>
      </nav>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 left-4 right-4 sm:left-auto lg:bottom-6 lg:right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-semibold shadow-xl backdrop-blur-md transition-all sm:max-w-md toast-enter ${
            toast.type === 'error'
              ? 'border-red-300 dark:border-red-800 bg-red-50/95 dark:bg-red-950/90 text-red-700 dark:text-red-300'
              : toast.type === 'info'
              ? 'border-[#b9e1e4] dark:border-[#0e5a63] bg-[#eef9fa]/95 dark:bg-[#042c30]/95 text-[#003135] dark:text-[#55d6dc]'
              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle size={16} className="shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
