-- GMRIT Deemed to be University - Enterprise Academic Scheduling Schema
-- Target: Supabase / PostgreSQL 15+
-- Notes:
--   1. Every table in `public` has RLS enabled and anon/authenticated Data API access revoked
--      (aligned with Supabase 2026-04-28 Data API security guidelines; backend connects via pg Pool).
--   2. Every foreign key column has an explicit covering B-Tree index for JOIN/DELETE performance.
--   3. Boolean-like status flags (`is_laboratory`, `is_read`, `used`, `affects_schedule`, `display_approved`)
--      use SMALLINT (0/1) to preserve strict === 1 API contract compatibility with web and mobile clients.
--   4. Calendar date strings (`YYYY-MM-DD`) and clock times (`HH:MM`) remain TEXT to prevent timezone
--      midnight shift across UTC / IST (+05:30).

-- ============================================================================
-- 1. CORE GOVERNANCE & ORGANIZATIONAL HIERARCHY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schools (
  school_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dean_name TEXT NOT NULL,
  dean_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.departments (
  department_id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES public.schools(school_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  hod_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_departments_school_id ON public.departments(school_id);

CREATE TABLE IF NOT EXISTS public.users (
  user_id TEXT PRIMARY KEY,
  pnrno TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  mobile_number TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'STUDENT', 'TEACHING_STAFF', 'NON_TEACHING_STAFF',
    'COORDINATOR', 'DEPT_ADMIN', 'DEAN', 'SUPER_ADMIN'
  )),
  department_id TEXT REFERENCES public.departments(department_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON public.users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON public.users(role, status);

CREATE TABLE IF NOT EXISTS public.staff (
  staff_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(user_id) ON DELETE SET NULL,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('TEACHING', 'NON_TEACHING')),
  designation TEXT NOT NULL,
  official_email TEXT,
  photo_url TEXT,
  lab_responsibility TEXT,
  display_approved SMALLINT NOT NULL DEFAULT 1 CHECK (display_approved IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_department_id ON public.staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_category ON public.staff(category);

-- ============================================================================
-- 2. ACADEMIC STRUCTURE & ROLE SCOPE ASSIGNMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.academic_programmes (
  programme_id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  programme_name TEXT NOT NULL,
  duration_years INTEGER NOT NULL DEFAULT 4
);
CREATE INDEX IF NOT EXISTS idx_academic_programmes_dept ON public.academic_programmes(department_id);

CREATE TABLE IF NOT EXISTS public.academic_years (
  year_id TEXT PRIMARY KEY,
  year_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.semesters (
  semester_id TEXT PRIMARY KEY,
  semester_number INTEGER NOT NULL,
  year_id TEXT NOT NULL REFERENCES public.academic_years(year_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_semesters_year_id ON public.semesters(year_id);

CREATE TABLE IF NOT EXISTS public.sections (
  section_id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  semester_id TEXT NOT NULL REFERENCES public.semesters(semester_id) ON DELETE RESTRICT,
  section_name TEXT NOT NULL CHECK (section_name IN ('A', 'B', 'C', 'D')),
  student_count INTEGER NOT NULL DEFAULT 0,
  academic_session TEXT NOT NULL,
  UNIQUE (department_id, semester_id, section_name, academic_session)
);
CREATE INDEX IF NOT EXISTS idx_sections_department_id ON public.sections(department_id);
CREATE INDEX IF NOT EXISTS idx_sections_semester_id ON public.sections(semester_id);

CREATE TABLE IF NOT EXISTS public.user_section_assignments (
  user_id TEXT PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES public.sections(section_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_section_assignments_section_id ON public.user_section_assignments(section_id);

CREATE TABLE IF NOT EXISTS public.dean_school_assignments (
  user_id TEXT PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dean_school_assignments_school_id ON public.dean_school_assignments(school_id);

-- ============================================================================
-- 3. INFRASTRUCTURE, CURRICULUM & MASTER TIMETABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  room_id TEXT PRIMARY KEY,
  department_id TEXT REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  room_number TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('CLASSROOM', 'LABORATORY', 'SEMINAR_HALL')),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  facilities_description TEXT
);
CREATE INDEX IF NOT EXISTS idx_rooms_department_id ON public.rooms(department_id);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON public.rooms(room_type);

CREATE TABLE IF NOT EXISTS public.laboratories (
  lab_id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE RESTRICT,
  staff_incharge_id TEXT REFERENCES public.staff(staff_id) ON DELETE SET NULL,
  assistant_incharge_id TEXT REFERENCES public.staff(staff_id) ON DELETE SET NULL,
  equipment_details TEXT,
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);
CREATE INDEX IF NOT EXISTS idx_laboratories_department_id ON public.laboratories(department_id);
CREATE INDEX IF NOT EXISTS idx_laboratories_room_id ON public.laboratories(room_id);
CREATE INDEX IF NOT EXISTS idx_laboratories_staff_incharge ON public.laboratories(staff_incharge_id);
CREATE INDEX IF NOT EXISTS idx_laboratories_assistant_incharge ON public.laboratories(assistant_incharge_id);

CREATE TABLE IF NOT EXISTS public.subjects (
  subject_id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  semester_id TEXT NOT NULL REFERENCES public.semesters(semester_id) ON DELETE RESTRICT,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  course_type TEXT NOT NULL CHECK (course_type IN ('THEORY', 'LABORATORY', 'INTEGRATED', 'PROJECT', 'SEMINAR')),
  credits NUMERIC(4,1) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subjects_department_id ON public.subjects(department_id);
CREATE INDEX IF NOT EXISTS idx_subjects_semester_id ON public.subjects(semester_id);
CREATE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(subject_code);

CREATE TABLE IF NOT EXISTS public.timetable_versions (
  version_id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE RESTRICT,
  academic_session TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  effective_from TEXT NOT NULL,
  created_by TEXT,
  published_at TIMESTAMPTZ,
  UNIQUE (department_id, academic_session, version_number)
);
CREATE INDEX IF NOT EXISTS idx_tt_versions_dept_status ON public.timetable_versions(department_id, status);

CREATE TABLE IF NOT EXISTS public.timetable_slots (
  slot_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES public.timetable_versions(version_id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES public.sections(section_id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  period_index INTEGER NOT NULL,
  subject_id TEXT NOT NULL REFERENCES public.subjects(subject_id) ON DELETE RESTRICT,
  faculty_id TEXT NOT NULL REFERENCES public.staff(staff_id) ON DELETE RESTRICT,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE RESTRICT,
  is_laboratory SMALLINT NOT NULL DEFAULT 0 CHECK (is_laboratory IN (0, 1)),
  lab_id TEXT REFERENCES public.laboratories(lab_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_slots_version_id ON public.timetable_slots(version_id);
CREATE INDEX IF NOT EXISTS idx_slots_subject_id ON public.timetable_slots(subject_id);
CREATE INDEX IF NOT EXISTS idx_slots_sec_day ON public.timetable_slots(section_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_slots_fac_day ON public.timetable_slots(faculty_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_slots_room_day ON public.timetable_slots(room_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_slots_lab_day ON public.timetable_slots(lab_id, day_of_week, period_index);

-- ============================================================================
-- 4. OPERATIONAL WORKFLOWS (SUBSTITUTIONS, BOOKINGS, INCIDENTS, INGESTION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.class_substitutions (
  substitution_id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES public.timetable_slots(slot_id) ON DELETE CASCADE,
  original_faculty_id TEXT NOT NULL REFERENCES public.staff(staff_id) ON DELETE RESTRICT,
  substitute_faculty_id TEXT NOT NULL REFERENCES public.staff(staff_id) ON DELETE RESTRICT,
  leave_date TEXT NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')),
  period_index INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  assigned_by_user_id TEXT NOT NULL,
  assigned_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subst_slot ON public.class_substitutions(slot_id);
CREATE INDEX IF NOT EXISTS idx_subst_orig_fac ON public.class_substitutions(original_faculty_id);
CREATE INDEX IF NOT EXISTS idx_subst_day_p ON public.class_substitutions(day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_subst_sub_fac ON public.class_substitutions(substitute_faculty_id, day_of_week, period_index);

CREATE TABLE IF NOT EXISTS public.lab_bookings (
  booking_id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES public.laboratories(lab_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  booking_type TEXT NOT NULL DEFAULT 'GENERAL',
  booking_date TEXT NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')),
  period_index INTEGER,
  start_time TEXT,
  end_time TEXT,
  coordinator_name TEXT,
  booked_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lab_bookings_day ON public.lab_bookings(lab_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_lab_bookings_date ON public.lab_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_lab_bookings_user ON public.lab_bookings(booked_by_user_id);
ALTER TABLE public.lab_bookings ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'GENERAL';

CREATE TABLE IF NOT EXISTS public.facility_bookings (
  booking_id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  facility_name TEXT,
  facility_type TEXT NOT NULL CHECK (facility_type IN ('CLASSROOM', 'LABORATORY')),
  title TEXT NOT NULL,
  club_name TEXT,
  description TEXT,
  booking_date TEXT NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')),
  period_index INTEGER,
  start_time TEXT,
  end_time TEXT,
  coordinator_name TEXT NOT NULL,
  coordinator_roll TEXT,
  coordinator_contact TEXT,
  faculty_mentor TEXT,
  expected_attendees INTEGER,
  booked_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fac_bookings_facility ON public.facility_bookings(facility_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_fac_bookings_date ON public.facility_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_fac_bookings_user ON public.facility_bookings(booked_by_user_id);

CREATE TABLE IF NOT EXISTS public.timetable_documents (
  doc_id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('PDF', 'EXCEL', 'CSV')),
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE CASCADE,
  academic_year TEXT,
  semester_label TEXT,
  total_slots_parsed INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  status TEXT NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'COMMITTED', 'REJECTED')),
  parsed_data_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tt_docs_dept ON public.timetable_documents(department_id, status);

CREATE TABLE IF NOT EXISTS public.lab_incidents (
  incident_id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES public.laboratories(lab_id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES public.departments(department_id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  reporter_name TEXT NOT NULL,
  incident_date TEXT NOT NULL,
  incident_time TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  equipment_affected TEXT,
  description TEXT NOT NULL,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED', 'UNDER_INVESTIGATION', 'RESOLVED')),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lab_incidents_lab ON public.lab_incidents(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_incidents_dept ON public.lab_incidents(department_id);
CREATE INDEX IF NOT EXISTS idx_lab_incidents_reporter ON public.lab_incidents(reporter_user_id);

-- ============================================================================
-- 5. COMMUNICATIONS, CALENDAR, FEEDBACK & RECOVERY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.events (
  event_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  venue TEXT NOT NULL,
  department_id TEXT REFERENCES public.departments(department_id) ON DELETE SET NULL,
  coordinator TEXT NOT NULL,
  poster_url TEXT,
  status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'ONGOING', 'COMPLETED', 'ARCHIVED')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_department_id ON public.events(department_id);

CREATE TABLE IF NOT EXISTS public.academic_events (
  event_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('HOLIDAY', 'EXAM', 'SEMINAR', 'FEST', 'WORKSHOP', 'GENERAL')),
  event_date TEXT NOT NULL,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  venue TEXT,
  department_id TEXT REFERENCES public.departments(department_id) ON DELETE SET NULL,
  affects_schedule SMALLINT NOT NULL DEFAULT 0 CHECK (affects_schedule IN (0, 1)),
  target_semester TEXT DEFAULT 'ALL',
  exam_halls TEXT,
  coordinator TEXT,
  status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'ACTIVE', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_acad_events_dept ON public.academic_events(department_id);
CREATE INDEX IF NOT EXISTS idx_acad_events_date ON public.academic_events(event_date);
CREATE INDEX IF NOT EXISTS idx_acad_events_type ON public.academic_events(event_type);

DROP TABLE IF EXISTS public.digital_notices;

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  recipient_role TEXT,
  department_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  action_url TEXT,
  is_read SMALLINT NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_by_user_id TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_dept ON public.notifications(department_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_feedback (
  feedback_id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  role TEXT,
  department_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('TIMETABLE', 'LAB_FACILITY', 'FEATURE_REQUEST', 'BUG_REPORT', 'GENERAL')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL,
  comments TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'IMPLEMENTED', 'DISMISSED')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON public.user_feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.user_feedback(user_id);

CREATE TABLE IF NOT EXISTS public.password_resets (
  reset_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  recovery_variant TEXT NOT NULL CHECK (recovery_variant IN ('EMAIL_OTP', 'SECURITY_VERIFY', 'ADMIN_EMERGENCY')),
  otp_code TEXT,
  reset_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used SMALLINT NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pwd_resets_token ON public.password_resets(reset_token);
CREATE INDEX IF NOT EXISTS idx_pwd_resets_user ON public.password_resets(user_id, used);

-- ============================================================================
-- 6. SECURITY, TELEMETRY, AUDIT & IMMUTABLE BLOCKCHAIN LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  log_id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_name, entity_id);

CREATE TABLE IF NOT EXISTS public.telemetry_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL,
  ip_address TEXT,
  user_id TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_requests_timestamp ON public.telemetry_requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_requests_user ON public.telemetry_requests(user_id);

CREATE TABLE IF NOT EXISTS public.telemetry_security_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  details TEXT NOT NULL,
  ip_address TEXT,
  user_identifier TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_sec_timestamp ON public.telemetry_security_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS public.blockchain_blocks (
  block_index INTEGER PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  validator_node TEXT NOT NULL,
  tx_count INTEGER NOT NULL,
  transactions_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS public.blockchain_active_sessions (
  user_id TEXT PRIMARY KEY,
  pnrno TEXT NOT NULL,
  role TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  block_index INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESTRICTED_SUPERSEDED', 'TERMINATED'))
);
CREATE INDEX IF NOT EXISTS idx_blockchain_sessions_pnr ON public.blockchain_active_sessions(pnrno);

CREATE TABLE IF NOT EXISTS public.blockchain_restrictions_log (
  restriction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pnrno TEXT NOT NULL,
  reason TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  block_index INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blockchain_restrictions_user ON public.blockchain_restrictions_log(user_id);

-- ============================================================================
-- 7. SUPABASE ROW-LEVEL SECURITY & DATA API LOCKDOWN
-- ============================================================================
-- Backend Express server connects directly over Postgres (`pg` Pool) using service
-- credentials. Locking down RLS with no anon/authenticated policies prevents any
-- direct Supabase PostgREST Data API exposure while keeping backend queries intact.

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_section_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dean_school_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laboratories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_restrictions_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END $$;
