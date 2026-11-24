# ProbashiShield (প্রবাসী শিল্ড)

**Hack the Vibe 2026**

| Track | Declared Challenges | Execution Window | Target Score |
|---|---|---|---|
| World Problem Solver | A02 & A07 | 4 Days (Solo) | 100 / 100 |

---

## 1. Executive Summary & Problem Context

Bangladeshi migrant workers contribute billions in foreign remittances annually, yet face systematic exploitation, fraud, and legal hazards due to information asymmetry and lack of direct document verification mechanisms.

| Problem | Evidence |
|---|---|
| **500% Fee Overcharges** | Government cap for Malaysia was 78,990 BDT, but investigators report workers paid up to 5x that amount. |
| **52.3% Middleman Drain** | BBS migration survey confirms over half of total worker expenditure goes directly to unaccredited middlemen (dalals). |
| **Human Trafficking & Scam Traps** | Over 1,000 workers cleared by BMET for Cambodia ended up trapped in illegal cyber-scam compounds (BRAC data). |
| **120-Day Redress Delay** | 39% of resolved BMET migrant complaints took over 120 working days, leaving workers stranded with debt. |

---

## 2. Solution Pitch & Architectural Novelty

**One-Sentence Pitch:** ProbashiShield allows prospective migrants to snap photos of their visa/contract/receipts to instantly detect fee overcharges and cross-document discrepancies, optimize legal migration pathways, and run a self-healing pre-departure state machine that automatically handles mid-journey step failures.

### Key Architectural Innovations (Why This Stands Out)

- **Neuro-Symbolic Verification (LLM Parser vs. Deterministic Code):** The LLM parses messy text from document photos, while deterministic, versioned rule engines execute compliance, fee-cap, and mismatch checks. High-uncertainty OCR forces explicit manual confirmation.
- **Unsatisfiable Constraint Explanation (A02 Core):** When a worker's desired country, target salary, and budget cannot be legally met, the engine returns an explicit conflict explanation (showing which parameters collide) and suggests minimal valid adjustments.
- **Self-Healing Pre-Departure State Machine (A07 Core):** If an intermediate milestone (e.g., medical clearance) expires after prior steps succeed, the system automatically rolls back flight readiness, freezes upcoming payment schedules, and dispatches family alerts.

---

## 3. Core System Architecture (3 Scoped Modules)

### Module 1: Document Forensics & Discrepancy Engine
- **Multimodal Extraction:** Parses offer letters, receipts, and demand letters for agency license, salary, fee, destination, and job role.
- **Cross-Document Audit:** Validates extracted entity details across documents (e.g., receipt agency ≠ licensed agency) and against government registries.
- **Fault Tolerance:** Includes pre-seeded demo documents for instant testing, duplicate hash detection, and manual input fallback on LLM timeout.

### Module 2: Cost-Fairness & Pathway Optimizer (Challenge A02)
- **Fee Fairness Index:** Ranks fee multiples (Green / Amber / Red) against government corridor caps with exact rule citations and effective dates.
- **Constraint Solver & Conflict Diagnoser:** Evaluates multi-condition worker inputs. Identifies exact conflicting constraints when no legal pathway satisfies all user criteria.

### Module 3: Self-Healing Journey Orchestrator (Challenge A07)
- **7-Stage Dependency Graph:** Agency Verification → Medical → Police Clearance → Training → Immigration → Visa → Flight Readiness.
- **Automated Failure Recovery:** Triggers auto-reopen on step expiration/failure, revokes flight readiness, freezes payment milestones, and pushes real-time nominee alerts.

---

## 4. User Roles & Security Model (M03 Baseline)

| Role | Permissions & Scope | Resource Isolation (RLS / Auth) |
|---|---|---|
| **Worker** | Full CRUD on own documents, pathway queries, and personal journey stages. | Row-Level Security prevents access to other workers' records. API returns `403 Forbidden` on unauthorized ID tampering. |
| **Family Nominee** | Read-only view of worker milestones and automated alert notifications. | Requires explicit worker-generated consent token. Scoped strictly to the bound worker journey. |
| **Caseworker / Admin** | View flagged high-risk audit logs, update corridor fee rules, override stuck steps. | Protected admin session scope; writes full immutable audit trails for all system actions. |

