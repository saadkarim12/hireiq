#!/bin/bash
# HireIQ — Proper GitHub setup with versioning, tags, and README

echo "Setting up proper GitHub project structure..."

cd ~/hireiq

# ── 1. Create proper .gitignore ───────────────────────────────────────────────
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.next/
dist/
build/

# Environment files — NEVER commit
.env
.env.local
.env.production
.env.*.local

# Secrets
*.pem
*.key

# Build outputs
*.zip
*.tgz

# Mac
.DS_Store
.AppleDouble
.LSOverride

# Logs
*.log
npm-debug.log*
logs/

# IDE
.idea/
.vscode/
*.swp
*.swo

# Test artifacts
coverage/
.nyc_output/

# Azure
.azure/
EOF
echo "✅ .gitignore updated"

# ── 2. Create comprehensive README.md ────────────────────────────────────────
cat > README.md << 'EOF'
<div align="center">
  <h1>🟢 HireIQ</h1>
  <p><strong>AI-Powered WhatsApp Candidate Screening Platform</strong></p>
  <p>Built for UAE & KSA Recruitment Agencies</p>

  ![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)
  ![Status](https://img.shields.io/badge/status-Phase%206%20Complete-blue)
  ![Platform](https://img.shields.io/badge/platform-Azure%20UAE%20North-orange)
  ![License](https://img.shields.io/badge/license-Private-red)
</div>

---

## What is HireIQ?

HireIQ is an AI-powered WhatsApp candidate screening SaaS platform targeting large recruitment agencies in UAE and KSA. Candidates apply via a branded web form, their CV is screened by AI instantly, and qualified candidates are screened through a bilingual WhatsApp conversation — all without any recruiter involvement.

**Target clients:** Salt Recruitment, Marc Ellis, Discovered, DigyCorp

---

## Key Features

| Feature | Description |
|---|---|
| 4-Step Job Wizard | Role Basics → JD Builder → Screening Criteria → Baseline Questions |
| AI JD Builder | Recruiter answers 5 questions → AI writes full English + Arabic JD |
| CV Screening | Claude parses CV, checks hard filters, calculates composite score |
| Two-Tier Automation | ≥75 auto-approve, 40-74 CV Review Dashboard, <40 auto-reject |
| WhatsApp Screening | Bilingual AI conversation — Arabic + English |
| CV Review Dashboard | Per-criterion evidence, parse confidence, integrity flags |
| Candidate Integrity Engine | Returning candidate detection, AI-alteration flagging |
| Talent Pool | Searchable candidate database across all jobs |
| Analytics | KPIs, timeline, score distribution, per-job stats |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, React Query |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| AI | Anthropic Claude claude-sonnet-4-5 (native tool use) |
| Database | PostgreSQL 16 + pgvector (Azure) |
| WhatsApp | 360dialog API |
| Auth | Azure AD B2C + NextAuth.js |
| Cloud | Azure UAE North (PDPL compliant) |
| Real-time | Socket.io |

---

## Architecture

```
Frontend (Next.js :3000)
    ↓
Core API (:3001) — Jobs, Candidates, Auth, Analytics
AI Engine (:3002) — CV scoring, JD generation, summaries
WhatsApp Service (:3003) — Conversation state machine
Scheduler (:3004) — Reminders, PDPL data deletion
    ↓
PostgreSQL + pgvector (Azure UAE North)
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js v22+
- Docker Desktop
- Anthropic API key

### 1. Clone and install
```bash
git clone https://github.com/saadkarim12/hireiq.git
cd hireiq
cd backend && npm install
cd ../frontend && npm install
```

### 2. Start PostgreSQL
```bash
docker run -d \
  --name hireiq-postgres \
  -e POSTGRES_USER=hireiq \
  -e POSTGRES_PASSWORD=hireiq_dev_2026 \
  -e POSTGRES_DB=hireiq \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### 3. Configure environment
```bash
cd backend
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 4. Run migrations and seed
```bash
cd backend
npx prisma migrate dev
npx ts-node prisma/seed.ts
```

### 5. Start all services
```bash
~/hireiq/start.sh          # starts all 4 backend services
cd frontend && npm run dev  # start frontend in new tab
```

### 6. Open the app
- Dashboard: http://localhost:3000
- WhatsApp Simulator: http://localhost:3003/mock
- API Health: http://localhost:3001/health

**Demo login:** `admin@saltrecruitment.ae`

---

## Project Structure

```
hireiq/
├── frontend/                 # Next.js 14 app
│   ├── src/
│   │   ├── app/              # Pages (App Router)
│   │   ├── components/       # Reusable components
│   │   └── api/              # API client
│   └── package.json
├── backend/                  # Node.js services
│   ├── src/
│   │   ├── core-api/         # Jobs, candidates, auth (:3001)
│   │   ├── ai-engine/        # Claude AI tools (:3002)
│   │   ├── whatsapp-service/ # Conversation engine (:3003)
│   │   ├── scheduler/        # Cron jobs (:3004)
│   │   └── shared/           # DB client, logger
│   ├── prisma/               # Schema + migrations + seed
│   └── package.json
├── docs/                     # BRD, HLD, LLD documents
├── qa/                       # Test scripts
├── start.sh                  # Start all services
└── README.md
```

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | BRD v3.0 | ✅ Complete |
| Phase 2 | High Level Design | ✅ Complete |
| Phase 3 | Low Level Design | ✅ Complete |
| Phase 4 | Frontend (Next.js) | ✅ Complete |
| Phase 5 | Backend (Node.js + Claude) | ✅ Complete |
| Phase 6 | QA — 27/27 tests passed | ✅ Complete |
| Phase 6b | CV Evidence Layer | ✅ Complete |
| Phase 6c | Returning Candidate Detection | ✅ Complete |
| Phase 6d | UI Polish + 4-step Wizard | ✅ Complete |
| Phase 7 | Azure Cloud Deployment | ⏳ Next |
| Phase 8 | Pilot Onboarding (5 agencies) | ⏳ Pending |

---

## Pricing

| Plan | Price | Seats | Features |
|---|---|---|---|
| Starter | AED 299/user/month | 3 min | Full platform |
| Growth | AED 499/user/month | 3 min | + Priority support |
| Enterprise | AED 799/user/month | Custom | + Custom integrations |

**First 5 agencies:** 90-day free pilot

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| AI Framework | Claude native tool use | No LangChain dependency |
| Vector DB | pgvector in PostgreSQL | Zero extra infrastructure |
| WhatsApp | Candidate-initiated (inbound) | No Meta template approval |
| Multi-tenancy | Row-level (agency_id) | Simple, scalable to 100 clients |
| Data residency | Azure UAE North only | PDPL + Saudi PDPPL compliance |

---

## Competitive Position

HireIQ is the only platform that combines:
1. **CV screening** with semantic matching (not keywords)
2. **WhatsApp screening** in Arabic + English for professional roles
3. **CV Review Dashboard** with per-criterion evidence
4. **Candidate Integrity Engine** — returning candidate + AI-alteration detection
5. **GCC compliance** — Emiratization, Saudization, PDPL, Gulf CV parsing

No competitor (Eightfold, Paradox, HireVue, Workable) delivers all five layers.

---

## Documents

| Document | Location |
|---|---|
| BRD v3.0 | `/docs/HireIQ_BRD_v3.0.docx` |
| HLD v1.0 | `/docs/HireIQ_HLD_v1.0.docx` |
| LLD v1.0 | `/docs/HireIQ_LLD_v1.0.docx` |

---

## Contributing

This is a private project. All development is tracked in this repository.

**Branch strategy:**
- `main` — stable, production-ready code
- `develop` — active development
- `feature/*` — individual features

**Commit convention:**
```
feat: add CV evidence layer
fix: pipeline page params error  
docs: update BRD v3.0
test: add workflow test suite
```

---

<div align="center">
  <p>Built by Ali (Project Advisor) + Saad Karim (Product Owner)</p>
  <p>HireIQ — Screen Smarter. Hire Faster.</p>
</div>
EOF
echo "✅ README.md created"

# ── 3. Create CHANGELOG.md ────────────────────────────────────────────────────
cat > CHANGELOG.md << 'EOF'
# HireIQ Changelog

All notable changes are documented here.
Format: [Version] - Date - Summary

---

## [1.0.0] - April 2026 — Phase 6 Complete

### Added
- 4-step job creation wizard (Role Basics, JD Builder, Screening Criteria, Baseline Questions)
- AI JD Builder — 5 guided questions → bilingual English + Arabic JD
- Simplified Screening Criteria step — auto-applied filters from Step 1, thresholds only
- CV Review Dashboard with per-criterion evidence layer
- Candidate Integrity Engine — returning candidate detection + AI-alteration flagging
- CV parse confidence score (0-100)
- WhatsApp simulator for testing without real number
- Returning candidate CV diff endpoint
- Token auto-refresh in start.sh
- Comprehensive workflow test suite (8 suites)

### Changed
- Job creation: 3 steps → 4 steps with JD Builder
- Screening questions renamed to Baseline Questions
- Salary fields: removed defaults, added "per month" label
- Step 3: removed duplicate skill entry, shows summary of Step 1 data
- WhatsApp initiation: outbound → candidate-initiated (inbound)
- Brand colours: Navy/Blue → Deep Emerald #0A3D2E + Warm Gold #C9A84C

### Fixed
- Pipeline page `use(params)` TypeScript error
- Arabic screening questions collapsed by default
- Currency auto-sets for all GCC countries
- Salary min/max on same row
- City dropdown with GCC cities + Other option

---

## [0.9.0] - March 2026 — Phase 5 (Backend)

### Added
- 4 Node.js backend services: Core API, AI Engine, WhatsApp Service, Scheduler
- Prisma ORM with 7-table PostgreSQL schema + pgvector
- Claude claude-sonnet-4-5 with 8 native tool definitions
- 13-state WhatsApp conversation state machine
- Cron-based scheduler for reminders and PDPL-compliant data deletion
- JWT authentication with dev bypass for local development

---

## [0.8.0] - March 2026 — Phase 4 (Frontend)

### Added
- Next.js 14 frontend with App Router
- Kanban pipeline board with DnD Kit
- Recharts analytics dashboard
- Socket.io real-time candidate updates
- Tailwind CSS with Emerald + Gold brand theme
- LinkedIn post generator for job sharing

---

## [0.1.0] - March 2026 — Phase 1 (BRD)

### Added
- Business Requirements Document v1.0
- 44 functional requirements
- 5 user roles
- 13-state conversation state machine design
EOF
echo "✅ CHANGELOG.md created"

# ── 4. Create docs folder structure ──────────────────────────────────────────
mkdir -p docs qa scripts
echo "✅ Folder structure confirmed"

# ── 5. Stage all files ────────────────────────────────────────────────────────
git add -A
git status --short | head -20
echo ""
echo "Files staged. Ready to commit."