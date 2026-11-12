import type { BackendRole, BackendUser } from './backend-client'

export type RecordValue = string | number | boolean | null

export type AcademicRecord = {
  id: string
  title: string
  subtitle?: string
  status?: string
  meta?: Record<string, RecordValue>
}

export type Metric = {
  id: string
  label: string
  value: string | number
  comparison?: string
  tone?: 'neutral' | 'positive' | 'warning' | 'critical'
}

export type AcademicResponse = {
  data: AcademicRecord[]
  metrics?: Metric[]
  generatedAt: string
  version?: string
  nextCursor?: string
}

export type TelemetrySnapshot = {
  timestamp: string
  uptimeSeconds: number
  database: { engine: string; connected: boolean; staffRecords: number }
  memory: { rss: string; heapUsed: string }
}

export type AcademicScreen =
  | 'overview'
  | 'departments'
  | 'timetable'
  | 'ingestion'
  | 'calendar'
  | 'labs'
  | 'availability'
  | 'bookings'
  | 'approvals'
  | 'people'
  | 'substitutions'
  | 'recommendations'
  | 'users'
  | 'feedback'
  | 'telemetry'

export type ScheduleState = {
  day: string
  period: number | null
  label: string
  startsAt?: string
  endsAt?: string
  type: 'period' | 'break' | 'before' | 'after' | 'closed'
}

export type MutationFieldSource =
  | 'departments'
  | 'sections'
  | 'versions'
  | 'subjects'
  | 'faculty'
  | 'rooms'
  | 'laboratories'
  | 'bookings'
  | 'slots'
  | 'users'

export type MutationField = {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select'
  required?: boolean
  options?: string[]
  /**
   * Live-data source for identifier fields. When present the form resolves the
   * option list at runtime (role-scoped) so operators never type a raw id.
   */
  source?: MutationFieldSource
  /** Re-resolve this field's options whenever the referenced field changes. */
  dependsOn?: string
  /** Short guidance rendered under the control. */
  help?: string
}

export type MutationContract = {
  method: 'POST' | 'PATCH' | 'PUT'
  path: string
  fields: MutationField[]
}

export const bellSchedule = [
  { label: 'Period 1', startsAt: '09:00', endsAt: '10:00', period: 1, type: 'period' as const },
  { label: 'Period 2', startsAt: '10:00', endsAt: '11:00', period: 2, type: 'period' as const },
  { label: 'Tea Break', startsAt: '11:00', endsAt: '11:10', period: null, type: 'break' as const },
  { label: 'Period 3', startsAt: '11:10', endsAt: '12:10', period: 3, type: 'period' as const },
  { label: 'Period 4', startsAt: '12:10', endsAt: '13:10', period: 4, type: 'period' as const },
  { label: 'Lunch Break', startsAt: '13:10', endsAt: '14:00', period: null, type: 'break' as const },
  { label: 'Period 5', startsAt: '14:00', endsAt: '15:00', period: 5, type: 'period' as const },
  { label: 'Period 6', startsAt: '15:00', endsAt: '16:00', period: 6, type: 'period' as const },
  { label: 'Period 7', startsAt: '16:00', endsAt: '17:00', period: 7, type: 'period' as const },
]

export function getScheduleState(date: Date): ScheduleState {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const day = days[date.getDay()]
  if (day === 'SUNDAY') return { day, period: null, label: 'Institution Closed', type: 'closed' }
  const current = date.getHours() * 60 + date.getMinutes()
  const minutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number)
    return hour * 60 + minute
  }
  const active = bellSchedule.find(
    (entry) => current >= minutes(entry.startsAt) && current < minutes(entry.endsAt),
  )
  if (active) return { day, ...active }
  if (current < minutes(bellSchedule[0].startsAt)) {
    return { day, period: null, label: 'Before Classes (09:00 AM)', type: 'before' }
  }
  return { day, period: null, label: 'After Classes (Concluded)', type: 'after' }
}

