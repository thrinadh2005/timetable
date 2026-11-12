# GMRITDU Timetable & Campus Operations Platform

Canonical Production Domain: `https://timetable.gmrit.edu.in`

Enterprise academic scheduling, laboratory infrastructure, faculty substitution, and facility reservation platform for GMR Institute of Technology Deemed to be University.

## Project Structure

```
.
├── server.js                   # Express API server & SPA static host
├── src/
│   ├── config/                 # Database pool (PostgreSQL / PGlite) & environment setup
│   ├── middleware/             # JWT authentication, RBAC guards, rate limits & headers
│   ├── routes/                 # Versioned REST endpoints (/api/v1/*)
│   ├── seed/                   # Baseline institutional schema bootstrap & role credentials
│   └── services/               # Scheduling conflict engine, approvals, facilities & workflows
├── frontend/
│   ├── entry.tsx               # Client entry & root error boundary
│   ├── build.cjs               # Frontend bundler outputting public/js/bundle.js
│   └── src/
│       ├── app/(frontend)/     # Login portal & role-adaptive operations console
│       └── lib/                # API client, contracts & live resource hooks
├── mobile/                     # Companion Expo React Native mobile app
├── public/                     # Production web assets, styles & compiled bundle
├── supabase/
│   └── migrations/             # PostgreSQL relational schema & RLS definitions
├── scripts/                    # Database maintenance utilities
├── Dockerfile                  # Production container image
├── docker-compose.yml          # Container orchestration setup
├── ecosystem.config.js         # PM2 production process configuration
└── render.yaml                 # Managed cloud deployment manifest
```

## Role Capabilities

All institutional entities (Schools, Departments, Staff, Classrooms, Laboratories, Subjects, Timetable Slots, Academic Events, Facility Bookings, Substitutions, Users, and Feedback) are dynamically editable according to role permissions:

- **System Administrator (`SUPER_ADMIN`)**: Full institutional control over Schools, Departments, Users, Master Timetables, Staff, Facilities, Laboratories, Calendar Events, Substitutions, Bookings, and System Health.
- **Executive School Dean (`DEAN`)**: School-scoped management across affiliated Departments, Staff, Timetables, Labs, Academic Events, and approvals.
- **Head of Department (`DEPT_ADMIN`)**: Department profile updates, HOD approvals, Staff roster, Labs, Classrooms, Timetables, and Substitutions.
- **Academic Coordinator (`COORDINATOR`)**: Department Timetable Slot management, Document Upload & Publishing, Subjects, Staff roster, and Calendar Events.
- **Faculty (`TEACHING_STAFF`)** & **Lab Staff (`NON_TEACHING_STAFF`)**: Personal workload/schedule view, peer substitution requests, continuous lab booking, and incident reporting.
- **Enrolled Student (`STUDENT`)**: Assigned section timetable, real-time campus facility availability, academic calendar, and portal feedback.

## Configuration & Deployment

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment variables** (copy `.env.example` to `.env`):
   - `PORT`: Web server port (default `3000`)
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: Strong secret string (required in production)
   - `DATABASE_URL`: PostgreSQL connection string (`postgresql://...`) or `PG_ENGINE=pglite` for embedded mode

3. **Apply PostgreSQL Schema**:
   Execute `supabase/migrations/20261112000000_initial_schema.sql` against your target PostgreSQL database (embedded PGlite applies it automatically on startup).

4. **Typecheck, Build Frontend & Start**:
   ```bash
   npm run typecheck
   npm run build:frontend
   npm start
   ```

5. **Health Verification**:
   Verify `GET https://timetable.gmrit.edu.in/api/v1/health` returns `200 OK`.
