# GMRIT Deemed to be University - Timetable & Academic Operations Platform

**Official Institutional Portal**: `https://timetable.gmrit.edu.in`  
**Deployment Target**: Render / Docker / Node.js 20+  
**Database**: Supabase PostgreSQL (Managed Cloud) / PGlite (Embedded Local Engine)

---

## 1. Executive Summary & Overview

The **GMRITDU Timetable & Academic Operations Platform** is a centralized, enterprise-grade academic scheduling, laboratory infrastructure, faculty substitution, and facility reservation system engineered for **GMR Institute of Technology Deemed to be University (GMRITDU)**.

It provides role-adaptive operations consoles for campus leadership (Super Admins, Deans, HODs, Coordinators), teaching faculty, technical laboratory assistants, and enrolled students, delivering real-time schedule conflict prevention, automated timetable versioning, live substitution approvals, and cryptographic auditability.

---

## 2. Institutional Dataset & Governance Hierarchy

The platform comes pre-synchronized with the complete official GMRITDU institutional datasets from `institutional-data/`:

| Dimension | Count | Details & Scope |
| :--- | :---: | :--- |
| **Schools** | **4** | **SOAC** (Computing), **SOAE** (Engineering), **SOPS** (Physical Sciences), **SOCO** (Commerce) |
| **Departments** | **10** | **CSE, AIML, AIDS, IT, CYBER, MECH, CIVIL, ECE, EEE**, and **BSH** (Basic Sciences & Humanities) |
| **Faculty Profiles** | **233** | Official verified faculty roster with employee IDs, official emails, designations, and departments |
| **Rooms & Laboratories** | **168** | 110 Lecture Halls & Classrooms + 58 Specialized Laboratories across academic blocks |
| **Curriculum Subjects** | **1,364** | Accredited subject catalog covering **AR26** (Autonomous University) and **AR23** regulations |
| **Enrolled Students** | **1,274** | Admitted 1st-year B.Tech students mapped into section cohorts (`CSE-SEM_1-A`, `ECE-SEM_1-B`, etc.) |
| **Calendar & Holidays** | **37** | 21 Official 2026 Public Holidays + 16 Academic Milestones (commencements, internal examinations) |
| **Timetable Versions** | **10** | Published operational baseline schedules across all academic departments |

---

## 3. Role-Based Access Control (RBAC) & Authentication Policy

All institutional accounts are securely initialized with protected role credentials upon database provisioning. In accordance with university cybersecurity guidelines, initial credentials are never published in public repositories:

- **Initial Access**: Provided directly to verified personnel via official university communication or the campus IT office.
- **Mandatory First Login**: Users are prompted to update their initial passwords via the **"Change Account Password"** self-service console located in the profile dashboard.
- **Self-Service Recovery**: Faculty and students can independently reset forgotten credentials via email verification, mobile OTP, or administrative approval at `/api/v1/auth/forgot-password`.