export function getAcademicEndpoint(
  screen: AcademicScreen,
  user: BackendUser,
  clock: ScheduleState,
) {
  const query = (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    }
    const result = params.toString()
    return result ? `?${result}` : ''
  }

  const dept = user.departmentId || 'CSE'
  // Executive Deans govern an entire school (multiple departments); every other role
  // is scoped to their single department. The backend honours `school` accordingly.
  const school = user.role === 'DEAN' ? user.schoolId : null
  const activeDay = clock.day === 'SUNDAY' ? 'MONDAY' : clock.day
  const activePeriod = clock.period || 1

  switch (screen) {
    case 'overview':
      return `/api/v1/availability/live-classes${query({ day: activeDay, period: activePeriod })}`
    case 'departments':
      return `/api/v1/departments${query({ school })}`
    case 'timetable':
      if (user.role === 'STUDENT') return '/api/v1/timetables/my-section'
      if (user.role === 'TEACHING_STAFF') {
        return `/api/v1/timetables/faculty-workload${query({ department: dept })}`
      }
      return `/api/v1/timetables/hierarchy${query({ school })}`
    case 'ingestion':
      return user.role === 'SUPER_ADMIN'
        ? '/api/v1/timetables/ingest/staged'
        : `/api/v1/timetables/ingest/staged${query({ department: dept })}`
    case 'calendar':
      return `/api/v1/events${query(school ? { school } : { department: dept })}`
    case 'labs':
      return `/api/v1/laboratories${query(school ? { scope: 'ALL', school } : { department: dept, scope: 'ALL' })}`
    case 'availability':
      return `/api/v1/availability${query({
        day: activeDay,
        period: activePeriod,
        ...(school ? { school } : { department: dept }),
      })}`
    case 'bookings':
    case 'approvals':
      return '/api/v1/laboratories/all-bookings'
    case 'people':
      return `/api/v1/staff${query({ school })}`
    case 'substitutions':
      return `/api/v1/substitutions${query(school ? { school, status: 'ALL' } : { department: dept, status: 'ALL' })}`
    case 'recommendations':
      return `/api/v1/availability/recommendations${query({
        day: activeDay,
        period: activePeriod,
        department: dept,
      })}`
    case 'users':
      return '/api/v1/admin/users'
    case 'feedback':
      // Reviewers receive their governed scope; every other subscriber receives
      // only the feedback they personally submitted (self-scoped by the backend).
      return '/api/v1/feedback'
    case 'telemetry':
      return '/api/v1/health'
  }
}

