# 🟢 HireIQ

**AI-Powered WhatsApp Candidate Screening Platform**
Built for UAE & KSA Recruitment Agencies

## What is HireIQ?
HireIQ screens job candidates automatically via WhatsApp. Candidates apply via a branded web form, their CV is screened by AI instantly, and qualified candidates are interviewed through a bilingual WhatsApp conversation — without recruiter involvement.

**Target clients:** Salt Recruitment, Marc Ellis, Discovered, DigyCorp

## Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, Prisma ORM
- **AI:** Anthropic Claude claude-sonnet-4-5 (native tool use)
- **Database:** PostgreSQL 16 + pgvector
- **WhatsApp:** 360dialog API
- **Cloud:** Azure UAE North (PDPL compliant)

## Quick Start
```bash
cat > CHANGELOG.md << 'EOF'
# Changelog

## [1.0.0] - April 2026
### Added
- 4-step job creation wizard (Role Basics, JD Builder, Screening Criteria, Baseline Questions)
- AI JD Builder — guided questions → bilingual English + Arabic JD
- CV Review Dashboard with per-criterion evidence layer
- Candidate Integrity Engine — returning candidate detection + AI-alteration flagging
- CV parse confidence score
- WhatsApp mock simulator
- Workflow test suite (8 suites, 35 checks)

### Changed
- Step 3 simplified — shows auto-applied filters from Step 1, thresholds only
- Screening questions renamed to Baseline Questions
- Brand: Deep Emerald #0A3D2E + Warm Gold #C9A84C
- WhatsApp: candidate-initiated (inbound) not outbound

### Fixed
- Pipeline page TypeScript error
- Arabic questions collapsed by default
- Salary fields: removed defaults, added per month label
- Token auto-refresh on start.sh

## [0.9.0] - March 2026
### Added
- 4 backend services, Prisma schema, Claude tool use, WhatsApp state machine

## [0.8.0] - March 2026
### Added
- Next.js 14 frontend, Kanban pipeline, analytics, real-time Socket.io
