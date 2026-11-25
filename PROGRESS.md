# ProbashiShield: progress against the proposal

Last updated: 25 Nov 2026. Each item below was checked against the code, not the commit messages.

**Short version:** Every rubric item except deployment is now covered: all three modules, both challenges (A02, A07), full CRUD, login rate limiting, admin fee-rule editing and the README with an architecture diagram. Still to do: deploy, then record the demo video. Three proposal promises are documented as limitations in the README instead of built (see "Gaps against the proposal").

> বাংলায় সংক্ষেপে: ডিপ্লয় ছাড়া রুব্রিকের সব কাজ শেষ। বাকি আছে ডিপ্লয় আর ডেমো ভিডিও।

Legend: ✅ done · 🟡 partly done · ❌ not started

---

## 1. Rubric scorecard

| Req. | Item (marks) | Status | What exists / what is missing |
|---|---|---|---|
| M01 | Complete functional system (12) | ✅ | Document audit → pathway selection → journey execution and recovery, all connected through the API and UI. |
| M02 | Database & persistence (8) | ✅ | Postgres (Supabase) with FK and CHECK constraints. Full CRUD: documents can be created, read, confirmed/corrected and deleted; journeys created and updated; corridor rules updated by admins. |
| M03 | Auth & authorization (8) | ✅ | JWT login (1 h expiry) with 3 roles, ownership checks, 403 plus an audit log entry on every denied request, login brute-force limit (429 after 10 failures per account in 15 min). RLS and the consent token are documented as limitations. |
| M04 | Complex business logic (10) | ✅ | Deterministic fee-cap bands, cross-document mismatch rules, ML risk score, 7-step state machine with ordering rules. |
| M05 | Dynamic data processing (6) | ✅ | Agency search/filter/sort, corridor filters, average fee cap, average and max overcharge by country (admin overview). |
| M06 | Error & edge-case handling (8) | ✅ | SHA-256 duplicate detection (409), blurry-photo confirmation flow, automatic manual-entry fallback when Gemini fails, input validation everywhere. |
| M07 | Responsive UI & accessibility (4) | ✅ | Mobile-first shadcn UI, keyboard-usable controls, semantic landmarks, skip link, **Bangla/English toggle**. |
| M08 | Deployment & docs (4) | 🟡 | README rewritten with architecture diagram, setup, env examples, test accounts, rubric map and limitations. No exposed keys. **Missing:** live URL. |
| A02 | Intelligent optimization (20) | ✅ | `/api/pathways/recommend` returns minimal conflict sets and minimal relaxations; UI has "Test Conflict" and one-click "Apply Relaxation". |
| A07 | Automated multi-step workflow (20) | ✅ | Expiry → downstream rollback → payment freeze → flight readiness revoked → nominee alert, with a recovery plan. Verified end to end against the live database. |

---

## 2. Module status

### Module 1: Document forensics ✅
- ✅ Gemini extraction of offer letters, receipts and demand letters (agency licence, salary, fee, destination, job role)
- ✅ Cross-document audit: licence mismatch, destination mismatch, missing salary clause
- ✅ Registry check against the agency table (neutral labels such as "Under Audit Review")
- ✅ Pre-seeded Malaysia demo case: 450,000 BDT, **5.70× → Red**, licence mismatch, missing salary clause
- ✅ Duplicate hash detection, blurry-photo confirmation, manual fallback when the LLM times out
- ✅ Explainable ML fraud score (top factors) and a live what-if simulator

### Module 2: Cost fairness & pathway optimizer (A02) ✅
- ✅ Green / Amber / Red fee bands with the rule source cited
- ✅ **Effective dates:** every corridor cites 1 Jan 2026, labelled in the rule source as a demo fixture
- ✅ Constraint solver, conflict diagnoser and minimal relaxation suggestions