| Institutional Role | Access Scope | Initial Credential Policy | Example Login (PNR / Username) |
| :--- | :--- | :--- | :--- |
| **Super Admin (`SUPER_ADMIN`)** | Full university control: taxonomy, users, health, telemetry, master audit | Confidential (Configured via `INITIAL_ADMIN_PASSWORD` env var) | `ADMIN001` or `admin@gmrit.edu.in` |
| **Executive Dean (`DEAN`)** | School-level governance: affiliated departments, staff, labs, academic calendar | Confidential (Distributed via Dean's Secretariat) | `DEAN001` (SOAC), `DEAN002` (SOAE), `DEAN003` (SOPS), `DEAN004` (SOCO) |
| **Head of Department (`DEPT_ADMIN`)** | Departmental operations: staff assignments, lab approvals, substitution reviews | Confidential (Distributed via Department Office) | `HOD-CSE`, `HOD-AIML`, `HOD-AIDS`, `HOD-IT`, `HOD-CYBER`, `HOD-MECH`, `HOD-CIVIL`, `HOD-ECE`, `HOD-EEE`, `HOD-BSH` |
| **Academic Coordinator (`COORDINATOR`)** | Section schedule authoring, slot assignments, version publishing, room allocation | Confidential (Assigned by HOD) | `COORD002` (CSE) or `COORD-<DEPT>` |
| **Teaching Faculty (`TEACHING_STAFF`)** | Personal teaching schedules, workload meters, peer substitution requests, lab reservations | Confidential (Issued upon faculty onboarding) | Employee ID (e.g. `52171`) or official faculty email |
| **Lab In-Charge (`NON_TEACHING_STAFF`)** | Continuous laboratory booking, equipment status, incident reporting | Confidential (Issued by Technical Services) | Employee ID (e.g. `50008`) or staff email |
| **Enrolled Student (`STUDENT`)** | Assigned cohort timetable, real-time room/facility availability, campus calendar | Confidential (Issued with admission letter) | Admission Number (e.g. `24341A0502`, `10004`, `10206`) |

---

## 4. Architectural Highlights

```
┌────────────────────────────────────────────────────────────────────────┐
│                   GMRITDU Institutional Client SPA                     │
│           (React 19, TypeScript, TailwindCSS, Lucide-React)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / WSS / REST
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Express 5 API Gateway (`server.js`)                   │
│   ┌──────────────────┬──────────────────┬──────────────────────────┐   │
│   │ Security Headers │ Sanitization     │ Telemetry & Audit Logs   │   │
│   ├──────────────────┼──────────────────┼──────────────────────────┤   │
│   │ JWT Auth Guard   │ RBAC Middleware  │ Static Cache Control     │   │
│   └──────────────────┴──────────────────┴──────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         │                                                     │
┌────────▼─────────────────────────────┐    ┌──────────────────▼─────────────────┐
│     Cloud Production Database        │    │    Embedded Development Database   │
│        Supabase PostgreSQL           │    │     PostgreSQL PGlite (WASM)       │
│  (Session Pooler, AWS ap-northeast-2)│    │      (Offline, Zero-Config)        │
└──────────────────────────────────────┘    └────────────────────────────────────┘
```

- **Dual Database Architecture**: Connects seamlessly to remote **Supabase PostgreSQL** via transaction pooler or falls back automatically to embedded **PGlite** (`./data/gmritdu-pg`) for zero-friction local development without installing Postgres.
- **Zero-Dependency Native Container**: Multi-stage `Dockerfile` uses pure JavaScript and WASM dependencies, avoiding heavy C++ build tools (`python/make/gcc`) for sub-30-second image builds.
- **Real-Time Conflict Prevention**: Validates faculty double-booking, room capacity limits, and laboratory resource overlap upon slot mutation.
- **Auditable Cryptographic Ledger**: Tamper-evident SHA-256 blockchain ledger logs all timetable approvals, version publications, and substitution authorizations.
- **Enterprise Telemetry**: Tracks HTTP latencies, query timings, active sessions, and anomalous access events with dedicated admin metrics.

---

## 5. Quick Start & Local Setup

### Prerequisites
- Node.js `20.x` or higher
- npm `10.x` or higher

### Windows 1-Click Launcher
Double-click `start.bat` in the project root. It automatically checks dependencies, creates `.env` if missing, compiles the frontend bundle, and launches the server at `http://localhost:3000`.

### Manual Setup
1. **Clone repository & install dependencies**:
   ```bash
   git clone https://github.com/thrinadh2005/timetable.git
   cd timetable
   npm ci
   ```

2. **Configure environment** (create `.env`):
   ```ini
   PORT=3000
   NODE_ENV=production
   JWT_SECRET=gmritdu_production_secret_key_2026_autonomous
   # Leave DATABASE_URL empty to use offline embedded PGlite, or paste your Supabase connection string:
   DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@[POOLER-HOST]:5432/postgres
   DATABASE_SSL=true
   ```

3. **Synchronize institutional datasets & seed database**:
   ```bash
   npm run seed
   ```

4. **Typecheck & compile frontend bundle**:
   ```bash
   npm run typecheck
   npm run build:frontend
   ```

5. **Start server**:
   ```bash
   npm start
   # Server online at http://localhost:3000
   # Health check at http://localhost:3000/api/v1/health
   ```

---

## 6. Docker & Render Cloud Deployment

### Render Web Service Deployment
1. Connect your GitHub repository to [Render](https://render.com).
2. Render detects the root `Dockerfile` and builds using the optimized multi-stage specification.
3. Configure Environment Variables in the Render Dashboard:
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: *(Generate a strong cryptographic string)*
   - `DATABASE_URL`: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[POOLER-HOST]:5432/postgres`
   - `DATABASE_SSL`: `true`
4. Health check endpoint: `/api/v1/health`.

### Docker Compose Local Orchestration
```bash
docker-compose up -d --build
```
Verify container status:
```bash
docker-compose ps
docker-compose logs -f timetable-app
```

---

## 7. API Reference Catalog

All endpoints are versioned under `/api/v1/*` with JWT bearer authentication and role guards:

| Endpoint | Method | Role Access | Description |
| :--- | :---: | :--- | :--- |
| `/api/v1/health` | `GET` | Public | System uptime, DB connection status, memory & staff metrics |
| `/api/v1/auth/login` | `POST` | Public | Authenticates credentials and issues signed JWT bearer token |
| `/api/v1/auth/me` | `GET` | Authenticated | Retrieves current authenticated profile, role, and department |
| `/api/v1/timetables/section` | `GET` | Authenticated | Fetches published weekly schedule matrix for a specific section |
| `/api/v1/timetables/hierarchy`| `GET` | Authenticated | Returns academic taxonomy tree (Schools -> Departments -> Sections) |
| `/api/v1/timetables/slot` | `POST/PUT/DELETE` | Coordinator / Admin | Creates, modifies, or deletes an individual timetable class slot |
| `/api/v1/laboratories` | `GET` | Authenticated | Lists all 58 campus laboratories with equipment & capacity details |
| `/api/v1/laboratories/book` | `POST` | Faculty / Staff | Reserves a laboratory slot for academic or project sessions |
| `/api/v1/substitutions` | `GET/POST` | Faculty / HOD | Proposes peer faculty substitution and processes approval workflows |
| `/api/v1/availability/overview` | `GET` | Authenticated | Real-time lecture hall, lab, and faculty availability matrix |
| `/api/v1/departments` | `GET/PUT` | Authenticated | Lists 10 university departments with HOD contact information |
| `/api/v1/staff` | `GET/POST` | Authenticated | Faculty directory query with designation and department filtering |
| `/api/v1/events` | `GET/POST` | Authenticated | Academic calendar milestones, exam schedules, and official holidays |
| `/api/v1/blockchain/ledger` | `GET` | Admin / Dean | Cryptographic SHA-256 audit block log of schedule modifications |
| `/api/v1/telemetry/metrics` | `GET` | Super Admin | Request latencies, error frequencies, and system performance metrics |

---

## 8. Directory Structure

```
├── Dockerfile                  # Multi-stage minimal production container image
├── docker-compose.yml          # Container orchestration service definition
├── package.json                # Project dependencies, engines, and npm scripts
├── render.yaml                 # Infrastructure-as-code cloud manifest
├── server.js                   # Enterprise Express 5 server & API router
├── start.bat                   # Windows 1-click developer setup & launcher
├── .dockerignore               # Container build context exclusions
├── .env.example                # Canonical environment variable template
├── .gitignore                  # Git repository exclusion rules
│
├── frontend/                   # Client Single-Page Application (React 19 + TypeScript)
│   ├── build.cjs               # ESBuild packaging pipeline -> public/js/bundle.js
│   ├── entry.tsx               # Client bootstrap entry & error boundaries
│   ├── tsconfig.json           # Strict TypeScript compiler options
│   └── src/
│       ├── app/(frontend)/     # Login console & role-adaptive operation dashboards
│       └── lib/                # API client, state hooks & security contracts
│
├── institutional-data/         # Official GMRITDU verified datasets (CSV)
│   ├── 01_leadership_and_hod_roster.csv
│   ├── 02_faculty_directory.csv
│   ├── 03_academic_programs_and_intake.csv
│   ├── 04_btech_1st_year_admitted_list_2026.csv
│   ├── 05_curriculum_subjects_ar26_ar23.csv
│   ├── 06_classrooms_and_labs_inventory.csv
│   ├── 07_academic_calendar_2026_27.csv
│   ├── 08_holidays_2026.csv
│   ├── 09_campus_room_numbers_master.csv
│   └── GMRIT_DU_MASTER_REPORT.md
│
├── public/                     # Compiled web assets served directly by Express
│   ├── css/style.css           # Modern design system & Tailwind styling
│   ├── js/bundle.js            # Production compiled JavaScript bundle (745 KB)
│   ├── index.html              # Single Page Application HTML shell
│   ├── robots.txt              # Search indexing rules
│   └── sitemap.xml             # Search navigation map
│
├── src/                        # Backend Application Core (Node.js / Express 5)
│   ├── config/
│   │   └── database.js         # Connection pooler (Supabase PostgreSQL / PGlite)
│   ├── middleware/
│   │   ├── auth.js             # JWT bearer verification & role authorization
│   │   ├── security.js         # Security headers, sanitization & CORS policy
│   │   └── telemetry.js        # Latency tracking & audit instrumentation
│   ├── routes/                 # Modular REST API endpoints
│   ├── seed/
│   │   ├── seedData.js         # Database seed orchestrator
│   │   ├── seedInstitutionalData.js # Batch upsert engine for institutional datasets
│   │   └── seedLabTimetables.js     # Laboratory schedule initialization
│   └── services/               # Enterprise business logic & workflow engines
│
└── supabase/
    └── migrations/
        └── 20261112000000_initial_schema.sql # Relational PostgreSQL DDL schema
```

---

## 9. Verification & Maintenance Commands

```bash
# Verify TypeScript typing across frontend application
npm run typecheck

# Recompile production frontend bundle
npm run build:frontend

# Synchronize database with official institutional datasets
npm run seed

# Apply raw SQL migration schema
npm run db:migrate

# Launch production server
npm start
```

---

## 10. License & Institutional Attribution
© 2026 **GMR Institute of Technology Deemed to be University (GMRITDU)**.  
All institutional data, curricula, faculty directories, and campus assets are proprietary to GMRITDU.