export const mutationContracts: Partial<Record<AcademicScreen, MutationContract>> = {
  timetable: {
    method: 'POST',
    path: '/api/v1/admin/slots',
    fields: [
      {
        name: 'section_id',
        label: 'Year, Semester & Section',
        source: 'sections',
        required: true,
        help: 'Select Year, Semester, and Section to resolve the class batch.',
      },
      {
        name: 'version_id',
        label: 'Timetable Version',
        source: 'versions',
        dependsOn: 'section_id',
        required: true,
      },
      {
        name: 'day_of_week',
        label: 'Day of Week',
        type: 'select',
        options: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        required: true,
      },
      {
        name: 'period_index',
        label: 'Starting Period',
        type: 'select',
        options: ['1', '2', '3', '4', '5', '6', '7'],
        required: true,
      },
      {
        name: 'subject_id',
        label: 'Subject',
        source: 'subjects',
        dependsOn: 'section_id',
        required: true,
      },
      { name: 'faculty_id', label: 'Assigned Faculty', source: 'faculty', required: true },
      { name: 'room_id', label: 'Classroom / Facility', source: 'rooms', required: true },
      {
        name: 'is_laboratory',
        label: 'Laboratory Session?',
        type: 'select',
        options: ['false', 'true'],
        required: true,
      },
      {
        name: 'lab_id',
        label: 'Laboratory Facility (for practical sessions)',
        source: 'laboratories',
        dependsOn: 'section_id',
      },
    ],
  },
  calendar: {
    method: 'POST',
    path: '/api/v1/events',
    fields: [
      { name: 'title', label: 'Event / Examination Title', required: true },
      {
        name: 'event_type',
        label: 'Event Type',
        type: 'select',
        options: ['HOLIDAY', 'EXAM', 'SEMINAR', 'FEST', 'WORKSHOP', 'GENERAL'],
        required: true,
      },
      { name: 'event_date', label: 'Start Date', type: 'date', required: true },
      { name: 'end_date', label: 'End Date', type: 'date' },
      {
        name: 'affects_schedule',
        label: 'Suspends Regular Classes?',
        type: 'select',
        options: ['true', 'false'],
        required: true,
      },
      { name: 'venue', label: 'Venue / Hall' },
      { name: 'description', label: 'Description & Circular Details', type: 'textarea' },
    ],
  },
  labs: {
    method: 'POST',
    path: '/api/v1/laboratories/:laboratoryId/bookings',
    fields: [
      { name: 'laboratoryId', label: 'Laboratory Facility', source: 'laboratories', required: true },
      { name: 'title', label: 'Event / Workshop Title', required: true },
      {
        name: 'booking_type',
        label: 'Booking Category',
        type: 'select',
        options: [
          'WORKSHOP',
          'PRACTICAL_EXAM',
          'SEMINAR',
          'MAINTENANCE',
          'HACKATHON',
          'GUEST_LECTURE',
          'OTHER',
        ],
        required: true,
      },
      { name: 'booking_date', label: 'Booking Date', type: 'date', required: true },
      {
        name: 'day_of_week',
        label: 'Day of Week',
        type: 'select',
        options: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        required: true,
      },
      {
        name: 'period_index',
        label: 'Starting Period',
        type: 'select',
        options: ['1', '2', '3', '4', '5', '6', '7'],
        required: true,
      },
      {
        name: 'duration_periods',
        label: 'Continuous Duration',
        type: 'select',
        options: ['1', '2', '3', '4'],
        required: true,
      },
      { name: 'notes', label: 'Setup Requirements & Notes', type: 'textarea' },
    ],
  },
  bookings: {
    method: 'POST',
    path: '/api/v1/laboratories/:laboratoryId/bookings',
    fields: [
      { name: 'laboratoryId', label: 'Laboratory Facility', source: 'laboratories', required: true },
      { name: 'title', label: 'Booking Title', required: true },
      {
        name: 'booking_type',
        label: 'Booking Category',
        type: 'select',
        options: [
          'WORKSHOP',
          'PRACTICAL_EXAM',
          'SEMINAR',
          'MAINTENANCE',
          'HACKATHON',
          'GUEST_LECTURE',
          'OTHER',
        ],
        required: true,
      },
      { name: 'booking_date', label: 'Booking Date', type: 'date', required: true },
      {
        name: 'day_of_week',
        label: 'Day of Week',
        type: 'select',
        options: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        required: true,
      },
      {
        name: 'period_index',
        label: 'Starting Period',
        type: 'select',
        options: ['1', '2', '3', '4', '5', '6', '7'],
        required: true,
      },
      {
        name: 'duration_periods',
        label: 'Continuous Duration',
        type: 'select',
        options: ['1', '2', '3', '4'],
        required: true,
      },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  approvals: {
    method: 'PUT',
    path: '/api/v1/laboratories/bookings/:bookingId/approval',
    fields: [
      {
        name: 'bookingId',
        label: 'Pending Booking Request',
        source: 'bookings',
        required: true,
        help: 'Only requests awaiting your approval are listed.',
      },
      {
        name: 'action',
        label: 'Approval Decision',
        type: 'select',
        options: ['APPROVE', 'REJECT'],
        required: true,
      },
    ],
  },
  substitutions: {
    method: 'POST',
    path: '/api/v1/substitutions',
    fields: [
      {
        name: 'section_id',
        label: 'Year, Semester & Section',
        source: 'sections',
        required: true,
        help: 'Choose Year, Semester, and Section to load its scheduled sessions below.',
      },
      {
        name: 'slot_id',
        label: 'Class Session to Reassign',
        source: 'slots',
        dependsOn: 'section_id',
        required: true,
      },
      { name: 'substitute_faculty_id', label: 'Substitute Faculty', source: 'faculty', required: true },
      { name: 'reason', label: 'Reason for Leave / Replacement', type: 'textarea', required: true },
      { name: 'leaveDate', label: 'Effective Date of Substitution', type: 'date', required: true },
    ],
  },
  availability: {
    method: 'POST',
    path: '/api/v1/availability/plan-event',
    fields: [
      { name: 'facilityId', label: 'Facility / Room / Lab', source: 'rooms', required: true },
      { name: 'title', label: 'Event / Session Title', required: true },
      { name: 'clubName', label: 'Club / Organizing Unit' },
      { name: 'bookingDate', label: 'Booking Date', type: 'date', required: true },
      {
        name: 'dayOfWeek',
        label: 'Day of Week',
        type: 'select',
        options: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        required: true,
      },
      {
        name: 'periodIndex',
        label: 'Start Period',
        type: 'select',
        options: ['1', '2', '3', '4', '5', '6', '7'],
        required: true,
      },
      {
        name: 'duration',
        label: 'Duration (Periods)',
        type: 'select',
        options: ['1', '2', '3', '4'],
        required: true,
      },
      { name: 'coordinatorName', label: 'Coordinator / Faculty Lead' },
      { name: 'expectedAttendees', label: 'Expected Attendees', type: 'number' },
      { name: 'description', label: 'Purpose / Description', type: 'textarea' },
    ],
  },
  feedback: {
    method: 'POST',
    path: '/api/v1/feedback',
    fields: [
      {
        name: 'category',
        label: 'Feedback Category',
        type: 'select',
        options: ['TIMETABLE', 'LAB_FACILITY', 'FEATURE_REQUEST', 'BUG_REPORT', 'GENERAL'],
        required: true,
      },
      { name: 'rating', label: 'Rating (1 to 5 Stars)', type: 'number', required: true },
      { name: 'title', label: 'Feedback Summary', required: true },
      { name: 'comments', label: 'Detailed Description / Recommendations', type: 'textarea', required: true },
    ],
  },
}

export function normalizeAcademicResponse(raw: unknown): AcademicResponse {
  const envelope = isObject(raw) ? raw : {}
  const payload = 'data' in envelope ? envelope.data : raw
  const records = extractRecords(payload)

  let metrics: Metric[] | undefined = undefined
  if (Array.isArray(envelope.metrics)) {
    metrics = envelope.metrics.flatMap((value, index) => {
      if (!isObject(value)) return []
      const label = first(value, ['label', 'name', 'title'])
      const metricValue = firstValue(value, ['value', 'count', 'total'])
      if (!label || metricValue === undefined) return []
      return [
        {
          id: String(firstValue(value, ['id']) ?? index),
          label,
          value: metricValue as string | number,
          comparison: first(value, ['comparison', 'detail']),
        },
      ]
    })
  } else if (isObject(payload) && isObject(payload.counts)) {
    const counts = payload.counts as Record<string, unknown>
    metrics = Object.entries(counts).map(([key, val], idx) => ({
      id: `metric-count-${idx}`,
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      value: String(val),
    }))
  } else if (isObject(payload) && payload.availableFacultyCount !== undefined) {
    metrics = [
      { id: 'm-fac', label: 'Available Free Faculty', value: String(payload.availableFacultyCount) },
      { id: 'm-cls', label: 'Vacant Classrooms', value: String(payload.vacantClassroomsCount || 0) },
      { id: 'm-lab', label: 'Vacant Practical Labs', value: String(payload.vacantLaboratoriesCount || 0) },
    ]
  }

  return {
    data: records.map(toAcademicRecord),
    metrics,
    generatedAt:
      first(envelope, ['generatedAt', 'timestamp', 'updated_at']) ?? new Date().toISOString(),
    version: first(envelope, ['version']),
    nextCursor: first(envelope, ['nextCursor', 'next_cursor']),
  }
}

function extractRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObject)
  if (!isObject(value)) return []
  const candidates = [
    'departments',
    'slots',
    'laboratories',
    'labs',
    'facilities',
    'requests',
    'bookings',
    'notifications',
    'users',
    'substitutions',
    'events',
    'classes',
    'faculty',
    'availableFaculty',
    'vacantClassrooms',
    'vacantLaboratories',
    'rooms',
    'results',
    'items',
  ]
  for (const key of candidates) {
    if (Array.isArray(value[key])) return value[key].filter(isObject)
  }
  return Object.entries(value)
    .filter(([, item]) => isObject(item))
    .map(([key, item]) => ({ id: key, ...(item as Record<string, unknown>) }))
}