### Module 3: Self-healing journey (A07) ✅
- ✅ 7-stage dependency graph (agency → medical → police → training → immigration → visa → flight)
- ✅ Expiry or failure reopens later steps, revokes flight readiness and freezes payment
- ✅ Nominee alerts (stored as `NOMINEE_ALERT_DISPATCHED` entries, shown in the nominee's alert feed)
- 🟡 **Payment milestones:** a single `payment_frozen` flag, not a schedule of individual payments

### Extras beyond the proposal
- ✅ Grounded RAG assistant "Probashi Sahayak AI" (Gemini, with a built-in fallback; answers in Bangla, Banglish or English with citations)
- ✅ Admin command center (live KPIs and a filterable audit/security log)
- ✅ Live security proofs in the UI (cross-user 403, nominee read-only 403)

---

## 3. Gaps against the proposal

These are things the proposal promises that the code does not yet do. A judge reading the proposal could notice them.

| # | Proposal says | Reality | Suggested fix | Effort |
|---|---|---|---|---|
| G1 | "Row-Level Security" | API-level ownership checks only | 🟡 Documented honestly in the README limitations; say "API-level ownership checks" in the video | — |
| G2 | Nominee access "requires explicit worker-generated consent token" | Nominee is linked by email when the journey is created | 🟡 Documented in the README limitations | 2–3 h if built |
| G3 | Admin can "update corridor fee rules" | ✅ Done: `PATCH /api/admin/corridors/:id` with validation, before/after audit log, and an edit form on the Admin page | — | — |
| G4 | Fee bands with "effective dates" | ✅ Done: seeded as a labelled demo date (1 Jan 2026) | — | — |
| G5 | "Freezes upcoming payment schedules" | A single frozen flag | 🟡 Documented in the README limitations | 30 min – 2 h if built |

Admin "override stuck steps" works already: an admin can change steps on any journey.

---

## 4. Remaining work (বাকি কাজ), in priority order

### Must do before submission (Day 4)
1. **Commit the frontend.** 21 changed paths in `client/` are uncommitted.
2. **Deploy.** For example, API on Render or Railway, client on Vercel or Netlify.
   - Set `VITE_API_URL` on the client host.
   - Set `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY` and `PORT` on the API host.
   - Restrict CORS to the client URL (it is currently open to all origins).
   - Add an SPA rewrite so routes such as `/journey` load on refresh.
3. **Rewrite the README** with:
   - the architecture diagram
   - test accounts (passwords are not listed here)
   - setup steps
   - a feature-to-rubric map
   - the "synthetic data / not a live BMET feed" disclaimer
4. **Record the 3-minute demo video** (S01). Before each take, run `npm run demo:reset` in `server` (add `-- --ready` to start with steps 1–4 already passed). It clears all documents, audits, journeys and logs, keeps accounts and rules, and recreates journey #1. Every scene in the proposal's script already works:
   - 0:00 Rahim → Load scam demo → Run audit → 5.70× Red, mismatch, missing salary clause
   - 0:55 Pathways → Test Conflict → Apply Relaxation
   - 1:40 Journey → pass steps 1–4 → Simulate medical expiry → frozen banner → Fatema sees the alert
   - 2:30 Duplicate upload (409), Karim's isolation test (403), Fatema's read-only test (403)
5. ~~Fix G4 (effective dates)~~ ✅ done. Journey page load also cut from ~5 s to ~1.2 s.

### Should do if time allows
6. G1: RLS policies, or reword the claim
7. G3: admin corridor-rule editing
8. G2: nominee consent token
9. Rate-limit `/api/auth/login`
10. Have a native speaker review `client/src/i18n/bn.js`

### Nice to have
11. Translate server-generated text (audit explanation, conflict reasons) for the Bangla UI
12. Add API tests for the routes. Only the journey engine has unit tests now; the end-to-end check was a one-off script.
13. Clean up the 12 lint warnings (no errors)

---

## 5. Verification log

| Check | Result |
|---|---|
| Journey engine unit tests (`server`: `npm test`) | 4 / 4 pass |
| End-to-end API check against Supabase (journey, 403s, simulator, assistant) | 19 / 19 pass (one-off script, since removed) |
| Client production build (`client`: `npm run build`) | Passes |
| Client lint (`npm run lint`) | 0 errors, 12 warnings |
| Secrets | `server/.env` gitignored and never committed |

## 6. Test credentials

| Account | Role | Use in the demo |
|---|---|---|
| rahim@demo.com | Worker | Scam audit, journey #1, A07 rollback |
| karim@demo.com | Worker | Cross-user isolation (403) |
| fatema@demo.com | Nominee | Alert feed, read-only lock (403) |
| admin@demo.com | Admin | KPIs, audit and security log |

Passwords are not listed here; test access is arranged privately with the organizers.