---

## 5. Hack the Vibe 2026 Rubric Alignment (100-Point Target)

| Req. ID | Rubric Item | Concrete Implementation in ProbashiShield |
|---|---|---|
| M01 (12m) | Complete Functional System | 3 interconnected modules forming a complete end-to-end flow: Document Audit → Pathway Selection → Journey Execution & Recovery. |
| M02 (8m) | Database & Persistence | Relational database schema (Users, Agencies, CorridorRules, Documents, Journeys, Steps, AuditLogs) with strict FK constraints. |
| M03 (8m) | Auth & Authorization | Role-based access across 3 roles with row-level security and session token isolation. |
| M04 (10m) | Complex Business Logic | Deterministic fee-cap calculation, multi-condition risk scoring, and strict state machine transition validation. |
| M05 (6m) | Dynamic Data Processing | Agency search/filter/sort; corridor-level dynamic aggregation (e.g., average overcharge multiple by country). |
| M06 (8m) | Error & Edge-Case Handling | Duplicate document hash detection, blurry photo prompts, and immediate fallback to manual entry if API fails. |
| M07 (4m) | Responsive UI & Accessibility | Mobile-first UI optimized for smartphone usage, keyboard navigation, semantic tags, and Bangla/English toggle. |
| M08 (4m) | Deployment & Docs | Live public URL, public GitHub repository with architecture diagram, test credentials, and zero exposed API keys. |
| A02 (20m) | Intelligent Optimization | **Constraint Engine Test:** Returns exact conflict diagnosis when user parameters (salary/budget/destination) cannot be legally satisfied. |
| A07 (20m) | Automated Multi-Step Workflow | **Intermediate Failure Test:** Simulating medical expiration reopens the step, blocks flight readiness, freezes payment, and logs alerts. |

---

## 6. 3-Minute Video Demo Script (S01 Verification)

1. **0:00–0:55 (Document Audit):** Rahim uploads synthetic photos of a 4.5 lakh BDT Malaysia offer letter and receipt. The engine detects a 5.7x fee overcharge, missing salary clause, and agency registry mismatch.
2. **0:55–1:40 (A02 Conflict Diagnosis):** Rahim requests a legal alternative with conflicting constraints. System outputs an explicit conflict breakdown showing why it's impossible and how to relax inputs.
3. **1:40–2:30 (A07 Journey State Machine):** Rahim begins his journey. A simulated medical expiration occurs mid-process. System automatically reopens the step, freezes the next payment, and notifies his Nominee.
4. **2:30–3:00 (Security & Edge Case):** Judge test: Demonstrating duplicate file rejection and blocking cross-user URL tampering (IDOR attempt blocked with 403).

---

## 7. 4-Day Solo Execution Roadmap

| Day | Primary Focus | Deliverables & Verification |
|---|---|---|
| Day 1 | DB Schema, Auth & Seed Data | Relational DB setup, JWT auth with 3 roles, RLS policies, seeded corridor rules & synthetic agency registry. |
| Day 2 | Module 1 & Challenge A02 | OCR/LLM document parser with manual fallback; deterministic cross-check rules; A02 constraint solver & conflict explainer. |
| Day 3 | Module 3 & Challenge A07 | 7-step state machine, expiration rollback engine, payment freeze triggers, search/filter aggregations, edge-case testing. |
| Day 4 | Deployment, Docs & Demo Video | Live deployment, public GitHub README with architecture notes, seeded test accounts, and 3-minute YouTube recording. |

---

## 8. Risk Mitigation & Project Boundaries

- **Configurable Rules (No Live BMET API):** Uses seeded, verifiable corridor fee limits and registry data; clearly disclosed in UI and video demo.
- **Synthetic Demo Data:** No real passports or personal identification documents are used in tests or screenshots.
- **Defamation Safeguard:** Agencies are displayed with neutral status indicators ("Verified", "Under Audit Review"), avoiding libelous labels.

---

*ProbashiShield Proposal — Hack the Vibe 2026. Implementation status is tracked in [PROGRESS.md](PROGRESS.md).*