function toAcademicRecord(value: Record<string, unknown>, index: number): AcademicRecord {
  const id = firstValue(value, [
    'doc_id',
    'docId',
    'slot_id',
    'laboratory_id',
    'lab_id',
    'booking_id',
    'facility_id',
    'facilityId',
    'event_id',
    'substitution_id',
    'feedback_id',
    'notification_id',
    'staff_id',
    'userId',
    'user_id',
    'department_id',
    'dept_id',
    'id',
  ])

  if (value.day_of_week && !value.day) {
    value.day = value.day_of_week
  }
  if (value.period_index && !value.period) {
    const timeStr = value.start_time && value.end_time ? ` (${value.start_time} - ${value.end_time})` : ''
    value.period = `P${value.period_index}${timeStr}`
  }

  const title =
    first(value, [
      'original_filename',
      'filename',
      'subject_name',
      'fullName',
      'full_name',
      'laboratory_name',
      'lab_name',
      'name',
      'room_name',
      'title',
      'subject_code',
      'room_id',
      'facility_id',
    ]) ?? `Record ${index + 1}`

  const subtitleParts = [
    first(value, ['faculty_name', 'in_charge_name', 'staff_incharge_name', 'designation', 'author_name']),
    first(value, ['room_id', 'location', 'room_number', 'venue']),
    first(value, ['department_id', 'departmentId', 'category']),
  ].filter(Boolean)

  let status = first(value, ['status', 'live_status', 'approval_status', 'user_status'])
  if (!status && value.is_overloaded !== undefined) {
    status = value.is_overloaded ? 'OVERLOADED' : 'NORMAL'
  }

  const excluded = new Set(['password', 'password_hash', 'token'])

  const meta = Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        !excluded.has(key) &&
        (typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean' ||
          item === null),
    ),
  ) as Record<string, RecordValue>

  return {
    id: String(id ?? index),
    title,
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : undefined,
    status,
    meta,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function first(value: Record<string, unknown>, keys: string[]) {
  const result = firstValue(value, keys)
  return typeof result === 'string' && result ? result : undefined
}

function firstValue(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' || typeof candidate === 'number') return candidate
  }
  return undefined
}

export type { BackendRole, BackendUser }
