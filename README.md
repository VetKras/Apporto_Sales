# Apporto Sales

Internal sales intelligence tool for the Apporto AI Suite. Used during customer calls to generate quotes, proposals, competitive battlecards, and strategy briefs.

## Stack

- React 18 + TypeScript + Vite
- Supabase (Postgres + Edge Functions)
- Tailwind CSS + Radix UI

## Features

- **Deals & Quotes** — pricing calculator with configurable models, discount approval tiers, bundle suggestions, and snapshot history. CoTutor is formula-driven (token-COGS ÷ target margin, not flat tiers); ExamSpace bills $/student/year across six desktop tiers (Container/Linux/Small/Medium/Large/GPU), not $/seat-day.
- **Products** — product fact management and source document ingestion
- **Competitive** — competitive matrix and battlecard generation
- **Portia** — AI deal assistant (Edge Function backed). Voice inherited from Athena (analytics), pricing discipline from Jordan Pricing, competitive discipline from Domonic Competitive. Reads live pricing assumptions/rates via `apporto_pricing_reference_query` and the team's own pipeline via `apporto_pipeline_query` (both server-scoped to the requester's real authority level, resolved from `profiles` — never trusted from the client) — never states a price or margin from memory.
- **Settings** — pricing config (CoTutor business levers, technical usage assumptions, approved AI model rate table), team authority levels, integrations, admin config (L3+)

## Auth

Demo mode — email picker dropdown + password field (any non-empty string accepted). Session stored in localStorage. Profile and access level loaded from Supabase on sign-in.

## Access Levels

L4 → L1 (most to least control). Settings requires L3+. Some tabs gate further by level.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL and anon key
npm run dev
```

Apply migrations in order from `supabase/migrations/` via the Supabase dashboard or CLI.

## Edge Functions

`hubspot-action` and `portia-chat` must be deployed to your Supabase project. Calls use the project anon key.

---

## AI Coworker Log

_Each AI session that touches this codebase logs what it did here. Format: Date · Model · Summary._

| Date | Model | Work Done |
|---|---|---|
| 2026-07-19 | Claude Sonnet 5 | CoTutor/ExamSpace pricing rebuild + Portia rebuild — full implementation of `docs/pricing/00_INDEX.md` through `05_PORTIA_AI.md`. Migration 021: `cotutor_pricing_assumptions` and `cotutor_ai_models` tables (formula-driven CoTutor pricing, replacing flat 20/15/10 tiers and the hardcoded, partly-fabricated `COTUTOR_MODELS` catalog — 4 Claude model entries never existed in the real cost model); ExamSpace re-seeded from $/seat-day (3 tiers) to $/student/year (6 tiers: Container/Linux/Small/Medium/Large/GPU). New `calculateCoTutorPrice()` in `pricing-engine.ts`, ported cell-for-cell from `CoTutor_Pricing_Final.xlsx` and verified to the cent against the workbook's reference quote ($24.01/student/yr, $240,103.75 ACV at 10k students / gpt-5.4-mini / 4 assignments-mo / 9-month contract — target margin 82.7%, confirmed by Antony/CEO 2026-07-19). Updated `QuoteInputsPanel`, `QuoteOutputPanel`, and `AdminConfigTab` (new "CoTutor Pricing Engine" tab: business levers, technical usage assumptions, approved AI model rate table) to match. `portia-chat` edge function: fixed a real bug where `competitive_context` was built client-side but never read server-side; added `apporto_pricing_reference_query` and `apporto_pipeline_query` tools (always available, not gated behind HubSpot config); added server-side access resolution (`resolveRequester`/`canAccessDeal`) that looks up real authority level from `profiles` by `user_profile_id` rather than trusting client-sent claims, and omits deal/competitive data entirely for unauthorized requests rather than relying on a prompt instruction to withhold it; removed the now-dead single-shot streaming fast path (tool-calling requires the non-streaming provider APIs, so this path never ran once tools became always-available); rewrote the persona (voice inherited from Athena, pricing discipline from Jordan Pricing, competitive discipline from Domonic Competitive — style only, no cross-app data). Feature-level access control (`feature_flags`/`feature_level_access`/`feature_team_restrictions`) is a separate, not-yet-built plan (`docs/FEATURE_ACCESS_CONTROL_PLAN.md`); Portia's `getEffectiveFeatureAccess()` is stubbed to "everything enabled" until that migration lands. PowerGrader/TrustEd pricing untouched (still unsourced v1 placeholders, `confidence: 'low'` — Phase 2). |
| 2026-06-29 | Claude Sonnet 4.6 | Replaced Supabase Auth with demo email-picker login. Fixed broken Edge Function auth (getSession → anon key) in DealWorkspace, PortiaPanel, PortiaStandalone, and SettingsPage (4 total — all cleared). Restored password field (accepts any string). Consolidated USERS list into users.ts. Added AdminConfigTab (prices, pricing rules, AI model costs) gated at L3+. Added configurable PricingRules loaded from DB. Migrated access control to opaque DB-only role flag; removed all human-readable admin identifiers from codebase. Added migration 015. Wired product_facts into deal workspace — each selected product now shows collapsible intel (positioning, sales claims, capabilities, risks, integrations) at point of quoting. Fixed TS union type error in SettingsPage tabs. |
| 2026-06-29 | Claude Sonnet 4.6 | Migration 016: ALTER competitive_matrix — added 9 enriched columns: sales_positioning_line, escalation_status (check constraint), threat_rationale, key_overlap, pricing_intel, lms_coverage, ferpa_positioning, evidence_source, strategic_window. Migration 017: seeded 19 missing competitors and 29 fully enriched competitive_matrix rows covering all 4 products (PowerGrader ×6, CoTutor ×9, TrustEd ×5, ExamSpace ×6 + Schoolyear new June 2026 entry). Data sourced from competitive_matrix_master.csv, per-product CSVs, Domonic LEARNING_LOG, and Schoolyear Safe brief. Each row includes threat rationale, escalation status, strategic windows, and sales positioning lines. |
